import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import { File, Paths } from 'expo-file-system'
import type { HomesroloApi } from './contract.ts'
import type {
  ArtifactKind,
  ArtifactMediaType,
  ArtifactRecord,
  ArtifactReservation,
  Capabilities,
  CreateWorkInput,
  DeviceFile,
  HomeSummary,
  HomeView,
  NativeSessionCredential,
  RoloReply,
  RoloTurn,
  ServerSession,
  UpdateWorkInput,
  WorkCategory,
  WorkKind,
  WorkRecord,
  WorkStatus,
} from './model.ts'
import {
  apiPath,
  boundedRoloConversation,
  commandRef,
  envelopeData,
  isArtifactRef,
  isHomeRef,
  isProjectRef,
  isSessionToken,
  nativeRequestHeaders,
  normalizeApiOrigin,
  problemCode,
} from './protocol.ts'
import {
  ActiveArtifactUploadAttempts,
  type ArtifactUploadAttempt,
  shouldDeleteUploadFile,
} from './upload-attempt.ts'

type JsonRecord = Record<string, unknown>
type TokenProvider = () => string | null

const WORK_KINDS = new Set<WorkKind>(['project', 'issue', 'repair', 'service', 'incident'])
const WORK_STATUSES = new Set<WorkStatus>(['planned', 'in_progress', 'completed', 'cancelled'])
const WORK_CATEGORIES = new Set<WorkCategory>([
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
])
const RELATIONSHIPS = new Set(['claimed_unverified', 'verified_controller', 'invited_participant'])
const ARTIFACT_KINDS = new Set<ArtifactKind>(['photo', 'document', 'warranty'])
const ARTIFACT_MEDIA = new Set<ArtifactMediaType>(['application/pdf', 'image/jpeg', 'image/png'])
const DESTINATIONS = new Set(['home', 'rolo', 'activity', 'library', 'details', 'work'])

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_wire_data')
  return value as JsonRecord
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.length === 0)) {
    throw new Error('invalid_wire_data')
  }
  return value
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('invalid_wire_data')
  return value
}

function capabilities(value: unknown): Capabilities {
  const source = record(value)
  const keys: readonly (keyof Capabilities)[] = [
    'emailCodeSignIn', 'magicLinkSignIn', 'persistence', 'projectQuotes',
    'homeResearch', 'uploads', 'photoCheckups', 'projectReview',
    'projectReviewAttachments', 'homeRecordHandoffs', 'invitations', 'sharing',
  ]
  const out = {} as Record<keyof Capabilities, boolean>
  for (const key of keys) {
    if (typeof source[key] !== 'boolean') throw new Error('invalid_wire_data')
    out[key] = source[key]
  }
  return out
}

function parseSession(value: unknown): ServerSession {
  const source = record(value)
  if (source.apiVersion !== 'homeowner-api.v1-draft') throw new Error('unsupported_api_version')
  if (source.kind === 'signed_out') {
    return { apiVersion: source.apiVersion, kind: 'signed_out', capabilities: capabilities(source.capabilities) }
  }
  if (source.kind !== 'signed_in' || typeof source.principalRef !== 'string'
    || !/^hprn_[A-Za-z0-9_-]{43}$/.test(source.principalRef)) {
    throw new Error('invalid_wire_data')
  }
  return {
    apiVersion: source.apiVersion,
    kind: 'signed_in',
    principalRef: source.principalRef,
    capabilities: capabilities(source.capabilities),
  }
}

function parseHomeSummary(value: unknown): HomeSummary {
  const source = record(value)
  if (!isHomeRef(source.homeRef) || typeof source.relationshipLabel !== 'string'
    || !RELATIONSHIPS.has(source.relationshipLabel)) throw new Error('invalid_wire_data')
  return {
    homeRef: source.homeRef,
    displayLabel: text(source.displayLabel, 80),
    privateLocationLabel: text(source.privateLocationLabel, 200),
    relationshipLabel: source.relationshipLabel as HomeSummary['relationshipLabel'],
  }
}

function parseHomeView(value: unknown): HomeView {
  const source = record(value)
  const summary = parseHomeSummary(source)
  return {
    ...summary,
    projectCount: count(source.projectCount),
    documentCount: count(source.documentCount),
    warrantyCount: count(source.warrantyCount),
    maintenanceCount: count(source.maintenanceCount),
    updatedAt: text(source.updatedAt, 40),
  }
}

