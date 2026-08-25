/**
 * REMOTE ADAPTER — HomeownerDataPort over the same-origin /api/v1 JSON wire.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8 + PR #15). The
 * server defines authenticated home/project reads and bounded same-origin
 * writes, and this adapter operates exactly those:
 *
 *   GET  /api/v1/session          → decodeSession
 *   GET  /api/v1/homes            → decodeServerHomeSummary[]
 *   GET  /api/v1/homes/{homeRef}  → decodeServerHomeView
 *   POST /api/v1/homes            → 201 decodeServerHomeSummary
 *   POST /api/v1/homes/{homeRef}/intake → 201 decodeRecordedHomeIntake
 *   POST /api/v1/homes/{homeRef}/research → 200 decodeHomeResearchResult
 *
 * The create body is EXACTLY homeownerApiCreateHomeInputSchema:
 * `{ commandRef, displayLabel, privateLocationLabel }`. The commandRef is the
 * one browser-minted identifier (an idempotency ref, command-ref.ts);
 * requestedAt, the principal, and every membership fact are server-derived.
 * homeType, yearBuilt, and systems never enter that create command. They cross
 * only through POST /api/v1/homes/{homeRef}/intake after the server returns
 * the exact homeRef.
 *
 * Any port method without a server route returns 'unavailable' without
 * building a request. When the server defines a route, the adapter gains it
 * together with its decoder.
 *
 * Enabled only when the runtime mode resolves to 'remote' (mode.ts; default
 * synthetic, unknown values fail closed). The adapter holds no state, invents
 * no data, and identifies nobody — the session is whatever the server's
 * cookie resolves to. The browser never sends a principal ref, provider id,
 * raw storage location, or authority claim.
 */

import { COMMAND_REF_PATTERN } from './command-ref.ts'
import {
  NO_CAPABILITIES,
  type HomeownerDataPort, type HomeownerSession, type PortResult, type SessionState,
} from './types.ts'
import {
  fetchArtifactUploadTransport,
  fetchPhotoCheckupUploadTransport,
  type ArtifactUploadTransport,
  type PhotoCheckupUploadTransport,
  type JsonTransport, type TransportReply, type TransportRequest,
} from './transport.ts'
import { roofingIntent } from '../roofing-intent.ts'
import {
  decodeArtifact, decodeArtifactUploadReservation, decodeDeletedPhotoCheckup, decodeHomeRecordHandoffList, decodeHomeRecordHandoffPreview, decodeHomeResearchResult, decodeList, decodePhotoCheckup, decodePhotoCheckupList, decodeProject, decodeProjectActivity, decodeProjectItem, decodeProjectQuote, decodeProjectReviewPreview, decodeProjectReviewSubmission, decodeRecordedHomeIntake, decodeServerHomeSummary, decodeServerHomeView, decodeSession,
  portErrorForStatus, unwrapEnvelope,
} from './wire.ts'

const API = '/api/v1'

/**
 * Path segments are validated against the EXACT ref type the route takes. A
 * well-formed ref of the wrong kind — an hprn_ or hprj_ where a home belongs —
 * is just as rejected as garbage: it never becomes a request path.
 */
const HOME_REF = /^hhom_[A-Za-z0-9_-]{43}$/
const PROJECT_REF = /^hprj_[A-Za-z0-9_-]{43}$/
const PROJECT_ITEM_REF = /^hpit_[A-Za-z0-9_-]{43}$/
const ARTIFACT_REF = /^hart_[A-Za-z0-9_-]{43}$/
const PHOTO_REF = /^hpho_[A-Za-z0-9_-]{43}$/
const QUOTE_REF = /^hquo_[A-Za-z0-9_-]{43}$/
const SHARE_REF = /^hshr_[A-Za-z0-9_-]{43}$/
const HANDOFF_ARTIFACT_REF = /^hproj_[A-Za-z0-9_-]{43}$/
const SHA256 = /^[a-f0-9]{64}$/
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const QUOTE_SCOPE_KEYS = new Set([
  'measurement', 'roof_configuration', 'tear_off', 'decking', 'underlayment',
  'leak_barrier', 'primary_materials', 'starter_and_ridge', 'valleys',
  'flashing_transitions', 'penetrations', 'ventilation', 'permits', 'cleanup',
  'workmanship_warranty', 'manufacturer_warranty', 'payment_terms', 'exclusions',
])
const PHOTO_CHECKUP_AREAS = new Set([
  'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
  'hvac', 'water_heater', 'foundation', 'gutters', 'other',
])
const MAX_PHOTO_INPUT_BYTES = 10 * 1024 * 1024

function artifactMediaType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50
    && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d
    && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

