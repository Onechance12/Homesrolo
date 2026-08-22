/**
 * The client's half of the wire: strict decoders for the /api/v1 responses the
 * remote adapter consumes, and the single HTTP-status-to-PortError map.
 *
 * Source of truth: src/homeowner/homeowner-api.v1.ts (PR #8). This release the
 * server defines three reads plus the create-home and exact-home intake
 * responses, and the decoders below mirror those schemas key for key. Speculative decoders for
 * routes the server has not defined were deleted rather than kept "for later":
 * an unsupported route returns unavailable in the adapter and never decodes.
 *
 * Envelope: every success body is exactly `{ "data": ... }` with no sibling
 * keys. The application service itself is transport-neutral, so this is a
 * ROUTE-ADAPTER REQUIREMENT on the server side, not something the service
 * already guarantees — flagged in the PR for the integration lane.
 */

import {
  type DeletedPhotoCheckup, type DocumentSummary, type HomeownerSession, type HomeResearchFact, type HomeResearchResult, type PhotoCheckup, type PortError, type Project, type ProjectQuote, type ProjectReviewPreview, type ProjectReviewSubmission, type QuoteScope, type QuoteScopeItem, type QuoteScopeKey, type RecordedHomeIntake, type RelationshipLabel,
  type ServerHomeSummary, type ServerHomeView, type SessionState, type SignInCapabilities,
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

function boundedArray<T>(item: Decoder<T>, minimum: number, maximum: number): Decoder<readonly T[]> {
  return (value, at) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
      return fail(at, `an array with ${minimum} through ${maximum} items`)
    }
    return value.map((entry, index) => item(entry, `${at}[${index}]`))
  }
}

/** Mirrors z.string().trim().min(1).max(n): trimmed, nonempty, bounded. */
function boundedLabel(max: number): Decoder<string> {
  return (value, at) => {
    if (typeof value !== 'string') return fail(at, 'a string')
    if (value !== value.trim()) return fail(at, 'a trimmed string')
    if (value.length < 1 || value.length > max) {
      return fail(at, `a nonempty string of at most ${max} characters`)
    }
    return value
  }
}

function trimmedText(max: number): Decoder<string> {
  return (value, at) => {
    if (typeof value !== 'string') return fail(at, 'a string')
    if (value !== value.trim()) return fail(at, 'a trimmed string')
    if (value.length > max) return fail(at, `a string of at most ${max} characters`)
    return value
  }
}

function boundedResearchText(max: number): Decoder<string> {
  return (value, at) => {
    const decoded = boundedLabel(max)(value, at)
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded)
      ? fail(at, 'text without control characters')
      : decoded
  }
}

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

function matching(pattern: RegExp, expected: string): Decoder<string> {
  return (value, at) => typeof value === 'string' && pattern.test(value)
    ? value
    : fail(at, expected)
}

const optional = <T>(decoder: Decoder<T>): Decoder<T | undefined> => (value, at) =>
  value === undefined ? undefined : decoder(value, at)

