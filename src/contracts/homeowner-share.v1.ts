// =============================================================================
// homeowner-share.v1 (DRAFT CONTRACT, NOT IMPLEMENTED)
// =============================================================================
// Types and pure validators for the future Jobrolo -> Homesrolo sharing path.
// This file deliberately contains NO network code, NO credentials, and NO
// Jobrolo connection. It exists so both sides can review and agree the shape
// before either builds against it.
//
// The governing rules:
//
//   1. TWO INDEPENDENT AUTHORITIES, BOTH REQUIRED.
//      Jobrolo authorizes disclosure of its own records. Homesrolo records the
//      homeowner's acceptance and continuing consent. Disclosure requires both
//      to be active at read time. Either side can revoke unilaterally and the
//      share dies immediately.
//
//   2. EXACT ARTIFACTS ONLY.
//      A share references a pinned list of artifacts by opaque reference,
//      content digest, and version. There is no "everything on this project"
//      grant, no folder grant, and no membership-implies-access rule.
//
//   3. NO GLOBAL PROPERTY IDENTITY IN V1.
//      A share is scoped by a Jobrolo-issued opaque share id. Homesrolo never
//      matches on address, parcel, geohash, or owner name, and never merges two
//      shares into one property. Cross-share linking is a separate RFC.
//
//   4. WORK RECORDS ONLY.
//      The allowed kinds are enumerated below. Policies, carrier
//      communications, claim-strategy material, internal notes, margins,
//      memories, Thresher output, and broad project access are excluded by
//      type, and the exclusion is asserted by tests.
//
//   5. FAIL CLOSED.
//      Anything unknown, expired, revoked, oversized, replayed, or malformed is
//      a refusal. Absence of a signal is never treated as permission.
// =============================================================================

export const HOMEOWNER_SHARE_CONTRACT_VERSION = 'homeowner-share.v1' as const

// --- what may be shared ------------------------------------------------------

/** V1 allowed artifact kinds. Work records only. */
export const ALLOWED_ARTIFACT_KINDS = Object.freeze([
  'inspection_photo',
  'roof_measurement',
  'scope_of_work',
  'completion_record',
  'warranty_document',
  'job_timeline_event',
] as const)

export type AllowedArtifactKind = (typeof ALLOWED_ARTIFACT_KINDS)[number]

/**
 * Explicitly excluded in V1. Enumerated (rather than merely omitted) so that a
 * future change has to delete a named prohibition rather than quietly add a
 * kind, and so tests can assert none of these ever becomes shareable.
 */
export const EXCLUDED_ARTIFACT_KINDS = Object.freeze([
  'insurance_policy',
  'policy_declarations',
  'carrier_communication',
  'claim_strategy_material',
  'claim_file',
  'internal_note',
  'margin_or_cost_detail',
  'contractor_memory',
  'thresher_result',
  'agent_analysis',
  'broad_project_access',
] as const)

export type ExcludedArtifactKind = (typeof EXCLUDED_ARTIFACT_KINDS)[number]

export function isAllowedArtifactKind(value: unknown): value is AllowedArtifactKind {
  return typeof value === 'string' && (ALLOWED_ARTIFACT_KINDS as readonly string[]).includes(value)
}

// --- transport limits --------------------------------------------------------

export const SHARE_LIMITS = Object.freeze({
  /** Max artifacts pinned into a single share. */
  maxArtifactsPerShare: 200,
  /** Max request/response body accepted on the future endpoint. */
  maxPayloadBytes: 256 * 1024,
  /** Clock skew tolerated on a signed request, in seconds. */
  maxRequestAgeSeconds: 300,
  /** Longest life a share authorization may be issued for, in days. */
  maxShareLifetimeDays: 365,
  /** Nonce retention window for replay rejection, in seconds. */
  nonceRetentionSeconds: 900,
})

// --- authority records -------------------------------------------------------

export type AuthorizationStatus = 'active' | 'revoked' | 'expired'
export type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

/** Jobrolo's side: the contractor tenant authorizes disclosure of its records. */
export type JobroloAuthorization = {
  status: AuthorizationStatus
  /** Opaque, issued by Jobrolo. Not a project id, customer id, or address. */
  shareId: string
  /** Opaque reference to the authorizing tenant. Never a tenant name. */
  issuerRef: string
  issuedAt: string
  expiresAt: string
  revokedAt?: string | null
}

/** Homesrolo's side: the homeowner accepted and has not withdrawn. */
export type HomeownerConsent = {
  status: ConsentStatus
  /** Opaque, issued by Homesrolo. Never a phone number or email. */
  homeownerRef: string
  acceptedAt?: string | null
  withdrawnAt?: string | null
}

export type SharedArtifactRef = {
  /** Opaque, issued by Jobrolo. Not a storage path, filename, or document id. */
  artifactRef: string
  kind: AllowedArtifactKind
  /** SHA-256 of the exact bytes authorized, so substitution is detectable. */
  contentSha256: string
  /** Pinned version. A new version requires a new authorization. */
  version: number
  expiresAt: string
  capabilities: {
    read: boolean
    download: boolean
  }
}

