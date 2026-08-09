import { createHash } from 'node:crypto'
import { z } from 'zod'

export const HOMEOWNER_SHARE_CONTRACT_VERSION = 'homeowner-share.v1' as const
export const HOMEOWNER_SHARE_AUTHORIZATION_VERSION = 'homeowner-share.authorization.v1' as const
export const HOMEOWNER_SHARE_CONSENT_VERSION = 'homeowner-share.consent.v1' as const
export const HOMEOWNER_SHARE_REVOCATION_VERSION = 'homeowner-share.revocation.v1' as const
export const HOMEOWNER_SHARE_PURPOSE = 'homeowner_work_records' as const
export const HOMEOWNER_SHARE_MAX_ARTIFACTS = 25
export const HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES = 25 * 1024 * 1024
export const HOMEOWNER_SHARE_MAX_TOTAL_ARTIFACT_BYTES = 100 * 1024 * 1024
export const HOMEOWNER_SHARE_MAX_MANIFEST_BYTES = 64 * 1024
export const HOMEOWNER_SHARE_MIN_LIFETIME_MS = 24 * 60 * 60 * 1000
export const HOMEOWNER_SHARE_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

// These are draft contract discriminators, not an activation allowlist. A
// projection needs its own reviewed content and metadata policy before this
// set can contain it. Keeping the activation set empty makes Phase 0 inert.
export const HOMEOWNER_SHARE_DRAFT_PROJECTION_KINDS = Object.freeze([
  'work_status_summary',
  'work_schedule_summary',
  'work_document_copy',
  'work_photo_set',
  'work_completion_record',
  'work_warranty_record',
  'work_invoice_receipt',
] as const)
export type HomeownerShareProjectionKind =
  (typeof HOMEOWNER_SHARE_DRAFT_PROJECTION_KINDS)[number]

export const HOMEOWNER_SHARE_LAUNCH_APPROVED_PROJECTION_KINDS = Object.freeze(
  [] as const satisfies readonly HomeownerShareProjectionKind[],
)

const OPAQUE_TOKEN = '[A-Za-z0-9_-]{43}'
const SHA256 = /^[a-f0-9]{64}$/
const UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/