function parseWork(value: unknown): WorkRecord {
  const source = record(value)
  if (!isProjectRef(source.projectRef) || !isHomeRef(source.homeRef)
    || typeof source.workKind !== 'string' || !WORK_KINDS.has(source.workKind as WorkKind)
    || typeof source.category !== 'string' || !WORK_CATEGORIES.has(source.category as WorkCategory)
    || typeof source.status !== 'string' || !WORK_STATUSES.has(source.status as WorkStatus)
    || (source.occurredOn !== null && typeof source.occurredOn !== 'string')
    || (source.professionalLabel !== null && typeof source.professionalLabel !== 'string')
    || typeof source.archived !== 'boolean'
    || (source.archivedAt !== null && typeof source.archivedAt !== 'string')) {
    throw new Error('invalid_wire_data')
  }
  return {
    projectRef: source.projectRef,
    homeRef: source.homeRef,
    title: text(source.title, 120),
    workKind: source.workKind as WorkKind,
    category: source.category as WorkCategory,
    status: source.status as WorkStatus,
    occurredOn: source.occurredOn,
    summary: text(source.summary, 2_000, true),
    professionalLabel: source.professionalLabel,
    revision: count(source.revision),
    archived: source.archived,
    archivedAt: source.archivedAt,
    createdAt: text(source.createdAt, 40),
    updatedAt: text(source.updatedAt, 40),
  }
}

function parseArtifact(value: unknown): ArtifactRecord {
  const source = record(value)
  if (!isArtifactRef(source.artifactRef) || !isHomeRef(source.homeRef)
    || (source.projectRef !== null && !isProjectRef(source.projectRef))
    || typeof source.kind !== 'string' || !ARTIFACT_KINDS.has(source.kind as ArtifactKind)
    || typeof source.mediaType !== 'string' || !ARTIFACT_MEDIA.has(source.mediaType as ArtifactMediaType)) {
    throw new Error('invalid_wire_data')
  }
  return {
    artifactRef: source.artifactRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    kind: source.kind as ArtifactKind,
    displayName: text(source.displayName, 160),
    mediaType: source.mediaType as ArtifactMediaType,
    byteLength: count(source.byteLength),
    createdAt: text(source.createdAt, 40),
  }
}

function parseRolo(value: unknown): RoloReply {
  const source = record(value)
  const proposed = source.proposedWork === null ? null : record(source.proposedWork)
  if (typeof source.requestRef !== 'string' || !source.requestRef.startsWith('hask_')
    || (source.destination !== null
      && (typeof source.destination !== 'string' || !DESTINATIONS.has(source.destination)))
    || (source.projectRef !== null && !isProjectRef(source.projectRef))
    || !Array.isArray(source.followUpQuestions)
    || source.followUpQuestions.some(question => typeof question !== 'string')) {
    throw new Error('invalid_wire_data')
  }
  let proposedWork: RoloReply['proposedWork'] = null
  if (proposed) {
    if (typeof proposed.kind !== 'string' || !WORK_KINDS.has(proposed.kind as WorkKind)
      || typeof proposed.category !== 'string' || !WORK_CATEGORIES.has(proposed.category as WorkCategory)
      || typeof proposed.status !== 'string' || !WORK_STATUSES.has(proposed.status as WorkStatus)
      || (proposed.occurredOn !== null && typeof proposed.occurredOn !== 'string')
      || (proposed.professionalLabel !== null && typeof proposed.professionalLabel !== 'string')
      || (proposed.firstUpdate !== null && typeof proposed.firstUpdate !== 'string')) {
      throw new Error('invalid_wire_data')
    }
    proposedWork = {
      kind: proposed.kind as WorkKind,
      title: text(proposed.title, 120),
      category: proposed.category as WorkCategory,
      status: proposed.status as WorkStatus,
      occurredOn: proposed.occurredOn,
      summary: text(proposed.summary, 2_000, true),
      professionalLabel: proposed.professionalLabel,
      firstUpdate: proposed.firstUpdate,
    }
  }
  return {
    requestRef: source.requestRef,
    answer: text(source.answer, 1_400),
    proposedWork,
    destination: source.destination as RoloReply['destination'],
    projectRef: source.projectRef,
    followUpQuestions: source.followUpQuestions as string[],
    disclosure: text(source.disclosure, 120),
  }
}

