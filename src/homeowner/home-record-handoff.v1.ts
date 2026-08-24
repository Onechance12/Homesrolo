import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
  type KeyObject,
} from 'node:crypto'
import { z } from 'zod'
import {
  HOMEOWNER_SHARE_CONSENT_VERSION,
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  HOMEOWNER_SHARE_PURPOSE,
  homeownerShareAuthorizationReplayKey,
  homeownerShareAuthorizationSigningPayload,
  homeownerShareCanonicalJson,
  homeownerShareConsentSigningPayload,
  homeownerShareManifestDigest,
  homeownerShareSha256,
  inspectHomeownerShareStructuralCompatibility,
  parseHomeownerShareAuthorizationReceipt,
  parseHomeownerShareConsentReceipt,
  parseHomeownerShareManifest,
  type HomeownerShareArtifact,
  type HomeownerShareAuthorizationReceipt,
  type HomeownerShareConsentReceipt,
  type HomeownerShareManifest,
} from '../contracts/homeowner-share.v1.ts'
import {
  authorizeHomeownerWorkspace,
  requireHomeownerActionGrant,
  type AuthorizedHomeownerAction,
  type HomeownerIdentityPort,
  type HomeownerRepositoryPort,
  type HomeownerWorkspaceAction,
} from './homeowner-runtime.v1.ts'
import {
  HomeownerApiError,
  type HomeownerApiRequestContext,
} from './homeowner-api.v1.ts'
import { validateHomeownerArtifactPayload } from './homeowner-artifacts.v1.ts'

/**
 * A deliberately separate, default-off runtime around the immutable Phase 0
 * homeowner-share.v1 wire. The original contract's empty launch allowlist and
 * always-deny decision remain unchanged; enabling this service requires every
 * server-owned provider below, an exact recipient binding, and an explicit
 * configuration flag.
 */
export const HOME_RECORD_HANDOFF_VERSION = 'home-record-handoff.v1' as const
export const HOME_RECORD_HANDOFF_ACCEPTANCE_VERSION =
  'home-record-handoff.acceptance.v1' as const
export const HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT =
  'I accept only the items selected in this preview into this private Home Record. Homesrolo will copy those exact files into its own private storage and will not import unselected items.' as const
export const HOME_RECORD_HANDOFF_DEFAULT_ENABLED = false as const

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const SHA256 = /^[a-f0-9]{64}$/
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))
const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => new Date(value).toISOString() === value, 'must be a canonical UTC instant')

const PDF_PROJECTION_KINDS = Object.freeze([
  'work_document_copy',
  'work_completion_record',
  'work_warranty_record',
  'work_invoice_receipt',
] as const)
const PHOTO_PROJECTION_KIND = 'work_photo_set' as const

export const HOME_RECORD_HANDOFF_ALLOWED_MEDIA_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const)
export const HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINAL_BYTES = 100 * 1024 * 1024
export const HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS = 250

export type HomeRecordHandoffMediaType =
  (typeof HOME_RECORD_HANDOFF_ALLOWED_MEDIA_TYPES)[number]

export function homeRecordHandoffExportPlanAllowed(
  byteLengths: readonly number[],
): boolean {
  if (byteLengths.length > HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS) return false
  let total = 0
  for (const byteLength of byteLengths) {
    if (!Number.isSafeInteger(byteLength) || byteLength < 1) return false
    total += byteLength
    if (!Number.isSafeInteger(total)
      || total > HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINAL_BYTES) return false
  }
  return true
}

function isAllowedBinaryProjection(artifact: HomeownerShareArtifact):
  artifact is HomeownerShareArtifact & { mediaType: HomeRecordHandoffMediaType } {
  if (artifact.mediaType === 'application/pdf') {
    return (PDF_PROJECTION_KINDS as readonly string[]).includes(artifact.projectionKind)
  }
  return artifact.projectionKind === PHOTO_PROJECTION_KIND
    && (artifact.mediaType === 'image/jpeg' || artifact.mediaType === 'image/png')
}

export interface HomeRecordHandoffOffer {
  readonly manifest: HomeownerShareManifest
  readonly authorization: HomeownerShareAuthorizationReceipt
  readonly manifestDigest: string
  readonly authorizationReplayKey: string
  readonly offerDigest: string
}

/**
 * Verifies immutable offer binding and the new binary import policy. It still
 * does not verify a trusted public key or current Jobrolo ledger state; the
 * service performs both separately before persistence and before every copy.
 */
export function inspectHomeRecordHandoffOffer(
  input: { readonly manifest: unknown; readonly authorization: unknown },
  now: Date,
): HomeRecordHandoffOffer {
  const manifest = parseHomeownerShareManifest(input.manifest)
  const authorization = parseHomeownerShareAuthorizationReceipt(input.authorization)
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) throw new Error('handoff_time_invalid')

  const manifestDigest = homeownerShareManifestDigest(manifest)
  if (authorization.shareId !== manifest.shareId
    || authorization.recipientRef !== manifest.recipientRef
    || authorization.purpose !== manifest.purpose
    || authorization.manifestContractVersion !== manifest.contractVersion
    || authorization.manifestDigest !== manifestDigest
    || authorization.expiresAt !== manifest.expiresAt
    || Date.parse(authorization.authorizedAt) < Date.parse(manifest.issuedAt)) {
    throw new Error('handoff_offer_mismatch')
  }
  if (nowMs < Date.parse(manifest.issuedAt)
    || nowMs < Date.parse(authorization.authorizedAt)) {
    throw new Error('handoff_not_yet_valid')
  }
  if (nowMs >= Date.parse(manifest.expiresAt)) throw new Error('handoff_expired')
  if (!manifest.artifacts.every(isAllowedBinaryProjection)) {
    throw new Error('handoff_projection_not_allowed')
  }

  return Object.freeze({
    manifest,
    authorization,
    manifestDigest,
    authorizationReplayKey: homeownerShareAuthorizationReplayKey(authorization),
    offerDigest: homeownerShareSha256({ manifest, authorization }),
  })
}

export function verifyHomeRecordHandoffAuthorizationSignature(
  authorization: HomeownerShareAuthorizationReceipt,
  publicKey: KeyObject,
): boolean {
  try {
    if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') return false
    return verifySignature(
      null,
      Buffer.from(homeownerShareAuthorizationSigningPayload(authorization), 'utf8'),
      publicKey,
      Buffer.from(authorization.signing.signature, 'base64url'),
    )
  } catch {
    return false
  }
}

export function parseEd25519PublicKey(pem: string): KeyObject | null {
  try {
    const key = createPublicKey(pem)
    return key.asymmetricKeyType === 'ed25519' ? key : null
  } catch {
    return null
  }
}

function artifactKind(artifact: HomeownerShareArtifact) {
  if (artifact.projectionKind === 'work_photo_set') return 'photo' as const
  if (artifact.projectionKind === 'work_warranty_record') return 'warranty' as const
  return 'document' as const
}

