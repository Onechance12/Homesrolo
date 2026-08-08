// =============================================================================
// homeowner-share.v1 — wire contract (STRUCTURE ONLY, NOTHING IS DELIVERABLE)
// =============================================================================
// Pure types and validators for the future Jobrolo -> Homesrolo path. No
// network code, no database, no credentials, no routes, no Jobrolo connection.
// Both sides review and agree this shape before either builds against it.
//
// THE MODEL
//
//   manifest            Immutable. Names exactly which purpose-built projections
//                       exist for one share, pinned by digest. Its canonical
//                       bytes are the thing everything else is bound to.
//
//   authorization       Signed by Jobrolo. The contractor tenant permits
//     receipt           disclosure of the projections in one exact manifest.
//
//   consent receipt     Signed by Homesrolo. The homeowner accepted that same
//                       exact manifest.
//
//   revocation receipt  Append-only. Either side withdraws. Nothing is ever
//                       edited or deleted; state is the fold over the ledger.
//
// Delivery requires BOTH authorities to be live at read time and bound to the
// same manifest digest. Absence of a signal is never permission.
//
// SEVEN RULES THAT DO NOT BEND
//
//   1. PROJECTIONS ONLY. What crosses the boundary is a recipient-, share-, and
//      purpose-specific `homeowner_release` projection built for disclosure.
//      Raw documents, database rows, storage paths, filenames, labels, URLs,
//      contact or claim identifiers, policy and carrier material, internal
//      notes, margins, contractor memory, and AI/Thresher output have no
//      representation in this contract and fail strict parsing.
//
//   2. ALL OR NOTHING. One invalid artifact rejects the entire manifest. The
//      parser never filters bad siblings and returns the rest, because a caller
//      handed a shortened list cannot tell it was shortened.
//
//   3. IMMUTABLE. Manifests and receipts are never mutated. A change is a new
//      generation with a new manifest, a new digest, and new receipts.
//
//   4. NO GLOBAL PROPERTY IDENTITY. Scope is one Jobrolo-issued shareId. No
//      address, parcel, geohash, or owner-name matching, and no auto-merge of
//      two shares into one property.
//
//   5. FAIL CLOSED, AND FAIL WITHOUT INFORMING. Unknown, expired, revoked,
//      oversized, replayed, or malformed is a refusal, and the external-facing
//      refusal collapses to one non-enumerating reason so a caller cannot probe
//      for the difference between "no such share" and "not permitted".
//
//   6. STRUCTURE IS NOT AUTHORIZATION. Everything here is shape checking.
//      See STRUCTURAL_VALIDATION_WARNING.
//
//   7. PHASE 0 IS INERT. The launch-approved projection set is frozen empty and
//      the delivery decision's type cannot express success. See
//      `evaluateDelivery`.
// =============================================================================

import {
  canonicalDigest,
  canonicalJson,
  instantToMillis,
  isBase64Url,
  isCanonicalInstant,
  isSha256Hex,
  utf8ByteLength,
} from './canonical.ts'

// --- identity of the contract -------------------------------------------------

export const HOMEOWNER_SHARE_CONTRACT_VERSION = 'homeowner-share.v1' as const
export const HOMEOWNER_SHARE_ISSUER = 'jobrolo' as const
export const HOMEOWNER_SHARE_AUDIENCE = 'homesrolo' as const
export const HOMEOWNER_SHARE_PURPOSE = 'homeowner_work_records' as const

/**
 * Loud, exported, and asserted by tests so it cannot be quietly dropped from
 * the documentation as the implementation grows.
 */
export const STRUCTURAL_VALIDATION_WARNING =
  'Structural validation proves shape and binding only. It does not verify any signature ' +
  'against a trusted key, and it does not consult the current revocation ledger. A manifest ' +
  'and receipt set that pass every check here may still be forged, revoked, or superseded.'

// --- what may cross the boundary ----------------------------------------------

/**
 * Projection kinds the contract can express. Every one is a summary built for
 * disclosure, never a pass-through of a stored record.
 *
 * Being known is not being permitted: see LAUNCH_APPROVED_PROJECTION_KINDS.
 */
export const KNOWN_PROJECTION_KINDS = Object.freeze([
  'work_status_summary',
  'inspection_photo_projection',
  'roof_measurement_summary',
  'scope_of_work_summary',
  'completion_record_summary',
  'warranty_summary',
  'job_timeline_summary',
] as const)

export type ProjectionKind = (typeof KNOWN_PROJECTION_KINDS)[number]

/**
 * PHASE 0 INERTNESS. Frozen empty: no projection kind is approved for launch,
 * so no manifest can produce a delivery. Adding a kind here is a deliberate,
 * reviewable act that changes what a homeowner can be shown.
 */
export const LAUNCH_APPROVED_PROJECTION_KINDS: readonly ProjectionKind[] = Object.freeze([])

