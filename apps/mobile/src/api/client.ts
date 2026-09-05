import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { HomesroloApi } from './contract.ts'
import type { ProtectedImageSource } from './image-source.ts'
import type {
  AcceptHouseholdInvitationInput,
  ArtifactContent,
  ArtifactKind,
  ArtifactMediaType,
  ArtifactRecord,
  ResolvedArtifactRecord,
  ArtifactReservation,
  Capabilities,
  CreateProjectQuoteInput,
  CreateProfessionalOrganizationInput,
  CreateHomeCheckupPhotoInput,
  CreateHouseholdInvitationInput,
  CreateWorkInput,
  CreatedProfessionalOrganization,
  DecideProfessionalProposalInput,
  DeviceFile,
  DeletedHomeCheckupPhoto,
  HomeCheckupPhoto,
  HomeRecordProfile,
  HomeSummary,
  HomeView,
  HouseholdInvitation,
  HouseholdInvitationAcceptance,
  HouseholdMember,
  HouseholdRoster,
  NativeSessionCredential,
  ProfessionalOrganization,
  ProfessionalProfileWorkspace,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectActivityRecord,
  ProjectItem,
  ProjectInvitation,
  ProjectQuote,
  RespondToProjectInvitationInput,
  RemoveHouseholdMemberInput,
  RevokeHouseholdInvitationInput,
  RevokeProjectInvitationInput,
  ReviseProfessionalProposalInput,
  RoloConversationState,
  RoloReply,
  RoloSelectedPhoto,
  RoloTurn,
  ServerSession,
  SaveProjectItemInput,
  SaveProjectQuoteInput,
  SaveProfessionalProfileInput,
  SetHouseholdMemberRoleInput,
  SubmitProfessionalProposalInput,
  InviteProfessionalInput,
  UpdateWorkInput,
  UpdateHomeRecordInput,
  UpdateArtifactMetadataInput,
  WorkCategory,
  WorkKind,
  WorkRecord,
  WorkStatus,
} from './model.ts'
import {
  homeCheckupUploadHeaders,
  parseDeletedHomeCheckupPhoto,
  parseHomeCheckupPhoto,
} from './home-checkup.ts'
import { homeRecordUpdateBody, parseHomeRecordProfile } from './home-record.ts'
import {
  acceptHouseholdInvitationBody,
  createHouseholdInvitationBody,
  householdRevisionBody,
  householdRoleBody,
  isHouseholdInvitationRef,
  isHouseholdMembershipRef,
  parseHouseholdAcceptanceEnvelope,
  parseHouseholdInvitationEnvelope,
  parseHouseholdMemberEnvelope,
  parseHouseholdRosterEnvelope,
} from './household.ts'
import { artifactContentFromResponse } from './artifact-content.ts'
import {
  artifactMetadataUpdateBody,
  parseArtifactRecord as parseArtifact,
} from './artifact-metadata.ts'
import {
  browserDeviceFileBytes,
  validatedArtifactPayloadMediaType,
} from './device-file-payload.ts'
import { parseProjectActivity } from './activity.ts'
import {
  homeownerProjectQuoteBody,
  projectQuoteMatchesBody,
} from './homeowner-quote.ts'
import { parseProjectItem, projectItemBody } from './project-item.ts'
import {
  createProfessionalOrganizationBody,
  decideProfessionalProposalBody,
  invitationRevisionBody,
  inviteProfessionalBody,
  isInvitationRef,
  isOrganizationRef,
  isQuoteRef,
  normalizedProfessionalSlug,
  parseCreatedProfessionalOrganization,
  parseProfessionalOrganization,
  parseProfessionalProfileWorkspace,
  parseProfessionalProposal,
  parseProjectInvitation,
  parseProjectQuote,
  professionalDirectoryQuery,
  professionalProposalBody,
  respondToProjectInvitationBody,
  saveProfessionalProfileBody,
} from './professional.ts'
import {
  apiPath,
  browserCookieRequestHeaders,
  boundedRoloConversation,
  commandRef,
  envelopeData,
  isArtifactRef,
  isCalendarDate,
  isHomeRef,
  isHomesroloClientContract,
  isProjectRef,
  isPhotoRef,
  isSessionToken,
  nativeRequestHeaders,
  normalizedRoloSelectedPhoto,
  normalizeApiOrigin,
  pwaCookieBridgeRequestInit,
  problemCode,
  roloPhotoReviewPresenceAllowed,
  type HomesroloClientContract,
} from './protocol.ts'
import {
  ActiveArtifactUploadAttempts,
  type ArtifactUploadAttempt,
  shouldDeleteUploadFile,
} from './upload-attempt.ts'

type JsonRecord = Record<string, unknown>
type TokenProvider = () => string | null

