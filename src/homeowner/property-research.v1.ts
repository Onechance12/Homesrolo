import { z } from 'zod'
import { homeownerPrivateAddressSchema } from './home-record-profile.v1.ts'

/** Additive, private contract; never changes home-record-profile.v1 or public listings. */
export const propertyAddressSchema = homeownerPrivateAddressSchema
const safeText = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value))
const instant = z.string().datetime({ precision: 3 })
const integer = (max: number) => z.number().int().min(0).max(max).nullable()

export const propertyFactsSchema = z.object({
  squareFeet: z.number().int().min(1).max(1_000_000).nullable(),
  yearBuilt: z.number().int().min(1000).max(2100).nullable(),
  lotSquareFeet: z.number().positive().max(10_000_000_000).nullable(),
  bedrooms: integer(100),
  bathrooms: z.number().min(0).max(100).multipleOf(0.25).nullable(),
  rooms: integer(1000),
  garageSpaces: integer(100),
  centralHeat: z.boolean().nullable(),
  centralAir: z.boolean().nullable(),
  subdivision: safeText(160).nullable(),
}).strict()

export const TARRANT_PROPERTY_SOURCE_URL =
  'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0'

export const propertyLookupSchema = z.object({
  version: z.literal('property-lookup.v1'),
  status: z.enum(['matched', 'no_match', 'ambiguous', 'unsupported', 'unavailable']),
  address: propertyAddressSchema,
  matchedAddress: safeText(360).nullable(),
  county: z.object({ name: safeText(120), fips: z.string().regex(/^\d{5}$/) }).strict().nullable(),
  retrievedAt: instant,
  source: z.object({
    id: z.literal('tarrant_county'),
    title: safeText(160),
    url: z.literal(TARRANT_PROPERTY_SOURCE_URL),
    parcelId: z.string().regex(/^\d{1,20}$/),
    recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }).strict().nullable(),
  facts: propertyFactsSchema,
  notes: z.array(safeText(500)).max(8),
}).strict().superRefine((lookup, context) => {
  if (lookup.status === 'matched') {
    if (!lookup.source || !lookup.matchedAddress || lookup.county?.fips !== '48439') {
      context.addIssue({ code: 'custom', message: 'matched records require a corroborated source' })
    }
  } else if (lookup.source !== null || lookup.matchedAddress !== null
    || Object.values(lookup.facts).some(value => value !== null)) {
    context.addIssue({ code: 'custom', message: 'unmatched results cannot supply property facts' })
  }
})

export const propertyReceiptSchema = z.string().max(16_000)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
export const propertyLookupRequestSchema = z.object({
  address: propertyAddressSchema,
  consentToLookup: z.literal(true),
}).strict()
export const propertyLookupResultSchema = z.object({
  lookup: propertyLookupSchema,
  receipt: propertyReceiptSchema.nullable(),
}).strict().superRefine((result, context) => {
  if ((result.lookup.status === 'matched') !== (result.receipt !== null)) {
    context.addIssue({ code: 'custom', message: 'only matched results carry receipts' })
  }
})
export const saveHomePropertySchema = z.object({
  commandRef: z.string().regex(/^hcmd_[A-Za-z0-9_-]{43}$/),
  address: propertyAddressSchema,
  facts: propertyFactsSchema,
  receipt: propertyReceiptSchema.nullable(),
}).strict()
export const homePropertySnapshotSchema = z.object({
  version: z.literal('home-property-snapshot.v1'),
  homeRef: z.string().regex(/^hhom_[A-Za-z0-9_-]{43}$/),
  address: propertyAddressSchema,
  facts: propertyFactsSchema,
  lookup: propertyLookupSchema.nullable(),
  reviewedAt: instant,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.lookup && (snapshot.lookup.status !== 'matched'
    || !samePropertyAddress(snapshot.address, snapshot.lookup.address))) {
    context.addIssue({ code: 'custom', message: 'saved source must match the reviewed address' })
  }
})

export type PropertyAddress = z.infer<typeof propertyAddressSchema>
export type PropertyFacts = z.infer<typeof propertyFactsSchema>
export type PropertyLookup = z.infer<typeof propertyLookupSchema>
export type PropertyLookupResult = z.infer<typeof propertyLookupResultSchema>
export type HomePropertySnapshot = z.infer<typeof homePropertySnapshotSchema>

/** Exact reviewed address binding, not parcel ownership or fuzzy address matching. */
export function samePropertyAddress(a: PropertyAddress, b: PropertyAddress): boolean {
  return a.line1 === b.line1 && a.line2 === b.line2 && a.city === b.city
    && a.regionCode === b.regionCode && a.postalCode === b.postalCode
    && a.countryCode === b.countryCode
}

export function emptyPropertyFacts(): PropertyFacts {
  return { squareFeet: null, yearBuilt: null, lotSquareFeet: null, bedrooms: null,
    bathrooms: null, rooms: null, garageSpaces: null, centralHeat: null,
    centralAir: null, subdivision: null }
}
