/**
 * REMOTE ADAPTER — HomeownerDataPort over the same-origin /api/v1 JSON wire.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8 + PR #15). The
 * server defines authenticated home/project reads and three exact writes, and this adapter operates exactly
 * those:
 *
 *   GET  /api/v1/session          → decodeSession
 *   GET  /api/v1/homes            → decodeServerHomeSummary[]
 *   GET  /api/v1/homes/{homeRef}  → decodeServerHomeView
 *   POST /api/v1/homes            → 201 decodeServerHomeSummary
 *   POST /api/v1/homes/{homeRef}/intake → 201 decodeRecordedHomeIntake
 *
 * The create body is EXACTLY homeownerApiCreateHomeInputSchema:
 * `{ commandRef, displayLabel, privateLocationLabel }`. The commandRef is the
 * one browser-minted identifier (an idempotency ref, command-ref.ts);
 * requestedAt, the principal, and every membership fact are server-derived.
 * homeType, yearBuilt, and systems never enter that create command. They cross
 * only through POST /api/v1/homes/{homeRef}/intake after the server returns
 * the exact homeRef.
 *
 * Every other port method — documents, warranties, timeline, and maintenance — returns 'unavailable' WITHOUT building
 * a request, because the server has not defined those routes and this client
 * does not decode guessed DTOs. When the server defines a route, the adapter
 * gains it together with its decoder.
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
  type ArtifactUploadTransport,
  type JsonTransport, type TransportReply, type TransportRequest,
} from './transport.ts'
import { roofingIntent } from '../roofing-intent.ts'
import {
  decodeArtifact, decodeList, decodeProject, decodeProjectQuote, decodeProjectReviewPreview, decodeProjectReviewSubmission, decodeRecordedHomeIntake, decodeServerHomeSummary, decodeServerHomeView, decodeSession,
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
const ARTIFACT_REF = /^hart_[A-Za-z0-9_-]{43}$/
const QUOTE_REF = /^hquo_[A-Za-z0-9_-]{43}$/
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const QUOTE_SCOPE_KEYS = new Set([
  'measurement', 'roof_configuration', 'tear_off', 'decking', 'underlayment',
  'leak_barrier', 'primary_materials', 'starter_and_ridge', 'valleys',
  'flashing_transitions', 'penetrations', 'ventilation', 'permits', 'cleanup',
  'workmanship_warranty', 'manufacturer_warranty', 'payment_terms', 'exclusions',
])

function validCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function homeRefSegment(candidate: string): string | null {
  return HOME_REF.test(candidate) ? candidate : null
}

function projectRefSegment(candidate: string): string | null {
  return PROJECT_REF.test(candidate) ? candidate : null
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

export function createRemotePort(
  transport: JsonTransport,
  artifactTransport: ArtifactUploadTransport = fetchArtifactUploadTransport,
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
      return { ok: false, error: portErrorForStatus(reply.status) }
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

    async requestMagicLink(email, requestedIntent = null) {
      const normalized = email.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: 'invalid' }
      }
      const intent = requestedIntent === null ? null : roofingIntent(requestedIntent)
      if (requestedIntent !== null && intent === null) return { ok: false, error: 'invalid' }
      return call({
        method: 'POST',
        path: `${API}/auth/magic-link`,
        body: intent ? { email: normalized, intent } : { email: normalized },
      }, value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (value as { accepted?: unknown }).accepted !== true
          || Object.keys(value).length !== 1) {
          throw new Error('invalid magic-link acceptance')
        }
        return { accepted: true as const }
      }, 202)
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
      if (!ref || !COMMAND_REF_PATTERN.test(input.commandRef)
        || !['photo', 'document', 'warranty'].includes(input.kind)
        || projectRef === null
        || !input.file || typeof input.file.name !== 'string'
        || typeof input.file.arrayBuffer !== 'function'
        || input.file.size < 1
        || input.file.size > 25 * 1024 * 1024) {
        return { ok: false, error: 'invalid' }
      }
      let reply: TransportReply
      try {
        reply = await artifactTransport({
          path: `${API}/homes/${ref}/artifacts`,
          commandRef: input.commandRef,
          kind: input.kind,
          ...(projectRef ? { projectRef } : {}),
          file: input.file,
        })
      } catch {
        return { ok: false, error: 'unavailable' }
      }
      if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
      if (reply.status !== 201) return { ok: false, error: portErrorForStatus(reply.status) }
      try {
        const artifact = decodeArtifact(unwrapEnvelope(reply.body), 'data')
        if (artifact.homeRef !== ref || artifact.projectRef !== (projectRef ?? null)) {
          return { ok: false, error: 'invalid' }
        }
        return { ok: true, value: artifact }
      } catch {
        return { ok: false, error: 'invalid' }
      }
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