const WORK_KINDS = new Set<WorkKind>(['project', 'issue', 'repair', 'service', 'incident', 'task'])
const WORK_STATUSES = new Set<WorkStatus>(['planned', 'in_progress', 'completed', 'cancelled'])
const WORK_CATEGORIES = new Set<WorkCategory>([
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
])
const RELATIONSHIPS = new Set(['claimed_unverified', 'verified_controller', 'invited_participant'])
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
  const requiredKeys: readonly (keyof Capabilities)[] = [
    'emailCodeSignIn', 'magicLinkSignIn', 'persistence', 'projectQuotes',
    'homeResearch', 'homeAssistant', 'uploads', 'photoCheckups', 'projectReview',
    'projectReviewAttachments', 'homeRecordHandoffs', 'invitations', 'sharing',
  ]
  const allowedKeys = new Set<keyof Capabilities>([...requiredKeys, 'homeAssistantVision'])
  if (Object.keys(source).some(key => !allowedKeys.has(key as keyof Capabilities))) {
    throw new Error('invalid_wire_data')
  }
  const out = {} as Record<keyof Capabilities, boolean>
  for (const key of requiredKeys) {
    if (typeof source[key] !== 'boolean') throw new Error('invalid_wire_data')
    out[key] = source[key]
  }
  if (source.homeAssistantVision !== undefined && typeof source.homeAssistantVision !== 'boolean') {
    throw new Error('invalid_wire_data')
  }
  out.homeAssistantVision = source.homeAssistantVision === true
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
    || (source.occurredOn !== null && !isCalendarDate(source.occurredOn))
    || (source.assignedMembershipRef !== null
      && (typeof source.assignedMembershipRef !== 'string'
        || !/^hmbr_[A-Za-z0-9_-]{43}$/.test(source.assignedMembershipRef)))
    || (source.dueOn !== null && !isCalendarDate(source.dueOn))
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
    assignedMembershipRef: source.assignedMembershipRef,
    dueOn: source.dueOn,
    summary: text(source.summary, 2_000, true),
    professionalLabel: source.professionalLabel,
    revision: count(source.revision),
    archived: source.archived,
    archivedAt: source.archivedAt,
    createdAt: text(source.createdAt, 40),
    updatedAt: text(source.updatedAt, 40),
  }
}