/**
 * Enumerated rather than merely omitted, so that widening the contract requires
 * deleting a named prohibition instead of quietly adding a kind. None of these
 * has a representation in the manifest; the list exists to be asserted against.
 */
export const EXCLUDED_SOURCE_KINDS = Object.freeze([
  'raw_document',
  'database_row',
  'storage_object',
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

/** The only source a manifest artifact may declare. */
export const PROJECTION_SOURCE = 'homeowner_release' as const

/** Media types a projection may be encoded as. */
export const ALLOWED_MEDIA_TYPES = Object.freeze([
  'application/json',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const)

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

// --- caps ---------------------------------------------------------------------

export const SHARE_LIMITS = Object.freeze({
  maxArtifacts: 25,
  maxArtifactBytes: 25 * 1024 * 1024,
  maxAggregateBytes: 100 * 1024 * 1024,
  maxCanonicalManifestBytes: 64 * 1024,
  minLifetimeDays: 1,
  maxLifetimeDays: 30,
})

const DAY_MS = 86_400_000

// --- opaque identifiers -------------------------------------------------------

export const ID_PREFIXES = Object.freeze({
  projection: 'hproj_',
  share: 'hshr_',
  recipient: 'hrcp_',
  nonce: 'hnce_',
  receipt: 'hrec_',
})

export type IdKind = keyof typeof ID_PREFIXES

/** 43 base64url characters carry 258 bits, so a valid id is unguessable. */
const OPAQUE_BODY_LENGTH = 43
const OPAQUE_BODY = /^[A-Za-z0-9_-]{43}$/

/**
 * Identifier shapes that carry meaning are refused outright. The charset
 * already excludes '@', '+', '.', '/', and whitespace, so an email, a URL, or a
 * street address cannot survive; this catches the remaining digit-run shapes
 * (phone, policy, claim, and account numbers) that would otherwise fit.
 */
const PII_SHAPED = /\d{10,}/

export function isOpaqueId(value: unknown, kind: IdKind): value is string {
  if (typeof value !== 'string') return false
  const prefix = ID_PREFIXES[kind]
  if (!value.startsWith(prefix)) return false
  const body = value.slice(prefix.length)
  if (body.length !== OPAQUE_BODY_LENGTH) return false
  if (!OPAQUE_BODY.test(body)) return false
  return !PII_SHAPED.test(body)
}

// --- the manifest -------------------------------------------------------------

export type ManifestArtifact = {
  /** Opaque projection reference. Not a path, filename, or document id. */
  readonly artifactRef: string
  readonly byteLength: number
  readonly mediaType: AllowedMediaType
  readonly projectionKind: ProjectionKind
  readonly projectionVersion: number
  /** SHA-256 of the exact projection bytes, so substitution is detectable. */
  readonly sha256: string
  readonly source: typeof PROJECTION_SOURCE
}

export type ShareManifest = {
  readonly artifacts: readonly ManifestArtifact[]
  readonly audience: typeof HOMEOWNER_SHARE_AUDIENCE
  readonly contractVersion: typeof HOMEOWNER_SHARE_CONTRACT_VERSION
  readonly expiresAt: string
  /** Increments when a share is reissued. A new generation is a new manifest. */
  readonly generation: number
  readonly issuedAt: string
  readonly issuer: typeof HOMEOWNER_SHARE_ISSUER
  readonly nonce: string
  readonly purpose: typeof HOMEOWNER_SHARE_PURPOSE
  readonly recipientRef: string
  readonly shareId: string
}

const MANIFEST_KEYS = Object.freeze([
  'artifacts',
  'audience',
  'contractVersion',
  'expiresAt',
  'generation',
  'issuedAt',
  'issuer',
  'nonce',
  'purpose',
  'recipientRef',
  'shareId',
])

const ARTIFACT_KEYS = Object.freeze([
  'artifactRef',
  'byteLength',
  'mediaType',
  'projectionKind',
  'projectionVersion',
  'sha256',
  'source',
])

/**
 * Field names that must never appear anywhere in a manifest. Strict unknown-key
 * rejection already refuses every one of them; this list exists so the refusal
 * names what was wrong, and so a test can assert each specific leak is caught
 * rather than trusting the general rule to have covered them.
 */
export const POISON_FIELD_NAMES = Object.freeze([
  'address',
  'street',
  'city',
  'state',
  'zip',
  'postalCode',
  'parcel',
  'geohash',
  'latitude',
  'longitude',
  'customer',
  'customerName',
  'customerId',
  'homeownerName',
  'contact',
  'phone',
  'phoneNumber',
  'email',
  'claimNumber',
  'policyNumber',
  'carrier',
  'url',
  'downloadUrl',
  'signedUrl',
  'href',
  'path',
  'storagePath',
  'bucket',
  'key',
  'filename',
  'fileName',
  'originalName',
  'title',
  'label',
  'caption',
  'notes',
  'internalNotes',
  'metadata',
  'tags',
  'projectId',
  'projectRef',
  'jobId',
  'documentId',
  'tenant',
  'tenantId',
  'tenantName',
  'margin',
  'cost',
  'price',
  'memory',
  'thresher',
  'analysis',
  'aiSummary',
])

const POISON_SET: ReadonlySet<string> = new Set(POISON_FIELD_NAMES)

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Report every extra and missing key, naming poison fields specifically. Errors
 * accumulate for the report; the caller still rejects the whole manifest on the
 * first non-empty error list.
 */
function checkKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  where: string,
  errors: string[],
): void {
  const present = Object.keys(record)
  for (const key of present) {
    if (expected.includes(key)) continue
    if (POISON_SET.has(key)) {
      errors.push(`${where}: prohibited field "${key}" must never cross the boundary`)
    } else {
      errors.push(`${where}: unknown field "${key}"`)
    }
  }
  for (const key of expected) {
    if (!present.includes(key)) errors.push(`${where}: missing field "${key}"`)
  }
}

function parseArtifact(value: unknown, index: number, errors: string[]): void {
  const where = `artifacts[${index}]`
  if (!isPlainObject(value)) {
    errors.push(`${where}: not an object`)
    return
  }

  checkKeys(value, ARTIFACT_KEYS, where, errors)

  if (!isOpaqueId(value['artifactRef'], 'projection')) {
    errors.push(`${where}.artifactRef: not an opaque ${ID_PREFIXES.projection} reference`)
  }

  const byteLength = value['byteLength']
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 1) {
    errors.push(`${where}.byteLength: must be a positive integer`)
  } else if ((byteLength as number) > SHARE_LIMITS.maxArtifactBytes) {
    errors.push(`${where}.byteLength: exceeds the per-artifact cap`)
  }

  if (!(ALLOWED_MEDIA_TYPES as readonly unknown[]).includes(value['mediaType'])) {
    errors.push(`${where}.mediaType: not an allowed media type`)
  }

  if (!(KNOWN_PROJECTION_KINDS as readonly unknown[]).includes(value['projectionKind'])) {
    errors.push(`${where}.projectionKind: not a known projection kind`)
  }

  const projectionVersion = value['projectionVersion']
  if (!Number.isSafeInteger(projectionVersion) || (projectionVersion as number) < 1) {
    errors.push(`${where}.projectionVersion: must be a positive integer`)
  }

  if (!isSha256Hex(value['sha256'])) {
    errors.push(`${where}.sha256: not a lowercase hex SHA-256 digest`)
  }

  if (value['source'] !== PROJECTION_SOURCE) {
    errors.push(`${where}.source: only "${PROJECTION_SOURCE}" projections may be shared`)
  }
}

/**
 * Strict, all-or-nothing manifest parse. Returns the manifest only when every
 * field of every artifact is valid; otherwise returns the full error list and
 * no value at all. There is deliberately no partial-success shape to destructure.
 */
export function parseShareManifest(input: unknown): ParseResult<ShareManifest> {
  const errors: string[] = []

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['manifest: not an object'] }
  }

  checkKeys(input, MANIFEST_KEYS, 'manifest', errors)

  if (input['contractVersion'] !== HOMEOWNER_SHARE_CONTRACT_VERSION) {
    errors.push('manifest.contractVersion: unsupported contract version')
  }
  if (input['issuer'] !== HOMEOWNER_SHARE_ISSUER) {
    errors.push('manifest.issuer: unexpected issuer')
  }
  if (input['audience'] !== HOMEOWNER_SHARE_AUDIENCE) {
    errors.push('manifest.audience: unexpected audience')
  }
  if (input['purpose'] !== HOMEOWNER_SHARE_PURPOSE) {
    errors.push('manifest.purpose: unexpected purpose')
  }
  if (!isOpaqueId(input['shareId'], 'share')) {
    errors.push('manifest.shareId: not an opaque share reference')
  }
  if (!isOpaqueId(input['recipientRef'], 'recipient')) {
    errors.push('manifest.recipientRef: not an opaque recipient reference')
  }
  if (!isOpaqueId(input['nonce'], 'nonce')) {
    errors.push('manifest.nonce: not an opaque nonce')
  }

  const generation = input['generation']
  if (!Number.isSafeInteger(generation) || (generation as number) < 1) {
    errors.push('manifest.generation: must be a positive integer')
  }

  const issuedAt = input['issuedAt']
  const expiresAt = input['expiresAt']
  if (!isCanonicalInstant(issuedAt)) {
    errors.push('manifest.issuedAt: not a canonical UTC millisecond instant')
  }
  if (!isCanonicalInstant(expiresAt)) {
    errors.push('manifest.expiresAt: not a canonical UTC millisecond instant')
  }
  if (isCanonicalInstant(issuedAt) && isCanonicalInstant(expiresAt)) {
    const lifetime = instantToMillis(expiresAt) - instantToMillis(issuedAt)
    if (lifetime <= 0) {
      errors.push('manifest.expiresAt: must be after issuedAt')
    } else if (lifetime < SHARE_LIMITS.minLifetimeDays * DAY_MS) {
      errors.push('manifest: lifetime is shorter than the minimum')
    } else if (lifetime > SHARE_LIMITS.maxLifetimeDays * DAY_MS) {
      errors.push('manifest: lifetime exceeds the maximum')
    }
  }

  const artifacts = input['artifacts']
  if (!Array.isArray(artifacts)) {
    errors.push('manifest.artifacts: must be an array')
  } else {
    if (artifacts.length < 1) errors.push('manifest.artifacts: must not be empty')
    if (artifacts.length > SHARE_LIMITS.maxArtifacts) {
      errors.push('manifest.artifacts: exceeds the artifact cap')
    }

    let aggregate = 0
    const seenRefs = new Set<string>()
    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index]
      parseArtifact(artifact, index, errors)
      if (isPlainObject(artifact)) {
        const byteLength = artifact['byteLength']
        if (Number.isSafeInteger(byteLength)) aggregate += byteLength as number
        const ref = artifact['artifactRef']
        if (typeof ref === 'string') {
          if (seenRefs.has(ref)) errors.push(`artifacts[${index}].artifactRef: duplicated in this manifest`)
          seenRefs.add(ref)
        }
      }
    }
    if (aggregate > SHARE_LIMITS.maxAggregateBytes) {
      errors.push('manifest.artifacts: aggregate size exceeds the cap')
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const manifest = input as unknown as ShareManifest
  const canonical = canonicalJson(manifest)
  if (utf8ByteLength(canonical) > SHARE_LIMITS.maxCanonicalManifestBytes) {
    return { ok: false, errors: ['manifest: canonical encoding exceeds the size cap'] }
  }

  return { ok: true, value: manifest }
}