const PROJECTION_LABELS: Readonly<Record<HomeownerShareArtifact['projectionKind'], string>> =
  Object.freeze({
    // These two names exist in the immutable Phase 0 wire type but are
    // rejected by isAllowedBinaryProjection before any handoff is stored.
    work_status_summary: 'Unsupported project summary',
    work_schedule_summary: 'Unsupported project schedule',
    work_document_copy: 'Project document',
    work_photo_set: 'Project photo',
    work_completion_record: 'Completion record',
    work_warranty_record: 'Warranty',
    work_invoice_receipt: 'Invoice or receipt',
  })

function extension(mediaType: HomeRecordHandoffMediaType) {
  if (mediaType === 'application/pdf') return 'pdf'
  if (mediaType === 'image/jpeg') return 'jpg'
  return 'png'
}

export function homeRecordHandoffDisplayName(
  artifact: HomeownerShareArtifact,
  position: number,
) {
  const suffix = String(position + 1).padStart(2, '0')
  return `${PROJECTION_LABELS[artifact.projectionKind]} ${suffix}.${extension(
    artifact.mediaType as HomeRecordHandoffMediaType,
  )}`
}

const handoffItemRecordSchema = z.object({
  sourceArtifactRef: opaqueRef('hproj'),
  projectionKind: z.enum([
    'work_document_copy',
    'work_photo_set',
    'work_completion_record',
    'work_warranty_record',
    'work_invoice_receipt',
  ]),
  projectionVersion: z.number().int().min(1).max(100),
  mediaType: z.enum(HOME_RECORD_HANDOFF_ALLOWED_MEDIA_TYPES),
  byteLength: z.number().int().min(1).max(25 * 1024 * 1024),
  payloadSha256: z.string().regex(SHA256),
  displayName: z.string().trim().min(1).max(160),
  decision: z.enum(['pending', 'accepted', 'rejected']),
  copyState: z.enum(['not_started', 'staged_clean', 'available', 'quarantined']),
  homeownerArtifactRef: opaqueRef('hart').optional(),
  storageObjectRef: opaqueRef('hobj').optional(),
  scanProvider: z.string().trim().min(1).max(80).optional(),
  scanVersion: z.string().trim().min(1).max(80).optional(),
  scannedAt: utcInstant.optional(),
  copiedAt: utcInstant.optional(),
  quarantineReason: z.enum([
    'mutated_replay',
    'source_changed',
    'byte_length_mismatch',
    'digest_mismatch',
    'media_type_mismatch',
    'content_rejected',
    'storage_verification_failed',
  ]).optional(),
}).strict()

export type HomeRecordHandoffItemRecord = z.infer<typeof handoffItemRecordSchema>

const handoffRecordBaseSchema = z.object({
  recordVersion: z.literal(HOME_RECORD_HANDOFF_VERSION),
  handoffRef: opaqueRef('hhof'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  recipientBindingRevision: z.number().int().min(1),
  manifest: z.unknown(),
  authorization: z.unknown(),
  manifestDigest: z.string().regex(SHA256),
  authorizationReplayKey: z.string().regex(SHA256),
  offerDigest: z.string().regex(SHA256),
  state: z.enum([
    'received',
    'accepting',
    'accepted',
    'rejected',
    'expired',
    'quarantined',
    'reconciliation_required',
  ]),
  receivedAt: utcInstant,
  expiresAt: utcInstant,
  commandRef: opaqueRef('hcmd').optional(),
  commandDigest: z.string().regex(SHA256).optional(),
  selectionDigest: z.string().regex(SHA256).optional(),
  acceptanceStatementDigest: z.string().regex(SHA256).optional(),
  consent: z.unknown().optional(),
  decidedAt: utcInstant.optional(),
  items: z.array(handoffItemRecordSchema).min(1).max(25),
}).strict()

export interface HomeRecordHandoffRecord extends Omit<
  z.infer<typeof handoffRecordBaseSchema>,
  'manifest' | 'authorization' | 'consent'
> {
  readonly manifest: HomeownerShareManifest
  readonly authorization: HomeownerShareAuthorizationReceipt
  readonly consent?: HomeownerShareConsentReceipt
}

export function parseHomeRecordHandoffRecord(input: unknown): HomeRecordHandoffRecord {
  const base = handoffRecordBaseSchema.parse(input)
  const manifest = parseHomeownerShareManifest(base.manifest)
  const authorization = parseHomeownerShareAuthorizationReceipt(base.authorization)
  const manifestDigest = homeownerShareManifestDigest(manifest)
  if (base.homeRef === manifest.recipientRef
    || base.manifestDigest !== manifestDigest
    || base.authorizationReplayKey !== homeownerShareAuthorizationReplayKey(authorization)
    || base.offerDigest !== homeownerShareSha256({ manifest, authorization })
    || base.expiresAt !== manifest.expiresAt
    || authorization.shareId !== manifest.shareId
    || authorization.recipientRef !== manifest.recipientRef
    || authorization.manifestDigest !== manifestDigest) {
    throw new Error('handoff_record_binding_invalid')
  }
  if (base.items.length !== manifest.artifacts.length) {
    throw new Error('handoff_record_items_invalid')
  }
  for (const [index, source] of manifest.artifacts.entries()) {
    const item = base.items[index]
    if (!item || item.sourceArtifactRef !== source.artifactRef
      || item.projectionKind !== source.projectionKind
      || item.projectionVersion !== source.projectionVersion
      || item.mediaType !== source.mediaType
      || item.byteLength !== source.byteLength
      || item.payloadSha256 !== source.sha256) {
      throw new Error('handoff_record_item_binding_invalid')
    }
    const refsPresent = item.homeownerArtifactRef !== undefined
      && item.storageObjectRef !== undefined
    if ((item.copyState === 'staged_clean' || item.copyState === 'available') && !refsPresent) {
      throw new Error('handoff_record_storage_binding_invalid')
    }
    if (item.copyState === 'available' && (!item.copiedAt || item.decision !== 'accepted')) {
      throw new Error('handoff_record_available_item_invalid')
    }
    if (item.copyState === 'quarantined' && !item.quarantineReason) {
      throw new Error('handoff_record_quarantine_invalid')
    }
  }

  let consent: HomeownerShareConsentReceipt | undefined
  if (base.consent !== undefined) consent = parseHomeownerShareConsentReceipt(base.consent)
  const acceptanceFields = [
    base.commandRef,
    base.commandDigest,
    base.selectionDigest,
    base.acceptanceStatementDigest,
    consent,
  ]
  if (base.state === 'accepting' || base.state === 'accepted'
    || base.state === 'reconciliation_required') {
    if (acceptanceFields.some(value => value === undefined)) {
      throw new Error('handoff_record_acceptance_binding_invalid')
    }
  }
  if (consent) {
    const pair = inspectHomeownerShareStructuralCompatibility({
      manifest,
      authorization,
      consent,
      now: new Date(consent.acceptedAt),
    })
    if (!pair.structurallyCompatible) throw new Error('handoff_record_consent_invalid')
  }
  if (base.state === 'accepted') {
    const selected = base.items.filter(item => item.decision === 'accepted')
    if (!base.decidedAt || selected.length < 1
      || selected.some(item => item.copyState !== 'available')) {
      throw new Error('handoff_record_accepted_state_invalid')
    }
  }
  if ((base.state === 'rejected' || base.state === 'expired') && !base.decidedAt) {
    throw new Error('handoff_record_terminal_state_invalid')
  }
  const { consent: _consent, manifest: _manifest, authorization: _authorization, ...record } = base
  return { ...record, manifest, authorization, ...(consent ? { consent } : {}) }
}

export const homeRecordHandoffAcceptInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  reviewedPreviewDigest: z.string().regex(SHA256),
  selectedArtifactRefs: z.array(opaqueRef('hproj')).min(1).max(25),
  consentAccepted: z.literal(true),
}).strict().superRefine((value, context) => {
  if (new Set(value.selectedArtifactRefs).size !== value.selectedArtifactRefs.length) {
    context.addIssue({
      code: 'custom',
      path: ['selectedArtifactRefs'],
      message: 'selected artifact references must be unique',
    })
  }
})

export const homeRecordHandoffRejectInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  reviewedPreviewDigest: z.string().regex(SHA256),
}).strict()

export const homeRecordHandoffPreviewItemSchema = z.object({
  artifactRef: opaqueRef('hproj'),
  projectionKind: handoffItemRecordSchema.shape.projectionKind,
  label: z.string().trim().min(1).max(120),
  mediaType: handoffItemRecordSchema.shape.mediaType,
  byteLength: handoffItemRecordSchema.shape.byteLength,
  decision: handoffItemRecordSchema.shape.decision,
  copyState: handoffItemRecordSchema.shape.copyState,
  homeownerArtifactRef: opaqueRef('hart').optional(),
}).strict()

export const homeRecordHandoffPreviewSchema = z.object({
  handoffRef: opaqueRef('hhof'),
  shareId: opaqueRef('hshr'),
  state: handoffRecordBaseSchema.shape.state,
  receivedAt: utcInstant,
  expiresAt: utcInstant,
  previewDigest: z.string().regex(SHA256),
  acceptanceText: z.literal(HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT),
  items: z.array(homeRecordHandoffPreviewItemSchema).min(1).max(25),
}).strict()

export type HomeRecordHandoffPreview = z.infer<typeof homeRecordHandoffPreviewSchema>

export interface HomeRecordHandoffRecipientBinding {
  readonly recipientRef: string
  readonly homeRef: string
  readonly controllerPrincipalRef: string
  readonly revision: number
  readonly state: 'active' | 'revoked'
}

export interface HomeRecordHandoffRecipientPort {
  resolveRecipientBinding(recipientRef: string): Promise<HomeRecordHandoffRecipientBinding | null>
}

export interface HomeRecordHandoffTrustPort {
  resolveJobroloAuthorizationKey(keyId: string): Promise<KeyObject | null>
}

export type HomeRecordHandoffSourceResult =
  | { readonly state: 'active'; readonly manifest: unknown; readonly authorization: unknown }
  | { readonly state: 'not_available' }

/**
 * A server-to-server transport only. Implementations must use an allowlisted
 * HTTPS origin, exact paths, signed method/path/time/nonce/body material,
 * bounded responses, and redirects disabled. No method exposes a database row,
 * session, provider object key, or signed storage URL.
 */
export interface HomeRecordHandoffSourcePort {
  claim(input: {
    readonly shareId: string
    readonly recipientRef: string
  }): Promise<HomeRecordHandoffSourceResult>
  checkCurrent(input: {
    readonly shareId: string
    readonly recipientRef: string
    readonly manifestDigest: string
  }): Promise<HomeRecordHandoffSourceResult>
  fetchArtifact(input: {
    readonly shareId: string
    readonly artifactRef: string
    readonly manifestDigest: string
    readonly consent: HomeownerShareConsentReceipt
  }): Promise<{
    readonly bytes: Uint8Array
    readonly mediaType: string
    readonly byteLength: number
    readonly payloadSha256: string
  }>
}

export interface HomeRecordHandoffConsentSignerPort {
  readonly keyId: string
  sign(payload: string): Promise<string>
}

export type HomeRecordHandoffScanResult =
  | {
      readonly verdict: 'clean'
      readonly provider: string
      readonly version: string
      readonly scannedAt: string
    }
  | {
      readonly verdict: 'rejected'
      readonly provider: string
      readonly version: string
      readonly scannedAt: string
      readonly reason: 'content_rejected'
    }

export interface HomeRecordHandoffScannerPort {
  scan(input: {
    readonly bytes: Uint8Array
    readonly mediaType: HomeRecordHandoffMediaType
    readonly expectedSha256: string
  }): Promise<HomeRecordHandoffScanResult>
}

export interface HomeRecordHandoffPersistencePort {
  receiveOffer(input: {
    readonly handoffRef: string
    readonly binding: HomeRecordHandoffRecipientBinding
    readonly offer: HomeRecordHandoffOffer
    readonly receivedAt: string
    readonly items: readonly HomeRecordHandoffItemRecord[]
  }): Promise<HomeRecordHandoffRecord>
  readHandoff(
    grant: AuthorizedHomeownerAction<'handoff.preview'>,
    shareId: string,
  ): Promise<HomeRecordHandoffRecord | null>
  listHandoffs(
    grant: AuthorizedHomeownerAction<'handoff.preview'>,
  ): Promise<readonly HomeRecordHandoffRecord[]>
  reserveAcceptance(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.accept'>
    readonly handoffRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly selectionDigest: string
    readonly selectedArtifactRefs: readonly string[]
    readonly acceptanceStatementDigest: string
    readonly consent: HomeownerShareConsentReceipt
    readonly acceptedAt: string
  }): Promise<HomeRecordHandoffRecord>
  markItemStagedClean(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.accept'>
    readonly handoffRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly sourceArtifactRef: string
    readonly homeownerArtifactRef: string
    readonly storageObjectRef: string
    readonly scanProvider: string
    readonly scanVersion: string
    readonly scannedAt: string
    readonly copiedAt: string
  }): Promise<HomeRecordHandoffRecord>
  quarantineItem(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.accept'>
    readonly handoffRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly sourceArtifactRef: string
    readonly reason: NonNullable<HomeRecordHandoffItemRecord['quarantineReason']>
    readonly quarantinedAt: string
    readonly scanProvider?: string
    readonly scanVersion?: string
    readonly scannedAt?: string
  }): Promise<void>
  finalizeAcceptance(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.accept'>
    readonly handoffRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly completedAt: string
  }): Promise<HomeRecordHandoffRecord>
  markAcceptanceUnknown(input: {
    readonly handoffRef: string
    readonly controllerPrincipalRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly failedAt: string
  }): Promise<void>
  rejectHandoff(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.reject'>
    readonly handoffRef: string
    readonly commandRef: string
    readonly commandDigest: string
    readonly rejectedAt: string
  }): Promise<HomeRecordHandoffRecord>
  expireHandoff(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.preview'>
    readonly handoffRef: string
    readonly expiredAt: string
  }): Promise<HomeRecordHandoffRecord>
  listAcceptedForExport(
    grant: AuthorizedHomeownerAction<'home_record.export'>,
  ): Promise<readonly HomeRecordHandoffRecord[]>
}

