/**
 * REMOTE ADAPTER — HomeownerDataPort over the same-origin /api/v1 JSON wire.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8 + PR #15). The
 * server defines THREE reads and TWO writes, and this adapter operates exactly
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
  NO_CAPABILITIES,
  type HomeownerDataPort, type HomeownerSession, type PortResult, type SessionState,
} from './types.ts'
import type { JsonTransport, TransportReply, TransportRequest } from './transport.ts'
import {
  decodeList, decodeRecordedHomeIntake, decodeServerHomeSummary, decodeServerHomeView, decodeSession,
  portErrorForStatus, unwrapEnvelope,
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

    async requestMagicLink(email) {
      const normalized = email.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: 'invalid' }
      }
      return call({
        method: 'POST',
        path: `${API}/auth/magic-link`,
        body: { email: normalized },
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

    // --- routes the server has not defined: unavailable, no request built ----

    async listProjects() { return UNDEFINED_ROUTE },
    async getProject() { return UNDEFINED_ROUTE },
    async addProject() { return UNDEFINED_ROUTE },
    async listDocuments() { return UNDEFINED_ROUTE },
    async listWarranties() { return UNDEFINED_ROUTE },
    async listTimeline() { return UNDEFINED_ROUTE },
    async listMaintenance() { return UNDEFINED_ROUTE },
  }
}