/** Canonical manifest bytes. The only input to the manifest digest. */
export function canonicalManifest(manifest: ShareManifest): string {
  return canonicalJson(manifest)
}

/** Manifest digest. Both receipts bind to this exact value. */
export function manifestDigest(manifest: ShareManifest): string {
  return canonicalDigest(manifest)
}

// =============================================================================
// Receipts
// =============================================================================
// Separate from the manifest and from each other. Immutable once signed.
//
// UNRECONCILED WITH JOBROLO — see RECEIPT_WIRE_RECONCILIATION below. Every
// structural rule in this section is implemented from Jobrolo's written
// requirements, but the exact receipt field set, the signing-input construction,
// and the replay-key derivation have not been published, so none of it is
// proven byte-compatible the way the manifest layer is.
// =============================================================================

export type ReceiptType = 'authorization' | 'consent' | 'revocation'

export const RECEIPT_TYPES = Object.freeze(['authorization', 'consent', 'revocation'] as const)

export const RECEIPT_SIGNATURE_ALGORITHM = 'ed25519' as const
const ED25519_SIGNATURE_BYTES = 64

/**
 * Fields common to all three receipts. Every one of them is part of the binding
 * between the two authorities: if any differs between the authorization and the
 * consent, they are not talking about the same disclosure.
 */
