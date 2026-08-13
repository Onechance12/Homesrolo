import { createHash } from 'node:crypto'
import { z } from 'zod'

export const HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION =
  'homesrolo-jobrolo-project-intake.v1' as const
export const HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION =
  'homesrolo-project-review-consent.v1' as const
export const HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT =
  'I agree to send this roofing request, my contact information, this home\u2019s location, and only the files I selected from Homesrolo to Chance\u2019s private Jobrolo review inbox. Chance will review it before deciding whether to share it with a local professional. This does not hire a contractor, approve work, guarantee a match, or send this request to a professional yet. My other Homesrolo records are not included in this request.' as const

export const HOMESROLO_JOBROLO_MAX_ATTACHMENTS = 10
export const HOMESROLO_JOBROLO_MAX_ARTIFACT_BYTES = 25 * 1024 * 1024
export const HOMESROLO_JOBROLO_MAX_TOTAL_ARTIFACT_BYTES = 50 * 1024 * 1024
export const HOMESROLO_JOBROLO_DOWNLOAD_LIFETIME_MS = 5 * 60 * 1000
export const HOMESROLO_JOBROLO_MAX_REQUEST_BYTES = 48 * 1024

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const SHA256 = /^[a-f0-9]{64}$/
const E164 = /^\+[1-9][0-9]{7,14}$/

function opaqueRef(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))
}

const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => new Date(value).toISOString() === value, 'must be a canonical UTC instant')

export const homesroloJobroloAttachmentSchema = z.object({
  artifactRef: opaqueRef('hart'),
  displayName: z.string().trim().min(1).max(160),
  kind: z.enum(['photo', 'document', 'warranty']),
  mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  byteLength: z.number().int().min(1).max(HOMESROLO_JOBROLO_MAX_ARTIFACT_BYTES),
  sha256: z.string().regex(SHA256),
  downloadUrl: z.string().url().refine(value => new URL(value).protocol === 'https:'),
  downloadExpiresAt: utcInstant,
}).strict()

export const homesroloJobroloProjectIntakeSchema = z.object({
  contractVersion: z.literal(HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION),
  submissionRef: opaqueRef('hsub'),
  source: z.object({
    homeRef: opaqueRef('hhom'),
    projectRef: opaqueRef('hprj'),
  }).strict(),
  submittedAt: utcInstant,
  consent: z.object({
    version: z.literal(HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION),
    acceptedAt: utcInstant,
    statementDigest: z.string().regex(SHA256),
    disclosureDigest: z.string().regex(SHA256),
  }).strict(),
  homeowner: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z.string().regex(E164).optional(),
    preferredContact: z.enum(['email', 'phone', 'text']),
  }).strict(),
  property: z.object({
    label: z.string().trim().min(1).max(200),
  }).strict(),
  project: z.object({
    title: z.string().trim().min(1).max(120),
    category: z.literal('roofing'),
    status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
    summary: z.string().trim().max(2000),
  }).strict(),
  attachments: z.array(homesroloJobroloAttachmentSchema)
    .max(HOMESROLO_JOBROLO_MAX_ATTACHMENTS),
}).strict().superRefine((request, context) => {
  if ((request.homeowner.preferredContact === 'phone'
      || request.homeowner.preferredContact === 'text')
    && !request.homeowner.phone) {
    context.addIssue({
      code: 'custom',
      path: ['homeowner', 'phone'],
      message: 'phone is required for phone or text contact',
    })
  }
  const submittedAt = Date.parse(request.submittedAt)
  const acceptedAt = Date.parse(request.consent.acceptedAt)
  if (acceptedAt > submittedAt || submittedAt - acceptedAt > 5 * 60 * 1000) {
    context.addIssue({
      code: 'custom',
      path: ['consent', 'acceptedAt'],
      message: 'consent must be accepted within five minutes before submission',
    })
  }
  const refs = new Set<string>()
  let totalBytes = 0
  request.attachments.forEach((attachment, index) => {
    if (refs.has(attachment.artifactRef)) {
      context.addIssue({
        code: 'custom',
        path: ['attachments', index, 'artifactRef'],
        message: 'attachment references must be unique',
      })
    }
    refs.add(attachment.artifactRef)
    totalBytes += attachment.byteLength
    const expiresAt = Date.parse(attachment.downloadExpiresAt)
    if (expiresAt <= submittedAt
      || expiresAt - submittedAt > HOMESROLO_JOBROLO_DOWNLOAD_LIFETIME_MS) {
      context.addIssue({
        code: 'custom',
        path: ['attachments', index, 'downloadExpiresAt'],
        message: 'attachment download must expire within five minutes after submission',
      })
    }
  })
  if (!Number.isSafeInteger(totalBytes)
    || totalBytes > HOMESROLO_JOBROLO_MAX_TOTAL_ARTIFACT_BYTES) {
    context.addIssue({
      code: 'custom',
      path: ['attachments'],
      message: 'aggregate attachment bytes exceed the handoff limit',
    })
  }
})

