import type { ArtifactKind, ArtifactMediaType, DeviceFile } from './model.ts'

export interface ArtifactUploadAttemptIntent {
  readonly homeRef: string
  readonly projectRef: string | null
  readonly kind: ArtifactKind
  readonly displayName: string
  readonly mediaType: ArtifactMediaType
  readonly byteLength: number
  readonly payloadSha256: string
}

export interface ArtifactUploadAttempt {
  readonly key: string
  readonly commandRef: string
  readonly artifactRef: string | null
}

export type UploadCleanupCandidate = Pick<DeviceFile, 'uri' | 'lifecycle'>

interface ActiveAttempt {
  readonly commandRef: Promise<string>
  readonly cleanupCandidates: Map<string, UploadCleanupCandidate>
  resolvedCommandRef?: string
  artifactRef?: string
}

/**
 * Binds an upload command to every command-digest input except server time.
 * The file URI is deliberately absent: re-picking the same bytes can create a
 * fresh cache URI while still representing the same retryable command.
 */
export function artifactUploadAttemptKey(intent: ArtifactUploadAttemptIntent): string {
  return JSON.stringify([
    intent.homeRef,
    intent.projectRef,
    intent.kind,
    intent.displayName,
    intent.mediaType,
    intent.byteLength,
    intent.payloadSha256,
  ])
}

/**
 * In-memory attempt metadata only. It is intentionally not an offline queue:
 * attempts survive retries while this API client is alive and disappear with
 * the app process.
 */
export class ActiveArtifactUploadAttempts {
  readonly #attempts = new Map<string, ActiveAttempt>()
  readonly #pendingCleanup = new Map<string, UploadCleanupCandidate>()

  async begin(
    intent: ArtifactUploadAttemptIntent,
    file: UploadCleanupCandidate,
    mintCommandRef: () => Promise<string>,
  ): Promise<ArtifactUploadAttempt> {
    const key = artifactUploadAttemptKey(intent)
    let active = this.#attempts.get(key)
    if (!active) {
      active = {
        commandRef: Promise.resolve().then(mintCommandRef),
        cleanupCandidates: new Map(),
      }
      this.#attempts.set(key, active)
    }
    if (file.lifecycle === 'staged-cache') {
      active.cleanupCandidates.set(file.uri, file)
    }
    try {
      const commandRef = await active.commandRef
      if (this.#attempts.get(key) === active) active.resolvedCommandRef = commandRef
      return { key, commandRef, artifactRef: active.artifactRef ?? null }
    } catch (error) {
      if (this.#attempts.get(key) === active) this.#attempts.delete(key)
      throw error
    }
  }

  /** Keep the exact reservation so a retry can attempt completion before reissuing a signed URL. */
  rememberReservation(attempt: ArtifactUploadAttempt, artifactRef: string): ArtifactUploadAttempt {
    const active = this.#attempts.get(attempt.key)
    if (!active || active.resolvedCommandRef !== attempt.commandRef) {
      throw new Error('upload_attempt_not_active')
    }
    if (active.artifactRef && active.artifactRef !== artifactRef) {
      throw new Error('upload_reservation_changed')
    }
    active.artifactRef = artifactRef
    return { ...attempt, artifactRef }
  }

  /** Remove the command only after confirmation, but retain cleanup work until it succeeds. */
  confirm(attempt: ArtifactUploadAttempt): void {
    const active = this.#attempts.get(attempt.key)
    if (!active || active.resolvedCommandRef !== attempt.commandRef) return
    this.#attempts.delete(attempt.key)
    for (const candidate of active.cleanupCandidates.values()) {
      this.#pendingCleanup.set(candidate.uri, candidate)
    }
  }

  pendingCleanupCandidates(): readonly UploadCleanupCandidate[] {
    return [...this.#pendingCleanup.values()]
  }

  markCleanupComplete(uri: string): void {
    this.#pendingCleanup.delete(uri)
  }
}

/**
 * A marker alone is insufficient to authorize deletion. The URI must also be
 * a child of Expo's cache directory, and the upload must be confirmed.
 */
export function shouldDeleteUploadFile(
  file: UploadCleanupCandidate,
  cacheDirectoryUri: string,
  confirmed: boolean,
): boolean {
  if (!confirmed || file.lifecycle !== 'staged-cache') return false
  try {
    const candidate = new URL(file.uri)
    const cache = new URL(cacheDirectoryUri)
    if (candidate.protocol !== 'file:' || cache.protocol !== 'file:'
      || candidate.host !== cache.host || candidate.search || candidate.hash) return false
    const cachePrefix = cache.href.endsWith('/') ? cache.href : `${cache.href}/`
    return candidate.href.startsWith(cachePrefix)
      && candidate.href.length > cachePrefix.length
      && !candidate.href.endsWith('/')
  } catch {
    return false
  }
}