export type ReceiptCore = {
  readonly algorithm: typeof RECEIPT_SIGNATURE_ALGORITHM
  readonly audience: typeof HOMEOWNER_SHARE_AUDIENCE
  readonly contractVersion: typeof HOMEOWNER_SHARE_CONTRACT_VERSION
  readonly expiresAt: string
  readonly generation: number
  readonly issuedAt: string
  readonly issuer: typeof HOMEOWNER_SHARE_ISSUER
  /** Identifies the signing key. Independent per side; never shared. */
  readonly keyId: string
  readonly manifestDigest: string
  /** The disclosure-policy version in force when this receipt was issued. */
  readonly policyVersion: string
  readonly purpose: typeof HOMEOWNER_SHARE_PURPOSE
  readonly receiptId: string
  readonly receiptType: ReceiptType
  readonly recipientRef: string
  readonly shareId: string
  /** Present only on a revocation, naming the receipt it withdraws. */
  readonly revokesReceiptId?: string
}

export type SignedReceipt = {
  readonly receipt: ReceiptCore
  /** Unpadded base64url of the 64 raw Ed25519 signature bytes. */
  readonly signature: string
}

/**
 * The identity of a receipt for replay purposes: what makes two receipts "the
 * same act" rather than two distinct acts. Two receipts with the same identity
 * must be byte-identical; if they are not, one of them is a forgery or a
 * mistake, and both are refused.
 */
