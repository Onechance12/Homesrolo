/**
 * The client's half of the wire: strict decoders for the /api/v1 responses the
 * remote adapter consumes, and the single HTTP-status-to-PortError map.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8). This release the
 * server defines exactly three reads — session, home list, home view — and the
 * decoders below mirror those schemas key for key. Speculative decoders for
 * routes the server has not defined were deleted rather than kept "for later":
 * an unsupported route returns unavailable in the adapter and never decodes.
 *
 * Envelope: every success body is exactly `{ "data": ... }` with no sibling
 * keys. The application service itself is transport-neutral, so this is a
 * ROUTE-ADAPTER REQUIREMENT on the server side, not something the service
 * already guarantees — flagged in the PR for the integration lane.
 */

import {
  type HomeownerSession, type PortError, type RelationshipLabel, type ServerHomeSummary,
  type ServerHomeView, type SessionState, type SignInCapabilities,
} from './types.ts'

/** Matches homeowner-api.v1's HOMEOWNER_API_VERSION exactly. */
export const EXPECTED_API_VERSION = 'homeowner-api.v1-draft'

/** 401 → not_signed_in, 403 → forbidden, 404 → not_found, 409 → conflict,
 *  400/422 → invalid, 429 → rate_limited; everything else unexpected → unavailable. */
export function portErrorForStatus(status: number): PortError {
  if (status === 401) return 'not_signed_in'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422 || status === 400) return 'invalid'
  if (status === 429) return 'rate_limited'
  return 'unavailable'
}

export class WireError extends Error {
  constructor(detail: string) {
    super(`wire: ${detail}`)
  }
}

// --- tiny strict combinators --------------------------------------------------

type Decoder<T> = (value: unknown, at: string) => T

const fail = (at: string, expected: string): never => {
  throw new WireError(`${at}: expected ${expected}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Strict object: every listed key decoded, any unlisted key rejects. */
function object<T>(shape: { [K in keyof T]: Decoder<T[K]> }): Decoder<T> {
  const keys = Object.keys(shape) as (keyof T & string)[]
  return (value, at) => {
    if (!isRecord(value)) return fail(at, 'an object')
    for (const key of Object.keys(value)) {
      if (!keys.includes(key as keyof T & string)) {
        throw new WireError(`${at}.${key}: unknown key rejected`)
      }
    }
    const out = {} as T
    for (const key of keys) {
      out[key] = shape[key](value[key], `${at}.${key}`)
    }
    return out
  }
}

function array<T>(item: Decoder<T>): Decoder<readonly T[]> {
  return (value, at) => {
    if (!Array.isArray(value)) return fail(at, 'an array')
    return value.map((entry, index) => item(entry, `${at}[${index}]`))
  }
}

const string: Decoder<string> = (value, at) =>
  typeof value === 'string' ? value : fail(at, 'a string')

const boolean: Decoder<boolean> = (value, at) =>
  typeof value === 'boolean' ? value : fail(at, 'a boolean')

const countInt: Decoder<number> = (value, at) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : fail(at, 'a non-negative integer')

function literal<const T extends string>(expected: T): Decoder<T> {
  return (value, at) => (value === expected ? expected : fail(at, JSON.stringify(expected)))
}

function oneOf<const T extends readonly string[]>(allowed: T): Decoder<T[number]> {
  return (value, at) =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T[number])
      : fail(at, `one of ${allowed.join('|')}`)
}

/** Opaque refs: exact prefix and 43-char body, or the response is rejected. */
function opaqueRef(prefix: string): Decoder<string> {
  const pattern = new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`)
  return (value, at) =>
    typeof value === 'string' && pattern.test(value)
      ? value
      : fail(at, `an opaque ${prefix}_ ref`)
}

/** Mirrors zod's .datetime({ offset: false }): UTC instant, Z suffix, no offset. */
const utcDatetime: Decoder<string> = (value, at) => {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    return fail(at, 'a UTC datetime with Z and no offset')
  }
  return value
}

// --- resource decoders (exactly homeowner-api.v1) -----------------------------

const RELATIONSHIP_LABELS = [
  'claimed_unverified', 'verified_controller', 'invited_participant',
] as const satisfies readonly RelationshipLabel[]

const decodeCapabilities: Decoder<SignInCapabilities> = object<SignInCapabilities>({
  magicLinkSignIn: boolean,
  persistence: boolean,
  uploads: boolean,
  invitations: boolean,
  sharing: boolean,
})

/**
 * homeownerApiSessionSchema, key for key. apiVersion is required and pinned;
 * signed_in carries a top-level principalRef and nothing else about the
 * person — no displayName, no isSynthetic, and the decoder rejects both as
 * unknown keys rather than tolerating them.
 */
export const decodeSession: Decoder<SessionState> = (value, at) => {
  if (!isRecord(value)) return fail(at, 'a session object')
  if (value.kind === 'signed_out') {
    const decoded = object<{
      apiVersion: string
      kind: 'signed_out'
      capabilities: SignInCapabilities
    }>({
      apiVersion: literal(EXPECTED_API_VERSION),
      kind: literal('signed_out'),
      capabilities: decodeCapabilities,
    })(value, at)
    return { kind: 'signed_out', capabilities: decoded.capabilities }
  }
  if (value.kind === 'signed_in') {
    const decoded = object<{
      apiVersion: string
      kind: 'signed_in'
      principalRef: string
      capabilities: SignInCapabilities
    }>({
      apiVersion: literal(EXPECTED_API_VERSION),
      kind: literal('signed_in'),
      principalRef: opaqueRef('hprn'),
      capabilities: decodeCapabilities,
    })(value, at)
    const session: HomeownerSession = {
      principalRef: decoded.principalRef,
      // The server names no one; the UI renders a neutral "Signed in".
      displayName: null,
      isSynthetic: false,
    }
    return { kind: 'signed_in', session, capabilities: decoded.capabilities }
  }
  return fail(at, 'kind signed_out|signed_in')
}

/** homeownerApiHomeSummarySchema: four fields, no counts, no markers. */
export const decodeServerHomeSummary: Decoder<ServerHomeSummary> = (value, at) => {
  const decoded = object<Omit<ServerHomeSummary, 'source'>>({
    homeRef: opaqueRef('hhom'),
    displayLabel: string,
    privateLocationLabel: string,
    relationshipLabel: oneOf(RELATIONSHIP_LABELS),
  })(value, at)
  return { source: 'server', ...decoded }
}

/** homeownerApiHomeViewSchema: the summary plus exactly the supplied counts. */
export const decodeServerHomeView: Decoder<ServerHomeView> = (value, at) => {
  const decoded = object<Omit<ServerHomeView, 'source'>>({
    homeRef: opaqueRef('hhom'),
    displayLabel: string,
    privateLocationLabel: string,
    relationshipLabel: oneOf(RELATIONSHIP_LABELS),
    projectCount: countInt,
    documentCount: countInt,
    warrantyCount: countInt,
    maintenanceCount: countInt,
    updatedAt: utcDatetime,
  })(value, at)
  return { source: 'server', ...decoded }
}

export const decodeList = array

/** Unwrap the `{ data: … }` envelope; any sibling key rejects the response. */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRecord(body)) throw new WireError('envelope: expected an object body')
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'data') {
    throw new WireError('envelope: expected exactly one key "data"')
  }
  return body.data
}
