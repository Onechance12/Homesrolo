/**
 * REMOTE ADAPTER — HomeownerDataPort over the same-origin /api/v1 JSON wire.
 *
 * Enabled only when the runtime mode resolves to 'remote' (see mode.ts; the
 * default is synthetic and unknown values fail closed). The adapter is a thin
 * composition: build a request, hand it to the transport, map the status, run
 * the strict decoder. It holds no state, invents no data, and identifies
 * nobody — the session is whatever the server's cookie says it is.
 *
 * Server-shape assumptions this client makes (documented in the PR for Codex;
 * the decoders in wire.ts enforce them exactly):
 *   - success bodies are `{ "data": ... }` with no sibling keys
 *   - DTO field names match lib/port/types.ts
 *   - opaque refs use the homeowner-runtime.v1 prefixes
 *   - server records carry isSynthetic: false explicitly
 */

import type {
  AddProjectInput, CreateHomeInput, HomeownerDataPort, HomeownerSession,
  PortResult, SessionState,
} from './types.ts'
import type { JsonTransport, TransportReply, TransportRequest } from './transport.ts'
import {
  decodeDocumentSummary, decodeHomeFile, decodeHomeSummary, decodeList,
  decodeMagicLinkAccepted, decodeMaintenanceItem, decodeProject, decodeProjectSummary,
  decodeSession, decodeTimelineEntry, decodeWarranty, portErrorForStatus, unwrapEnvelope,
} from './wire.ts'

const API = '/api/v1'

/** Path segments are validated opaque refs; anything else never leaves the app. */
const REF = /^[a-z]+_[A-Za-z0-9_-]{43}$/
function refSegment(candidate: string): string | null {
  return REF.test(candidate) ? candidate : null
}

export function createRemotePort(transport: JsonTransport): HomeownerDataPort {
  async function call<T>(
    request: TransportRequest,
    decode: (value: unknown, at: string) => T,
    okStatuses: readonly number[] = [200],
  ): Promise<PortResult<T>> {
    let reply: TransportReply
    try {
      reply = await transport(request)
    } catch {
      return { ok: false, error: 'unavailable' }
    }
    if (reply.kind === 'network_failure') return { ok: false, error: 'unavailable' }
    if (!okStatuses.includes(reply.status)) {
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
      // A session read that fails in any way is a signed-out UI with no real
      // capabilities — never a guessed session.
      return { kind: 'signed_out', capabilities: { magicLinkSignIn: false } }
    },

    async enterDemoSession(): Promise<HomeownerSession> {
      // The demo doorway does not exist against a real server.
      throw new Error('enterDemoSession is synthetic-mode only')
    },

    async requestMagicLink(email: string) {
      return call(
        { method: 'POST', path: `${API}/session/magic-link`, body: { email } },
        decodeMagicLinkAccepted,
        [200, 202],
      )
    },

    async signOut() {
      await call({ method: 'DELETE', path: `${API}/session` }, () => null, [200, 204])
    },

    async listHomes() {
      return call({ method: 'GET', path: `${API}/homes` }, decodeList(decodeHomeSummary))
    },

    async getHome(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call({ method: 'GET', path: `${API}/homes/${ref}` }, decodeHomeFile)
    },

    async createHome(input: CreateHomeInput) {
      return call(
        { method: 'POST', path: `${API}/homes`, body: input },
        decodeHomeSummary,
        [200, 201],
      )
    },

    async listProjects(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${ref}/projects` },
        decodeList(decodeProjectSummary),
      )
    },

    async getProject(homeRef, projectRef) {
      const home = refSegment(homeRef)
      const project = refSegment(projectRef)
      if (!home || !project) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${home}/projects/${project}` },
        decodeProject,
      )
    },

    async addProject(homeRef, input: AddProjectInput) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'POST', path: `${API}/homes/${ref}/projects`, body: input },
        decodeProjectSummary,
        [200, 201],
      )
    },

    async listDocuments(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${ref}/documents` },
        decodeList(decodeDocumentSummary),
      )
    },

    async listWarranties(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${ref}/warranties` },
        decodeList(decodeWarranty),
      )
    },

    async listTimeline(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${ref}/timeline` },
        decodeList(decodeTimelineEntry),
      )
    },

    async listMaintenance(homeRef) {
      const ref = refSegment(homeRef)
      if (!ref) return { ok: false, error: 'not_found' }
      return call(
        { method: 'GET', path: `${API}/homes/${ref}/maintenance` },
        decodeList(decodeMaintenanceItem),
      )
    },
  }
}