export type ReceiptIdentity = {
  readonly contractVersion: string
  readonly generation: number
  readonly manifestDigest: string
  readonly purpose: string
  readonly receiptId: string
  readonly receiptType: ReceiptType
  readonly recipientRef: string
  readonly shareId: string
}

export function receiptIdentity(receipt: ReceiptCore): ReceiptIdentity {
  return {
    contractVersion: receipt.contractVersion,
    generation: receipt.generation,
    manifestDigest: receipt.manifestDigest,
    purpose: receipt.purpose,
    receiptId: receipt.receiptId,
    receiptType: receipt.receiptType,
    recipientRef: receipt.recipientRef,
    shareId: receipt.shareId,
  }
}

/**
 * Stable replay key over a receipt's identity.
 *
 * NOT RECONCILED. Jobrolo published three expected replay-key values without
 * the derivation that produces them, and an exhaustive search over the
 * published identity fields does not reproduce any of the three, so at least
 * one input to Jobrolo's derivation is not in this contract. This function is
 * therefore Homesrolo's own stable key: correct for local replay detection,
 * and NOT asserted to equal Jobrolo's. See RECEIPT_WIRE_RECONCILIATION.
 */
export function receiptReplayKey(receipt: ReceiptCore): string {
  return canonicalDigest(receiptIdentity(receipt))
}

/**
 * Bytes a signer covers: the algorithm and key identifier are inside the signed
 * region, so a signature cannot be replayed under a different algorithm or
 * attributed to a different key.
 *
 * NOT RECONCILED — see RECEIPT_WIRE_RECONCILIATION.
 */
export function receiptSigningInput(receipt: ReceiptCore): string {
  return [
    HOMEOWNER_SHARE_CONTRACT_VERSION,
    receipt.algorithm,
    receipt.keyId,
    canonicalJson(receipt),
  ].join('\n')
}

export function isCanonicalReceiptSignature(value: unknown): value is string {
  return isBase64Url(value, ED25519_SIGNATURE_BYTES)
}

const RECEIPT_KEYS = Object.freeze([
  'algorithm',
  'audience',
  'contractVersion',
  'expiresAt',
  'generation',
  'issuedAt',
  'issuer',
  'keyId',
  'manifestDigest',
  'policyVersion',
  'purpose',
  'receiptId',
  'receiptType',
  'recipientRef',
  'shareId',
])

const POLICY_VERSION = /^[a-z0-9][a-z0-9._-]{2,63}$/
const KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/

export function parseSignedReceipt(input: unknown): ParseResult<SignedReceipt> {
  const errors: string[] = []

  if (!isPlainObject(input)) return { ok: false, errors: ['receipt envelope: not an object'] }
  checkKeys(input, ['receipt', 'signature'], 'receipt envelope', errors)

  if (!isCanonicalReceiptSignature(input['signature'])) {
    errors.push('receipt envelope.signature: not a canonical 64-byte base64url Ed25519 signature')
  }

  const receipt = input['receipt']
  if (!isPlainObject(receipt)) {
    errors.push('receipt: not an object')
    return { ok: false, errors }
  }

  const receiptType = receipt['receiptType']
  const isRevocation = receiptType === 'revocation'
  const expected = isRevocation ? [...RECEIPT_KEYS, 'revokesReceiptId'] : RECEIPT_KEYS
  checkKeys(receipt, expected, 'receipt', errors)

  if (!(RECEIPT_TYPES as readonly unknown[]).includes(receiptType)) {
    errors.push('receipt.receiptType: unknown receipt type')
  }
  if (receipt['algorithm'] !== RECEIPT_SIGNATURE_ALGORITHM) {
    errors.push('receipt.algorithm: only ed25519 is accepted')
  }
  if (receipt['contractVersion'] !== HOMEOWNER_SHARE_CONTRACT_VERSION) {
    errors.push('receipt.contractVersion: unsupported contract version')
  }
  if (receipt['issuer'] !== HOMEOWNER_SHARE_ISSUER) {
    errors.push('receipt.issuer: unexpected issuer')
  }
  if (receipt['audience'] !== HOMEOWNER_SHARE_AUDIENCE) {
    errors.push('receipt.audience: unexpected audience')
  }
  if (receipt['purpose'] !== HOMEOWNER_SHARE_PURPOSE) {
    errors.push('receipt.purpose: unexpected purpose')
  }
  if (!isOpaqueId(receipt['receiptId'], 'receipt')) {
    errors.push('receipt.receiptId: not an opaque receipt reference')
  }
  if (!isOpaqueId(receipt['shareId'], 'share')) {
    errors.push('receipt.shareId: not an opaque share reference')
  }
  if (!isOpaqueId(receipt['recipientRef'], 'recipient')) {
    errors.push('receipt.recipientRef: not an opaque recipient reference')
  }
  if (!isSha256Hex(receipt['manifestDigest'])) {
    errors.push('receipt.manifestDigest: not a lowercase hex SHA-256 digest')
  }
  if (typeof receipt['keyId'] !== 'string' || !KEY_ID.test(receipt['keyId'])) {
    errors.push('receipt.keyId: not a well-formed key identifier')
  }
  if (typeof receipt['policyVersion'] !== 'string' || !POLICY_VERSION.test(receipt['policyVersion'])) {
    errors.push('receipt.policyVersion: not a well-formed policy version')
  }

  const generation = receipt['generation']
  if (!Number.isSafeInteger(generation) || (generation as number) < 1) {
    errors.push('receipt.generation: must be a positive integer')
  }

  const issuedAt = receipt['issuedAt']
  const expiresAt = receipt['expiresAt']
  if (!isCanonicalInstant(issuedAt)) errors.push('receipt.issuedAt: not a canonical UTC millisecond instant')
  if (!isCanonicalInstant(expiresAt)) errors.push('receipt.expiresAt: not a canonical UTC millisecond instant')
  if (isCanonicalInstant(issuedAt) && isCanonicalInstant(expiresAt)) {
    if (instantToMillis(expiresAt) <= instantToMillis(issuedAt)) {
      errors.push('receipt.expiresAt: must be after issuedAt')
    }
  }

  if (isRevocation && !isOpaqueId(receipt['revokesReceiptId'], 'receipt')) {
    errors.push('receipt.revokesReceiptId: a revocation must name the receipt it withdraws')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: input as unknown as SignedReceipt }
}