function parseReservation(value: unknown): ArtifactReservation {
  const source = record(value)
  if (source.state === 'available') {
    return { state: 'available', artifact: parseArtifact(source.artifact) }
  }
  if (source.state !== 'upload_required' || !isArtifactRef(source.artifactRef)) {
    throw new Error('invalid_wire_data')
  }
  const upload = record(source.upload)
  return {
    state: 'upload_required',
    artifactRef: source.artifactRef,
    upload: {
      signedUrl: text(upload.signedUrl, 4_096),
      path: text(upload.path, 160),
      token: text(upload.token, 4_096),
      expiresAt: text(upload.expiresAt, 40),
    },
  }
}

export class NativeApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined

  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code)
    this.name = 'NativeApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function configuredOrigin(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: unknown } | undefined
  const candidate = typeof extra?.apiUrl === 'string' ? extra.apiUrl : 'https://app.homesrolo.com'
  return normalizeApiOrigin(candidate)
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function mediaTypeFor(bytes: Uint8Array): ArtifactMediaType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50
    && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d
    && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

function assertSignedUpload(reservation: Extract<ArtifactReservation, { state: 'upload_required' }>) {
  const url = new URL(reservation.upload.signedUrl)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  const expectedPath = `/storage/v1/object/upload/sign/homesrolo-homeowner-dev-uploads/${reservation.upload.path}`
  const queryKeys = [...url.searchParams.keys()]
  if ((!local && url.protocol !== 'https:') || (local && !['http:', 'https:'].includes(url.protocol))
    || url.username || url.password || url.hash
    || (!local && !!url.port)
    || (!local && !url.hostname.endsWith('.supabase.co'))
    || !/^hhom_[A-Za-z0-9_-]{43}\/hobj_[A-Za-z0-9_-]{43}$/.test(reservation.upload.path)
    || url.pathname !== expectedPath
    || queryKeys.length !== 1 || queryKeys[0] !== 'token'
    || url.searchParams.getAll('token').length !== 1
    || url.searchParams.get('token') !== reservation.upload.token) {
    throw new Error('invalid_signed_upload')
  }
}

export class HomesroloNativeApi implements HomesroloApi {
  readonly #origin: string
  readonly #token: TokenProvider
  readonly #onSignedOut: () => void
  readonly #uploadAttempts = new ActiveArtifactUploadAttempts()

  constructor(token: TokenProvider, options: {
    readonly origin?: string
    readonly onSignedOut?: () => void
  } = {}) {
    this.#origin = normalizeApiOrigin(options.origin ?? configuredOrigin())
    this.#token = token
    this.#onSignedOut = options.onSignedOut ?? (() => undefined)
  }

  async newCommandRef(): Promise<string> {
    return commandRef(await Crypto.getRandomBytesAsync(32))
  }