/** Bytes are staged under an opaque Homesrolo-owned private path. */
export interface HomeRecordHandoffObjectPort {
  stageExactObject(input: {
    readonly grant: AuthorizedHomeownerAction<'handoff.accept'>
    readonly handoffRef: string
    readonly homeownerArtifactRef: string
    readonly storageObjectRef: string
    readonly mediaType: HomeRecordHandoffMediaType
    readonly byteLength: number
    readonly payloadSha256: string
    readonly bytes: Uint8Array
  }): Promise<void>
  readAcceptedExactObject(input: {
    readonly grant: AuthorizedHomeownerAction<'home_record.export'>
    readonly handoffRef: string
    readonly homeownerArtifactRef: string
    readonly storageObjectRef: string
    readonly expectedSha256: string
    readonly maximumBytes: number
  }): Promise<Uint8Array>
}

function acceptancePreviewDigest(record: HomeRecordHandoffRecord): string {
  return homeownerShareSha256({
    version: HOME_RECORD_HANDOFF_ACCEPTANCE_VERSION,
    handoffRef: record.handoffRef,
    shareId: record.manifest.shareId,
    manifestDigest: record.manifestDigest,
    expiresAt: record.expiresAt,
    items: record.items.map(item => ({
      artifactRef: item.sourceArtifactRef,
      projectionKind: item.projectionKind,
      projectionVersion: item.projectionVersion,
      mediaType: item.mediaType,
      byteLength: item.byteLength,
      payloadSha256: item.payloadSha256,
    })),
  })
}

function safePreview(recordInput: unknown): HomeRecordHandoffPreview {
  const record = parseHomeRecordHandoffRecord(recordInput)
  return homeRecordHandoffPreviewSchema.parse({
    handoffRef: record.handoffRef,
    shareId: record.manifest.shareId,
    state: record.state,
    receivedAt: record.receivedAt,
    expiresAt: record.expiresAt,
    previewDigest: acceptancePreviewDigest(record),
    acceptanceText: HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT,
    items: record.items.map(item => ({
      artifactRef: item.sourceArtifactRef,
      projectionKind: item.projectionKind,
      label: PROJECTION_LABELS[item.projectionKind],
      mediaType: item.mediaType,
      byteLength: item.byteLength,
      decision: item.decision,
      copyState: item.copyState,
      ...(item.homeownerArtifactRef
        ? { homeownerArtifactRef: item.homeownerArtifactRef }
        : {}),
    })),
  })
}

function consentForOffer(input: {
  readonly offer: HomeRecordHandoffOffer
  readonly consentId: string
  readonly acceptedAt: string
  readonly keyId: string
  readonly signature?: string
}): HomeownerShareConsentReceipt {
  return {
    receiptVersion: HOMEOWNER_SHARE_CONSENT_VERSION,
    issuer: 'homesrolo',
    audience: 'jobrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    consentId: input.consentId,
    shareId: input.offer.manifest.shareId,
    recipientRef: input.offer.manifest.recipientRef,
    manifestDigest: input.offer.manifestDigest,
    manifestContractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    consentPolicyVersion: 'homesrolo-share-consent.v1',
    acceptedAt: input.acceptedAt,
    expiresAt: input.offer.manifest.expiresAt,
    signing: {
      algorithm: 'Ed25519',
      keyId: input.keyId,
      signature: input.signature ?? Buffer.alloc(64).toString('base64url'),
    },
  }
}

function sameGrant(
  left: AuthorizedHomeownerAction<HomeownerWorkspaceAction>,
  right: AuthorizedHomeownerAction<HomeownerWorkspaceAction>,
) {
  return left.principalRef === right.principalRef
    && left.homeRef === right.homeRef
    && left.membershipRef === right.membershipRef
    && left.membershipRevision === right.membershipRevision
}

function stableSelected(record: HomeRecordHandoffRecord, selected: readonly string[]) {
  const set = new Set(selected)
  if (set.size !== selected.length
    || selected.some(ref => !record.items.some(item => item.sourceArtifactRef === ref))) {
    throw new HomeownerApiError('invalid_request')
  }
  return record.items
    .filter(item => set.has(item.sourceArtifactRef))
    .map(item => item.sourceArtifactRef)
}

function acceptanceReservationMatches(input: {
  readonly record: HomeRecordHandoffRecord
  readonly commandRef: string
  readonly commandDigest: string
  readonly selectionDigest: string
  readonly acceptanceStatementDigest: string
  readonly selectedArtifactRefs: readonly string[]
  readonly consent: HomeownerShareConsentReceipt
}) {
  const selected = new Set(input.selectedArtifactRefs)
  return input.record.commandRef === input.commandRef
    && input.record.commandDigest === input.commandDigest
    && input.record.selectionDigest === input.selectionDigest
    && input.record.acceptanceStatementDigest === input.acceptanceStatementDigest
    && input.record.consent !== undefined
    && homeownerShareSha256(input.record.consent) === homeownerShareSha256(input.consent)
    && input.record.items.every(item => item.decision === (
      selected.has(item.sourceArtifactRef) ? 'accepted' : 'rejected'
    ))
}

function validateFetchedArtifact(
  item: HomeRecordHandoffItemRecord,
  fetched: Awaited<ReturnType<HomeRecordHandoffSourcePort['fetchArtifact']>>,
) {
  if (fetched.byteLength !== fetched.bytes.byteLength
    || fetched.byteLength !== item.byteLength) {
    throw new Error('byte_length_mismatch')
  }
  if (fetched.mediaType !== item.mediaType) throw new Error('media_type_mismatch')
  const digest = createHash('sha256').update(fetched.bytes).digest('hex')
  if (fetched.payloadSha256 !== item.payloadSha256 || digest !== item.payloadSha256) {
    throw new Error('digest_mismatch')
  }
  const validated = validateHomeownerArtifactPayload({
    kind: artifactKind({
      artifactRef: item.sourceArtifactRef,
      source: 'homeowner_release',
      projectionKind: item.projectionKind,
      projectionVersion: item.projectionVersion,
      mediaType: item.mediaType,
      byteLength: item.byteLength,
      sha256: item.payloadSha256,
    }),
    displayName: item.displayName,
    bytes: fetched.bytes,
  })
  if (validated.mediaType !== item.mediaType
    || validated.byteLength !== item.byteLength
    || validated.payloadSha256 !== item.payloadSha256) {
    throw new Error('media_type_mismatch')
  }
  return validated.bytes
}

function quarantineReason(error: unknown): NonNullable<
  HomeRecordHandoffItemRecord['quarantineReason']
> {
  if (error instanceof Error && [
    'byte_length_mismatch',
    'digest_mismatch',
    'media_type_mismatch',
  ].includes(error.message)) {
    return error.message as 'byte_length_mismatch' | 'digest_mismatch' | 'media_type_mismatch'
  }
  return 'source_changed'
}