// --- binding ------------------------------------------------------------------

/** Every field the two authorities must agree on to be the same disclosure. */
const BOUND_FIELDS = Object.freeze([
  'audience',
  'contractVersion',
  'expiresAt',
  'generation',
  'issuer',
  'manifestDigest',
  'policyVersion',
  'purpose',
  'recipientRef',
  'shareId',
] as const)

export type BindingResult = { readonly bound: true } | { readonly bound: false; readonly errors: readonly string[] }

/**
 * Bind an authorization and a consent to each other and to one exact manifest.
 * A mismatch on any bound field means the two receipts describe different
 * disclosures and neither authorizes the other's manifest.
 */
export function bindAuthorities(
  manifest: ShareManifest,
  authorization: ReceiptCore,
  consent: ReceiptCore,
): BindingResult {
  const errors: string[] = []

  if (authorization.receiptType !== 'authorization') errors.push('authorization: wrong receipt type')
  if (consent.receiptType !== 'consent') errors.push('consent: wrong receipt type')

  const digest = manifestDigest(manifest)
  if (authorization.manifestDigest !== digest) errors.push('authorization: manifest digest mismatch')
  if (consent.manifestDigest !== digest) errors.push('consent: manifest digest mismatch')

  if (authorization.shareId !== manifest.shareId) errors.push('authorization: shareId does not match the manifest')
  if (consent.shareId !== manifest.shareId) errors.push('consent: shareId does not match the manifest')
  if (authorization.recipientRef !== manifest.recipientRef) {
    errors.push('authorization: recipientRef does not match the manifest')
  }
  if (consent.recipientRef !== manifest.recipientRef) {
    errors.push('consent: recipientRef does not match the manifest')
  }
  if (authorization.generation !== manifest.generation) {
    errors.push('authorization: generation does not match the manifest')
  }
  if (consent.generation !== manifest.generation) {
    errors.push('consent: generation does not match the manifest')
  }

  for (const field of BOUND_FIELDS) {
    if (authorization[field] !== consent[field]) {
      errors.push(`binding: authorization and consent disagree on "${field}"`)
    }
  }

  // Chronology: a homeowner cannot consent to a disclosure that was not yet
  // authorized, and neither authority may outlive the manifest.
  const authIssued = instantToMillis(authorization.issuedAt)
  const consentIssued = instantToMillis(consent.issuedAt)
  const manifestIssued = instantToMillis(manifest.issuedAt)
  const manifestExpires = instantToMillis(manifest.expiresAt)

  if (authIssued < manifestIssued) errors.push('chronology: authorization predates the manifest')
  if (consentIssued < authIssued) errors.push('chronology: consent predates the authorization')
  if (instantToMillis(authorization.expiresAt) > manifestExpires) {
    errors.push('chronology: authorization outlives the manifest')
  }
  if (instantToMillis(consent.expiresAt) > manifestExpires) {
    errors.push('chronology: consent outlives the manifest')
  }

  if (errors.length > 0) return { bound: false, errors }
  return { bound: true }
}

// =============================================================================
// Append-only receipt ledger
// =============================================================================

export type LedgerEntry = {
  readonly replayKey: string
  /** Canonical bytes of the whole signed envelope, for exact-replay comparison. */
  readonly canonicalBytes: string
  readonly receipt: ReceiptCore
}

export type Ledger = {
  readonly entries: readonly LedgerEntry[]
}