function parseRolo(value: unknown): RoloReply {
  const source = record(value)
  const proposed = source.proposedWork === null ? null : record(source.proposedWork)
  // `photoReview` was added after the first mobile contract. Missing and null
  // both mean that no saved photo was reviewed, which keeps rolling deploys
  // backward compatible without relaxing the shape of a present review.
  const photoReviewSource = source.photoReview === undefined || source.photoReview === null
    ? null
    : record(source.photoReview)
  if (typeof source.requestRef !== 'string' || !source.requestRef.startsWith('hask_')
    || (source.destination !== null
      && (typeof source.destination !== 'string' || !DESTINATIONS.has(source.destination)))
    || (source.projectRef !== null && !isProjectRef(source.projectRef))
    || !Array.isArray(source.followUpQuestions)
    || source.followUpQuestions.some(question => typeof question !== 'string')) {
    throw new Error('invalid_wire_data')
  }
  let photoReview: RoloReply['photoReview'] = null
  if (photoReviewSource) {
    const urgency = photoReviewSource.urgency
    const suggestedTrade = photoReviewSource.suggestedTrade
    const hazardSignal = photoReviewSource.hazardSignal
    const hazards = new Set([
      'none', 'visible_fire_or_smoke', 'visible_sparking_or_exposed_electrical',
      'water_near_electrical', 'major_displacement_or_collapse',
    ])
    if (Object.keys(photoReviewSource).sort().join(',')
        !== 'cannotConfirm,hazardSignal,suggestedTrade,urgency,visibleObservations'
      || !Array.isArray(photoReviewSource.visibleObservations)
      || photoReviewSource.visibleObservations.length < 1
      || photoReviewSource.visibleObservations.length > 5
      || photoReviewSource.visibleObservations.some(item => typeof item !== 'string')
      || !Array.isArray(photoReviewSource.cannotConfirm)
      || photoReviewSource.cannotConfirm.length < 1
      || photoReviewSource.cannotConfirm.length > 4
      || photoReviewSource.cannotConfirm.some(item => typeof item !== 'string')
      || (urgency !== 'routine' && urgency !== 'prompt_attention' && urgency !== 'urgent')
      || (suggestedTrade !== null
        && (typeof suggestedTrade !== 'string'
          || !WORK_CATEGORIES.has(suggestedTrade as WorkCategory)))
      || typeof hazardSignal !== 'string'
      || !hazards.has(hazardSignal)) {
      throw new Error('invalid_wire_data')
    }
    photoReview = {
      visibleObservations: photoReviewSource.visibleObservations.map(item => text(item, 240)),
      cannotConfirm: photoReviewSource.cannotConfirm.map(item => text(item, 240)),
      urgency,
      suggestedTrade: suggestedTrade as WorkCategory | null,
      hazardSignal: hazardSignal as NonNullable<RoloReply['photoReview']>['hazardSignal'],
    }
  }
  let proposedWork: RoloReply['proposedWork'] = null
  if (proposed) {
    if (typeof proposed.kind !== 'string' || !WORK_KINDS.has(proposed.kind as WorkKind)
      || typeof proposed.category !== 'string' || !WORK_CATEGORIES.has(proposed.category as WorkCategory)
      || typeof proposed.status !== 'string' || !WORK_STATUSES.has(proposed.status as WorkStatus)
      || (proposed.occurredOn !== null && !isCalendarDate(proposed.occurredOn))
      || (proposed.assignedMembershipRef !== null
        && !isHouseholdMembershipRef(proposed.assignedMembershipRef))
      || (proposed.dueOn !== null && !isCalendarDate(proposed.dueOn))
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
      assignedMembershipRef: proposed.assignedMembershipRef,
      dueOn: proposed.dueOn,
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
    photoReview,
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
  readonly #privateRequestGuard: (() => () => void) | undefined
  readonly #clientContract: HomesroloClientContract
  readonly #uploadAttempts = new ActiveArtifactUploadAttempts()

  constructor(token: TokenProvider, options: {
    readonly origin?: string
    readonly onSignedOut?: () => void
    readonly privateRequestGuard?: () => () => void
    readonly clientContract?: HomesroloClientContract
  } = {}) {
    const clientContract = options.clientContract ?? 'native.v1'
    if (!isHomesroloClientContract(clientContract)) throw new Error('invalid_client_contract')
    this.#origin = normalizeApiOrigin(options.origin ?? configuredOrigin())
    this.#token = token
    this.#onSignedOut = options.onSignedOut ?? (() => undefined)
    this.#privateRequestGuard = options.privateRequestGuard
    this.#clientContract = clientContract
  }

  #usesCookieSession(): boolean {
    return this.#clientContract === 'pwa.v1'
  }

  #authenticatedToken(): string | null {
    if (this.#usesCookieSession()) return null
    const token = this.#token()
    if (!token || !isSessionToken(token)) throw new NativeApiError(401, 'signed_out')
    return token
  }

  #authenticatedHeaders(
    token: string | null,
    content: 'none' | 'json' = 'none',
  ): Record<string, string> {
    return this.#usesCookieSession()
      ? browserCookieRequestHeaders(content)
      : nativeRequestHeaders(token, content, this.#clientContract)
  }

  #credentials(): RequestCredentials {
    return this.#usesCookieSession() ? 'same-origin' : 'omit'
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
  ): Promise<ResolvedArtifactRecord> {
    return parseArtifact(await this.#request(
      apiPath('homes', homeRef, 'artifacts', attempt.artifactRef, 'complete'),
      { method: 'POST', body: { commandRef: attempt.commandRef } },
    ))
  }

  async #request(path: string, options: {
    readonly method?: 'GET' | 'POST' | 'DELETE'
    readonly body?: unknown
    readonly authentication?: 'required' | 'bootstrap'
  } = {}): Promise<unknown> {
    const authentication = options.authentication ?? 'required'
    const privateRequest = authentication === 'required'
      && path !== apiPath('session') && path !== apiPath('auth', 'signout')
    const confirmCurrent = privateRequest ? this.#privateRequestGuard?.() : undefined
    const token = authentication === 'required' ? this.#authenticatedToken() : null
    let response: Response
    try {
      const serialized = options.body === undefined ? null : JSON.stringify(options.body)
      response = await fetch(`${this.#origin}${path}`, {
        method: options.method ?? 'GET',
        credentials: this.#credentials(),
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: this.#authenticatedHeaders(
          token,
          options.body === undefined ? 'none' : 'json',
        ),
        ...(serialized === null ? {} : { body: serialized }),
      })
    } catch {
      throw new NativeApiError(0, 'network_unavailable')
    }
    let payload: unknown
    try { payload = await response.json() } catch { payload = null }
    confirmCurrent?.()
    if (!response.ok) {
      const problem = problemCode(payload)
      if (response.status === 401 && (privateRequest || !this.#usesCookieSession())) this.#onSignedOut()
      throw new NativeApiError(response.status, problem.code, problem.retryAfterSeconds)
    }
    try { return envelopeData(payload) } catch { throw new NativeApiError(response.status, 'invalid_response') }
  }

  /**
   * The browser-only migration action is the sole PWA request allowed to carry
   * an old bearer. It is bodyless, same-origin, and immediately replaces that
   * script-readable credential with the server's HttpOnly cookie.
   */
  async #pwaCookieBridge(path: string, token: string | null): Promise<unknown> {
    if (this.#clientContract !== 'pwa.v1') throw new Error('invalid_client_contract')
    let response: Response
    try {
      response = await fetch(`${this.#origin}${path}`, {
        ...pwaCookieBridgeRequestInit(token),
      })
    } catch {
      throw new NativeApiError(0, 'network_unavailable')
    }
    let payload: unknown
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok) {
      const problem = problemCode(payload)
      // Bootstrap validates the current cookie afterward; a failed legacy
      // credential cannot sign out a newer browser principal.
      throw new NativeApiError(response.status, problem.code, problem.retryAfterSeconds)
    }
    try { return envelopeData(payload) } catch {
      throw new NativeApiError(response.status, 'invalid_response')
    }
  }

  async #readArtifactContent(
    path: string,
    artifactRef: string,
    fallbackDisplayName?: string,
  ): Promise<ArtifactContent> {
    const confirmCurrent = this.#privateRequestGuard?.()
    const token = this.#authenticatedToken()
    let response: Response
    try {
      response = await fetch(`${this.#origin}${path}`, {
        method: 'GET',
        credentials: this.#credentials(),
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: {
          ...this.#authenticatedHeaders(token),
          accept: '*/*',
        },
      })
    } catch {
      throw new NativeApiError(0, 'network_unavailable')
    }
    if (!response.ok) {
      let payload: unknown = null
      try { payload = await response.json() } catch { /* Binary errors may have no JSON body. */ }
      const problem = problemCode(payload)
      confirmCurrent?.()
      if (response.status === 401) this.#onSignedOut()
      throw new NativeApiError(response.status, problem.code, problem.retryAfterSeconds)
    }
    let content: ArtifactContent
    try {
      content = await artifactContentFromResponse(response, artifactRef, fallbackDisplayName)
    } catch {
      throw new NativeApiError(response.status, 'invalid_response')
    }
    confirmCurrent?.()
    return content
  }

  async requestEmailCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase()
    const data = record(await this.#request(apiPath('auth', 'email-code'), {
      method: 'POST', body: { email: normalized }, authentication: 'bootstrap',
    }))
    if (data.accepted !== true) throw new NativeApiError(200, 'invalid_response')
  }

  async verifyEmailCode(email: string, code: string): Promise<NativeSessionCredential | null> {
    const data = record(await this.#request(apiPath('auth', 'email-code', 'verify'), {
      method: 'POST', body: { email: email.trim().toLowerCase(), code }, authentication: 'bootstrap',
    }))
    if (this.#usesCookieSession()) {
      if (Object.keys(data).length !== 1 || data.signedIn !== true) {
        throw new NativeApiError(200, 'invalid_response')
      }
      return null
    }
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

  async upgradeLegacyPwaSession(legacyBearer: string | null): Promise<void> {
    if (this.#clientContract !== 'pwa.v1') return
    if (legacyBearer !== null && !isSessionToken(legacyBearer)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const data = record(await this.#pwaCookieBridge(
      apiPath('auth', 'pwa-upgrade'),
      legacyBearer,
    ))
    if (Object.keys(data).length !== 1 || typeof data.signedIn !== 'boolean') {
      throw new NativeApiError(200, 'invalid_response')
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
    const confirmOperation = this.#privateRequestGuard?.()
    const command = createCommandRef ?? await this.newCommandRef()
    confirmOperation?.()
    return parseHomeSummary(await this.#request(apiPath('homes'), {
      method: 'POST',
      body: {
        commandRef: command,
        displayLabel: displayLabel.trim(),
        privateLocationLabel: privateLocationLabel.trim(),
      },
    }))
  }

  async getHome(homeRef: string): Promise<HomeView> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    return parseHomeView(await this.#request(apiPath('homes', homeRef)))
  }

  async getHomeRecord(homeRef: string): Promise<HomeRecordProfile> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    const profile = parseHomeRecordProfile(
      await this.#request(apiPath('homes', homeRef, 'record')),
    )
    if (profile.homeRef !== homeRef) throw new NativeApiError(200, 'invalid_response')
    return profile
  }

  async updateHomeRecord(
    homeRef: string,
    input: UpdateHomeRecordInput,
  ): Promise<HomeRecordProfile> {
    const body = homeRecordUpdateBody(input)
    if (!isHomeRef(homeRef) || !body) throw new NativeApiError(400, 'invalid_request')
    const profile = parseHomeRecordProfile(await this.#request(
      apiPath('homes', homeRef, 'record'), { method: 'POST', body },
    ))
    if (profile.homeRef !== homeRef || profile.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return profile
  }

  async listWork(homeRef: string): Promise<readonly WorkRecord[]> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    const data = await this.#request(apiPath('homes', homeRef, 'projects'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseWork)
  }

  async getHousehold(homeRef: string): Promise<HouseholdRoster> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    return parseHouseholdRosterEnvelope(
      await this.#request(apiPath('homes', homeRef, 'household')),
      homeRef,
    )
  }

  async listHouseholdMembers(homeRef: string): Promise<readonly HouseholdMember[]> {
    return (await this.getHousehold(homeRef)).members
  }

  async createHouseholdInvitation(
    homeRef: string,
    input: CreateHouseholdInvitationInput,
  ): Promise<HouseholdInvitation> {
    const body = createHouseholdInvitationBody(input)
    if (!isHomeRef(homeRef) || !body) throw new NativeApiError(400, 'invalid_request')
    const invitation = parseHouseholdInvitationEnvelope(await this.#request(
      apiPath('homes', homeRef, 'household', 'invitations'),
      { method: 'POST', body },
    ), homeRef)
    if (invitation.status !== 'pending' || invitation.revision !== 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitation
  }

  async acceptHouseholdInvitation(
    invitationRef: string,
    input: AcceptHouseholdInvitationInput,
  ): Promise<HouseholdInvitationAcceptance> {
    const body = acceptHouseholdInvitationBody(input)
    if (!isHouseholdInvitationRef(invitationRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return parseHouseholdAcceptanceEnvelope(await this.#request(
      apiPath('household', 'invitations', invitationRef, 'accept'),
      { method: 'POST', body },
    ), invitationRef)
  }

  async revokeHouseholdInvitation(
    homeRef: string,
    invitationRef: string,
    input: RevokeHouseholdInvitationInput,
  ): Promise<HouseholdInvitation> {
    const body = householdRevisionBody(input)
    if (!isHomeRef(homeRef) || !isHouseholdInvitationRef(invitationRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const invitation = parseHouseholdInvitationEnvelope(await this.#request(
      apiPath('homes', homeRef, 'household', 'invitations', invitationRef, 'revoke'),
      { method: 'POST', body },
    ), homeRef, invitationRef)
    if (invitation.status !== 'revoked' || invitation.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitation
  }

  async removeHouseholdMember(
    homeRef: string,
    membershipRef: string,
    input: RemoveHouseholdMemberInput,
  ): Promise<HouseholdMember> {
    const body = householdRevisionBody(input)
    if (!isHomeRef(homeRef) || !isHouseholdMembershipRef(membershipRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const member = parseHouseholdMemberEnvelope(await this.#request(
      apiPath('homes', homeRef, 'household', 'members', membershipRef, 'remove'),
      { method: 'POST', body },
    ), homeRef, membershipRef)
    if (member.state !== 'revoked' || member.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return member
  }

  async setHouseholdMemberRole(
    homeRef: string,
    membershipRef: string,
    input: SetHouseholdMemberRoleInput,
  ): Promise<HouseholdMember> {
    const body = householdRoleBody(input)
    if (!isHomeRef(homeRef) || !isHouseholdMembershipRef(membershipRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const member = parseHouseholdMemberEnvelope(await this.#request(
      apiPath('homes', homeRef, 'household', 'members', membershipRef, 'role'),
      { method: 'POST', body },
    ), homeRef, membershipRef)
    if (member.role !== input.desiredRole || member.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return member
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

  async listProjectActivity(
    homeRef: string,
    projectRef: string,
  ): Promise<readonly ProjectActivityRecord[]> {
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const data = await this.#request(apiPath('homes', homeRef, 'projects', projectRef, 'activity'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    const activity = data.map(parseProjectActivity)
    if (activity.some(entry => entry.homeRef !== homeRef || entry.projectRef !== projectRef)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return activity
  }

  async addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    noteCommandRef?: string,
  ): Promise<ProjectActivityRecord> {
    const confirmOperation = this.#privateRequestGuard?.()
    const cleanBody = body.trim()
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)
      || cleanBody.length < 1 || cleanBody.length > 2_000) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const command = noteCommandRef ?? await this.newCommandRef()
    confirmOperation?.()
    const activity = parseProjectActivity(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'activity'), {
      method: 'POST',
      body: {
        commandRef: command,
        kind: 'note',
        body: cleanBody,
      },
    }))
    if (activity.homeRef !== homeRef || activity.projectRef !== projectRef
      || activity.kind !== 'note' || activity.body !== cleanBody) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return activity
  }

  async addWorkMilestone(
    homeRef: string,
    projectRef: string,
    body: string,
    milestoneCommandRef?: string,
  ): Promise<ProjectActivityRecord> {
    const confirmOperation = this.#privateRequestGuard?.()
    const cleanBody = body.trim()
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)
      || cleanBody.length < 1 || cleanBody.length > 2_000) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const command = milestoneCommandRef ?? await this.newCommandRef()
    confirmOperation?.()
    const activity = parseProjectActivity(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'activity'), {
      method: 'POST',
      body: {
        commandRef: command,
        kind: 'milestone',
        body: cleanBody,
      },
    }))
    if (activity.homeRef !== homeRef || activity.projectRef !== projectRef
      || activity.kind !== 'milestone' || activity.body !== cleanBody) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return activity
  }

  async listProjectItems(homeRef: string, projectRef: string): Promise<readonly ProjectItem[]> {
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const data = await this.#request(apiPath('homes', homeRef, 'projects', projectRef, 'items'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    const items = data.map(parseProjectItem)
    if (items.some(item => item.homeRef !== homeRef || item.projectRef !== projectRef)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return items
  }

  async saveProjectItem(
    homeRef: string,
    projectRef: string,
    input: SaveProjectItemInput,
  ): Promise<ProjectItem> {
    const body = projectItemBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const item = parseProjectItem(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'items'),
      { method: 'POST', body },
    ))
    const expectedRevision = input.expectedRevision === undefined
      ? 1
      : input.expectedRevision + 1
    if (item.homeRef !== homeRef || item.projectRef !== projectRef
      || (input.itemRef !== undefined && item.itemRef !== input.itemRef)
      || item.revision !== expectedRevision) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return item
  }

  async listProjectQuotes(homeRef: string, projectRef: string): Promise<readonly ProjectQuote[]> {
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const data = await this.#request(apiPath('homes', homeRef, 'projects', projectRef, 'quotes'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    const quotes = data.map(parseProjectQuote)
    if (quotes.some(quote => quote.homeRef !== homeRef || quote.projectRef !== projectRef)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return quotes
  }

  async createProjectQuote(
    homeRef: string,
    projectRef: string,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    const body = homeownerProjectQuoteBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef) || !body
      || body.expectedRevision !== undefined) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const quote = parseProjectQuote(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'quotes'),
      { method: 'POST', body },
    ))
    if (quote.homeRef !== homeRef || quote.projectRef !== projectRef
      || quote.revision !== 1 || !projectQuoteMatchesBody(quote, body)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return quote
  }

  async saveProjectQuote(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: SaveProjectQuoteInput,
  ): Promise<ProjectQuote> {
    const body = homeownerProjectQuoteBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef) || !isQuoteRef(quoteRef)
      || !body || body.expectedRevision === undefined) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const quote = parseProjectQuote(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'quotes', quoteRef),
      { method: 'POST', body },
    ))
    if (quote.quoteRef !== quoteRef || quote.homeRef !== homeRef
      || quote.projectRef !== projectRef || quote.revision !== body.expectedRevision + 1
      || !projectQuoteMatchesBody(quote, body)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return quote
  }

  async listProfessionals(filters: {
    readonly trade?: ProfessionalTrade
    readonly serviceArea?: string
  } = {}): Promise<readonly ProfessionalOrganization[]> {
    const query = professionalDirectoryQuery(filters)
    if (query === null) throw new NativeApiError(400, 'invalid_request')
    const data = await this.#request(`${apiPath('professionals')}${query ? `?${query}` : ''}`)
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseProfessionalOrganization)
  }

  async getProfessional(slug: string): Promise<ProfessionalOrganization> {
    const normalized = normalizedProfessionalSlug(slug)
    if (!normalized) throw new NativeApiError(400, 'invalid_request')
    const organization = parseProfessionalOrganization(
      await this.#request(apiPath('professionals', normalized)),
    )
    if (organization.slug !== normalized) throw new NativeApiError(200, 'invalid_response')
    return organization
  }

  async getProfessionalProfile(): Promise<ProfessionalProfileWorkspace> {
    return parseProfessionalProfileWorkspace(
      await this.#request(apiPath('professional', 'profile')),
    )
  }

  async createProfessionalOrganization(
    input: CreateProfessionalOrganizationInput,
  ): Promise<CreatedProfessionalOrganization> {
    const body = createProfessionalOrganizationBody(input)
    if (!body) throw new NativeApiError(400, 'invalid_request')
    return parseCreatedProfessionalOrganization(await this.#request(apiPath('professionals'), {
      method: 'POST', body,
    }))
  }

  async saveProfessionalProfile(
    input: SaveProfessionalProfileInput,
  ): Promise<ProfessionalOrganization> {
    const body = saveProfessionalProfileBody(input)
    if (!body) throw new NativeApiError(400, 'invalid_request')
    const organization = parseProfessionalOrganization(await this.#request(
      apiPath('professional', 'profile'), { method: 'POST', body },
    ))
    if (organization.organizationRef !== input.organizationRef
      || organization.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return organization
  }

  async listProjectInvitations(
    homeRef: string,
    projectRef: string,
  ): Promise<readonly ProjectInvitation[]> {
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const data = await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'invitations'),
    )
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    const invitations = data.map(parseProjectInvitation)
    if (invitations.some(invitation => invitation.homeRef !== homeRef
      || invitation.projectRef !== projectRef)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitations
  }

  async inviteProfessional(
    homeRef: string,
    projectRef: string,
    input: InviteProfessionalInput,
  ): Promise<ProjectInvitation> {
    const body = inviteProfessionalBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const invitation = parseProjectInvitation(await this.#request(
      apiPath('homes', homeRef, 'projects', projectRef, 'invitations'),
      { method: 'POST', body },
    ))
    if (invitation.homeRef !== homeRef || invitation.projectRef !== projectRef
      || invitation.professionalOrganizationRef !== input.professionalOrganizationRef) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitation
  }

  async revokeProjectInvitation(
    homeRef: string,
    projectRef: string,
    invitationRef: string,
    input: RevokeProjectInvitationInput,
  ): Promise<ProjectInvitation> {
    const body = invitationRevisionBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef)
      || !isInvitationRef(invitationRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const invitation = parseProjectInvitation(await this.#request(apiPath(
      'homes', homeRef, 'projects', projectRef, 'invitations', invitationRef, 'revoke',
    ), { method: 'POST', body }))
    if (invitation.invitationRef !== invitationRef || invitation.homeRef !== homeRef
      || invitation.projectRef !== projectRef || invitation.status !== 'revoked'
      || invitation.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitation
  }

  async listProfessionalInvitations(): Promise<readonly ProjectInvitation[]> {
    const data = await this.#request(apiPath('professional', 'invitations'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseProjectInvitation)
  }

  async respondToProjectInvitation(
    invitationRef: string,
    input: RespondToProjectInvitationInput,
  ): Promise<ProjectInvitation> {
    const body = respondToProjectInvitationBody(input)
    if (!isInvitationRef(invitationRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const invitation = parseProjectInvitation(await this.#request(
      apiPath('professional', 'invitations', invitationRef, 'respond'),
      { method: 'POST', body },
    ))
    if (invitation.invitationRef !== invitationRef || invitation.status !== input.response
      || invitation.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return invitation
  }

  professionalArtifactPreviewSource(
    invitationRef: string,
    artifactRef: string,
  ): ProtectedImageSource {
    const token = this.#authenticatedToken()
    if (!isInvitationRef(invitationRef) || !isArtifactRef(artifactRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return {
      uri: `${this.#origin}${apiPath(
        'professional', 'invitations', invitationRef, 'artifacts', artifactRef,
      )}`,
      headers: {
        ...this.#authenticatedHeaders(token),
        accept: '*/*',
      },
    }
  }

  async readProfessionalArtifactContent(
    invitationRef: string,
    artifactRef: string,
  ): Promise<ArtifactContent> {
    if (!isInvitationRef(invitationRef) || !isArtifactRef(artifactRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return this.#readArtifactContent(apiPath(
      'professional', 'invitations', invitationRef, 'artifacts', artifactRef,
    ), artifactRef)
  }

  async getProfessionalProposal(invitationRef: string): Promise<ProfessionalProposal | null> {
    if (!isInvitationRef(invitationRef)) throw new NativeApiError(400, 'invalid_request')
    const data = await this.#request(
      apiPath('professional', 'invitations', invitationRef, 'proposals'),
    )
    const proposal = data === null ? null : parseProfessionalProposal(data)
    if (proposal !== null && proposal.invitationRef !== invitationRef) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return proposal
  }

  async submitProfessionalProposal(
    invitationRef: string,
    input: SubmitProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    const body = professionalProposalBody(input)
    if (!isInvitationRef(invitationRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const proposal = parseProfessionalProposal(await this.#request(
      apiPath('professional', 'invitations', invitationRef, 'proposals'),
      { method: 'POST', body },
    ))
    if (proposal.invitationRef !== invitationRef || proposal.revision !== 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return proposal
  }

  async reviseProfessionalProposal(
    invitationRef: string,
    quoteRef: string,
    input: ReviseProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    const body = professionalProposalBody(input)
    if (!isInvitationRef(invitationRef) || !isQuoteRef(quoteRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const proposal = parseProfessionalProposal(await this.#request(apiPath(
      'professional', 'invitations', invitationRef, 'proposals', quoteRef,
    ), { method: 'POST', body }))
    if (proposal.invitationRef !== invitationRef || proposal.quoteRef !== quoteRef
      || proposal.revision !== input.expectedRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return proposal
  }

  async decideProfessionalProposal(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: DecideProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    const body = decideProfessionalProposalBody(input)
    if (!isHomeRef(homeRef) || !isProjectRef(projectRef) || !isQuoteRef(quoteRef) || !body) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const proposal = parseProfessionalProposal(await this.#request(apiPath(
      'homes', homeRef, 'projects', projectRef, 'proposals', quoteRef, 'decision',
    ), { method: 'POST', body }))
    if (proposal.homeRef !== homeRef || proposal.projectRef !== projectRef
      || proposal.quoteRef !== quoteRef || proposal.homeownerDecision !== input.decision
      || proposal.decisionRevision !== input.expectedDecisionRevision + 1) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return proposal
  }

  async askRolo(
    homeRef: string,
    message: string,
    history: readonly RoloTurn[],
    conversationState: RoloConversationState,
    projectRef?: string,
    selectedPhoto?: RoloSelectedPhoto,
  ): Promise<RoloReply> {
    if (!isHomeRef(homeRef) || (projectRef !== undefined && !isProjectRef(projectRef))) {
      throw new NativeApiError(400, 'invalid_request')
    }
    let conversation: ReturnType<typeof boundedRoloConversation>
    try { conversation = boundedRoloConversation(message, history, conversationState) } catch {
      throw new NativeApiError(400, 'invalid_request')
    }
    const photoSelection = selectedPhoto === undefined
      ? null
      : normalizedRoloSelectedPhoto(selectedPhoto)
    if (selectedPhoto !== undefined && !photoSelection) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const reply = parseRolo(await this.#request(apiPath('homes', homeRef, 'assistant'), {
      method: 'POST',
      body: {
        ...conversation,
        destination: 'rolo',
        ...(projectRef ? { projectRef } : {}),
        ...(photoSelection ? { selectedPhoto: photoSelection } : {}),
      },
    }))
    if (!roloPhotoReviewPresenceAllowed(photoSelection, reply.photoReview !== null)) {
      throw new NativeApiError(502, 'invalid_response')
    }
    return reply
  }

  async listArtifacts(homeRef: string): Promise<readonly ResolvedArtifactRecord[]> {
    const data = await this.#request(apiPath('homes', homeRef, 'artifacts'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    return data.map(parseArtifact)
  }

  artifactPreviewSource(homeRef: string, artifactRef: string): ProtectedImageSource {
    const token = this.#authenticatedToken()
    if (!isHomeRef(homeRef) || !isArtifactRef(artifactRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return {
      uri: `${this.#origin}${apiPath('homes', homeRef, 'artifacts', artifactRef, 'preview')}`,
      headers: {
        ...this.#authenticatedHeaders(token),
        accept: 'image/*',
      },
    }
  }

  async readArtifactContent(homeRef: string, artifact: ArtifactRecord): Promise<ArtifactContent> {
    if (!isHomeRef(homeRef) || artifact.homeRef !== homeRef
      || !isArtifactRef(artifact.artifactRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const content = await this.#readArtifactContent(
      apiPath('homes', homeRef, 'artifacts', artifact.artifactRef, 'content'),
      artifact.artifactRef,
      artifact.displayName,
    )
    if (content.mediaType !== artifact.mediaType || content.byteLength !== artifact.byteLength) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return content
  }

  async uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ResolvedArtifactRecord> {
    const confirmOperation = this.#privateRequestGuard?.()
    this.#cleanupConfirmedUploadFiles()
    if (!isHomeRef(homeRef) || (projectRef !== undefined && !isProjectRef(projectRef))
      || deviceFile.byteLength < 1 || deviceFile.byteLength > 10 * 1024 * 1024) {
      throw new NativeApiError(400, 'invalid_request')
    }
    let payload: ArrayBuffer
    try {
      if (Platform.OS === 'web') {
        payload = await browserDeviceFileBytes(deviceFile)
      } else {
        const sourceFile = new File(deviceFile.uri)
        if (!sourceFile.exists) throw new Error('missing_file')
        payload = await sourceFile.arrayBuffer()
      }
    } catch {
      throw new NativeApiError(400, 'invalid_file')
    }
    let mediaType: ArtifactMediaType
    try {
      mediaType = validatedArtifactPayloadMediaType(deviceFile, kind, payload)
    } catch (error) {
      const code = error instanceof Error && error.message === 'invalid_file'
        ? 'invalid_file'
        : 'unsupported_file'
      throw new NativeApiError(400, code)
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
    }, {
      uri: deviceFile.uri,
      ...(deviceFile.lifecycle ? { lifecycle: deviceFile.lifecycle } : {}),
    }, () => this.newCommandRef())
    confirmOperation?.()
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
    confirmOperation?.()
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
    confirmOperation?.()
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
    confirmOperation?.()
    const artifact = await this.#completeArtifactUpload(homeRef, {
      ...attempt,
      artifactRef: reservation.artifactRef,
    })
    this.#confirmUploadAttempt(attempt)
    return artifact
  }

  async updateArtifactMetadata(
    homeRef: string,
    artifactRef: string,
    input: UpdateArtifactMetadataInput,
  ): Promise<ResolvedArtifactRecord> {
    if (!isHomeRef(homeRef) || !isArtifactRef(artifactRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    let body: ReturnType<typeof artifactMetadataUpdateBody>
    try { body = artifactMetadataUpdateBody(input) } catch {
      throw new NativeApiError(400, 'invalid_request')
    }
    const artifact = parseArtifact(await this.#request(
      apiPath('homes', homeRef, 'artifacts', artifactRef, 'metadata'),
      { method: 'POST', body },
    ))
    if (artifact.homeRef !== homeRef || artifact.artifactRef !== artifactRef
      || artifact.projectRef !== body.projectRef
      || artifact.observedOn !== body.observedOn
      || artifact.phase !== body.phase
      || artifact.areaLabel !== body.areaLabel
      || JSON.stringify(artifact.geoPin) !== JSON.stringify(body.geoPin)
      || artifact.revision !== body.expectedRevision + 1) {
      throw new NativeApiError(502, 'invalid_response')
    }
    return artifact
  }

  async listHomeCheckups(homeRef: string): Promise<readonly HomeCheckupPhoto[]> {
    if (!isHomeRef(homeRef)) throw new NativeApiError(400, 'invalid_request')
    const data = await this.#request(apiPath('homes', homeRef, 'photo-checkups'))
    if (!Array.isArray(data)) throw new NativeApiError(200, 'invalid_response')
    const photos = data.map(parseHomeCheckupPhoto)
    if (photos.length > 100 || photos.some(photo => photo.homeRef !== homeRef)) {
      throw new NativeApiError(200, 'invalid_response')
    }
    return photos
  }

  homeCheckupPhotoSource(
    homeRef: string,
    photoRef: string,
    variant: 'thumbnail' | 'full',
  ): ProtectedImageSource {
    const token = this.#authenticatedToken()
    if (!isHomeRef(homeRef) || !isPhotoRef(photoRef)
      || (variant !== 'thumbnail' && variant !== 'full')) {
      throw new NativeApiError(400, 'invalid_request')
    }
    return {
      uri: `${this.#origin}${apiPath('homes', homeRef, 'photo-checkups', photoRef, variant)}`,
      headers: {
        ...this.#authenticatedHeaders(token),
        accept: 'image/jpeg',
      },
    }
  }

  async uploadHomeCheckup(
    homeRef: string,
    input: CreateHomeCheckupPhotoInput,
  ): Promise<HomeCheckupPhoto> {
    const confirmOperation = this.#privateRequestGuard?.()
    const extraHeaders = homeCheckupUploadHeaders(input)
    if (!isHomeRef(homeRef) || !extraHeaders || input.file.byteLength < 1
      || input.file.byteLength > 10 * 1024 * 1024) {
      throw new NativeApiError(400, 'invalid_request')
    }
    let payload: ArrayBuffer
    try {
      if (Platform.OS === 'web') {
        payload = await browserDeviceFileBytes(input.file)
      } else {
        const sourceFile = new File(input.file.uri)
        if (!sourceFile.exists) throw new Error('missing_file')
        payload = await sourceFile.arrayBuffer()
      }
    } catch {
      throw new NativeApiError(400, 'invalid_file')
    }
    let mediaType: 'image/jpeg' | 'image/png'
    try {
      const detected = validatedArtifactPayloadMediaType(input.file, 'photo', payload)
      if (detected === 'application/pdf') throw new Error('unsupported_file')
      mediaType = detected
    } catch (error) {
      const code = error instanceof Error && error.message === 'invalid_file'
        ? 'invalid_file'
        : 'unsupported_file'
      throw new NativeApiError(400, code)
    }
    confirmOperation?.()
    const token = this.#authenticatedToken()
    const confirmCurrent = this.#privateRequestGuard?.()
    let response: Response
    try {
      response = await fetch(`${this.#origin}${apiPath('homes', homeRef, 'photo-checkups')}`, {
        method: 'POST',
        credentials: this.#credentials(),
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: {
          ...this.#authenticatedHeaders(token),
          ...extraHeaders,
          'content-type': mediaType,
        },
        body: payload,
      })
    } catch {
      throw new NativeApiError(0, 'network_unavailable')
    }
    let responseBody: unknown
    try { responseBody = await response.json() } catch { responseBody = null }
    confirmCurrent?.()
    if (!response.ok) {
      const problem = problemCode(responseBody)
      if (response.status === 401) this.#onSignedOut()
      throw new NativeApiError(response.status, problem.code, problem.retryAfterSeconds)
    }
    let photo: HomeCheckupPhoto
    try { photo = parseHomeCheckupPhoto(envelopeData(responseBody)) } catch {
      throw new NativeApiError(response.status, 'invalid_response')
    }
    if (response.status !== 201 || photo.homeRef !== homeRef
      || photo.observedOn !== input.observedOn || photo.area !== input.area
      || photo.viewLabel !== input.viewLabel.trim() || photo.caption !== input.caption.trim()) {
      throw new NativeApiError(response.status, 'invalid_response')
    }
    return photo
  }

  async deleteHomeCheckup(
    homeRef: string,
    photoRef: string,
  ): Promise<DeletedHomeCheckupPhoto> {
    if (!isHomeRef(homeRef) || !isPhotoRef(photoRef)) {
      throw new NativeApiError(400, 'invalid_request')
    }
    const deleted = parseDeletedHomeCheckupPhoto(await this.#request(
      apiPath('homes', homeRef, 'photo-checkups', photoRef), { method: 'DELETE' },
    ))
    if (deleted.photoRef !== photoRef) throw new NativeApiError(200, 'invalid_response')
    return deleted
  }
}
