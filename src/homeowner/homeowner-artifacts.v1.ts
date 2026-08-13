import { createHash } from 'node:crypto'
import { z } from 'zod'

export const HOMEOWNER_ARTIFACT_MAX_BYTES = 25 * 1024 * 1024

export const homeownerArtifactKindSchema = z.enum(['photo', 'document', 'warranty'])
export type HomeownerArtifactKind = z.infer<typeof homeownerArtifactKindSchema>

export const homeownerArtifactUploadInputSchema = z.object({
  commandRef: z.string().regex(/^hcmd_[A-Za-z0-9_-]{43}$/),
  projectRef: z.string().regex(/^hprj_[A-Za-z0-9_-]{43}$/).optional(),
  kind: homeownerArtifactKindSchema,
  displayName: z.string().trim().min(1).max(160),
}).strict()

export type HomeownerArtifactUploadInput = z.infer<typeof homeownerArtifactUploadInputSchema>

export interface ValidatedHomeownerArtifactPayload {
  readonly displayName: string
  readonly mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'
  readonly byteLength: number
  readonly payloadSha256: string
  readonly bytes: Uint8Array
}

function detectedMediaType(bytes: Uint8Array): ValidatedHomeownerArtifactPayload['mediaType'] | null {
  if (bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
    && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e
    && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a
    && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

/**
 * Keeps only a display label. Original paths and control characters never
 * become storage keys, response headers, or database values.
 */
export function safeArtifactDisplayName(input: string): string | null {
  const candidate = input
    .normalize('NFC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!candidate || candidate === '.' || candidate === '..') return null
  return candidate.slice(0, 160).trim() || null
}

export function validateHomeownerArtifactPayload(input: {
  readonly kind: HomeownerArtifactKind
  readonly displayName: string
  readonly bytes: Uint8Array
}): ValidatedHomeownerArtifactPayload {
  homeownerArtifactKindSchema.parse(input.kind)
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > HOMEOWNER_ARTIFACT_MAX_BYTES) {
    throw new Error('artifact_byte_length_invalid')
  }
  const mediaType = detectedMediaType(input.bytes)
  if (!mediaType || (input.kind === 'photo' && mediaType === 'application/pdf')) {
    throw new Error('artifact_media_type_invalid')
  }
  const displayName = safeArtifactDisplayName(input.displayName)
  if (!displayName) throw new Error('artifact_display_name_invalid')
  return Object.freeze({
    displayName,
    mediaType,
    byteLength: input.bytes.byteLength,
    payloadSha256: createHash('sha256').update(input.bytes).digest('hex'),
    bytes: input.bytes,
  })
}