/** Opaque refs: exact prefix and 43-char body, or the response is rejected. */
function opaqueRef(prefix: string): Decoder<string> {
  const pattern = new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`)
  return (value, at) =>
    typeof value === 'string' && pattern.test(value)
      ? value
      : fail(at, `an opaque ${prefix}_ ref`)
}

/**
 * The server's canonical UTC instant: exactly YYYY-MM-DDTHH:mm:ss.sssZ, a real
 * moment, and byte-equal to its own round trip through Date — the same rule
 * the root contracts apply. Alternate precision, offsets, and impossible dates
 * (2026-02-30) all reject.
 */
const utcInstant: Decoder<string> = (value, at) => {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return fail(at, 'a canonical UTC instant (YYYY-MM-DDTHH:mm:ss.sssZ)')
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return fail(at, 'a real canonical UTC instant')
  }
  return value
}

const nullable = <T>(decoder: Decoder<T>): Decoder<T | null> => (value, at) =>
  value === null ? null : decoder(value, at)

const calendarDate: Decoder<string> = (value, at) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail(at, 'a calendar date')
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return fail(at, 'a real calendar date')
  }
  return value
}

/** Server-filtered browser-safe citation URL. The client repeats the public
 * HTTPS/auth/port bounds so a malformed success response is never rendered. */
const publicHttpsUrl: Decoder<string> = (value, at) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) {
    return fail(at, 'a public HTTPS URL')
  }
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const bareHostname = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bareHostname)
    const privateIpv4 = ipv4 ? (() => {
      const octets = ipv4.slice(1).map(Number)
      const [first = Number.NaN, second = Number.NaN] = octets
      return octets.some(part => part > 255)
        || first === 0 || first === 10 || first === 127
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
    })() : false
    const privateIpv6 = bareHostname === '::' || bareHostname === '::1'
      || bareHostname.startsWith('fc') || bareHostname.startsWith('fd')
      || /^fe[89ab]/.test(bareHostname) || bareHostname.startsWith('::ffff:')
    const blockedMarketplace = [
      'zillow.com', 'realtor.com', 'redfin.com', 'trulia.com',
    ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
    if (url.protocol !== 'https:' || url.username || url.password
      || (url.port && url.port !== '443') || url.href !== value
      || url.hash
      || [...url.searchParams.keys()].some(key => /^(?:utm_|fbclid$|gclid$)/i.test(key))
      || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || privateIpv4 || privateIpv6 || blockedMarketplace) {
      return fail(at, 'a canonical public HTTPS URL')
    }
    return value
  } catch {
    return fail(at, 'a public HTTPS URL')
  }
}

const wholeYear: Decoder<number> = (value, at) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1800 && value <= 9999
    ? value
    : fail(at, 'a whole year from 1800 through 9999')

const decodeApproximateYear = object<{ value: number; precision: 'exact' | 'approximate' }>({
  value: wholeYear,
  precision: oneOf(['exact', 'approximate'] as const),
})

// --- resource decoders (exactly homeowner-api.v1) -----------------------------

const RELATIONSHIP_LABELS = [
  'claimed_unverified', 'verified_controller', 'invited_participant',
] as const satisfies readonly RelationshipLabel[]

const decodeCapabilities: Decoder<SignInCapabilities> = object<SignInCapabilities>({
  magicLinkSignIn: boolean,
  persistence: boolean,
  projectQuotes: boolean,
  homeResearch: boolean,
  uploads: boolean,
  photoCheckups: boolean,
  projectReview: boolean,
  projectReviewAttachments: boolean,
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
    displayLabel: boundedLabel(80),
    privateLocationLabel: boundedLabel(200),
    relationshipLabel: oneOf(RELATIONSHIP_LABELS),
  })(value, at)
  return { source: 'server', ...decoded }
}

/** homeownerApiHomeViewSchema: the summary plus exactly the supplied counts. */
export const decodeServerHomeView: Decoder<ServerHomeView> = (value, at) => {
  const decoded = object<Omit<ServerHomeView, 'source'>>({
    homeRef: opaqueRef('hhom'),
    displayLabel: boundedLabel(80),
    privateLocationLabel: boundedLabel(200),
    relationshipLabel: oneOf(RELATIONSHIP_LABELS),
    projectCount: countInt,
    documentCount: countInt,
    warrantyCount: countInt,
    maintenanceCount: countInt,
    updatedAt: utcInstant,
  })(value, at)
  return { source: 'server', ...decoded }
}

const SYSTEM_KINDS = [
  'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
] as const

const decodeRecordedSystem = object<RecordedHomeIntake['systems'][number]>({
  kind: oneOf(SYSTEM_KINDS),
  present: oneOf(['yes', 'no', 'unknown'] as const),
  installedOrReplacedYear: nullable(decodeApproximateYear),
})

export const decodeRecordedHomeIntake: Decoder<RecordedHomeIntake> = (value, at) => {
  const decoded = object<RecordedHomeIntake>({
    homeRef: opaqueRef('hhom'),
    homeType: oneOf(['house', 'townhouse', 'condo', 'other', 'unknown'] as const),
    yearBuilt: nullable(decodeApproximateYear),
    source: literal('homeowner_recollection'),
    systems: array(decodeRecordedSystem),
    updatedAt: utcInstant,
  })(value, at)
  const kinds = decoded.systems.map(system => system.kind)
  if (kinds.length !== SYSTEM_KINDS.length
    || new Set(kinds).size !== SYSTEM_KINDS.length
    || SYSTEM_KINDS.some(kind => !kinds.includes(kind))) {
    return fail(`${at}.systems`, 'each supported system exactly once')
  }
  for (const [index, system] of decoded.systems.entries()) {
    if (system.present !== 'yes' && system.installedOrReplacedYear !== null) {
      fail(`${at}.systems[${index}].installedOrReplacedYear`, 'null unless present is yes')
    }
  }
  return decoded
}

type WireProject = {
  projectRef: string
  homeRef: string
  title: string
  category: 'roofing' | 'exterior' | 'interior' | 'electrical' | 'plumbing' | 'hvac' | 'landscaping' | 'appliances' | 'pest' | 'pool' | 'new_construction' | 'other'
  status: Project['status']
  occurredOn: string | null
  summary: string
  createdAt: string
  updatedAt: string
}

const PROJECT_CATEGORIES = [
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac', 'landscaping',
  'appliances', 'pest', 'pool', 'new_construction', 'other',
] as const

const PROJECT_CATEGORY_LABEL: Readonly<Record<WireProject['category'], string>> = Object.freeze({
  roofing: 'Roofing',
  exterior: 'Exterior',
  interior: 'Interior',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  landscaping: 'Landscaping',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Other',
})

export const decodeProject: Decoder<Project> = (value, at) => {
  const decoded = object<WireProject>({
    projectRef: opaqueRef('hprj'),
    homeRef: opaqueRef('hhom'),
    title: boundedLabel(120),
    category: oneOf(PROJECT_CATEGORIES),
    status: oneOf(['planned', 'in_progress', 'completed', 'cancelled'] as const),
    occurredOn: nullable(calendarDate),
    summary: trimmedText(2000),
    createdAt: utcInstant,
    updatedAt: utcInstant,
  })(value, at)
  if (decoded.updatedAt < decoded.createdAt) {
    return fail(`${at}.updatedAt`, 'a time on or after createdAt')
  }
  return {
    projectRef: decoded.projectRef,
    homeRef: decoded.homeRef,
    title: decoded.title,
    trade: PROJECT_CATEGORY_LABEL[decoded.category],
    performedOn: decoded.occurredOn,
    status: decoded.status,
    photoCount: 0,
    documentCount: 0,
    isSynthetic: false,
    summary: decoded.summary,
    contractor: '',
    materials: [],
    photos: [],
    documents: [],
    warranty: null,
  }
}

type WireArtifact = {
  artifactRef: string
  homeRef: string
  projectRef: string | null
  kind: 'photo' | 'document' | 'warranty'
  displayName: string
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'
  byteLength: number
  createdAt: string
}

export const decodeArtifact: Decoder<DocumentSummary> = (value, at) => {
  const decoded = object<WireArtifact>({
    artifactRef: opaqueRef('hart'),
    homeRef: opaqueRef('hhom'),
    projectRef: nullable(opaqueRef('hprj')),
    kind: oneOf(['photo', 'document', 'warranty'] as const),
    displayName: boundedLabel(160),
    mediaType: oneOf(['application/pdf', 'image/jpeg', 'image/png'] as const),
    byteLength: countInt,
    createdAt: utcInstant,
  })(value, at)
  if (decoded.byteLength < 1 || decoded.byteLength > 25 * 1024 * 1024) {
    return fail(`${at}.byteLength`, 'a byte length from 1 through 25 MiB')
  }
  return {
    documentRef: decoded.artifactRef,
    homeRef: decoded.homeRef,
    projectRef: decoded.projectRef,
    title: decoded.displayName,
    kind: decoded.kind === 'photo' ? 'photo_set' : decoded.kind,
    addedOn: decoded.createdAt.slice(0, 10),
    pages: 0,
    mediaType: decoded.mediaType,
    byteLength: decoded.byteLength,
    downloadHref: `/api/v1/homes/${decoded.homeRef}/artifacts/${decoded.artifactRef}/content`,
    isSynthetic: false,
  }
}

const PHOTO_CHECKUP_AREAS = [
  'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
  'hvac', 'water_heater', 'foundation', 'gutters', 'other',
] as const satisfies readonly PhotoCheckup['area'][]

type WirePhotoCheckup = PhotoCheckup

/**
 * An image view can point only to its own exact-home, same-origin routes. The
 * response never gets to choose an arbitrary URL, even a same-origin one.
 */
export const decodePhotoCheckup: Decoder<PhotoCheckup> = (value, at) => {
  const decoded = object<WirePhotoCheckup>({
    photoRef: opaqueRef('hpho'),
    homeRef: opaqueRef('hhom'),
    observedOn: calendarDate,
    area: oneOf(PHOTO_CHECKUP_AREAS),
    viewLabel: boundedLabel(80),
    caption: trimmedText(240),
    fullUrl: matching(
      /^\/api\/v1\/homes\/hhom_[A-Za-z0-9_-]{43}\/photo-checkups\/hpho_[A-Za-z0-9_-]{43}\/full$/,
      'an exact same-origin full-photo route',
    ),
    thumbnailUrl: matching(
      /^\/api\/v1\/homes\/hhom_[A-Za-z0-9_-]{43}\/photo-checkups\/hpho_[A-Za-z0-9_-]{43}\/thumbnail$/,
      'an exact same-origin thumbnail route',
    ),
    width: countInt,
    height: countInt,
    createdAt: utcInstant,
  })(value, at)
  if (/[\u0000-\u001f\u007f]/.test(decoded.viewLabel)
    || /[\u0000-\u001f\u007f]/.test(decoded.caption)
    || decoded.width < 1 || decoded.width > 2048
    || decoded.height < 1 || decoded.height > 2048) {
    return fail(at, 'safe caption text and dimensions from 1 through 2048')
  }
  const base = `/api/v1/homes/${decoded.homeRef}/photo-checkups/${decoded.photoRef}`
  if (decoded.fullUrl !== `${base}/full` || decoded.thumbnailUrl !== `${base}/thumbnail`) {
    return fail(at, 'photo URLs matching their own homeRef and photoRef')
  }
  return decoded
}

/** The per-home quota makes any larger success response off-contract. */
export const decodePhotoCheckupList: Decoder<readonly PhotoCheckup[]> = (value, at) => {
  const decoded = boundedArray(decodePhotoCheckup, 0, 100)(value, at)
  if (new Set(decoded.map(photo => photo.photoRef)).size !== decoded.length) {
    return fail(at, 'photos with unique opaque refs')
  }
  return decoded
}

export const decodeDeletedPhotoCheckup: Decoder<DeletedPhotoCheckup> =
  object<DeletedPhotoCheckup>({
    photoRef: opaqueRef('hpho'),
    state: literal('deleted'),
  })

const QUOTE_SCOPE_KEYS = [
  'measurement', 'roof_configuration', 'tear_off', 'decking', 'underlayment',
  'leak_barrier', 'primary_materials', 'starter_and_ridge', 'valleys',
  'flashing_transitions', 'penetrations', 'ventilation', 'permits', 'cleanup',
  'workmanship_warranty', 'manufacturer_warranty', 'payment_terms', 'exclusions',
] as const satisfies readonly QuoteScopeKey[]

const decodeQuoteScopeItem = object<QuoteScopeItem>({
  status: oneOf(['included', 'excluded', 'allowance', 'not_stated'] as const),
  detail: optional(boundedLabel(160)),
})

const decodeQuoteScope: Decoder<QuoteScope> = (value, at) => {
  if (!isRecord(value)) return fail(at, 'an object')
  const scope: Partial<Record<QuoteScopeKey, QuoteScopeItem>> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!QUOTE_SCOPE_KEYS.includes(key as QuoteScopeKey)) {
      return fail(`${at}.${key}`, 'a supported quote scope key')
    }
    scope[key as QuoteScopeKey] = decodeQuoteScopeItem(item, `${at}.${key}`)
  }
  return scope
}

export const decodeProjectQuote: Decoder<ProjectQuote> = (value, at) => {
  const decoded = object<ProjectQuote>({
    quoteRef: opaqueRef('hquo'),
    homeRef: opaqueRef('hhom'),
    projectRef: opaqueRef('hprj'),
    contractorLabel: boundedLabel(120),
    proposalDate: nullable(calendarDate),
    artifactRef: nullable(opaqueRef('hart')),
    scope: decodeQuoteScope,
    notes: trimmedText(500),
    source: literal('homeowner_entry'),
    revision: (entry, entryAt) => typeof entry === 'number'
      && Number.isInteger(entry) && entry >= 1
      ? entry
      : fail(entryAt, 'a positive integer'),
    createdAt: utcInstant,
    updatedAt: utcInstant,
  })(value, at)
  if (decoded.updatedAt < decoded.createdAt) {
    return fail(`${at}.updatedAt`, 'a time on or after createdAt')
  }
  return decoded
}

export const decodeProjectReviewSubmission: Decoder<ProjectReviewSubmission> =
  object<ProjectReviewSubmission>({
    submissionRef: opaqueRef('hsub'),
    projectRef: opaqueRef('hprj'),
    status: oneOf(['awaiting_chance_review', 'reconciliation_required'] as const),
    submittedAt: utcInstant,
    message: boundedLabel(240),
  })

export const decodeProjectReviewPreview: Decoder<ProjectReviewPreview> =
  object<ProjectReviewPreview>({
    projectRef: opaqueRef('hprj'),
    disclosureDigest: matching(/^[a-f0-9]{64}$/, 'a SHA-256 digest'),
    homeowner: object<ProjectReviewPreview['homeowner']>({
      name: boundedLabel(120),
      email: boundedLabel(254),
      phone: optional(matching(/^\+[1-9][0-9]{7,14}$/, 'an E.164 phone number')),
      preferredContact: oneOf(['email', 'phone', 'text'] as const),
    }),
    property: object<ProjectReviewPreview['property']>({ label: boundedLabel(240) }),
    project: object<ProjectReviewPreview['project']>({
      title: boundedLabel(160),
      category: oneOf(['roofing'] as const),
      status: oneOf(['planned', 'in_progress', 'completed', 'cancelled'] as const),
      summary: trimmedText(4000),
    }),
    attachments: array(object<ProjectReviewPreview['attachments'][number]>({
      artifactRef: opaqueRef('hart'),
      displayName: boundedLabel(160),
      kind: oneOf(['photo', 'document', 'warranty'] as const),
      mediaType: oneOf(['application/pdf', 'image/jpeg', 'image/png'] as const),
      byteLength: countInt,
    })),
    consentText: boundedLabel(1000),
  })

const HOME_RESEARCH_FIELDS = [
  'year_built', 'property_type', 'square_footage', 'lot_size', 'roof',
  'heating', 'cooling', 'water_heater', 'permit', 'tax_record',
  'public_record', 'other',
] as const

const decodeHomeResearchFact = object<HomeResearchFact>({
  field: oneOf(HOME_RESEARCH_FIELDS),
  value: boundedResearchText(300),
  confidence: oneOf(['low', 'medium', 'high'] as const),
  sourceUrls: boundedArray(publicHttpsUrl, 1, 4),
})

/** Strict projection of HomeResearchResult. Citations must resolve to a source
 * included in the same response; otherwise the whole answer is rejected. */
export const decodeHomeResearchResult: Decoder<HomeResearchResult> = (value, at) => {
  const decoded = object<HomeResearchResult>({
    requestRef: matching(
      /^hres_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      'a canonical lowercase hres_ UUIDv4 request ref',
    ),
    answer: boundedResearchText(1_200),
    answerSourceUrls: boundedArray(publicHttpsUrl, 1, 6),
    proposedFacts: boundedArray(decodeHomeResearchFact, 0, 12),
    sources: boundedArray(object<HomeResearchResult['sources'][number]>({
      title: boundedResearchText(160),
      url: publicHttpsUrl,
    }), 1, 12),
    limitations: boundedArray(boundedResearchText(240), 0, 6),
    followUpQuestions: boundedArray(boundedResearchText(240), 0, 4),
    disclosure: literal('Research is a draft. Confirm proposed facts before adding them to your home record.'),
  })(value, at)
  const sourceUrls = new Set(decoded.sources.map(source => source.url))
  if (sourceUrls.size !== decoded.sources.length
    || new Set(decoded.answerSourceUrls).size !== decoded.answerSourceUrls.length
    || decoded.proposedFacts.some(fact => new Set(fact.sourceUrls).size !== fact.sourceUrls.length)) {
    return fail(at, 'unique source and citation URLs')
  }
  if (decoded.answerSourceUrls.some(url => !sourceUrls.has(url))) {
    return fail(`${at}.answerSourceUrls`, 'URLs present in sources')
  }
  if (decoded.proposedFacts.some(fact => fact.sourceUrls.some(url => !sourceUrls.has(url)))) {
    return fail(`${at}.proposedFacts`, 'fact citations present in sources')
  }
  return decoded
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