export const EMPTY_LEDGER: Ledger = Object.freeze({ entries: Object.freeze([]) })

export type AppendOutcome =
  | { readonly outcome: 'appended'; readonly ledger: Ledger }
  /** Byte-identical resubmission of an act already recorded. State unchanged. */
  | { readonly outcome: 'exact_replay'; readonly ledger: Ledger }
  /** Same identity, different bytes. Refused: one of the two is not genuine. */
  | { readonly outcome: 'conflict'; readonly ledger: Ledger; readonly errors: readonly string[] }
  | { readonly outcome: 'rejected'; readonly ledger: Ledger; readonly errors: readonly string[] }

/**
 * Append a signed receipt. The ledger is never edited in place and entries are
 * never removed: `appendReceipt` returns a new ledger and the input is
 * untouched, so "the current state" is always a fold over the full history.
 */
export function appendReceipt(ledger: Ledger, signed: SignedReceipt): AppendOutcome {
  const parsed = parseSignedReceipt(signed)
  if (!parsed.ok) return { outcome: 'rejected', ledger, errors: parsed.errors }

  const receipt = parsed.value.receipt
  const replayKey = receiptReplayKey(receipt)
  const canonicalBytes = canonicalJson(parsed.value)

  const existing = ledger.entries.find(entry => entry.replayKey === replayKey)
  if (existing) {
    if (existing.canonicalBytes === canonicalBytes) {
      return { outcome: 'exact_replay', ledger }
    }
    return {
      outcome: 'conflict',
      ledger,
      errors: ['ledger: a different receipt already exists with this identity'],
    }
  }

  if (receipt.receiptType === 'revocation') {
    const targetId = receipt.revokesReceiptId
    const target = ledger.entries.find(entry => entry.receipt.receiptId === targetId)
    if (!target) {
      return { outcome: 'rejected', ledger, errors: ['revocation: names a receipt this ledger has never seen'] }
    }
    if (target.receipt.receiptType === 'revocation') {
      return { outcome: 'rejected', ledger, errors: ['revocation: a revocation cannot itself be revoked'] }
    }
    const mismatches: string[] = []
    if (target.receipt.shareId !== receipt.shareId) mismatches.push('shareId')
    if (target.receipt.recipientRef !== receipt.recipientRef) mismatches.push('recipientRef')
    if (target.receipt.manifestDigest !== receipt.manifestDigest) mismatches.push('manifestDigest')
    if (target.receipt.generation !== receipt.generation) mismatches.push('generation')
    if (mismatches.length > 0) {
      return {
        outcome: 'rejected',
        ledger,
        errors: [`revocation: does not bind to its target (${mismatches.join(', ')})`],
      }
    }
  }

  return {
    outcome: 'appended',
    ledger: { entries: [...ledger.entries, { replayKey, canonicalBytes, receipt }] },
  }
}

export type LedgerState = {
  readonly authorizationActive: boolean
  readonly consentActive: boolean
  readonly revokedReceiptIds: readonly string[]
}

/**
 * Current state as a fold over the whole ledger. Revocation is terminal: once a
 * receipt id appears as a revocation target it can never become active again,
 * because there is no receipt type that un-revokes.
 */
export function ledgerState(ledger: Ledger, shareId: string, manifestDigestValue: string, now: Date): LedgerState {
  const revoked = new Set<string>()
  for (const entry of ledger.entries) {
    if (entry.receipt.receiptType === 'revocation' && entry.receipt.revokesReceiptId) {
      revoked.add(entry.receipt.revokesReceiptId)
    }
  }

  const live = (type: ReceiptType): boolean =>
    ledger.entries.some(entry => {
      const receipt = entry.receipt
      if (receipt.receiptType !== type) return false
      if (receipt.shareId !== shareId) return false
      if (receipt.manifestDigest !== manifestDigestValue) return false
      if (revoked.has(receipt.receiptId)) return false
      return instantToMillis(receipt.expiresAt) > now.getTime()
    })

  return {
    authorizationActive: live('authorization'),
    consentActive: live('consent'),
    revokedReceiptIds: [...revoked],
  }
}

// =============================================================================
// Delivery decision — Phase 0
// =============================================================================

export type DeliveryInput = {
  readonly manifest: ShareManifest
  readonly authorization: ReceiptCore
  readonly consent: ReceiptCore
  readonly ledger: Ledger
}

/**
 * The decision type cannot express success. `authorized` is the literal `false`,
 * so Phase 0 inertness is a compile-time property: making this contract deliver
 * anything requires editing this type, which is a reviewable change rather than
 * a runtime configuration slip.
 */
export type DeliveryDecision = {
  readonly authorized: false
  readonly reasons: readonly string[]
  /** Always present. Structure is not authorization. */
  readonly warning: typeof STRUCTURAL_VALIDATION_WARNING
}