function opaqueId(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}_${OPAQUE_TOKEN}$`))
}

const utcTimestamp = z.string()
  .regex(UTC_MILLISECONDS)
  .refine(value => {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
  }, 'timestamp must be a real canonical UTC instant')

const canonicalEd25519Signature = z.string().regex(SIGNATURE).refine(value => {
  const decoded = Buffer.from(value, 'base64url')
  return decoded.byteLength === 64 && decoded.toString('base64url') === value
}, 'signature must be canonical base64url for exactly 64 bytes')

const signingProofSchema = z.object({
  algorithm: z.literal('Ed25519'),
  keyId: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
  signature: canonicalEd25519Signature,
}).strict()

const homeownerShareArtifactSchema = z.object({
  artifactRef: opaqueId('hproj'),
  source: z.literal('homeowner_release'),
  projectionKind: z.enum(HOMEOWNER_SHARE_DRAFT_PROJECTION_KINDS),
  projectionVersion: z.number().int().min(1).max(100),
  mediaType: z.enum([
    'application/json',
    'application/pdf',
    'image/jpeg',
    'image/png',
  ]),
  byteLength: z.number().int().min(1).max(HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES),
  sha256: z.string().regex(SHA256),
}).strict()

const homeownerShareManifestSchema = z.object({
  contractVersion: z.literal(HOMEOWNER_SHARE_CONTRACT_VERSION),
  issuer: z.literal('jobrolo'),
  audience: z.literal('homesrolo'),
  purpose: z.literal(HOMEOWNER_SHARE_PURPOSE),
  shareId: opaqueId('hshr'),
  recipientRef: opaqueId('hrcp'),
  generation: z.literal(1),
  issuedAt: utcTimestamp,
  expiresAt: utcTimestamp,
  nonce: opaqueId('hnce'),
  artifacts: z.array(homeownerShareArtifactSchema)
    .min(1)
    .max(HOMEOWNER_SHARE_MAX_ARTIFACTS),
}).strict()

const homeownerShareAuthorizationReceiptSchema = z.object({
  receiptVersion: z.literal(HOMEOWNER_SHARE_AUTHORIZATION_VERSION),
  issuer: z.literal('jobrolo'),
  audience: z.literal('homesrolo'),
  purpose: z.literal(HOMEOWNER_SHARE_PURPOSE),
  authorizationId: opaqueId('hauth'),
  shareId: opaqueId('hshr'),
  recipientRef: opaqueId('hrcp'),
  manifestDigest: z.string().regex(SHA256),
  manifestContractVersion: z.literal(HOMEOWNER_SHARE_CONTRACT_VERSION),
  authorizedByRole: z.enum(['owner', 'admin']),
  authorizedActorRef: opaqueId('hactor'),
  authorizationPolicyVersion: z.literal('jobrolo-homeowner-disclosure.v1'),
  authorizedAt: utcTimestamp,
  expiresAt: utcTimestamp,
  signing: signingProofSchema,
}).strict()

const homeownerShareConsentReceiptSchema = z.object({
  receiptVersion: z.literal(HOMEOWNER_SHARE_CONSENT_VERSION),
  issuer: z.literal('homesrolo'),
  audience: z.literal('jobrolo'),
  purpose: z.literal(HOMEOWNER_SHARE_PURPOSE),
  consentId: opaqueId('hcons'),
  shareId: opaqueId('hshr'),
  recipientRef: opaqueId('hrcp'),
  manifestDigest: z.string().regex(SHA256),
  manifestContractVersion: z.literal(HOMEOWNER_SHARE_CONTRACT_VERSION),
  consentPolicyVersion: z.literal('homesrolo-share-consent.v1'),
  acceptedAt: utcTimestamp,
  expiresAt: utcTimestamp,
  signing: signingProofSchema,
}).strict()

const homeownerShareRevocationReceiptSchema = z.object({
  receiptVersion: z.literal(HOMEOWNER_SHARE_REVOCATION_VERSION),
  issuer: z.enum(['jobrolo', 'homesrolo']),
  audience: z.enum(['jobrolo', 'homesrolo']),
  purpose: z.literal(HOMEOWNER_SHARE_PURPOSE),
  revocationId: opaqueId('hrev'),
  shareId: opaqueId('hshr'),
  recipientRef: opaqueId('hrcp'),
  manifestDigest: z.string().regex(SHA256),
  revokedReceiptVersion: z.enum([
    HOMEOWNER_SHARE_AUTHORIZATION_VERSION,
    HOMEOWNER_SHARE_CONSENT_VERSION,
  ]),
  revokedReceiptRef: z.union([opaqueId('hauth'), opaqueId('hcons')]),
  reasonCode: z.enum([
    'authorization_withdrawn',
    'source_unavailable',
    'consent_withdrawn',
    'account_deleted',
    'security_response',
  ]),
  revokedAt: utcTimestamp,
  signing: signingProofSchema,
}).strict()

export type HomeownerShareArtifact = z.infer<typeof homeownerShareArtifactSchema>
export type HomeownerShareManifest = z.infer<typeof homeownerShareManifestSchema>
export type HomeownerShareAuthorizationReceipt =
  z.infer<typeof homeownerShareAuthorizationReceiptSchema>
export type HomeownerShareConsentReceipt = z.infer<typeof homeownerShareConsentReceiptSchema>
export type HomeownerShareRevocationReceipt = z.infer<typeof homeownerShareRevocationReceiptSchema>

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Homeowner share rejects non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Homeowner share canonical JSON accepts plain objects only')
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalValue(child)]))
  }
  throw new Error(`Homeowner share rejects ${typeof value}`)
}

export function homeownerShareCanonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

export function homeownerShareSha256(value: unknown) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : homeownerShareCanonicalJson(value), 'utf8')
    .digest('hex')
}

function assertManifestSemantics(manifest: HomeownerShareManifest) {
  const issuedAt = Date.parse(manifest.issuedAt)
  const expiresAt = Date.parse(manifest.expiresAt)
  const lifetime = expiresAt - issuedAt
  if (lifetime < HOMEOWNER_SHARE_MIN_LIFETIME_MS
    || lifetime > HOMEOWNER_SHARE_MAX_LIFETIME_MS) {
    throw new Error('Homeowner share lifetime must be between one and 30 days')
  }

  const artifactRefs = new Set<string>()
  let totalBytes = 0
  for (const artifact of manifest.artifacts) {
    if (artifactRefs.has(artifact.artifactRef)) {
      throw new Error('Homeowner share artifact references must be unique')
    }
    artifactRefs.add(artifact.artifactRef)
    totalBytes += artifact.byteLength
    if (!Number.isSafeInteger(totalBytes)
      || totalBytes > HOMEOWNER_SHARE_MAX_TOTAL_ARTIFACT_BYTES) {
      throw new Error('Homeowner share aggregate artifact bytes exceed the contract cap')
    }
  }

  const manifestBytes = Buffer.byteLength(homeownerShareCanonicalJson(manifest), 'utf8')
  if (manifestBytes > HOMEOWNER_SHARE_MAX_MANIFEST_BYTES) {
    throw new Error('Homeowner share manifest exceeds the canonical byte cap')
  }
}

export function parseHomeownerShareManifest(input: unknown): HomeownerShareManifest {
  const manifest = homeownerShareManifestSchema.parse(input)
  assertManifestSemantics(manifest)
  return manifest
}

function assertAuthorizationReceiptSemantics(receipt: HomeownerShareAuthorizationReceipt) {
  const authorizedAt = Date.parse(receipt.authorizedAt)
  const expiresAt = Date.parse(receipt.expiresAt)
  if (authorizedAt >= expiresAt) throw new Error('Authorization receipt expiry is invalid')
}

function assertConsentReceiptSemantics(receipt: HomeownerShareConsentReceipt) {
  const acceptedAt = Date.parse(receipt.acceptedAt)
  const expiresAt = Date.parse(receipt.expiresAt)
  if (acceptedAt >= expiresAt) throw new Error('Consent receipt expiry is invalid')
}

function assertRevocationReceiptSemantics(receipt: HomeownerShareRevocationReceipt) {
  const jobroloRevocation = receipt.issuer === 'jobrolo'
    && receipt.audience === 'homesrolo'
    && receipt.revokedReceiptVersion === HOMEOWNER_SHARE_AUTHORIZATION_VERSION
    && receipt.revokedReceiptRef.startsWith('hauth_')
    && ['authorization_withdrawn', 'source_unavailable', 'security_response']
      .includes(receipt.reasonCode)
  const homesroloRevocation = receipt.issuer === 'homesrolo'
    && receipt.audience === 'jobrolo'
    && receipt.revokedReceiptVersion === HOMEOWNER_SHARE_CONSENT_VERSION
    && receipt.revokedReceiptRef.startsWith('hcons_')
    && ['consent_withdrawn', 'account_deleted', 'security_response']
      .includes(receipt.reasonCode)
  if (!jobroloRevocation && !homesroloRevocation) {
    throw new Error('Homeowner share revocation issuer and target do not match')
  }
}

export function parseHomeownerShareAuthorizationReceipt(input: unknown) {
  const receipt = homeownerShareAuthorizationReceiptSchema.parse(input)
  assertAuthorizationReceiptSemantics(receipt)
  return receipt
}

export function parseHomeownerShareConsentReceipt(input: unknown) {
  const receipt = homeownerShareConsentReceiptSchema.parse(input)
  assertConsentReceiptSemantics(receipt)
  return receipt
}

export function parseHomeownerShareRevocationReceipt(input: unknown) {
  const receipt = homeownerShareRevocationReceiptSchema.parse(input)
  assertRevocationReceiptSemantics(receipt)
  return receipt
}

export function homeownerShareManifestDigest(manifest: HomeownerShareManifest) {
  return homeownerShareSha256(parseHomeownerShareManifest(manifest))
}

export function homeownerShareAuthorizationSigningPayload(
  receipt: HomeownerShareAuthorizationReceipt,
) {
  const parsed = parseHomeownerShareAuthorizationReceipt(receipt)
  const { signature: _signature, ...signing } = parsed.signing
  return homeownerShareCanonicalJson({ ...parsed, signing })
}

export function homeownerShareConsentSigningPayload(receipt: HomeownerShareConsentReceipt) {
  const parsed = parseHomeownerShareConsentReceipt(receipt)
  const { signature: _signature, ...signing } = parsed.signing
  return homeownerShareCanonicalJson({ ...parsed, signing })
}

export function homeownerShareRevocationSigningPayload(receipt: HomeownerShareRevocationReceipt) {
  const parsed = parseHomeownerShareRevocationReceipt(receipt)
  const { signature: _signature, ...signing } = parsed.signing
  return homeownerShareCanonicalJson({ ...parsed, signing })
}

export function homeownerShareAuthorizationReplayKey(
  receipt: HomeownerShareAuthorizationReceipt,
) {
  const parsed = parseHomeownerShareAuthorizationReceipt(receipt)
  return homeownerShareSha256([
    parsed.receiptVersion,
    parsed.issuer,
    parsed.authorizationId,
  ])
}

export function homeownerShareConsentReplayKey(receipt: HomeownerShareConsentReceipt) {
  const parsed = parseHomeownerShareConsentReceipt(receipt)
  return homeownerShareSha256([
    parsed.receiptVersion,
    parsed.issuer,
    parsed.consentId,
  ])
}

export function homeownerShareRevocationReplayKey(receipt: HomeownerShareRevocationReceipt) {
  const parsed = parseHomeownerShareRevocationReceipt(receipt)
  return homeownerShareSha256([
    parsed.receiptVersion,
    parsed.issuer,
    parsed.revocationId,
  ])
}

export function homeownerShareReplayDisposition(existing: unknown, incoming: unknown) {
  return homeownerShareCanonicalJson(existing) === homeownerShareCanonicalJson(incoming)
    ? 'exact_replay' as const
    : 'conflict' as const
}

export type HomeownerSharePairFailure =
  | 'contract_mismatch'
  | 'manifest_mismatch'
  | 'not_yet_valid'
  | 'not_available'

export type HomeownerSharePairDecision =
  | { structurallyCompatible: true; manifestDigest: string }
  | { structurallyCompatible: false; reason: HomeownerSharePairFailure }

// This checks immutable wire compatibility only. It does not verify signatures,
// trusted keys, current source authority, or either service's revocation ledger.
// It must never be used as a delivery authorization decision.
export function inspectHomeownerShareStructuralCompatibility(input: {
  manifest: HomeownerShareManifest
  authorization: HomeownerShareAuthorizationReceipt
  consent: HomeownerShareConsentReceipt
  now: Date
}): HomeownerSharePairDecision {
  let manifest: HomeownerShareManifest
  let authorization: HomeownerShareAuthorizationReceipt
  let consent: HomeownerShareConsentReceipt
  try {
    manifest = parseHomeownerShareManifest(input.manifest)
    authorization = parseHomeownerShareAuthorizationReceipt(input.authorization)
    consent = parseHomeownerShareConsentReceipt(input.consent)
  } catch {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }

  const manifestDigest = homeownerShareManifestDigest(manifest)
  if (authorization.shareId !== manifest.shareId
    || consent.shareId !== manifest.shareId
    || authorization.recipientRef !== manifest.recipientRef
    || consent.recipientRef !== manifest.recipientRef
    || authorization.purpose !== manifest.purpose
    || consent.purpose !== manifest.purpose
    || authorization.manifestContractVersion !== manifest.contractVersion
    || consent.manifestContractVersion !== manifest.contractVersion
    || authorization.expiresAt !== manifest.expiresAt
    || consent.expiresAt !== manifest.expiresAt) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }
  if (authorization.manifestDigest !== manifestDigest
    || consent.manifestDigest !== manifestDigest) {
    return { structurallyCompatible: false, reason: 'manifest_mismatch' }
  }
  if (Date.parse(authorization.authorizedAt) < Date.parse(manifest.issuedAt)
    || Date.parse(consent.acceptedAt) < Date.parse(authorization.authorizedAt)) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }

  const now = input.now.getTime()
  if (!Number.isFinite(now)) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }
  if (now < Date.parse(manifest.issuedAt)
    || now < Date.parse(authorization.authorizedAt)
    || now < Date.parse(consent.acceptedAt)) {
    return { structurallyCompatible: false, reason: 'not_yet_valid' }
  }
  if (now >= Date.parse(manifest.expiresAt)) {
    return { structurallyCompatible: false, reason: 'not_available' }
  }
  return { structurallyCompatible: true, manifestDigest }
}

// This binds an immutable revocation event to the exact manifest and receipt
// it names. It still does not verify signatures, trusted keys, or whether the
// event is the authoritative latest state in either service's ledger.
export function inspectHomeownerShareRevocationStructuralCompatibility(input: {
  manifest: HomeownerShareManifest
  target: HomeownerShareAuthorizationReceipt | HomeownerShareConsentReceipt
  revocation: HomeownerShareRevocationReceipt
  now: Date
}): HomeownerSharePairDecision {
  let manifest: HomeownerShareManifest
  let target: HomeownerShareAuthorizationReceipt | HomeownerShareConsentReceipt
  let revocation: HomeownerShareRevocationReceipt
  try {
    manifest = parseHomeownerShareManifest(input.manifest)
    target = input.target.receiptVersion === HOMEOWNER_SHARE_AUTHORIZATION_VERSION
      ? parseHomeownerShareAuthorizationReceipt(input.target)
      : parseHomeownerShareConsentReceipt(input.target)
    revocation = parseHomeownerShareRevocationReceipt(input.revocation)
  } catch {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }

  const manifestDigest = homeownerShareManifestDigest(manifest)
  const targetRef = target.receiptVersion === HOMEOWNER_SHARE_AUTHORIZATION_VERSION
    ? target.authorizationId
    : target.consentId
  const targetAt = target.receiptVersion === HOMEOWNER_SHARE_AUTHORIZATION_VERSION
    ? target.authorizedAt
    : target.acceptedAt
  if (target.shareId !== manifest.shareId
    || revocation.shareId !== manifest.shareId
    || target.recipientRef !== manifest.recipientRef
    || revocation.recipientRef !== manifest.recipientRef
    || target.purpose !== manifest.purpose
    || revocation.purpose !== manifest.purpose
    || target.manifestContractVersion !== manifest.contractVersion
    || target.expiresAt !== manifest.expiresAt
    || revocation.revokedReceiptVersion !== target.receiptVersion
    || revocation.revokedReceiptRef !== targetRef) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }
  if (target.manifestDigest !== manifestDigest
    || revocation.manifestDigest !== manifestDigest) {
    return { structurallyCompatible: false, reason: 'manifest_mismatch' }
  }
  const now = input.now.getTime()
  if (!Number.isFinite(now)) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }
  if (Date.parse(revocation.revokedAt) < Date.parse(targetAt)) {
    return { structurallyCompatible: false, reason: 'contract_mismatch' }
  }
  if (now < Date.parse(revocation.revokedAt)) {
    return { structurallyCompatible: false, reason: 'not_yet_valid' }
  }
  return { structurallyCompatible: true, manifestDigest }
}

export function homeownerShareExternalFailure(reason: HomeownerSharePairFailure) {
  return reason === 'contract_mismatch' || reason === 'manifest_mismatch'
    ? 'contract_mismatch' as const
    : 'not_available' as const
}

export function homeownerSharePhase0DeliveryDecision(input: {
  manifest: HomeownerShareManifest
  authorization: HomeownerShareAuthorizationReceipt
  consent: HomeownerShareConsentReceipt
  now: Date
}) {
  const pair = inspectHomeownerShareStructuralCompatibility(input)
  if (!pair.structurallyCompatible) {
    return { authorized: false as const, reason: pair.reason }
  }
  return {
    authorized: false as const,
    reason: 'phase0_no_projection_policy_approved' as const,
  }
}
