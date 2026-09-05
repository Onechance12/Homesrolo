import type { HomesroloApi } from '../api/contract.ts'
import type { ServerSession } from '../api/model.ts'

export class SessionCheckRequired extends Error {
  readonly resumeWhenVerified: (() => Promise<boolean>) | undefined
  constructor(resumeWhenVerified?: () => Promise<boolean>) {
    super('session_check_required')
    this.name = 'SessionCheckRequired'
    this.resumeWhenVerified = resumeWhenVerified
  }
}

/** Local presentation/request fence; the server remains the identity authority. */
export class SessionFence {
  #generation = 0
  #verified = false
  #principalRef: string | null = null
  #identityVersion = 0
  #pendingChanges = new Set<string>()
  #verificationWaiters = new Set<() => void>()

  get identityVersion(): number { return this.#identityVersion }
  canVerify(): boolean { return this.#pendingChanges.size === 0 }
  beginChange(id: string): void { this.#pendingChanges.add(id); this.invalidate() }
  endChange(id: string): void { this.#pendingChanges.delete(id); this.invalidate() }

  reset(): void {
    this.#principalRef = null
    this.#identityVersion += 1
    this.invalidate()
    for (const notify of [...this.#verificationWaiters]) notify()
  }

  #waitForVerification(principalRef: string | null, identityVersion: number): Promise<boolean> {
    return new Promise(resolve => {
      const notify = () => {
        if (principalRef !== this.#principalRef || identityVersion !== this.#identityVersion) {
          this.#verificationWaiters.delete(notify)
          resolve(false)
        } else if (this.#verified) {
          this.#verificationWaiters.delete(notify)
          resolve(principalRef !== null)
        }
      }
      this.#verificationWaiters.add(notify)
      notify()
    })
  }

  invalidate(): number {
    this.#verified = false
    return ++this.#generation
  }

  isCurrent(generation: number): boolean {
    return generation === this.#generation
  }

  confirm(generation: number, session: ServerSession): boolean {
    if (!this.isCurrent(generation) || !this.canVerify()) return false
    const nextPrincipal = session.kind === 'signed_in' ? session.principalRef : null
    if (nextPrincipal !== this.#principalRef) this.#identityVersion += 1
    this.#principalRef = nextPrincipal
    this.#verified = true
    for (const notify of [...this.#verificationWaiters]) notify()
    return true
  }

  capture(principalRef = this.#principalRef, identityVersion = this.#identityVersion): () => void {
    const blocked = () => new SessionCheckRequired(() => this.#waitForVerification(principalRef, identityVersion))
    if (!this.#verified || principalRef === null || principalRef !== this.#principalRef
      || identityVersion !== this.#identityVersion) {
      throw blocked()
    }
    const generation = this.#generation
    return () => {
      if (!this.#verified || !this.isCurrent(generation) || principalRef !== this.#principalRef
        || identityVersion !== this.#identityVersion) {
        throw blocked()
      }
    }
  }
}

/** Current-only session completion: an old success/401 must not replace a newer identity. */
export async function revalidateSession(
  fence: SessionFence,
  read: () => Promise<ServerSession>,
  apply: (session: ServerSession) => void | Promise<void>,
  failed: (error: unknown) => void,
): Promise<void> {
  if (!fence.canVerify()) return
  const generation = fence.invalidate()
  try {
    const session = await read()
    if (fence.confirm(generation, session)) await apply(session)
  } catch (error) {
    if (fence.isCurrent(generation)) failed(error)
  }
}

const PUBLIC_METHODS = new Set<keyof HomesroloApi>([
  'newCommandRef', 'requestEmailCode', 'verifyEmailCode', 'upgradeLegacyPwaSession',
  'session', 'signOut', 'listProfessionals', 'getProfessional',
])
// These only construct a URL; hiding the mounted subtree prevents old previews
// from being displayed during checks. Actual private network calls are fenced.
const SOURCE_METHODS = new Set<keyof HomesroloApi>([
  'artifactPreviewSource', 'professionalArtifactPreviewSource', 'homeCheckupPhotoSource',
])

export function sessionBoundApi(
  api: HomesroloApi,
  fence: SessionFence,
  principalRef: string | null,
  cookieSession: boolean,
): HomesroloApi {
  if (!cookieSession) return api
  const identityVersion = fence.identityVersion
  const methods = new Map<PropertyKey, unknown>()
  return new Proxy(api, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (!methods.has(property)) {
        const call = value.bind(target) as (...args: unknown[]) => unknown
        methods.set(property, PUBLIC_METHODS.has(property as keyof HomesroloApi)
          || SOURCE_METHODS.has(property as keyof HomesroloApi)
          ? call
          : async (...args: unknown[]) => {
              const check = fence.capture(principalRef, identityVersion)
              try {
                const result = await call(...args)
                check()
                return result
              } catch (error) {
                check()
                throw error
              }
            })
      }
      return methods.get(property)
    },
  })
}