export type HomeownerShareGrant = {
  contractVersion: typeof HOMEOWNER_SHARE_CONTRACT_VERSION
  jobroloAuthorization: JobroloAuthorization
  homeownerConsent: HomeownerConsent
  artifacts: readonly SharedArtifactRef[]
}

// --- signed request envelope (shape only) ------------------------------------

/**
 * Shape of the future signed request. Generic HMAC-style envelope: no product
 * branding, no tenant identity, no external-network authority baked in.
 * Signature construction and verification live in the implementation phase.
 */
export type SignedShareRequest = {
  contractVersion: typeof HOMEOWNER_SHARE_CONTRACT_VERSION
  shareId: string
  homeownerRef: string
  /** Unix seconds. Requests outside maxRequestAgeSeconds are refused. */
  timestamp: number
  /** Single-use within nonceRetentionSeconds. Reuse is a replay and refused. */
  nonce: string
  /** SHA-256 of the canonical body, bound into the signature. */
  bodySha256: string
}

// --- validation --------------------------------------------------------------

export type ShareDecision =
  | { disclosable: true; artifacts: readonly SharedArtifactRef[] }
  | { disclosable: false; reasons: string[] }

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const OPAQUE_REF = /^[a-z0-9][a-z0-9_-]{7,63}$/i
const SHA256_HEX = /^[a-f0-9]{64}$/i

function isFutureOf(instant: string, now: Date): boolean {
  if (!ISO_INSTANT.test(instant)) return false
  const parsed = Date.parse(instant)
  return Number.isFinite(parsed) && parsed > now.getTime()
}

/**
 * Decide whether a share may be disclosed right now, and with which artifacts.
 * Pure: callers pass `now` so the decision is testable and reproducible.
 *
 * Both authorities must be active and unexpired. Individual artifacts are then
 * filtered by their own expiry and read capability. An empty artifact set after
 * filtering is a refusal, not an empty success, so a caller cannot mistake
 * "nothing left" for "nothing shared".
 */
export function evaluateShare(grant: HomeownerShareGrant, now: Date): ShareDecision {
  const reasons: string[] = []

  if (grant?.contractVersion !== HOMEOWNER_SHARE_CONTRACT_VERSION) {
    reasons.push('unsupported contract version')
  }

  const auth = grant?.jobroloAuthorization
  if (!auth || auth.status !== 'active') {
    reasons.push('jobrolo authorization is not active')
  } else {
    if (!OPAQUE_REF.test(auth.shareId ?? '')) reasons.push('share id is not an opaque reference')
    if (!OPAQUE_REF.test(auth.issuerRef ?? '')) reasons.push('issuer ref is not an opaque reference')
    if (!isFutureOf(auth.expiresAt ?? '', now)) reasons.push('jobrolo authorization is expired')
    if (auth.revokedAt) reasons.push('jobrolo authorization was revoked')
  }

  const consent = grant?.homeownerConsent
  if (!consent || consent.status !== 'accepted') {
    reasons.push('homeowner consent is not accepted')
  } else {
    if (!OPAQUE_REF.test(consent.homeownerRef ?? '')) reasons.push('homeowner ref is not an opaque reference')
    if (consent.withdrawnAt) reasons.push('homeowner consent was withdrawn')
  }

  const artifacts = Array.isArray(grant?.artifacts) ? grant.artifacts : []
  if (artifacts.length > SHARE_LIMITS.maxArtifactsPerShare) {
    reasons.push('share exceeds the artifact cap')
  }

  const disclosable = artifacts.filter(artifact => {
    if (!isAllowedArtifactKind(artifact?.kind)) return false
    if (!OPAQUE_REF.test(artifact?.artifactRef ?? '')) return false
    if (!SHA256_HEX.test(artifact?.contentSha256 ?? '')) return false
    if (!Number.isSafeInteger(artifact?.version) || artifact.version < 1) return false
    if (!isFutureOf(artifact?.expiresAt ?? '', now)) return false
    return artifact?.capabilities?.read === true
  })

  if (reasons.length > 0) return { disclosable: false, reasons }
  if (disclosable.length === 0) return { disclosable: false, reasons: ['no artifact is currently disclosable'] }
  return { disclosable: true, artifacts: disclosable }
}

/** Reject stale or future-dated requests before any signature work. */
export function isRequestFresh(request: SignedShareRequest, nowUnixSeconds: number): boolean {
  const timestamp = request?.timestamp
  if (!Number.isSafeInteger(timestamp)) return false
  const age = nowUnixSeconds - timestamp
  return age >= -SHARE_LIMITS.maxRequestAgeSeconds && age <= SHARE_LIMITS.maxRequestAgeSeconds
}