function safeArtifactDisplayName(input: string): string | null {
  const candidate = input.normalize('NFC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!candidate || candidate === '.' || candidate === '..') return null
  return candidate.slice(0, 160).trim() || null
}

async function hashedFilePayload(file: File): Promise<{
  readonly payload: ArrayBuffer
  readonly bytes: Uint8Array
  readonly sha256: string
} | null> {
  try {
    const payload = await file.arrayBuffer()
    if (payload.byteLength !== file.size) return null
    const hash = await globalThis.crypto.subtle.digest('SHA-256', payload)
    const sha256 = [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, '0')).join('')
    return { payload, bytes: new Uint8Array(payload), sha256 }
  } catch {
    return null
  }
}

function validCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function homeRefSegment(candidate: string): string | null {
  return HOME_REF.test(candidate) ? candidate : null
}

function boundedResearchText(value: string, maximum: number): string | null {
  const trimmed = value.trim()
  return trimmed.length >= 1
    && trimmed.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)
    ? trimmed
    : null
}

function projectRefSegment(candidate: string): string | null {
  return PROJECT_REF.test(candidate) ? candidate : null
}

const PROJECT_CATEGORIES = [
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
] as const
const PROJECT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const

function projectUpdateBody(input: Parameters<HomeownerDataPort['updateProject']>[2]) {
  const body: Record<string, unknown> = {
    commandRef: input.commandRef,
    expectedRevision: input.expectedRevision,
  }
  if (!COMMAND_REF_PATTERN.test(input.commandRef)
    || !Number.isInteger(input.expectedRevision)
    || input.expectedRevision < 1) return null
  let editableFieldCount = 0
  if (Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string') return null
    const title = input.title.trim()
    if (title.length < 1 || title.length > 120) return null
    body.title = title
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'category')) {
    if (!input.category || !PROJECT_CATEGORIES.includes(input.category)) return null
    body.category = input.category
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'status')) {
    if (!input.status || !PROJECT_STATUSES.includes(input.status)) return null
    body.status = input.status
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'occurredOn')) {
    if (input.occurredOn !== null
      && (typeof input.occurredOn !== 'string' || !validCalendarDate(input.occurredOn))) {
      return null
    }
    body.occurredOn = input.occurredOn
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'summary')) {
    if (input.summary !== null && typeof input.summary !== 'string') return null
    const summary = input.summary?.trim() ?? null
    if (summary !== null && summary.length > 2000) return null
    body.summary = summary
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'professionalLabel')) {
    if (input.professionalLabel !== null && typeof input.professionalLabel !== 'string') return null
    const professionalLabel = input.professionalLabel?.trim() ?? null
    if (professionalLabel !== null
      && (professionalLabel.length < 1 || professionalLabel.length > 160)) return null
    body.professionalLabel = professionalLabel
    editableFieldCount += 1
  }
  if (Object.hasOwn(input, 'archived')) {
    if (typeof input.archived !== 'boolean') return null
    body.archived = input.archived
    editableFieldCount += 1
  }
  return editableFieldCount > 0 ? body : null
}

function projectItemBody(input: Parameters<HomeownerDataPort['saveProjectItem']>[2]) {
  const label = input.label.trim()
  const detail = input.detail?.trim()
  const itemRefSupplied = input.itemRef !== undefined
  const revisionSupplied = input.expectedRevision !== undefined
  if (!COMMAND_REF_PATTERN.test(input.commandRef)
    || itemRefSupplied !== revisionSupplied
    || (input.itemRef !== undefined && !PROJECT_ITEM_REF.test(input.itemRef))
    || (input.expectedRevision !== undefined
      && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1))
    || !['material', 'decision', 'wishlist'].includes(input.kind)
    || !['considering', 'chosen', 'purchased', 'declined'].includes(input.state)
    || label.length < 1 || label.length > 160
    || (detail !== undefined && (detail.length < 1 || detail.length > 2000))) {
    return null
  }
  return {
    commandRef: input.commandRef,
    ...(input.itemRef ? { itemRef: input.itemRef } : {}),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
    kind: input.kind,
    label,
    ...(detail ? { detail } : {}),
    state: input.state,
  }
}

