import { z } from 'zod'
import {
  HOMEOWNER_SYSTEM_KINDS,
  homeownerApproximateYearSchema,
  homeownerHomeTypeSchema,
  homeownerSystemKindSchema,
  homeownerUtcInstantSchema,
  type AuthorizedHomeownerAction,
  type AuthorizedHomeownerWorkspace,
} from './homeowner-runtime.v1.ts'

export const HOME_RECORD_PROFILE_VERSION = 'home-record-profile.v1' as const

const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`))

const safeAddressText = (maximum: number) => z.string()
  .trim()
  .min(1)
  .max(maximum)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'control characters are not allowed')

/** Private, controller-entered US mailing address. It is never part of a home-list projection. */
export const homeownerPrivateAddressSchema = z.object({
  line1: safeAddressText(120),
  line2: safeAddressText(120).nullable(),
  city: safeAddressText(80),
  regionCode: z.string().regex(/^[A-Z]{2}$/),
  postalCode: z.string().regex(/^\d{5}(?:-\d{4})?$/),
  countryCode: z.literal('US'),
}).strict()

export const homeownerHomeRecordSystemSchema = z.object({
  kind: homeownerSystemKindSchema,
  present: z.enum(['yes', 'no', 'unknown']),
  installedOrReplacedYear: homeownerApproximateYearSchema.nullable(),
}).strict().superRefine((system, context) => {
  if (system.present !== 'yes' && system.installedOrReplacedYear !== null) {
    context.addIssue({
      code: 'custom',
      path: ['installedOrReplacedYear'],
      message: 'only a present system may carry an installed or replaced year',
    })
  }
})

const sixSystemInventory = z.array(homeownerHomeRecordSystemSchema)
  .length(HOMEOWNER_SYSTEM_KINDS.length)
  .superRefine((systems, context) => {
    const kinds = systems.map(system => system.kind)
    if (new Set(kinds).size !== HOMEOWNER_SYSTEM_KINDS.length
      || HOMEOWNER_SYSTEM_KINDS.some(kind => !kinds.includes(kind))) {
      context.addIssue({
        code: 'custom',
        message: 'the record must contain each supported system exactly once',
      })
    }
  })

/** Browser-safe aggregate. No principal, membership, provider, or storage identifier crosses it. */
export const homeownerHomeRecordProfileSchema = z.object({
  recordVersion: z.literal(HOME_RECORD_PROFILE_VERSION),
  homeRef: opaqueRef('hhom'),
  revision: z.number().int().min(1),
  address: homeownerPrivateAddressSchema.nullable(),
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  systems: sixSystemInventory,
  source: z.literal('homeowner_recollection'),
  updatedAt: homeownerUtcInstantSchema,
}).strict()

export const updateHomeRecordProfileFieldsSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  expectedRevision: z.number().int().min(1),
  address: homeownerPrivateAddressSchema,
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  systems: sixSystemInventory,
  requestedAt: homeownerUtcInstantSchema,
}).strict()

export const updateHomeRecordProfileInputSchema =
  updateHomeRecordProfileFieldsSchema.superRefine((command, context) => {
    const requestedYear = new Date(command.requestedAt).getUTCFullYear()
    if (command.yearBuilt && command.yearBuilt.value > requestedYear) {
      context.addIssue({
        code: 'custom',
        path: ['yearBuilt'],
        message: 'year built may not be in the future',
      })
    }
    command.systems.forEach((system, index) => {
      if (system.installedOrReplacedYear
        && system.installedOrReplacedYear.value > requestedYear) {
        context.addIssue({
          code: 'custom',
          path: ['systems', index, 'installedOrReplacedYear'],
          message: 'installed or replaced year may not be in the future',
        })
      }
    })
  })

export type HomeownerPrivateAddress = z.infer<typeof homeownerPrivateAddressSchema>
export type HomeownerHomeRecordSystem = z.infer<typeof homeownerHomeRecordSystemSchema>
export type HomeownerHomeRecordProfile = z.infer<typeof homeownerHomeRecordProfileSchema>
export type UpdateHomeRecordProfileInput = z.infer<typeof updateHomeRecordProfileInputSchema>

/**
 * Route scope is part of receipt identity; server execution time is not.
 * This prevents one controller's command reference from replaying across homes.
 */
export function homeRecordProfileCommandIntent(
  homeRef: string,
  command: UpdateHomeRecordProfileInput,
) {
  const { requestedAt: _executionTime, ...intent } = updateHomeRecordProfileInputSchema.parse(command)
  return { homeRef: opaqueRef('hhom').parse(homeRef), ...intent }
}

export interface HomeownerHomeRecordProfilePort {
  readHomeRecordProfile(
    grant: AuthorizedHomeownerWorkspace,
  ): Promise<HomeownerHomeRecordProfile>
  updateHomeRecordProfile(input: {
    readonly grant: AuthorizedHomeownerAction<'home_record.update'>
    readonly command: UpdateHomeRecordProfileInput
  }): Promise<HomeownerHomeRecordProfile>
}

export const HOME_RECORD_PROFILE_WARNING =
  'The exact address and recollected home facts are private controller-entered data. They are not ownership verification, public-record truth, measurements, condition findings, or insurance evidence.'
