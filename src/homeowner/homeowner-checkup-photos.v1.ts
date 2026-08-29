import { z } from 'zod'
import { isRealCalendarDate } from '../contracts/home-file-record.v1.ts'
import type { AuthorizedHomeownerWorkspace } from './homeowner-runtime.v1.ts'

/**
 * Private, sanitized seasonal home-checkup photos.
 *
 * This is intentionally separate from the generic artifact surface. The raw
 * upload and its filename are never persisted. Only server-decoded JPEG
 * derivatives and the small amount of homeowner-authored context below may
 * cross this port.
 */
export const HOMEOWNER_CHECKUP_PHOTO_VERSION = 'homeowner-checkup-photo.v1' as const

export const HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS = 32_000_000
export const HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_DIMENSION = 2_048
export const HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES = 1_500 * 1024
export const HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_DIMENSION = 480
export const HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES = 100 * 1024
export const HOMEOWNER_CHECKUP_PHOTO_MAX_PER_HOME = 100

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => new Date(value).toISOString() === value, 'must be a canonical UTC instant')

const calendarDate = z.string().refine(isRealCalendarDate, 'must be a real calendar date')
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const safeText = (maximum: number, minimum = 0) => z.string().trim().min(minimum).max(maximum)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'control characters are not allowed')

export const HOMEOWNER_CHECKUP_PHOTO_AREAS = Object.freeze([
  'front_exterior',
  'rear_exterior',
  'roofline',
  'attic',
  'ceilings',
  'hvac',
  'water_heater',
  'foundation',
  'gutters',
  'siding',
  'windows_doors',
  'drainage',
  'other',
] as const)

export const homeownerCheckupPhotoAreaSchema = z.enum(HOMEOWNER_CHECKUP_PHOTO_AREAS)
export type HomeownerCheckupPhotoArea = z.infer<typeof homeownerCheckupPhotoAreaSchema>

/** Server-created upload command. Input content facts bind retries to one exact file. */
export const homeownerCheckupPhotoObservationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  observedOn: calendarDate,
  area: homeownerCheckupPhotoAreaSchema,
  viewLabel: safeText(80, 1),
  caption: safeText(240),
}).strict()

export const createHomeownerCheckupPhotoInputSchema =
  homeownerCheckupPhotoObservationInputSchema.extend({
  inputMediaType: z.enum(['image/jpeg', 'image/png']),
  inputByteLength: z.number().int().min(1).max(HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES),
  inputPayloadSha256: sha256,
  requestedAt: utcInstant,
}).strict()

export type CreateHomeownerCheckupPhotoInput = z.infer<
  typeof createHomeownerCheckupPhotoInputSchema
>

/** Stable retry intent. Server execution time is deliberately excluded. */
export function homeownerCheckupPhotoCommandIntent(input: CreateHomeownerCheckupPhotoInput) {
  const command = createHomeownerCheckupPhotoInputSchema.parse(input)
  const { requestedAt: _requestedAt, ...intent } = command
  return intent
}

export const homeownerCheckupPhotoMetadataSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_CHECKUP_PHOTO_VERSION),
  photoRef: opaqueRef('hpho'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  observedOn: calendarDate,
  area: homeownerCheckupPhotoAreaSchema,
  viewLabel: safeText(80, 1),
  caption: safeText(240),
  mediaType: z.literal('image/jpeg'),
  fullStorageObjectRef: opaqueRef('hobj'),
  fullByteLength: z.number().int().min(1).max(HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES),
  fullPayloadSha256: sha256,
  thumbnailStorageObjectRef: opaqueRef('hobj'),
  thumbnailByteLength: z.number().int().min(1)
    .max(HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES),
  thumbnailPayloadSha256: sha256,
  width: z.number().int().min(1).max(HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_DIMENSION),
  height: z.number().int().min(1).max(HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_DIMENSION),
  createdAt: utcInstant,
}).strict()

export type HomeownerCheckupPhotoMetadata = z.infer<
  typeof homeownerCheckupPhotoMetadataSchema
>

export const homeownerCheckupPhotoReservationSchema = z.object({
  photoRef: opaqueRef('hpho'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  commandRef: opaqueRef('hcmd'),
  commandDigest: sha256,
  leaseToken: opaqueRef('hles'),
  fullStorageObjectRef: opaqueRef('hobj'),
  thumbnailStorageObjectRef: opaqueRef('hobj'),
}).strict()

export type HomeownerCheckupPhotoReservation = z.infer<
  typeof homeownerCheckupPhotoReservationSchema
>

export type HomeownerCheckupPhotoReserveResult =
  | { readonly state: 'available'; readonly photo: HomeownerCheckupPhotoMetadata }
  | { readonly state: 'reserved'; readonly reservation: HomeownerCheckupPhotoReservation }

export interface SanitizedHomeownerCheckupPhoto {
  readonly fullBytes: Uint8Array
  readonly fullPayloadSha256: string
  readonly thumbnailBytes: Uint8Array
  readonly thumbnailPayloadSha256: string
  readonly width: number
  readonly height: number
}

export type HomeownerCheckupPhotoVariant = 'full' | 'thumbnail'

/** Service-role adapter only. Implementations must keep the storage bucket private. */
export interface HomeownerCheckupPhotoPort {
  listCheckupPhotos(
    grant: AuthorizedHomeownerWorkspace,
  ): Promise<readonly HomeownerCheckupPhotoMetadata[]>
  reserveCheckupPhotoUpload(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly command: CreateHomeownerCheckupPhotoInput
  }): Promise<HomeownerCheckupPhotoReserveResult>
  completeCheckupPhotoUpload(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly command: CreateHomeownerCheckupPhotoInput
    readonly reservation: HomeownerCheckupPhotoReservation
    readonly photo: SanitizedHomeownerCheckupPhoto
  }): Promise<HomeownerCheckupPhotoMetadata>
  rejectCheckupPhotoUpload(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly reservation: HomeownerCheckupPhotoReservation
    readonly rejectedAt: string
  }): Promise<void>
  readCheckupPhotoVariant(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly photoRef: string
    readonly variant: HomeownerCheckupPhotoVariant
  }): Promise<{
    readonly photo: HomeownerCheckupPhotoMetadata
    readonly bytes: Uint8Array
  }>
  deleteCheckupPhoto(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly photoRef: string
    readonly deletedAt: string
  }): Promise<{ readonly photoRef: string; readonly state: 'deleted' }>
}

export const HOMEOWNER_CHECKUP_PHOTO_WARNING =
  'This private beta stores only stripped, resized JPEG derivatives. It does not inspect the home, diagnose damage, prove when a condition began, or send photos to a contractor or Jobrolo.'