function quoteInputBody(input: {
  readonly commandRef: string
  readonly contractorLabel: string
  readonly proposalDate?: string
  readonly artifactRef?: string
  readonly scope: object
  readonly notes?: string
  readonly expectedRevision?: number
}) {
  const contractorLabel = input.contractorLabel.trim()
  const notes = input.notes?.trim()
  const date = input.proposalDate
  if (!COMMAND_REF_PATTERN.test(input.commandRef)
    || contractorLabel.length < 1 || contractorLabel.length > 120
    || (date !== undefined && !validCalendarDate(date))
    || (input.artifactRef !== undefined && !ARTIFACT_REF.test(input.artifactRef))
    || (notes !== undefined && notes.length > 500)
    || !input.scope || typeof input.scope !== 'object' || Array.isArray(input.scope)) {
    return null
  }
  const scope: Record<string, { status: string; detail?: string }> = {}
  for (const [key, value] of Object.entries(input.scope)) {
    if (!QUOTE_SCOPE_KEYS.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    const item = value as { status?: unknown; detail?: unknown }
    const keys = Object.keys(item)
    if (keys.some(itemKey => itemKey !== 'status' && itemKey !== 'detail')
      || typeof item.status !== 'string'
      || !['included', 'excluded', 'allowance', 'not_stated'].includes(item.status)
      || (item.detail !== undefined && (typeof item.detail !== 'string'
        || item.detail !== item.detail.trim() || item.detail.length > 160))) {
      return null
    }
    scope[key] = {
      status: item.status,
      ...(item.detail ? { detail: item.detail } : {}),
    }
  }
  if (input.expectedRevision !== undefined
    && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)) {
    return null
  }
  return {
    commandRef: input.commandRef,
    contractorLabel,
    ...(date ? { proposalDate: date } : {}),
    ...(input.artifactRef ? { artifactRef: input.artifactRef } : {}),
    scope,
    ...(notes ? { notes } : {}),
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
  }
}

const UNDEFINED_ROUTE: PortResult<never> = Object.freeze({
  ok: false as const,
  error: 'unavailable' as const,
})

function boundedRetryAfterSeconds(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'error')) return null
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object' || Array.isArray(error)
    || Object.keys(error).length !== 2
    || (error as { code?: unknown }).code !== 'rate_limited') return null
  const seconds = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds
  return typeof seconds === 'number' && Number.isSafeInteger(seconds)
    && seconds >= 1 && seconds <= 3_600
    ? seconds
    : null
}

