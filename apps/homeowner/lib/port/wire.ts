/**
 * The client's half of the wire: strict decoders for every /api/v1 response
 * the remote adapter consumes, and the single HTTP-status-to-PortError map.
 *
 * Narrow on purpose. A response with an unknown key, a missing key, a
 * malformed opaque ref, or an impossible date is REJECTED as 'invalid', never
 * displayed. The server (Codex's lane) is authoritative for what these shapes
 * become; when it diverges from the assumptions documented in the PR, this
 * file is where the client meets it — by updating a decoder, not by loosening
 * one.
 *
 * Wire envelope assumption: every success body is exactly `{ "data": ... }`.
 */

import type {
  DocumentSummary, HomeFile, HomeSummary, MaintenanceItem, PortError, Project,
  ProjectPhoto, ProjectStatus, ProjectSummary, SessionState, TimelineEntry, Warranty,
} from './types.ts'

/** 401 → not_signed_in, 403 → forbidden, 404 → not_found, 409 → conflict,
 *  422 → invalid, 429 → rate_limited; everything else unexpected → unavailable. */
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

const integer: Decoder<number> = (value, at) =>
  typeof value === 'number' && Number.isInteger(value) ? value : fail(at, 'an integer')

function nullable<T>(inner: Decoder<T>): Decoder<T | null> {
  return (value, at) => (value === null ? null : inner(value, at))
}

function literal<const T extends string | boolean>(expected: T): Decoder<T> {
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

const calendarDate: Decoder<string> = (value, at) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail(at, 'a YYYY-MM-DD date')
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return fail(at, 'a real calendar date')
  }
  return value
}

// --- resource decoders --------------------------------------------------------

const PROJECT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const

const keyFact = object<{ label: string; value: string }>({ label: string, value: string })

export const decodeSession: Decoder<SessionState> = (value, at) => {
  if (!isRecord(value)) return fail(at, 'a session object')
  const capabilities = object<{ magicLinkSignIn: boolean }>({ magicLinkSignIn: boolean })
  if (value.kind === 'signed_out') {
    return object<Extract<SessionState, { kind: 'signed_out' }>>({
      kind: literal('signed_out'),
      capabilities,
    })(value, at)
  }
  if (value.kind === 'signed_in') {
    return object<Extract<SessionState, { kind: 'signed_in' }>>({
      kind: literal('signed_in'),
      capabilities,
      session: object({
        principalRef: opaqueRef('hprn'),
        displayName: string,
        // A server session describes a real person; a server claiming its own
        // data is synthetic would be nonsense and is rejected as malformed.
        isSynthetic: literal(false),
      }),
    })(value, at)
  }
  return fail(at, 'kind signed_out|signed_in')
}

export const decodeHomeSummary: Decoder<HomeSummary> = object<HomeSummary>({
  homeRef: opaqueRef('hhom'),
  alias: string,
  locality: string,
  projectCount: integer,
  openMaintenanceCount: integer,
  isSynthetic: literal(false),
})

export const decodeHomeFile: Decoder<HomeFile> = object<HomeFile>({
  homeRef: opaqueRef('hhom'),
  alias: string,
  locality: string,
  projectCount: integer,
  openMaintenanceCount: integer,
  yearBuilt: nullable(integer),
  homeType: oneOf(['house', 'townhouse', 'condo', 'other'] as const),
  keyFacts: array(keyFact),
  isSynthetic: literal(false),
})

export const decodeProjectSummary: Decoder<ProjectSummary> = object<ProjectSummary>({
  projectRef: opaqueRef('hprj'),
  homeRef: opaqueRef('hhom'),
  title: string,
  trade: string,
  performedOn: calendarDate,
  status: oneOf(PROJECT_STATUSES) as Decoder<ProjectStatus>,
  photoCount: integer,
  documentCount: integer,
  isSynthetic: literal(false),
})

const decodePhoto: Decoder<ProjectPhoto> = object<ProjectPhoto>({
  photoRef: opaqueRef('hphot'),
  caption: string,
  art: oneOf(['roof', 'gutter', 'window', 'interior', 'exterior'] as const),
  takenOn: calendarDate,
  isSynthetic: literal(false),
})

export const decodeDocumentSummary: Decoder<DocumentSummary> = object<DocumentSummary>({
  documentRef: opaqueRef('hdoc'),
  homeRef: opaqueRef('hhom'),
  projectRef: nullable(opaqueRef('hprj')),
  title: string,
  kind: oneOf(['contract', 'invoice', 'warranty', 'photo_set', 'permit', 'manual'] as const),
  addedOn: calendarDate,
  pages: integer,
  isSynthetic: literal(false),
})

export const decodeWarranty: Decoder<Warranty> = object<Warranty>({
  warrantyRef: opaqueRef('hwar'),
  homeRef: opaqueRef('hhom'),
  projectRef: nullable(opaqueRef('hprj')),
  coverage: string,
  issuedBy: string,
  startsOn: calendarDate,
  endsOn: calendarDate,
  isSynthetic: literal(false),
})

export const decodeProject: Decoder<Project> = object<Project>({
  projectRef: opaqueRef('hprj'),
  homeRef: opaqueRef('hhom'),
  title: string,
  trade: string,
  performedOn: calendarDate,
  status: oneOf(PROJECT_STATUSES) as Decoder<ProjectStatus>,
  photoCount: integer,
  documentCount: integer,
  summary: string,
  contractor: string,
  materials: array(keyFact),
  photos: array(decodePhoto),
  documents: array(decodeDocumentSummary),
  warranty: nullable(decodeWarranty),
  isSynthetic: literal(false),
})

export const decodeTimelineEntry: Decoder<TimelineEntry> = (value, at) => {
  const entry = object<TimelineEntry>({
    entryRef: string,
    homeRef: opaqueRef('hhom'),
    kind: oneOf(['project', 'document', 'warranty', 'maintenance', 'home'] as const),
    on: calendarDate,
    title: string,
    detail: string,
    href: nullable(string),
    isSynthetic: literal(false),
  })(value, at)
  // A timeline href is an app-internal route or nothing. A server must never
  // steer the client to an absolute URL, a protocol, or another origin.
  if (entry.href !== null && !/^\/home\//.test(entry.href)) {
    throw new WireError(`${at}.href: only app-internal /home/ routes are accepted`)
  }
  return entry
}

export const decodeMaintenanceItem: Decoder<MaintenanceItem> = object<MaintenanceItem>({
  itemRef: opaqueRef('hmnt'),
  homeRef: opaqueRef('hhom'),
  title: string,
  cadence: string,
  dueInSeason: string,
  state: oneOf(['upcoming', 'done'] as const),
  isSynthetic: literal(false),
})

export const decodeMagicLinkAccepted: Decoder<{ readonly accepted: true }> =
  object<{ accepted: true }>({ accepted: literal(true) })

export const decodeList = array
export { object as decodeObject, string as decodeString }

/** Unwrap the `{ data: … }` envelope; any sibling key rejects the response. */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRecord(body)) throw new WireError('envelope: expected an object body')
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'data') {
    throw new WireError('envelope: expected exactly one key "data"')
  }
  return body.data
}