export const homesroloJobroloProjectIntakeReceiptSchema = z.object({
  contractVersion: z.literal(HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION),
  submissionRef: opaqueRef('hsub'),
  receiptRef: opaqueRef('hjrc'),
  status: z.literal('awaiting_chance_review'),
  acceptedAt: utcInstant,
  replayed: z.boolean(),
  requestNonce: z.string().regex(/^[A-Za-z0-9_-]{22,86}$/),
  requestBodySha256: z.string().regex(SHA256),
  disclosureDigest: z.string().regex(SHA256),
}).strict()

export type HomesroloJobroloProjectIntake = z.infer<
  typeof homesroloJobroloProjectIntakeSchema
>
export type HomesroloJobroloProjectIntakeReceipt = z.infer<
  typeof homesroloJobroloProjectIntakeReceiptSchema
>

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('intake canonical JSON rejects this number')
    }
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('intake canonical JSON accepts plain objects only')
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalValue(child)]))
  }
  throw new Error(`intake canonical JSON rejects ${typeof value}`)
}

export function homesroloJobroloCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export function homesroloJobroloSha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : homesroloJobroloCanonicalJson(value), 'utf8')
    .digest('hex')
}

export function parseHomesroloJobroloProjectIntake(
  input: unknown,
): HomesroloJobroloProjectIntake {
  const request = homesroloJobroloProjectIntakeSchema.parse(input)
  if (request.consent.statementDigest !== homesroloJobroloSha256(
    HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT,
  )) {
    throw new Error('project-review consent statement digest does not match')
  }
  if (request.consent.disclosureDigest !== homesroloJobroloSha256(
    homesroloJobroloDisclosure(request),
  )) {
    throw new Error('project-review disclosure digest does not match')
  }
  if (Buffer.byteLength(homesroloJobroloCanonicalJson(request), 'utf8')
    > HOMESROLO_JOBROLO_MAX_REQUEST_BYTES) {
    throw new Error('project intake exceeds the canonical request limit')
  }
  return request
}

export function homesroloJobroloDisclosure(
  request: Pick<HomesroloJobroloProjectIntake,
    'source' | 'homeowner' | 'property' | 'project' | 'attachments'>,
) {
  return {
    source: request.source,
    homeowner: request.homeowner,
    property: request.property,
    project: request.project,
    attachments: request.attachments.map(({
      artifactRef, displayName, kind, mediaType, byteLength, sha256,
    }) => ({ artifactRef, displayName, kind, mediaType, byteLength, sha256 })),
  }
}

export function homesroloJobroloRequestSigningMaterial(input: {
  readonly method: 'POST'
  readonly pathname: string
  readonly timestamp: string
  readonly nonce: string
  readonly bodySha256: string
}): string {
  return [
    HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    input.method,
    input.pathname,
    input.timestamp,
    input.nonce,
    input.bodySha256,
  ].join('\n')
}

export function homesroloJobroloReceiptSigningMaterial(
  receipt: HomesroloJobroloProjectIntakeReceipt,
): string {
  const parsed = homesroloJobroloProjectIntakeReceiptSchema.parse(receipt)
  return [
    HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    parsed.submissionRef,
    parsed.receiptRef,
    parsed.status,
    parsed.acceptedAt,
    String(parsed.replayed),
    parsed.requestNonce,
    parsed.requestBodySha256,
    parsed.disclosureDigest,
  ].join('\n')
}