export function createRemotePort(
  transport: JsonTransport,
  artifactTransport: ArtifactUploadTransport = fetchArtifactUploadTransport,
  photoTransport: PhotoCheckupUploadTransport = fetchPhotoCheckupUploadTransport,
): HomeownerDataPort {
  async function call<T>(
    request: TransportRequest,
    decode: (value: unknown, at: string) => T,
    successStatus = 200,
  ): Promise<PortResult<T>> {
    let reply: TransportReply
    try {
      reply = await transport(request)
    } catch {
      return { ok: false, error: 'unavailable' }
    }
    if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
    if (reply.status !== successStatus) {
      const error = portErrorForStatus(reply.status)
      const retryAfterSeconds = error === 'rate_limited'
        ? boundedRetryAfterSeconds(reply.body)
        : null
      return retryAfterSeconds === null
        ? { ok: false, error }
        : { ok: false, error, retryAfterSeconds }
    }
    try {
      return { ok: true, value: decode(unwrapEnvelope(reply.body), 'data') }
    } catch {
      // A malformed success body is not shown to anyone; it is a client-visible
      // server bug, surfaced as invalid rather than rendered.
      return { ok: false, error: 'invalid' }
    }
  }

  return {
    async getSession(): Promise<SessionState> {
      const result = await call({ method: 'GET', path: `${API}/session` }, decodeSession)
      if (result.ok) return result.value
      // A session read that fails in any way is a signed-out UI with no
      // capabilities — never a guessed session.
      return { kind: 'signed_out', capabilities: NO_CAPABILITIES }
    },

    async enterDemoSession(): Promise<HomeownerSession> {
      // The demo doorway does not exist against a real server.
      throw new Error('enterDemoSession is synthetic-mode only')
    },

    async listHomes() {
      return call({ method: 'GET', path: `${API}/homes` }, decodeList(decodeServerHomeSummary))
    },

    async getHome(homeRef) {
      const ref = homeRefSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call({ method: 'GET', path: `${API}/homes/${ref}` }, decodeServerHomeView)
    },

    async createHome(input) {
      // The one browser-minted identifier is validated to the exact hcmd_
      // shape; anything else never becomes a request. Same for the labels:
      // the server's trim/min/max bounds are enforced BEFORE the wire.
      if (!COMMAND_REF_PATTERN.test(input.commandRef)) {
        return { ok: false, error: 'invalid' }
      }
      const displayLabel = input.alias.trim()
      const privateLocationLabel = input.locality.trim()
      if (displayLabel.length < 1 || displayLabel.length > 80
        || privateLocationLabel.length < 1 || privateLocationLabel.length > 200) {
        return { ok: false, error: 'invalid' }
      }
      // EXACTLY homeownerApiCreateHomeInputSchema — three keys, nothing else.
      // input.homeType and input.yearBuilt stay out of this command. They are
      // recorded only by the separate exact-home intake command.
      return call({
        method: 'POST',
        path: `${API}/homes`,
        body: { commandRef: input.commandRef, displayLabel, privateLocationLabel },
      }, decodeServerHomeSummary, 201)
    },

    async recordInitialIntake(homeRef, input) {
      const ref = homeRefSegment(homeRef)
      if (!ref || !COMMAND_REF_PATTERN.test(input.commandRef)) {
        return { ok: false, error: 'invalid' }
      }
      const allowedHomeTypes = ['house', 'townhouse', 'condo', 'other', 'unknown'] as const
      const supportedKinds = [
        'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
      ] as const
      const yearIsValid = (year: typeof input.yearBuilt) =>
        year === null || (Number.isInteger(year.value)
          && year.value >= 1800
          && year.value <= 9999
          && (year.precision === 'exact' || year.precision === 'approximate'))
      const kinds = input.systems.map(system => system.kind)
      if (!allowedHomeTypes.includes(input.homeType)
        || !yearIsValid(input.yearBuilt)
        || input.systems.length !== supportedKinds.length
        || new Set(kinds).size !== supportedKinds.length
        || supportedKinds.some(kind => !kinds.includes(kind))
        || input.systems.some(system => !['yes', 'no', 'unknown'].includes(system.present)
          || !yearIsValid(system.installedOrReplacedYear)
          || (system.present !== 'yes' && system.installedOrReplacedYear !== null))) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${ref}/intake`,
        body: {
          commandRef: input.commandRef,
          homeType: input.homeType,
          yearBuilt: input.yearBuilt,
          systems: input.systems.map(system => ({
            kind: system.kind,
            present: system.present,
            installedOrReplacedYear: system.installedOrReplacedYear,
          })),
        },
      }, decodeRecordedHomeIntake, 201)
      if (result.ok && result.value.homeRef !== ref) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async researchHome(homeRef, input) {
      const ref = homeRefSegment(homeRef)
      if (!input || typeof input !== 'object') return { ok: false, error: 'invalid' }
      const address = typeof input.address === 'string'
        ? boundedResearchText(input.address, 200)
        : null
      const message = typeof input.message === 'string'
        ? boundedResearchText(input.message, 800)
        : null
      const history = Array.isArray(input.history) ? input.history : []
      const normalizedHistory = history.map(turn => {
        if (!turn || typeof turn !== 'object') return { role: null, text: null }
        return {
          role: turn.role === 'user' || turn.role === 'assistant' ? turn.role : null,
          text: typeof turn.text === 'string' ? boundedResearchText(turn.text, 600) : null,
        }
      })
      const totalCharacters = (message?.length ?? 0)
        + normalizedHistory.reduce((total, turn) => total + (turn.text?.length ?? 0), 0)
      if (!ref || !address || !message
        || input.consentToResearchThisAddressOnline !== true
        || address.includes('\n') || address.includes('\r') || address.includes('://')
        || !/\p{L}/u.test(address) || !/\d/.test(address)
        || !Array.isArray(input.history)
        || history.length > 4
        || normalizedHistory.some(turn => turn.role === null || !turn.text)
        || totalCharacters > 2_800) {
        return { ok: false, error: 'invalid' }
      }
      const body = {
        address,
        message,
        consentToResearchThisAddressOnline: true as const,
        history: normalizedHistory.map(turn => ({
          role: turn.role as 'user' | 'assistant',
          text: turn.text as string,
        })),
      }
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 8 * 1024) {
        return { ok: false, error: 'invalid' }
      }
      return call({
        method: 'POST',
        path: `${API}/homes/${ref}/research`,
        body,
      }, decodeHomeResearchResult)
    },

    async requestMagicLink(email, requestedIntent = null, requestedHandoff = null) {
      const normalized = email.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: 'invalid' }
      }
      const intent = requestedIntent === null ? null : roofingIntent(requestedIntent)
      if (requestedIntent !== null && intent === null) return { ok: false, error: 'invalid' }
      const handoff = requestedHandoff === null || SHARE_REF.test(requestedHandoff)
        ? requestedHandoff
        : null
      if (requestedHandoff !== null && handoff === null) return { ok: false, error: 'invalid' }
      return call({
        method: 'POST',
        path: `${API}/auth/magic-link`,
        body: {
          email: normalized,
          ...(intent ? { intent } : {}),
          ...(handoff ? { handoff } : {}),
        },
      }, value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (value as { accepted?: unknown }).accepted !== true
          || Object.keys(value).length !== 1) {
          throw new Error('invalid magic-link acceptance')
        }
        return { accepted: true as const }
      }, 202)
    },

    async requestEmailCode(email) {
      const normalized = email.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: 'invalid' }
      }
      return call({
        method: 'POST',
        path: `${API}/auth/email-code`,
        body: { email: normalized },
      }, value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (value as { accepted?: unknown }).accepted !== true
          || Object.keys(value).length !== 1) {
          throw new Error('invalid email-code acceptance')
        }
        return { accepted: true as const }
      }, 202)
    },

    async verifyEmailCode(email, code, requestedIntent = null, requestedHandoff = null) {
      const normalized = email.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        || !/^\d{6}$/.test(code)) {
        return { ok: false, error: 'invalid' }
      }
      const intent = requestedIntent === null ? null : roofingIntent(requestedIntent)
      if (requestedIntent !== null && intent === null) return { ok: false, error: 'invalid' }
      const handoff = requestedHandoff === null || SHARE_REF.test(requestedHandoff)
        ? requestedHandoff
        : null
      if (requestedHandoff !== null && handoff === null) return { ok: false, error: 'invalid' }
      return call({
        method: 'POST',
        path: `${API}/auth/email-code/verify`,
        body: {
          email: normalized,
          code,
          ...(intent ? { intent } : {}),
          ...(handoff ? { handoff } : {}),
        },
      }, value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (value as { signedIn?: unknown }).signedIn !== true
          || Object.keys(value).length !== 1) {
          throw new Error('invalid email-code verification')
        }
        return { signedIn: true as const }
      })
    },

    async signOut() {
      const result = await call({ method: 'POST', path: `${API}/auth/signout` }, value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (value as { signedOut?: unknown }).signedOut !== true) {
          throw new Error('invalid sign-out reply')
        }
        return true
      })
      if (!result.ok) throw new Error('sign-out failed')
    },

    async listProjects(homeRef) {
      const ref = homeRefSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call({ method: 'GET', path: `${API}/homes/${ref}/projects` }, decodeList(decodeProject))
    },

    async getProject(homeRef, projectRef) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      if (!home || !project) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/projects/${project}` },
        decodeProject,
      )
      if (result.ok && (result.value.homeRef !== home
        || result.value.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async addProject() { return UNDEFINED_ROUTE },

    async createProject(homeRef, input) {
      const ref = homeRefSegment(homeRef)
      const categories = [
        'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
        'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
      ] as const
      const statuses = ['planned', 'in_progress', 'completed', 'cancelled'] as const
      const title = input.title.trim()
      const summary = input.summary.trim()
      const occurredOn = input.occurredOn?.trim()
      if (!ref
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !categories.includes(input.category)
        || !statuses.includes(input.status)
        || title.length < 1
        || title.length > 120
        || summary.length > 2000
        || (occurredOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn))) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${ref}/projects`,
        body: {
          commandRef: input.commandRef,
          title,
          category: input.category,
          status: input.status,
          ...(occurredOn ? { occurredOn } : {}),
          ...(summary ? { summary } : {}),
        },
      }, decodeProject, 201)
      const trade = {
        roofing: 'Roofing', exterior: 'Exterior', interior: 'Interior',
        electrical: 'Electrical', plumbing: 'Plumbing', hvac: 'HVAC',
        landscaping: 'Landscaping', appliances: 'Appliances', pest: 'Pest control',
        pool: 'Pool', new_construction: 'New construction', other: 'Other',
      } as const
      if (result.ok && (result.value.homeRef !== ref
        || result.value.trade !== trade[input.category]
        || result.value.status !== input.status
        || result.value.performedOn !== (occurredOn || null))) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async updateProject(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const body = projectUpdateBody(input)
      if (!home || !project || !body) return { ok: false, error: 'invalid' }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/projects/${project}/update`,
        body,
      }, decodeProject)
      if (result.ok && (result.value.homeRef !== home
        || result.value.projectRef !== project
        || result.value.revision !== input.expectedRevision + 1)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async listProjectActivity(homeRef, projectRef) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      if (!home || !project) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/projects/${project}/activity` },
        decodeList(decodeProjectActivity),
      )
      if (result.ok && result.value.some(entry => entry.homeRef !== home
        || entry.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async addProjectActivity(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const body = input.body.trim()
      if (!home || !project
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !['note', 'milestone'].includes(input.kind)
        || body.length < 1 || body.length > 2000) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/projects/${project}/activity`,
        body: { commandRef: input.commandRef, kind: input.kind, body },
      }, decodeProjectActivity, 201)
      if (result.ok && (result.value.homeRef !== home
        || result.value.projectRef !== project
        || result.value.kind !== input.kind
        || result.value.body !== body)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async listProjectItems(homeRef, projectRef) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      if (!home || !project) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/projects/${project}/items` },
        decodeList(decodeProjectItem),
      )
      if (result.ok && result.value.some(item => item.homeRef !== home
        || item.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async saveProjectItem(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const body = projectItemBody(input)
      if (!home || !project || !body) return { ok: false, error: 'invalid' }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/projects/${project}/items`,
        body,
      }, decodeProjectItem, input.itemRef ? 200 : 201)
      if (result.ok && (result.value.homeRef !== home
        || result.value.projectRef !== project
        || (input.itemRef !== undefined && result.value.itemRef !== input.itemRef)
        || result.value.revision !== (input.expectedRevision === undefined
          ? 1
          : input.expectedRevision + 1))) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async startRoofingProject(homeRef, input) {
      const ref = homeRefSegment(homeRef)
      const allowedNeeds = ['repair', 'replacement', 'inspection', 'storm_damage', 'not_sure'] as const
      const allowedTiming = ['urgent', 'within_30_days', 'researching', 'not_sure'] as const
      const notes = input.notes.trim()
      if (!ref
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !allowedNeeds.includes(input.need)
        || !allowedTiming.includes(input.timing)
        || notes.length > 1500) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${ref}/roofing-projects`,
        body: {
          commandRef: input.commandRef,
          need: input.need,
          timing: input.timing,
          ...(notes ? { notes } : {}),
        },
      }, decodeProject, 201)
      if (result.ok && (result.value.homeRef !== ref
        || result.value.trade !== 'Roofing'
        || result.value.status !== 'planned')) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async listProjectQuotes(homeRef, projectRef) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      if (!home || !project) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/projects/${project}/quotes` },
        decodeList(decodeProjectQuote),
      )
      if (result.ok && result.value.some(quote => quote.homeRef !== home
        || quote.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async createProjectQuote(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const body = quoteInputBody(input)
      if (!home || !project || !body) return { ok: false, error: 'invalid' }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/projects/${project}/quotes`,
        body,
      }, decodeProjectQuote, 201)
      if (result.ok && (result.value.homeRef !== home || result.value.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async saveProjectQuote(homeRef, projectRef, quoteRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const body = quoteInputBody(input)
      if (!home || !project || !QUOTE_REF.test(quoteRef) || !body) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/projects/${project}/quotes/${quoteRef}`,
        body,
      }, decodeProjectQuote)
      if (result.ok && (result.value.quoteRef !== quoteRef
        || result.value.homeRef !== home || result.value.projectRef !== project)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async listDocuments(homeRef) {
      const ref = homeRefSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call({ method: 'GET', path: `${API}/homes/${ref}/artifacts` }, decodeList(decodeArtifact))
    },

    async uploadPrivateArtifact(homeRef, input) {
      const ref = homeRefSegment(homeRef)
      const projectRef = input.projectRef === undefined
        ? undefined
        : projectRefSegment(input.projectRef) ?? null
      const displayName = input.file && typeof input.file.name === 'string'
        ? safeArtifactDisplayName(input.file.name)
        : null
      if (!ref || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !['photo', 'document', 'warranty'].includes(input.kind)
        || projectRef === null
        || !input.file || typeof input.file.name !== 'string'
        || typeof input.file.arrayBuffer !== 'function'
        || input.file.size < 1
        || input.file.size > 10 * 1024 * 1024
        || !displayName) {
        return { ok: false, error: 'invalid' }
      }
      const hashed = await hashedFilePayload(input.file)
      if (!hashed) return { ok: false, error: 'unavailable' }
      const mediaType = artifactMediaType(hashed.bytes)
      if (!mediaType || (input.kind === 'photo' && mediaType === 'application/pdf')) {
        return { ok: false, error: 'invalid' }
      }
      let reply: TransportReply
      try {
        reply = await transport({
          method: 'POST',
          path: `${API}/homes/${ref}/artifacts`,
          body: {
            commandRef: input.commandRef,
            kind: input.kind,
            ...(projectRef ? { projectRef } : {}),
            displayName,
            mediaType,
            byteLength: hashed.payload.byteLength,
            payloadSha256: hashed.sha256,
          },
        })
      } catch {
        return { ok: false, error: 'unavailable' }
      }
      if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
      if (reply.status !== 200 && reply.status !== 202) {
        return { ok: false, error: portErrorForStatus(reply.status) }
      }
      let reservation
      try {
        reservation = decodeArtifactUploadReservation(unwrapEnvelope(reply.body), 'data')
      } catch {
        return { ok: false, error: 'invalid' }
      }
      if ((reply.status === 200) !== (reservation.state === 'available')) {
        return { ok: false, error: 'invalid' }
      }
      const expectedKind = input.kind === 'photo' ? 'photo_set' : input.kind
      const matches = (artifact: ReturnType<typeof decodeArtifact>) =>
        artifact.homeRef === ref
        && artifact.projectRef === (projectRef ?? null)
        && artifact.title === displayName
        && artifact.kind === expectedKind
        && artifact.mediaType === mediaType
        && artifact.byteLength === hashed.payload.byteLength
      if (reservation.state === 'available') {
        return matches(reservation.artifact)
          ? { ok: true, value: reservation.artifact }
          : { ok: false, error: 'invalid' }
      }
      try {
        await artifactTransport({ ...reservation.upload, payload: hashed.payload })
      } catch {
        // Completion is authoritative after an ambiguous direct PUT result.
      }
      const completed = await call({
        method: 'POST',
        path: `${API}/homes/${ref}/artifacts/${reservation.artifactRef}/complete`,
        body: { commandRef: input.commandRef },
      }, decodeArtifact, 201)
      if (!completed.ok) return completed
      return completed.value.documentRef === reservation.artifactRef && matches(completed.value)
        ? completed
        : { ok: false, error: 'invalid' }
    },

    async listHomeRecordHandoffs(homeRef) {
      const home = homeRefSegment(homeRef)
      if (!home) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${home}/handoffs` },
        decodeHomeRecordHandoffList,
      )
    },

    async claimHomeRecordHandoff(homeRef, shareId) {
      const home = homeRefSegment(homeRef)
      if (!home || !SHARE_REF.test(shareId)) return { ok: false, error: 'not_found' }
      const result = await call(
        {
          method: 'POST',
          path: `${API}/homes/${home}/handoffs/${shareId}/claim`,
          body: {},
        },
        decodeHomeRecordHandoffPreview,
      )
      if (result.ok && result.value.shareId !== shareId) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async previewHomeRecordHandoff(homeRef, shareId) {
      const home = homeRefSegment(homeRef)
      if (!home || !SHARE_REF.test(shareId)) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/handoffs/${shareId}` },
        decodeHomeRecordHandoffPreview,
      )
      if (result.ok && result.value.shareId !== shareId) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async acceptHomeRecordHandoff(homeRef, shareId, input) {
      const home = homeRefSegment(homeRef)
      const selected = [...input.selectedArtifactRefs]
      if (!home || !SHARE_REF.test(shareId)
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !SHA256.test(input.reviewedPreviewDigest)
        || input.consentAccepted !== true
        || selected.length !== 1
        || selected.some(ref => !HANDOFF_ARTIFACT_REF.test(ref))) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/handoffs/${shareId}/accept`,
        body: {
          commandRef: input.commandRef,
          reviewedPreviewDigest: input.reviewedPreviewDigest,
          selectedArtifactRefs: selected,
          consentAccepted: true,
        },
      }, decodeHomeRecordHandoffPreview)
      if (result.ok && result.value.shareId !== shareId) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async rejectHomeRecordHandoff(homeRef, shareId, input) {
      const home = homeRefSegment(homeRef)
      if (!home || !SHARE_REF.test(shareId)
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !SHA256.test(input.reviewedPreviewDigest)) {
        return { ok: false, error: 'invalid' }
      }
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${home}/handoffs/${shareId}/reject`,
        body: {
          commandRef: input.commandRef,
          reviewedPreviewDigest: input.reviewedPreviewDigest,
        },
      }, decodeHomeRecordHandoffPreview)
      if (result.ok && result.value.shareId !== shareId) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async listPhotoCheckups(homeRef) {
      const home = homeRefSegment(homeRef)
      if (!home) return { ok: false, error: 'not_found' }
      const result = await call(
        { method: 'GET', path: `${API}/homes/${home}/photo-checkups` },
        decodePhotoCheckupList,
      )
      if (result.ok && result.value.some(photo => photo.homeRef !== home)) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async uploadPhotoCheckup(homeRef, input) {
      const home = homeRefSegment(homeRef)
      const caption = input.caption.trim()
      const viewLabel = input.viewLabel.trim()
      const today = new Date().toISOString().slice(0, 10)
      let encodedCaption: string
      let encodedViewLabel: string
      try {
        encodedCaption = caption ? encodeURIComponent(caption) : ''
        encodedViewLabel = encodeURIComponent(viewLabel)
      } catch {
        return { ok: false, error: 'invalid' }
      }
      if (!home
        || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !validCalendarDate(input.observedOn)
        || input.observedOn > today
        || !PHOTO_CHECKUP_AREAS.has(input.area)
        || viewLabel.length < 1
        || viewLabel.length > 80
        || /[\u0000-\u001f\u007f]/.test(viewLabel)
        || encodedViewLabel.length > 400
        || caption.length > 240
        || /[\u0000-\u001f\u007f]/.test(caption)
        || encodedCaption.length > 1_000
        || !input.file
        || typeof input.file.arrayBuffer !== 'function'
        || !['image/jpeg', 'image/png'].includes(input.file.type)
        || input.file.size < 1
        || input.file.size > MAX_PHOTO_INPUT_BYTES) {
        return { ok: false, error: 'invalid' }
      }
      let reply: TransportReply
      try {
        reply = await photoTransport({
          path: `${API}/homes/${home}/photo-checkups`,
          commandRef: input.commandRef,
          observedOn: input.observedOn,
          area: input.area,
          encodedViewLabel,
          ...(encodedCaption ? { encodedCaption } : {}),
          file: input.file,
        })
      } catch {
        return { ok: false, error: 'unavailable' }
      }
      if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
      if (reply.status !== 201) return { ok: false, error: portErrorForStatus(reply.status) }
      try {
        const photo = decodePhotoCheckup(unwrapEnvelope(reply.body), 'data')
        if (photo.homeRef !== home) return { ok: false, error: 'invalid' }
        return { ok: true, value: photo }
      } catch {
        return { ok: false, error: 'invalid' }
      }
    },

    async deletePhotoCheckup(homeRef, photoRef) {
      const home = homeRefSegment(homeRef)
      if (!home || !PHOTO_REF.test(photoRef)) return { ok: false, error: 'not_found' }
      const result = await call({
        method: 'DELETE',
        path: `${API}/homes/${home}/photo-checkups/${photoRef}`,
      }, decodeDeletedPhotoCheckup)
      if (result.ok && result.value.photoRef !== photoRef) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    async previewProjectForReview(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const name = input.name.trim()
      const phone = input.phone?.trim()
      const refs = [...input.selectedArtifactRefs]
      if (!home || !project
        || name.length < 1 || name.length > 120
        || !['email', 'phone', 'text'].includes(input.preferredContact)
        || ((input.preferredContact === 'phone' || input.preferredContact === 'text') && !phone)
        || (phone !== undefined && !/^\+[1-9][0-9]{7,14}$/.test(phone))
        || refs.length > 10 || new Set(refs).size !== refs.length
        || refs.some(ref => !ARTIFACT_REF.test(ref))) {
        return { ok: false, error: 'invalid' }
      }
      let reply: TransportReply
      try {
        reply = await transport({
          method: 'POST',
          path: `${API}/homes/${home}/projects/${project}/submit-for-review`,
          body: {
            operation: 'preview',
            name,
            ...(phone ? { phone } : {}),
            preferredContact: input.preferredContact,
            selectedArtifactRefs: refs,
          },
        })
      } catch {
        return { ok: false, error: 'unavailable' }
      }
      if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
      if (reply.status !== 200) {
        return { ok: false, error: portErrorForStatus(reply.status) }
      }
      try {
        const result = decodeProjectReviewPreview(unwrapEnvelope(reply.body), 'data')
        if (result.projectRef !== project) return { ok: false, error: 'invalid' }
        return { ok: true, value: result }
      } catch {
        return { ok: false, error: 'invalid' }
      }
    },

    async submitProjectForReview(homeRef, projectRef, input) {
      const home = homeRefSegment(homeRef)
      const project = projectRefSegment(projectRef)
      const name = input.name.trim()
      const phone = input.phone?.trim()
      const refs = [...input.selectedArtifactRefs]
      if (!home || !project || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !/^[a-f0-9]{64}$/.test(input.reviewedDisclosureDigest)
        || name.length < 1 || name.length > 120
        || !['email', 'phone', 'text'].includes(input.preferredContact)
        || ((input.preferredContact === 'phone' || input.preferredContact === 'text') && !phone)
        || (phone !== undefined && !/^\+[1-9][0-9]{7,14}$/.test(phone))
        || refs.length > 10 || new Set(refs).size !== refs.length
        || refs.some(ref => !ARTIFACT_REF.test(ref))
        || input.consentAccepted !== true) {
        return { ok: false, error: 'invalid' }
      }
      let reply: TransportReply
      try {
        reply = await transport({
          method: 'POST',
          path: `${API}/homes/${home}/projects/${project}/submit-for-review`,
          body: {
            operation: 'submit',
            commandRef: input.commandRef,
            reviewedDisclosureDigest: input.reviewedDisclosureDigest,
            name,
            ...(phone ? { phone } : {}),
            preferredContact: input.preferredContact,
            selectedArtifactRefs: refs,
            consentAccepted: true,
          },
        })
      } catch {
        return { ok: false, error: 'unavailable' }
      }
      if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
      if (reply.status !== 201 && reply.status !== 202) {
        return { ok: false, error: portErrorForStatus(reply.status) }
      }
      try {
        const result = decodeProjectReviewSubmission(unwrapEnvelope(reply.body), 'data')
        if (result.projectRef !== project
          || (reply.status === 201 && result.status !== 'awaiting_chance_review')
          || (reply.status === 202 && result.status !== 'reconciliation_required')) {
          return { ok: false, error: 'invalid' }
        }
        return { ok: true, value: result }
      } catch {
        return { ok: false, error: 'invalid' }
      }
    },

    // --- routes the server has not defined: unavailable, no request built ----

    async listWarranties() { return UNDEFINED_ROUTE },
    async listTimeline() { return UNDEFINED_ROUTE },
    async listMaintenance() { return UNDEFINED_ROUTE },
  }
}