export interface HomeRecordHandoffServiceOptions {
  readonly enabled?: boolean
  readonly identity: HomeownerIdentityPort
  readonly repository: HomeownerRepositoryPort
  readonly recipients: HomeRecordHandoffRecipientPort
  readonly trust: HomeRecordHandoffTrustPort
  readonly source: HomeRecordHandoffSourcePort
  readonly signer: HomeRecordHandoffConsentSignerPort
  readonly scanner: HomeRecordHandoffScannerPort
  readonly persistence: HomeRecordHandoffPersistencePort
  readonly objects: HomeRecordHandoffObjectPort
  readonly now?: () => string
}

export class HomeRecordHandoffService {
  readonly #enabled: boolean
  readonly #identity: HomeownerIdentityPort
  readonly #repository: HomeownerRepositoryPort
  readonly #recipients: HomeRecordHandoffRecipientPort
  readonly #trust: HomeRecordHandoffTrustPort
  readonly #source: HomeRecordHandoffSourcePort
  readonly #signer: HomeRecordHandoffConsentSignerPort
  readonly #scanner: HomeRecordHandoffScannerPort
  readonly #persistence: HomeRecordHandoffPersistencePort
  readonly #objects: HomeRecordHandoffObjectPort
  readonly #now: () => string

  constructor(options: HomeRecordHandoffServiceOptions) {
    this.#enabled = options.enabled ?? HOME_RECORD_HANDOFF_DEFAULT_ENABLED
    this.#identity = options.identity
    this.#repository = options.repository
    this.#recipients = options.recipients
    this.#trust = options.trust
    this.#source = options.source
    this.#signer = options.signer
    this.#scanner = options.scanner
    this.#persistence = options.persistence
    this.#objects = options.objects
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  /** Server-only claim. A route must never accept a home or principal here. */
  async claim(input: {
    readonly shareId: string
    readonly recipientRef: string
  }): Promise<{ readonly handoffRef: string; readonly state: HomeRecordHandoffRecord['state'] }> {
    this.#requireEnabled()
    if (!opaqueRef('hshr').safeParse(input.shareId).success
      || !opaqueRef('hrcp').safeParse(input.recipientRef).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const binding = await this.#recipients.resolveRecipientBinding(input.recipientRef)
    if (!binding || binding.state !== 'active'
      || binding.recipientRef !== input.recipientRef
      || !opaqueRef('hhom').safeParse(binding.homeRef).success
      || !opaqueRef('hprn').safeParse(binding.controllerPrincipalRef).success
      || !Number.isSafeInteger(binding.revision) || binding.revision < 1) {
      throw new HomeownerApiError('not_found')
    }
    const source = await this.#source.claim(input)
    if (source.state !== 'active') throw new HomeownerApiError('not_found')
    const offer = await this.#verifyOffer(source, new Date(this.#now()))
    if (offer.manifest.shareId !== input.shareId
      || offer.manifest.recipientRef !== input.recipientRef) {
      throw new HomeownerApiError('unavailable')
    }
    const receivedAt = this.#now()
    const stored = parseHomeRecordHandoffRecord(await this.#persistence.receiveOffer({
      handoffRef: `hhof_${randomBytes(32).toString('base64url')}`,
      binding,
      offer,
      receivedAt,
      items: offer.manifest.artifacts.map((artifact, index) => handoffItemRecordSchema.parse({
        sourceArtifactRef: artifact.artifactRef,
        projectionKind: artifact.projectionKind,
        projectionVersion: artifact.projectionVersion,
        mediaType: artifact.mediaType as HomeRecordHandoffMediaType,
        byteLength: artifact.byteLength,
        payloadSha256: artifact.sha256,
        displayName: homeRecordHandoffDisplayName(artifact, index),
        decision: 'pending',
        copyState: 'not_started',
      })),
    }))
    if (stored.homeRef !== binding.homeRef
      || stored.controllerPrincipalRef !== binding.controllerPrincipalRef
      || stored.recipientBindingRevision !== binding.revision
      || stored.offerDigest !== offer.offerDigest) {
      throw new HomeownerApiError('unavailable')
    }
    return { handoffRef: stored.handoffRef, state: stored.state }
  }

  async list(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<readonly HomeRecordHandoffPreview[]> {
    this.#requireEnabled()
    const grant = await this.#grant(context, requestedHomeRef, 'handoff.preview')
    const records = await this.#persistence.listHandoffs(grant)
    return records.map(record => {
      const parsed = parseHomeRecordHandoffRecord(record)
      if (parsed.homeRef !== grant.homeRef
        || parsed.controllerPrincipalRef !== grant.principalRef) {
        throw new HomeownerApiError('unavailable')
      }
      return safePreview(parsed)
    })
  }

  async preview(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedShareId: string,
  ): Promise<HomeRecordHandoffPreview> {
    this.#requireEnabled()
    if (!opaqueRef('hshr').safeParse(requestedShareId).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#grant(context, requestedHomeRef, 'handoff.preview')
    let record = await this.#readExact(grant, requestedShareId)
    if (record.state === 'received') {
      if (Date.parse(this.#now()) >= Date.parse(record.expiresAt)) {
        record = parseHomeRecordHandoffRecord(await this.#persistence.expireHandoff({
          grant,
          handoffRef: record.handoffRef,
          expiredAt: this.#now(),
        }))
      } else {
        const current = await this.#currentOffer(record)
        if (!current) {
          // Source revocation before the stated expiry removes import authority
          // but is not rewritten as a false time-based expiry in the ledger.
          throw new HomeownerApiError('conflict')
        }
      }
    }
    return safePreview(record)
  }

  async reject(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedShareId: string,
    input: unknown,
  ): Promise<HomeRecordHandoffPreview> {
    this.#requireEnabled()
    const parsed = homeRecordHandoffRejectInputSchema.safeParse(input)
    if (!parsed.success || !opaqueRef('hshr').safeParse(requestedShareId).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#grant(context, requestedHomeRef, 'handoff.reject')
    const previewGrant = await this.#grant(context, requestedHomeRef, 'handoff.preview')
    if (!sameGrant(grant, previewGrant)) throw new HomeownerApiError('not_found')
    const record = await this.#readExact(previewGrant, requestedShareId)
    if (parsed.data.reviewedPreviewDigest !== acceptancePreviewDigest(record)) {
      throw new HomeownerApiError('conflict')
    }
    const commandDigest = homeownerShareSha256({
      version: HOME_RECORD_HANDOFF_ACCEPTANCE_VERSION,
      operation: 'reject',
      commandRef: parsed.data.commandRef,
      handoffRef: record.handoffRef,
      previewDigest: parsed.data.reviewedPreviewDigest,
    })
    const rejected = parseHomeRecordHandoffRecord(await this.#persistence.rejectHandoff({
      grant,
      handoffRef: record.handoffRef,
      commandRef: parsed.data.commandRef,
      commandDigest,
      rejectedAt: this.#now(),
    }))
    return safePreview(rejected)
  }