  #cleanupConfirmedUploadFiles(): void {
    const candidates = this.#uploadAttempts.pendingCleanupCandidates()
    let cacheDirectoryUri: string
    try { cacheDirectoryUri = Paths.cache.uri } catch { return }
    for (const candidate of candidates) {
      if (!shouldDeleteUploadFile(candidate, cacheDirectoryUri, true)) {
        this.#uploadAttempts.markCleanupComplete(candidate.uri)
        continue
      }
      try {
        const stagedFile = new File(candidate.uri)
        if (stagedFile.exists) stagedFile.delete()
        this.#uploadAttempts.markCleanupComplete(candidate.uri)
      } catch {
        // Keep the candidate for another active-session cleanup pass.
      }
    }
  }

  #confirmUploadAttempt(attempt: ArtifactUploadAttempt): void {
    this.#uploadAttempts.confirm(attempt)
    this.#cleanupConfirmedUploadFiles()
  }

  async #completeArtifactUpload(
    homeRef: string,
    attempt: ArtifactUploadAttempt & { readonly artifactRef: string },
  ): Promise<ArtifactRecord> {
    return parseArtifact(await this.#request(
      apiPath('homes', homeRef, 'artifacts', attempt.artifactRef, 'complete'),
      { method: 'POST', body: { commandRef: attempt.commandRef } },
    ))
  }

  async #request(path: string, options: {
    readonly method?: 'GET' | 'POST'
    readonly body?: unknown
    readonly authentication?: 'required' | 'bootstrap'
  } = {}): Promise<unknown> {
    const authentication = options.authentication ?? 'required'
    const token = authentication === 'required' ? this.#token() : null
    if (authentication === 'required' && (!token || !isSessionToken(token))) {
      throw new NativeApiError(401, 'signed_out')
    }
    let response: Response
    try {
      const serialized = options.body === undefined ? null : JSON.stringify(options.body)
      response = await fetch(`${this.#origin}${path}`, {
        method: options.method ?? 'GET',
        credentials: 'omit',
        headers: nativeRequestHeaders(token, options.body === undefined ? 'none' : 'json'),
        ...(serialized === null ? {} : { body: serialized }),
      })
    } catch {
      throw new NativeApiError(0, 'network_unavailable')
    }
    let payload: unknown
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok) {
      const problem = problemCode(payload)
      if (response.status === 401) this.#onSignedOut()
      throw new NativeApiError(response.status, problem.code, problem.retryAfterSeconds)
    }
    try { return envelopeData(payload) } catch { throw new NativeApiError(response.status, 'invalid_response') }
  }

  async requestEmailCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase()
    const data = record(await this.#request(apiPath('auth', 'email-code'), {
      method: 'POST', body: { email: normalized }, authentication: 'bootstrap',
    }))
    if (data.accepted !== true) throw new NativeApiError(200, 'invalid_response')
  }

  async verifyEmailCode(email: string, code: string): Promise<NativeSessionCredential> {
    const data = record(await this.#request(apiPath('auth', 'email-code', 'verify'), {
      method: 'POST', body: { email: email.trim().toLowerCase(), code }, authentication: 'bootstrap',
    }))
    const session = record(data.session)
    if (data.signedIn !== true || session.tokenType !== 'Bearer'
      || !isSessionToken(session.token) || typeof session.expiresInSeconds !== 'number'
      || !Number.isInteger(session.expiresInSeconds) || session.expiresInSeconds < 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return {
      token: session.token,
      tokenType: 'Bearer',
      expiresInSeconds: session.expiresInSeconds,
    }
  }

  async session(): Promise<ServerSession> {
    return parseSession(await this.#request(apiPath('session')))
  }

  async signOut(): Promise<void> {
    const data = record(await this.#request(apiPath('auth', 'signout'), { method: 'POST' }))
    if (data.signedOut !== true) throw new NativeApiError(200, 'invalid_response')
  }

  async listHomes(): Promise<readonly HomeSummary[]> {
    const data = await this.#request(apiPath('homes'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseHomeSummary)
  }

  async createHome(
    displayLabel: string,
    privateLocationLabel: string,
    createCommandRef?: string,
  ): Promise<HomeSummary> {
    return parseHomeSummary(await this.#request(apiPath('homes'), {
      method: 'POST',
      body: {
        commandRef: createCommandRef ?? await this.newCommandRef(),
        displayLabel: displayLabel.trim(),
        privateLocationLabel: privateLocationLabel.trim(),
      },
    }))
  }

  async getHome(homeRef: string): Promise<HomeView> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    return parseHomeView(await this.#request(apiPath('homes', homeRef)))
  }

  async listWork(homeRef: string): Promise<readonly WorkRecord[]> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    const data = await this.#request(apiPath('homes', homeRef, 'projects'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseWork)
  }

  async createWork(homeRef: string, input: CreateWorkInput): Promise<WorkRecord> {
    return parseWork(await this.#request(apiPath('homes', homeRef, 'projects'), {
      method: 'POST', body: input,
    }))
  }

  async updateWork(homeRef: string, projectRef: string, input: UpdateWorkInput): Promise<WorkRecord> {
    return parseWork(await this.#request(apiPath('homes', homeRef, 'projects', projectRef, 'update'), {
      method: 'POST', body: input,
    }))
  }

  async addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    noteCommandRef?: string,
  ): Promise<void> {
    await this.#request(apiPath('homes', homeRef, 'projects', projectRef, 'activity'), {
      method: 'POST',
      body: {
        commandRef: noteCommandRef ?? await this.newCommandRef(),
        kind: 'note',
        body: body.trim(),
      },
    })
  }

  async askRolo(homeRef: string, message: string, history: readonly RoloTurn[]): Promise<RoloReply> {
    let conversation: ReturnType<typeof boundedRoloConversation>
    try { conversation = boundedRoloConversation(message, history) } catch {
      throw new NativeApiError(400, 'invalid_request')
    }
    return parseRolo(await this.#request(apiPath('homes', homeRef, 'assistant'), {
      method: 'POST', body: { ...conversation, destination: 'rolo' },
    }))
  }

  async listArtifacts(homeRef: string): Promise<readonly ArtifactRecord[]> {
    const data = await this.#request(apiPath('homes', homeRef, 'artifacts'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseArtifact)
  }

  artifactPreviewSource(homeRef: string, artifactRef: string): {
    readonly uri: string
    readonly headers: Readonly<Record<string, string>>
  } {
    const token = this.#token()
    if (!isHomeRef(homeRef) || !isArtifactRef(artifactRef) || !token) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return {
      uri: `${this.#origin}${apiPath('homes', homeRef, 'artifacts', artifactRef, 'preview')}`,
      headers: { ...nativeRequestHeaders(token), accept: 'image/*' },
    }
  }

  async uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ArtifactRecord> {
    this.#cleanupConfirmedUploadFiles()
    if (!isHomeRef(homeRef) || (projectRef !== undefined && !isProjectRef(projectRef))
      || deviceFile.byteLength < 1 || deviceFile.byteLength > 10 * 1024 * 1024) {
      throw new NativeApiError(400, 'invalid_request')
    }
    let payload: ArrayBuffer
    try {
      const sourceFile = new File(deviceFile.uri)
      if (!sourceFile.exists) throw new Error('missing_file')
      payload = await sourceFile.arrayBuffer()
    } catch {
      throw new NativeApiError(400, 'invalid_file')
    }
    if (payload.byteLength !== deviceFile.byteLength) throw new NativeApiError(400, 'invalid_file')
    const mediaType = mediaTypeFor(new Uint8Array(payload))
    if (!mediaType || mediaType !== deviceFile.mediaType
      || (kind === 'photo' && mediaType === 'application/pdf')) {
      throw new NativeApiError(400, 'unsupported_file')
    }
    const digest = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, payload))
    const displayName = deviceFile.name.slice(0, 160)
    let attempt = await this.#uploadAttempts.begin({
      homeRef,
      projectRef: projectRef ?? null,
      kind,
      displayName,
      mediaType,
      byteLength: payload.byteLength,
      payloadSha256: digest,
    }, deviceFile, () => this.newCommandRef())
    if (attempt.artifactRef) {
      try {
        const artifact = await this.#completeArtifactUpload(homeRef, {
          ...attempt,
          artifactRef: attempt.artifactRef,
        })
        this.#confirmUploadAttempt(attempt)
        return artifact
      } catch (error) {
        // A server-unavailable result can mean the object was never stored.
        // Every retry first attempts exact completion; only then may the same
        // reservation receive a fresh bounded upload ticket.
        if (!(error instanceof NativeApiError
          && (error.status === 409 || error.status === 503))) throw error
      }
    }
    const reservation = parseReservation(await this.#request(apiPath('homes', homeRef, 'artifacts'), {
      method: 'POST',
      body: {
        commandRef: attempt.commandRef,
        kind,
        ...(projectRef ? { projectRef } : {}),
        displayName,
        mediaType,
        byteLength: payload.byteLength,
        payloadSha256: digest,
      },
    }))
    if (reservation.state === 'available') {
      this.#confirmUploadAttempt(attempt)
      return reservation.artifact
    }
    assertSignedUpload(reservation)
    attempt = this.#uploadAttempts.rememberReservation(attempt, reservation.artifactRef)
    try {
      await fetch(reservation.upload.signedUrl, {
        method: 'PUT', credentials: 'omit',
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'max-age=0',
          'x-upsert': 'false',
        },
        body: payload,
      })
    } catch {
      // Completion is authoritative when the one-time PUT result is ambiguous.
    }
    // A non-2xx PUT can also mean an earlier ambiguous PUT already stored the
    // object. Completion verifies the exact bytes and is authoritative either
    // way, so it is always attempted before this retry is considered failed.
    const artifact = await this.#completeArtifactUpload(homeRef, {
      ...attempt,
      artifactRef: reservation.artifactRef,
    })
    this.#confirmUploadAttempt(attempt)
    return artifact
  }
}
