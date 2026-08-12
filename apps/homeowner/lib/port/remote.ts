/**
 * REMOTE ADAPTER — HomeownerDataPort over the same-origin /api/v1 JSON wire.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8 + PR #15). The
 * server defines THREE reads and ONE write, and this adapter operates exactly
 * those:
 *
 *   GET  /api/v1/session                 → decodeSession
 *   GET  /api/v1/homes                   → decodeServerHomeSummary[]
 *   GET  /api/v1/homes/{homeRef}         → decodeServerHomeView
 *   POST /api/v1/homes                   → 201 decodeServerHomeSummary
 *   POST /api/v1/homes/{homeRef}/intake  → 201 decodeIntakeView
 *
 * The create body is EXACTLY homeownerApiCreateHomeInputSchema:
 * `{ commandRef, displayLabel, privateLocationLabel }` — the home shell only.
 * The intake body is EXACTLY homeownerApiRecordIntakeInputSchema:
 * `{ commandRef, homeType, yearBuilt, systems }` against the exact home in
 * the path. Each command's commandRef is the only browser-minted identifier
 * (an idempotency ref, command-ref.ts), and the two commands use SEPARATE
 * refs; requestedAt, the principal, the recollection source, and every
 * membership/authority fact are server-derived.
 *
 * Every other port method — magic link, sign-out, projects, documents,
 * warranties, timeline, maintenance — returns 'unavailable' WITHOUT building
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
  INTAKE_SYSTEM_KINDS, NO_CAPABILITIES,
  type HomeownerDataPort, type HomeownerSession, type IntakeYear, type PortResult,
  type RecordIntakeInput, type SessionState,
} from './types.ts'
import type { JsonTransport, TransportReply, TransportRequest } from './transport.ts'
import {
  decodeIntakeView, decodeList, decodeServerHomeSummary, decodeServerHomeView,
  decodeSession, portErrorForStatus, unwrapEnvelope,
} from './wire.ts'

const API = '/api/v1'

/**
 * Path segments are validated against the EXACT ref type the route takes. A
 * well-formed ref of the wrong kind — an hprn_ or hprj_ where a home belongs —
 * is just as rejected as garbage: it never becomes a request path.
 */
const HOME_REF = /^hhom_[A-Za-z0-9_-]{43}$/
function homeRefSegment(candidate: string): string | null {
  return HOME_REF.test(candidate) ? candidate : null
}

const UNDEFINED_ROUTE: PortResult<never> = Object.freeze({
  ok: false as const,
  error: 'unavailable' as const,
})

/** homeownerApproximateYearSchema bounds, enforced before the wire. */
function validYear(year: IntakeYear | null): boolean {
  return year === null
    || (Number.isInteger(year.value) && year.value >= 1800 && year.value <= 9999
      && (year.precision === 'exact' || year.precision === 'approximate'))
}

/**
 * homeownerApiRecordIntakeInputSchema, mirrored as a pre-wire gate: each
 * supported system exactly once, a year only on a present system, bounded
 * precision-carrying years. Anything else never becomes a request.
 */
function validIntakeFacts(input: RecordIntakeInput): boolean {
  if (!['house', 'townhouse', 'condo', 'other', 'unknown'].includes(input.homeType)) return false
  if (!validYear(input.yearBuilt)) return false
  const kinds = input.systems.map(system => system.kind)
  if (kinds.length !== INTAKE_SYSTEM_KINDS.length) return false
  if (new Set(kinds).size !== kinds.length) return false
  if (kinds.some(kind => !(INTAKE_SYSTEM_KINDS as readonly string[]).includes(kind))) return false
  return input.systems.every(system =>
    ['yes', 'no', 'unknown'].includes(system.present)
    && validYear(system.installedOrReplacedYear)
    && (system.present === 'yes' || system.installedOrReplacedYear === null))
}

export function createRemotePort(transport: JsonTransport): HomeownerDataPort {
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
      // input.homeType, input.yearBuilt, and the systems inventory ride the
      // SEPARATE intake command (recordIntake): the create command carries the
      // home shell only and never smuggles other facts.
      return call({
        method: 'POST',
        path: `${API}/homes`,
        body: { commandRef: input.commandRef, displayLabel, privateLocationLabel },
      }, decodeServerHomeSummary, 201)
    },

    async recordIntake(input) {
      if (!COMMAND_REF_PATTERN.test(input.commandRef)) {
        return { ok: false, error: 'invalid' }
      }
      // The exact home comes from the PATH; the body never carries a homeRef.
      const ref = homeRefSegment(input.homeRef)
      if (!ref) return { ok: false, error: 'invalid' }
      if (!validIntakeFacts(input)) return { ok: false, error: 'invalid' }
      // The body is rebuilt key by key so nothing a caller might attach can
      // ride along: EXACTLY homeownerApiRecordIntakeInputSchema. The source
      // ('homeowner_recollection'), requestedAt, and all authority are
      // server-derived.
      const result = await call({
        method: 'POST',
        path: `${API}/homes/${ref}/intake`,
        body: {
          commandRef: input.commandRef,
          homeType: input.homeType,
          yearBuilt: input.yearBuilt === null
            ? null
            : { value: input.yearBuilt.value, precision: input.yearBuilt.precision },
          systems: input.systems.map(system => ({
            kind: system.kind,
            present: system.present,
            installedOrReplacedYear: system.installedOrReplacedYear === null
              ? null
              : {
                value: system.installedOrReplacedYear.value,
                precision: system.installedOrReplacedYear.precision,
              },
          })),
        },
      }, decodeIntakeView, 201)
      // An answer about a different home is not an answer: the recorded view
      // must name exactly the home that was asked for.
      if (result.ok && result.value.homeRef !== ref) {
        return { ok: false, error: 'invalid' }
      }
      return result
    },

    // --- routes the server has not defined: unavailable, no request built ----

    async requestMagicLink() {
      // The session capability is false and no route exists; the sign-in form
      // is hidden, and even a direct call refuses without touching the wire.
      return UNDEFINED_ROUTE
    },

    async signOut() {
      // No sign-out route is defined yet. The UI disables the control in
      // remote mode; a direct call must FAIL rather than resolve as though a
      // session had actually ended.
      throw new Error('signOut has no defined route in homeowner-api.v1')
    },

    async listProjects() { return UNDEFINED_ROUTE },
    async getProject() { return UNDEFINED_ROUTE },
    async addProject() { return UNDEFINED_ROUTE },
    async listDocuments() { return UNDEFINED_ROUTE },
    async listWarranties() { return UNDEFINED_ROUTE },
    async listTimeline() { return UNDEFINED_ROUTE },
    async listMaintenance() { return UNDEFINED_ROUTE },
  }
}
