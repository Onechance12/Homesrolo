/**
 * Public directory profile contract, V1.
 *
 * This is the PUBLIC layer. It is deliberately disconnected from the private
 * home file and from the inert Jobrolo share contract:
 *
 *   - Nothing here reads a home file, a share manifest, or a receipt.
 *   - Nothing here accepts an address, a homeowner name, a claim reference, or
 *     any other private field. Those are rejected by name, and one of them
 *     anywhere rejects the whole profile.
 *   - Nothing here expresses a payment, a sponsorship, a boost, or a rank.
 *     Ordering is computed from stable identity alone (see ordering.ts), so
 *     placement cannot be bought.
 *
 * The wedge this exists to serve is the Home Project Passport: a homeowner
 * explicitly releases a record of real work, and that release is what can later
 * substantiate a company's project proof. Until a release exists, a claim about
 * a company is self-reported and must say so.
 */

import { z } from 'zod'

export const PUBLIC_DIRECTORY_CONTRACT_VERSION = 'public-directory.v1' as const

// --- verification: five independent dimensions, never one boolean ------------

/**
 * Verification is factual and dimensional. A company can have a confirmed state
 * license and no project proof at all; collapsing that into "Verified" would be
 * the single most misleading thing this product could do.
 */
export const VERIFICATION_DIMENSIONS = Object.freeze([
  'business_identity',
  'license_jurisdiction',
  'insurance',
  'project_proof',
  'review_provenance',
] as const)

export type VerificationDimension = (typeof VERIFICATION_DIMENSIONS)[number]

export const VERIFICATION_STATUSES = Object.freeze([
  'confirmed',
  'self_reported',
  'pending_review',
  'expired',
  'not_checked',
  'not_applicable',
] as const)

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

/**
 * Where a fact came from. `company_self_reported` is a legitimate source, but
 * it is never displayed as confirmation, and the UI must show it as what it is.
 */
export const VERIFICATION_SOURCES = Object.freeze([
  'homeowner_released_project',
  'state_license_registry',
  'insurer_certificate',
  'business_registry',
  'company_self_reported',
  'not_collected',
] as const)

export type VerificationSource = (typeof VERIFICATION_SOURCES)[number]

/** Neutral trade categories. Descriptive only; carries no quality signal. */
export const TRADE_CATEGORIES = Object.freeze([
  'roofing',
  'gutters',
  'siding',
  'windows_doors',
  'exterior_painting',
  'general_contracting',
] as const)

export type TradeCategory = (typeof TRADE_CATEGORIES)[number]

/**
 * External providers a company may link out to. Homesrolo links and attributes;
 * it does not scrape, mirror, cache, or restate their content. Ratings and
 * review text stay on the source, which is both a terms-of-service boundary and
 * an accuracy one.
 */
export const EXTERNAL_LINK_KINDS = Object.freeze([
  'company_website',
  'google_business_profile',
  'bbb',
  'angi',
  'pinterest',
] as const)

export type ExternalLinkKind = (typeof EXTERNAL_LINK_KINDS)[number]

// --- fields that must never appear -------------------------------------------

/**
 * Private-layer field names. Strict schemas already reject every unknown key;
 * this list exists so the refusal names what leaked, and so a test can assert
 * each specific leak individually rather than trusting the general rule.
 */
export const PROHIBITED_PUBLIC_FIELDS = Object.freeze([
  'address',
  'streetAddress',
  'addressLine1',
  'city',
  'postalCode',
  'zip',
  'parcel',
  'latitude',
  'longitude',
  'geohash',
  'homeId',
  'homeFileId',
  'homeownerName',
  'homeownerRef',
  'recipientRef',
  'ownerEmail',
  'ownerPhone',
  'phone',
  'email',
  'contact',
  'claimNumber',
  'claimStatus',
  'carrier',
  'policyNumber',
  'deductible',
  'settlementAmount',
  'shareId',
  'manifestDigest',
  'jobId',
  'jobNimbusId',
  'projectCost',
  'invoiceTotal',
  'margin',
  'internalNotes',
  'sponsorshipTier',
  'placementFee',
  'leadPrice',
  'rankBoost',
  'paidPlacement',
] as const)

const PROHIBITED = new Set<string>(PROHIBITED_PUBLIC_FIELDS)

// --- primitives ---------------------------------------------------------------

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isoDate = z.string().regex(ISO_DATE).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'must be a real calendar date')

/**
 * V1 accepts only clearly synthetic external links. Real provider URLs require
 * permission or a licensed API plus an attribution review, neither of which
 * exists yet, so anything other than example.com is refused at the type
 * boundary rather than left to editorial discipline.
 */
const SYNTHETIC_EXTERNAL_URL = z.string().url().refine(value => {
  let parsed: URL
  try { parsed = new URL(value) } catch { return false }
  if (parsed.protocol !== 'https:') return false
  return parsed.hostname === 'example.com' || parsed.hostname.endsWith('.example.com')
}, 'V1 permits only synthetic https example.com links')

