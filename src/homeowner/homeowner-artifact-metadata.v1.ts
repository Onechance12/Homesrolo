import { z } from 'zod'
import { isRealCalendarDate } from '../contracts/home-file-record.v1.ts'
import {
  homeownerUtcInstantSchema,
  type AuthorizedHomeownerAction,
  type HomeownerArtifactMetadata,
} from './homeowner-runtime.v1.ts'

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

const calendarDate = z.string()
  .refine(isRealCalendarDate, 'must be a real calendar date')

export const homeownerArtifactPhotoPhaseSchema = z.enum([
  'before',
  'during',
  'after',
  'reference',
])

export const homeownerArtifactAreaLabelSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]*$/, 'must not contain control characters')

/**
 * A geo pin is never inferred from image bytes or EXIF. The only accepted
 * provenance means the device location was shown to and confirmed by the
 * homeowner before this command was created.
 */
export const homeownerArtifactGeoPinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100_000),
  capturedAt: homeownerUtcInstantSchema,
  provenance: z.literal('device_confirmed'),
}).strict()

export const updateHomeownerArtifactMetadataFieldsSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  expectedRevision: z.number().int().min(1),
  projectRef: opaqueRef('hprj').nullable(),
  observedOn: calendarDate.nullable(),
  phase: homeownerArtifactPhotoPhaseSchema.nullable(),
  areaLabel: homeownerArtifactAreaLabelSchema.nullable(),
  geoPin: homeownerArtifactGeoPinSchema.nullable(),
}).strict()

export const updateHomeownerArtifactMetadataInputSchema =
  updateHomeownerArtifactMetadataFieldsSchema.extend({
    artifactRef: opaqueRef('hart'),
    requestedAt: homeownerUtcInstantSchema,
  }).strict().superRefine((command, context) => {
    const requestedDate = command.requestedAt.slice(0, 10)
    if (command.observedOn !== null && command.observedOn > requestedDate) {
      context.addIssue({
        code: 'custom',
        path: ['observedOn'],
        message: 'observed date may not be in the future',
      })
    }
    if (command.geoPin !== null
      && command.geoPin.capturedAt > command.requestedAt) {
      context.addIssue({
        code: 'custom',
        path: ['geoPin', 'capturedAt'],
        message: 'capture time may not be in the future',
      })
    }
  })

export type UpdateHomeownerArtifactMetadataInput = z.infer<
  typeof updateHomeownerArtifactMetadataInputSchema
>

/** Stable retry intent; server execution time is never part of the digest. */
export function homeownerArtifactMetadataCommandIntent(
  input: UpdateHomeownerArtifactMetadataInput,
) {
  const command = updateHomeownerArtifactMetadataInputSchema.parse(input)
  const { requestedAt: _requestedAt, ...intent } = command
  return intent
}

export interface HomeownerArtifactMetadataPort {
  updateArtifactMetadata(input: {
    readonly grant: AuthorizedHomeownerAction<'artifact.update_metadata'>
    readonly command: UpdateHomeownerArtifactMetadataInput
  }): Promise<HomeownerArtifactMetadata>
}

/** The browser-safe projection keeps storage and integrity details private. */
export const homeownerArtifactPhotoMetadataViewSchema = z.object({
  projectRef: opaqueRef('hprj').nullable(),
  observedOn: calendarDate.nullable(),
  phase: homeownerArtifactPhotoPhaseSchema.nullable(),
  areaLabel: homeownerArtifactAreaLabelSchema.nullable(),
  geoPin: homeownerArtifactGeoPinSchema.nullable(),
  revision: z.number().int().min(1),
  updatedAt: homeownerUtcInstantSchema,
}).strict()