/**
 * Evaluate a would-be delivery. Every reason the request fails is collected for
 * the internal audit record; see `externalRefusal` for what a caller is told.
 */
export function evaluateDelivery(input: DeliveryInput, now: Date): DeliveryDecision {
  const reasons: string[] = []

  const parsed = parseShareManifest(input.manifest)
  if (!parsed.ok) {
    reasons.push(...parsed.errors)
  } else {
    const binding = bindAuthorities(parsed.value, input.authorization, input.consent)
    if (!binding.bound) reasons.push(...binding.errors)

    const digest = manifestDigest(parsed.value)
    const state = ledgerState(input.ledger, parsed.value.shareId, digest, now)
    if (!state.authorizationActive) reasons.push('no live authorization for this manifest')
    if (!state.consentActive) reasons.push('no live consent for this manifest')
    if (instantToMillis(parsed.value.expiresAt) <= now.getTime()) reasons.push('manifest has expired')

    for (const artifact of parsed.value.artifacts) {
      if (!LAUNCH_APPROVED_PROJECTION_KINDS.includes(artifact.projectionKind)) {
        reasons.push(`projection kind "${artifact.projectionKind}" is not launch-approved`)
      }
    }
  }

  reasons.push('phase 0: Homesrolo has no delivery path and authorizes nothing')

  return { authorized: false, reasons, warning: STRUCTURAL_VALIDATION_WARNING }
}

/**
 * What a caller outside the trust boundary is told. Collapsed to one fixed
 * string: an attacker who can distinguish "no such share" from "revoked" from
 * "expired" can enumerate shares and learn the state of other people's claims
 * without ever being authorized. The detailed reasons stay in the audit record.
 */
export const EXTERNAL_REFUSAL_MESSAGE = 'This request is not authorized.'

export function externalRefusal(): { readonly error: typeof EXTERNAL_REFUSAL_MESSAGE } {
  return { error: EXTERNAL_REFUSAL_MESSAGE }
}

// =============================================================================
// Cross-repo golden vectors
// =============================================================================

/**
 * Values Jobrolo published as normative. Homesrolo CI reproduces the manifest
 * layer byte-for-byte; the receipt layer is recorded but not yet reproducible.
 */
export const WIRE_GOLDEN = Object.freeze({
  manifestJson:
    '{"artifacts":[{"artifactRef":"hproj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","byteLength":1024,"mediaType":"application/json","projectionKind":"work_status_summary","projectionVersion":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":"homeowner_release"}],"audience":"homesrolo","contractVersion":"homeowner-share.v1","expiresAt":"2026-08-15T12:00:00.000Z","generation":1,"issuedAt":"2026-08-08T12:00:00.000Z","issuer":"jobrolo","nonce":"hnce_nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn","purpose":"homeowner_work_records","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}',
  manifestDigest: '1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1',
  authorizationReplayKey: '532afbc246fd5be873839be88a3ad811c083529204e1fafc3e51bae49328575f',
  consentReplayKey: '801f74c84aca67311a2d53a3f3aa458f38ed9ad54fdd2f66208f6bc23cf1ca48',
  revocationReplayKey: 'dcd1f96647db72262610750e78256bcae0c8ba1a19567e6238a5f635b6b66e0a',
})

/**
 * Which parts of the wire contract are proven compatible with Jobrolo.
 *
 * `manifest: 'reconciled'` — `WIRE_GOLDEN.manifestJson` parses strictly here,
 * re-canonicalizes to identical bytes, and digests to `WIRE_GOLDEN.manifestDigest`.
 * Asserted in CI.
 *
 * `receipts: 'unreconciled'` — Jobrolo published three expected replay keys but
 * not the derivation that produces them. An exhaustive search over every subset,
 * ordering, separator, prefix, and receipt-type spelling of the eleven published
 * identity fields (6,408,192 candidates) reproduced none of the three, so at
 * least one input to Jobrolo's derivation is absent from the published vectors —
 * most likely `policyVersion`, `keyId`, `receiptId`, or a receipt-specific
 * timestamp, none of which appear in the golden manifest.
 *
 * Homesrolo therefore does NOT assert equality against those three values.
 * Asserting a guessed derivation would make Homesrolo's CI certify a wire format
 * Jobrolo never agreed to, which is the exact divergence this contract exists to
 * prevent. `receiptReplayKey` is a correct local replay key and nothing more.
 *
 * TO CLOSE THIS: Jobrolo publishes the receipt field set and the replay-key
 * derivation (fields, order, domain separation). Then `receiptIdentity`,
 * `receiptReplayKey`, and `receiptSigningInput` are matched to it and this flag
 * flips to 'reconciled', at which point the assertions in the test suite become
 * live golden-vector checks.
 */
export const RECEIPT_WIRE_RECONCILIATION = Object.freeze({
  manifest: 'reconciled',
  receipts: 'unreconciled',
} as const)