  async accept(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedShareId: string,
    input: unknown,
  ): Promise<HomeRecordHandoffPreview> {
    this.#requireEnabled()
    const parsed = homeRecordHandoffAcceptInputSchema.safeParse(input)
    if (!parsed.success || !opaqueRef('hshr').safeParse(requestedShareId).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#grant(context, requestedHomeRef, 'handoff.accept')
    const previewGrant = await this.#grant(context, requestedHomeRef, 'handoff.preview')
    if (!sameGrant(grant, previewGrant)) throw new HomeownerApiError('not_found')
    let record = await this.#readExact(previewGrant, requestedShareId)
    if (parsed.data.reviewedPreviewDigest !== acceptancePreviewDigest(record)) {
      throw new HomeownerApiError('conflict')
    }
    if (record.state === 'accepted') return safePreview(record)
    if (record.state !== 'received' && record.state !== 'accepting') {
      throw new HomeownerApiError('conflict')
    }
    const requestedAt = this.#now()
    if (Date.parse(requestedAt) >= Date.parse(record.expiresAt)) {
      const expired = await this.#persistence.expireHandoff({
        grant: previewGrant,
        handoffRef: record.handoffRef,
        expiredAt: requestedAt,
      })
      return safePreview(expired)
    }
    if (!await this.#currentOffer(record)) throw new HomeownerApiError('conflict')

    const selectedArtifactRefs = stableSelected(record, parsed.data.selectedArtifactRefs)
    const selectionDigest = homeownerShareSha256({
      version: HOME_RECORD_HANDOFF_ACCEPTANCE_VERSION,
      manifestDigest: record.manifestDigest,
      selectedArtifactRefs,
    })
    const acceptanceStatementDigest = homeownerShareSha256({
      text: HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT,
      selectionDigest,
    })
    const commandDigest = homeownerShareSha256({
      version: HOME_RECORD_HANDOFF_ACCEPTANCE_VERSION,
      operation: 'accept',
      commandRef: parsed.data.commandRef,
      handoffRef: record.handoffRef,
      previewDigest: parsed.data.reviewedPreviewDigest,
      selectionDigest,
      acceptanceStatementDigest,
    })
    let consent: HomeownerShareConsentReceipt
    if (record.state === 'accepting') {
      if (!record.consent || !acceptanceReservationMatches({
        record,
        commandRef: parsed.data.commandRef,
        commandDigest,
        selectionDigest,
        acceptanceStatementDigest,
        selectedArtifactRefs,
        consent: record.consent,
      })) {
        throw new HomeownerApiError('conflict')
      }
      consent = record.consent
    } else {
      const consentId = `hcons_${randomBytes(32).toString('base64url')}`
      const offer = {
        manifest: record.manifest,
        authorization: record.authorization,
        manifestDigest: record.manifestDigest,
        authorizationReplayKey: record.authorizationReplayKey,
        offerDigest: record.offerDigest,
      }
      const unsigned = consentForOffer({
        offer,
        consentId,
        acceptedAt: requestedAt,
        keyId: this.#signer.keyId,
      })
      const signature = await this.#signer.sign(homeownerShareConsentSigningPayload(unsigned))
      consent = parseHomeownerShareConsentReceipt(consentForOffer({
        offer,
        consentId,
        acceptedAt: requestedAt,
        keyId: this.#signer.keyId,
        signature,
      }))
      record = parseHomeRecordHandoffRecord(await this.#persistence.reserveAcceptance({
        grant,
        handoffRef: record.handoffRef,
        commandRef: parsed.data.commandRef,
        commandDigest,
        selectionDigest,
        selectedArtifactRefs,
        acceptanceStatementDigest,
        consent,
        acceptedAt: requestedAt,
      }))
      if (!acceptanceReservationMatches({
        record,
        commandRef: parsed.data.commandRef,
        commandDigest,
        selectionDigest,
        acceptanceStatementDigest,
        selectedArtifactRefs,
        consent,
      })) throw new HomeownerApiError('unavailable')
    }
    const pair = inspectHomeownerShareStructuralCompatibility({
      manifest: record.manifest,
      authorization: record.authorization,
      consent,
      now: new Date(requestedAt),
    })
    if (!pair.structurallyCompatible) throw new HomeownerApiError('conflict')
    if (record.state === 'accepted' || record.state === 'reconciliation_required'
      || record.state === 'quarantined') return safePreview(record)
    if (record.state !== 'accepting') throw new HomeownerApiError('unavailable')

    let activeItem: HomeRecordHandoffItemRecord | null = null
    try {
      for (const sourceArtifactRef of selectedArtifactRefs) {
        const item = record.items.find(candidate =>
          candidate.sourceArtifactRef === sourceArtifactRef)
        if (!item || item.decision !== 'accepted') throw new HomeownerApiError('unavailable')
        if (item.copyState === 'staged_clean' || item.copyState === 'available') continue
        if (!item.homeownerArtifactRef || !item.storageObjectRef) {
          throw new HomeownerApiError('unavailable')
        }
        activeItem = item
        const beforeFetch = await this.#grant(context, requestedHomeRef, 'handoff.accept')
        if (!sameGrant(grant, beforeFetch) || !await this.#currentOffer(record)) {
          throw new HomeownerApiError('not_found')
        }
        const fetched = await this.#source.fetchArtifact({
          shareId: record.manifest.shareId,
          artifactRef: item.sourceArtifactRef,
          manifestDigest: record.manifestDigest,
          consent,
        })
        const afterFetch = await this.#grant(context, requestedHomeRef, 'handoff.accept')
        if (!sameGrant(grant, afterFetch) || !await this.#currentOffer(record)) {
          throw new HomeownerApiError('not_found')
        }
        let bytes: Uint8Array
        try {
          bytes = validateFetchedArtifact(item, fetched)
        } catch (error) {
          await this.#persistence.quarantineItem({
            grant: afterFetch,
            handoffRef: record.handoffRef,
            commandRef: parsed.data.commandRef,
            commandDigest,
            sourceArtifactRef: item.sourceArtifactRef,
            reason: quarantineReason(error),
            quarantinedAt: this.#now(),
          })
          return safePreview({
            ...record,
            state: 'quarantined',
            items: record.items.map(candidate => candidate.sourceArtifactRef === item.sourceArtifactRef
              ? { ...candidate, copyState: 'quarantined', quarantineReason: quarantineReason(error) }
              : candidate),
          })
        }
        const scan = await this.#scanner.scan({
          bytes,
          mediaType: item.mediaType,
          expectedSha256: item.payloadSha256,
        })
        if (scan.verdict !== 'clean') {
          await this.#persistence.quarantineItem({
            grant: afterFetch,
            handoffRef: record.handoffRef,
            commandRef: parsed.data.commandRef,
            commandDigest,
            sourceArtifactRef: item.sourceArtifactRef,
            reason: 'content_rejected',
            quarantinedAt: scan.scannedAt,
            scanProvider: scan.provider,
            scanVersion: scan.version,
            scannedAt: scan.scannedAt,
          })
          return safePreview({
            ...record,
            state: 'quarantined',
            items: record.items.map(candidate => candidate.sourceArtifactRef === item.sourceArtifactRef
              ? {
                  ...candidate,
                  copyState: 'quarantined',
                  quarantineReason: 'content_rejected',
                  scanProvider: scan.provider,
                  scanVersion: scan.version,
                  scannedAt: scan.scannedAt,
                }
              : candidate),
          })
        }
        await this.#objects.stageExactObject({
          grant: afterFetch,
          handoffRef: record.handoffRef,
          homeownerArtifactRef: item.homeownerArtifactRef,
          storageObjectRef: item.storageObjectRef,
          mediaType: item.mediaType,
          byteLength: item.byteLength,
          payloadSha256: item.payloadSha256,
          bytes,
        })
        const afterStorage = await this.#grant(context, requestedHomeRef, 'handoff.accept')
        if (!sameGrant(grant, afterStorage)) throw new HomeownerApiError('not_found')
        record = parseHomeRecordHandoffRecord(await this.#persistence.markItemStagedClean({
          grant: afterStorage,
          handoffRef: record.handoffRef,
          commandRef: parsed.data.commandRef,
          commandDigest,
          sourceArtifactRef: item.sourceArtifactRef,
          homeownerArtifactRef: item.homeownerArtifactRef,
          storageObjectRef: item.storageObjectRef,
          scanProvider: scan.provider,
          scanVersion: scan.version,
          scannedAt: scan.scannedAt,
          copiedAt: this.#now(),
        }))
        activeItem = null
      }
      const finalGrant = await this.#grant(context, requestedHomeRef, 'handoff.accept')
      if (!sameGrant(grant, finalGrant) || !await this.#currentOffer(record)) {
        throw new HomeownerApiError('not_found')
      }
      const accepted = parseHomeRecordHandoffRecord(await this.#persistence.finalizeAcceptance({
        grant: finalGrant,
        handoffRef: record.handoffRef,
        commandRef: parsed.data.commandRef,
        commandDigest,
        completedAt: this.#now(),
      }))
      if (accepted.state !== 'accepted') throw new HomeownerApiError('unavailable')
      return safePreview(accepted)
    } catch {
      try {
        await this.#persistence.markAcceptanceUnknown({
          handoffRef: record.handoffRef,
          controllerPrincipalRef: record.controllerPrincipalRef,
          commandRef: parsed.data.commandRef,
          commandDigest,
          failedAt: this.#now(),
        })
      } catch {
        // The reservation remains non-visible. An uncertain external effect is
        // never converted into a safe retry merely because state marking failed.
      }
      return safePreview({
        ...record,
        state: activeItem?.copyState === 'quarantined'
          ? 'quarantined'
          : 'reconciliation_required',
      })
    }
  }

  async exportHomeRecord(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<{
    readonly fileName: 'homesrolo-home-record.zip'
    readonly mediaType: 'application/zip'
    readonly byteLength: number
    readonly payloadSha256: string
    readonly bytes: Uint8Array
  }> {
    this.#requireEnabled()
    const grant = await this.#grant(context, requestedHomeRef, 'home_record.export')
    const records = (await this.#persistence.listAcceptedForExport(grant))
      .map(parseHomeRecordHandoffRecord)
    const originalByteLengths: number[] = []
    for (const record of records) {
      if (record.state !== 'accepted' || record.homeRef !== grant.homeRef
        || record.controllerPrincipalRef !== grant.principalRef || !record.consent) {
        throw new HomeownerApiError('unavailable')
      }
      originalByteLengths.push(...record.items
        .filter(item => item.decision === 'accepted')
        .map(item => item.byteLength))
    }
    // The current ZIP builder is intentionally in-memory. Bound the complete
    // plan before reading a single object so a large Home Record fails closed
    // instead of exhausting the application process. A later streaming export
    // can lift this limit without changing artifact ownership or provenance.
    if (!homeRecordHandoffExportPlanAllowed(originalByteLengths)) {
      throw new HomeownerApiError('unavailable')
    }
    const entries: ZipEntry[] = []
    const exportHandoffs: unknown[] = []
    let filePosition = 0
    for (const record of records) {
      if (record.state !== 'accepted' || record.homeRef !== grant.homeRef
        || record.controllerPrincipalRef !== grant.principalRef || !record.consent) {
        throw new HomeownerApiError('unavailable')
      }
      const exportItems: unknown[] = []
      for (const item of record.items.filter(candidate => candidate.decision === 'accepted')) {
        if (item.copyState !== 'available' || !item.homeownerArtifactRef
          || !item.storageObjectRef || !item.copiedAt) {
          throw new HomeownerApiError('unavailable')
        }
        const beforeRead = await this.#grant(context, requestedHomeRef, 'home_record.export')
        if (!sameGrant(grant, beforeRead)) throw new HomeownerApiError('not_found')
        const bytes = await this.#objects.readAcceptedExactObject({
          grant: beforeRead,
          handoffRef: record.handoffRef,
          homeownerArtifactRef: item.homeownerArtifactRef,
          storageObjectRef: item.storageObjectRef,
          expectedSha256: item.payloadSha256,
          maximumBytes: item.byteLength,
        })
        const afterRead = await this.#grant(context, requestedHomeRef, 'home_record.export')
        if (!sameGrant(grant, afterRead)
          || bytes.byteLength !== item.byteLength
          || createHash('sha256').update(bytes).digest('hex') !== item.payloadSha256) {
          throw new HomeownerApiError('unavailable')
        }
        validateHomeownerArtifactPayload({
          kind: item.projectionKind === 'work_photo_set' ? 'photo'
            : item.projectionKind === 'work_warranty_record' ? 'warranty' : 'document',
          displayName: item.displayName,
          bytes,
        })
        filePosition += 1
        const path = `originals/${String(filePosition).padStart(3, '0')}-${
          item.projectionKind.replaceAll('_', '-')
        }.${extension(item.mediaType)}`
        entries.push({ path, bytes, modifiedAt: new Date(item.copiedAt) })
        exportItems.push({
          path,
          homeownerArtifactRef: item.homeownerArtifactRef,
          sourceArtifactRef: item.sourceArtifactRef,
          projectionKind: item.projectionKind,
          projectionVersion: item.projectionVersion,
          mediaType: item.mediaType,
          byteLength: item.byteLength,
          payloadSha256: item.payloadSha256,
          suppliedBy: 'jobrolo',
          source: 'homeowner_release',
          copiedAt: item.copiedAt,
        })
      }
      exportHandoffs.push({
        handoffRef: record.handoffRef,
        shareId: record.manifest.shareId,
        manifestDigest: record.manifestDigest,
        authorization: record.authorization,
        consent: record.consent,
        selectionDigest: record.selectionDigest,
        acceptanceStatementDigest: record.acceptanceStatementDigest,
        receivedAt: record.receivedAt,
        acceptedAt: record.decidedAt,
        items: exportItems,
      })
    }
    const exportedAt = this.#now()
    const machineManifest = {
      exportVersion: HOME_RECORD_HANDOFF_VERSION,
      homeRef: grant.homeRef,
      exportedAt,
      handoffs: exportHandoffs,
    }
    const manifestBytes = new TextEncoder().encode(
      `${homeownerShareCanonicalJson(machineManifest)}\n`,
    )
    const summary = [
      'Homesrolo Home Record export',
      '',
      `Exported: ${exportedAt}`,
      `Accepted handoffs: ${records.length}`,
      `Original files: ${filePosition}`,
      '',
      'Each original is stored with its exact byte length and SHA-256 digest in home-record-manifest.json.',
      'The manifest also includes the signed Jobrolo authorization and signed Homesrolo consent receipts.',
      '',
    ].join('\n')
    entries.unshift(
      { path: 'home-record-manifest.json', bytes: manifestBytes, modifiedAt: new Date(exportedAt) },
      {
        path: 'home-record-summary.txt',
        bytes: new TextEncoder().encode(summary),
        modifiedAt: new Date(exportedAt),
      },
    )
    const bytes = createStoredZip(entries)
    return Object.freeze({
      fileName: 'homesrolo-home-record.zip' as const,
      mediaType: 'application/zip' as const,
      byteLength: bytes.byteLength,
      payloadSha256: createHash('sha256').update(bytes).digest('hex'),
      bytes,
    })
  }

  async #verifyOffer(
    source: Extract<HomeRecordHandoffSourceResult, { readonly state: 'active' }>,
    now: Date,
  ) {
    let offer: HomeRecordHandoffOffer
    try {
      offer = inspectHomeRecordHandoffOffer(source, now)
    } catch {
      throw new HomeownerApiError('unavailable')
    }
    const key = await this.#trust.resolveJobroloAuthorizationKey(
      offer.authorization.signing.keyId,
    )
    if (!key || !verifyHomeRecordHandoffAuthorizationSignature(offer.authorization, key)) {
      throw new HomeownerApiError('unavailable')
    }
    return offer
  }

  async #currentOffer(record: HomeRecordHandoffRecord) {
    const current = await this.#source.checkCurrent({
      shareId: record.manifest.shareId,
      recipientRef: record.manifest.recipientRef,
      manifestDigest: record.manifestDigest,
    })
    if (current.state !== 'active') return null
    const offer = await this.#verifyOffer(current, new Date(this.#now()))
    if (offer.offerDigest !== record.offerDigest
      || offer.authorizationReplayKey !== record.authorizationReplayKey) {
      throw new HomeownerApiError('unavailable')
    }
    return offer
  }

  async #readExact(
    grant: AuthorizedHomeownerAction<'handoff.preview'>,
    shareId: string,
  ) {
    const record = await this.#persistence.readHandoff(grant, shareId)
    if (!record) throw new HomeownerApiError('not_found')
    const parsed = parseHomeRecordHandoffRecord(record)
    if (parsed.homeRef !== grant.homeRef
      || parsed.controllerPrincipalRef !== grant.principalRef
      || parsed.manifest.shareId !== shareId) {
      throw new HomeownerApiError('not_found')
    }
    return parsed
  }

  async #grant<Action extends Extract<HomeownerWorkspaceAction,
    'handoff.preview' | 'handoff.accept' | 'handoff.reject' | 'home_record.export'>>(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    action: Action,
  ) {
    if (!opaqueRef('hhom').safeParse(requestedHomeRef).success) {
      throw new HomeownerApiError('invalid_request')
    }
    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const membership = await this.#repository.readMembership(
      principal.principalRef,
      requestedHomeRef,
    )
    if (!membership) throw new HomeownerApiError('not_found')
    const decision = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef,
      action,
      recheckedAt: this.#now(),
    })
    if (!decision.authorized) {
      if (decision.reason === 'role_denied') throw new HomeownerApiError('forbidden')
      throw new HomeownerApiError('not_found')
    }
    const grant = requireHomeownerActionGrant(decision, action)
    if (!grant) throw new HomeownerApiError('forbidden')
    return grant
  }

  #requireEnabled() {
    if (!this.#enabled) throw new HomeownerApiError('unavailable')
  }
}