const verificationFactSchema = z.object({
  dimension: z.enum(VERIFICATION_DIMENSIONS),
  status: z.enum(VERIFICATION_STATUSES),
  source: z.enum(VERIFICATION_SOURCES),
  /** Plain-language, dimension-specific. Must not read as a blanket claim. */
  statement: z.string().min(8).max(240),
  /** When Homesrolo last looked. Always required, including for not_checked. */
  checkedAt: isoDate,
  /** The date the underlying record itself speaks to, when different. */
  asOf: isoDate.optional(),
  /** Required for anything that lapses, such as insurance or a license. */
  expiresAt: isoDate.optional(),
}).strict()

const externalLinkSchema = z.object({
  kind: z.enum(EXTERNAL_LINK_KINDS),
  url: SYNTHETIC_EXTERNAL_URL,
  /** Shown next to the link. Homesrolo does not restate the destination. */
  attribution: z.string().min(4).max(160),
}).strict()

const portfolioPreviewSchema = z.object({
  id: z.string().regex(SLUG),
  title: z.string().min(4).max(120),
  tradeCategory: z.enum(TRADE_CATEGORIES),
  /** Coarse only. Never a street address. */
  serviceArea: z.string().min(2).max(80),
  completedOn: isoDate,
  /** Whether a homeowner released this project. Drives project_proof. */
  homeownerReleased: z.boolean(),
  summary: z.string().min(12).max(400),
  /** Code-native illustration token, not a photograph or a remote asset. */
  illustration: z.enum(['roofline', 'gutter', 'siding', 'window', 'paint', 'frame']),
}).strict()

export const publicProfileSchema = z.object({
  contractVersion: z.literal(PUBLIC_DIRECTORY_CONTRACT_VERSION),
  slug: z.string().regex(SLUG).min(3).max(64),
  displayName: z.string().min(2).max(120),
  /**
   * V1 has no real companies. Every profile must declare itself synthetic, and
   * the page must show that declaration.
   */
  isSynthetic: z.literal(true),
  /** Synthetic profiles are excluded from indexing. */
  noindex: z.literal(true),
  tradeCategories: z.array(z.enum(TRADE_CATEGORIES)).min(1).max(6),
  serviceAreas: z.array(z.string().min(2).max(80)).min(1).max(12),
  summary: z.string().min(20).max(600),
  verificationFacts: z.array(verificationFactSchema).min(1).max(12),
  externalLinks: z.array(externalLinkSchema).max(6),
  portfolioPreview: z.array(portfolioPreviewSchema).max(12),
  /** Any relationship that could bias the listing. Empty array is a claim too. */
  relationshipDisclosures: z.array(z.string().min(8).max(240)).max(8),
}).strict()

export type VerificationFact = z.infer<typeof verificationFactSchema>
export type ExternalLink = z.infer<typeof externalLinkSchema>
export type PortfolioPreview = z.infer<typeof portfolioPreviewSchema>
export type PublicProfile = z.infer<typeof publicProfileSchema>

/**
 * Parse a public profile. All or nothing: one bad field rejects the whole
 * profile rather than yielding a partially-scrubbed one, because a caller
 * handed a filtered profile cannot tell it was filtered.
 */
export function parsePublicProfile(input: unknown): PublicProfile {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const leaked = Object.keys(input as Record<string, unknown>).filter(key => PROHIBITED.has(key))
    if (leaked.length > 0) {
      throw new Error(`Public profile rejects private field(s): ${leaked.join(', ')}`)
    }
  }
  return publicProfileSchema.parse(input)
}

/**
 * Every dimension a profile must speak to. Silence is not neutral: a company
 * with no insurance fact at all reads as "fine" unless the absence is stated,
 * so a complete profile carries an explicit fact for each dimension, including
 * `not_checked`.
 */
export function missingDimensions(profile: PublicProfile): VerificationDimension[] {
  const present = new Set(profile.verificationFacts.map(fact => fact.dimension))
  return VERIFICATION_DIMENSIONS.filter(dimension => !present.has(dimension))
}

/**
 * Status as of `today`, not as stored. A fact whose expiry has passed reads as
 * expired regardless of what it was written as, so a stale certificate cannot
 * keep presenting itself as confirmed.
 */
export function effectiveStatus(fact: VerificationFact, today: string): VerificationStatus {
  if (fact.expiresAt && fact.expiresAt < today) return 'expired'
  return fact.status
}

/**
 * There is deliberately no `isVerified(profile)`. Any single boolean over these
 * five dimensions would be a summary that hides which one failed, which is the
 * exact claim V1 refuses to make. Callers must render facts.
 */
export const NO_BLANKET_VERIFICATION_NOTICE =
  'Homesrolo does not publish an overall verified badge. Each fact below states what was checked, ' +
  'where it came from, and when. A listing is information, not an endorsement or a recommendation.'