interface ZipEntry {
  readonly path: string
  readonly bytes: Uint8Array
  readonly modifiedAt: Date
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTimestamp(input: Date) {
  const date = Number.isFinite(input.getTime()) ? input : new Date('1980-01-01T00:00:00.000Z')
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()))
  const time = (date.getUTCHours() << 11)
    | (date.getUTCMinutes() << 5)
    | Math.floor(date.getUTCSeconds() / 2)
  const day = (year << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  return { time, day }
}

function concatenate(chunks: readonly Uint8Array[]) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

/** Minimal deterministic ZIP writer using the uncompressed/store method. */
export function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > 65_535) throw new Error('zip_entry_limit')
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let localOffset = 0
  for (const entry of entries) {
    if (!entry.path || entry.path.startsWith('/') || entry.path.includes('..')
      || entry.path.includes('\\') || /[\u0000-\u001f\u007f]/.test(entry.path)) {
      throw new Error('zip_path_invalid')
    }
    const name = encoder.encode(entry.path)
    const checksum = crc32(entry.bytes)
    const { time, day } = dosTimestamp(entry.modifiedAt)
    const local = new Uint8Array(30 + name.byteLength)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, time, true)
    localView.setUint16(12, day, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, entry.bytes.byteLength, true)
    localView.setUint32(22, entry.bytes.byteLength, true)
    localView.setUint16(26, name.byteLength, true)
    localView.setUint16(28, 0, true)
    local.set(name, 30)
    locals.push(local, entry.bytes)

    const central = new Uint8Array(46 + name.byteLength)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 0x0314, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, time, true)
    centralView.setUint16(14, day, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, entry.bytes.byteLength, true)
    centralView.setUint32(24, entry.bytes.byteLength, true)
    centralView.setUint16(28, name.byteLength, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, localOffset, true)
    central.set(name, 46)
    centrals.push(central)
    localOffset += local.byteLength + entry.bytes.byteLength
  }
  const centralBytes = concatenate(centrals)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralBytes.byteLength, true)
  endView.setUint32(16, localOffset, true)
  endView.setUint16(20, 0, true)
  return concatenate([...locals, centralBytes, end])
}

export const HOME_RECORD_HANDOFF_WARNING =
  'This executable seam is disabled by default. Enabling it requires exact recipient-to-home binding, trusted Ed25519 keys, current Jobrolo authority checks, clean scanning, private staged storage, and durable receipt persistence. An accepted private copy remains subject to Homesrolo retention and deletion policy; a pending or expired share is never import authority.'

// Tests and server adapters use the immutable wire only through this named,
// guarded activation seam. The original contract remains byte-for-byte intact.
export {
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  HOMEOWNER_SHARE_PURPOSE,
  homeownerShareAuthorizationSigningPayload,
  homeownerShareManifestDigest,
}
export type {
  HomeownerShareAuthorizationReceipt,
  HomeownerShareManifest,
}
