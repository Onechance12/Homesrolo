/**
 * Safe public projection.
 *
 * The schema already refuses private fields on the way in. This is the second
 * gate, on the way out: the page renders a projection built from an explicit
 * allowlist, so a field added to the model later does not reach the public
 * surface just because someone forgot to think about it. New public fields are
 * a deliberate edit here.
 */

import {
  type PublicProfile,
  type VerificationFact,
  type VerificationStatus,
  effectiveStatus,
} from './public-profile.v1.ts'

/** The only keys that may be rendered publicly. */
export const PUBLIC_PROFILE_FIELD_ALLOWLIST = Object.freeze([
  'contractVersion',
  'slug',
  'displayName',
  'isSynthetic',
  'noindex',
  'tradeCategories',
  'serviceAreas',
  'summary',
  'verificationFacts',
  'externalLinks',
  'portfolioPreview',
  'relationshipDisclosures',
] as const)

export type PublicProfileProjection = Pick<
  PublicProfile,
  (typeof PUBLIC_PROFILE_FIELD_ALLOWLIST)[number]
>

export function toPublicProjection(profile: PublicProfile): PublicProfileProjection {
  const projected: Record<string, unknown> = {}
  for (const key of PUBLIC_PROFILE_FIELD_ALLOWLIST) {
    projected[key] = profile[key]
  }
  return projected as PublicProfileProjection
}

// --- display requirements -----------------------------------------------------

const STATUS_LABELS: Readonly<Record<VerificationStatus, string>> = Object.freeze({
  confirmed: 'Confirmed',
  self_reported: 'Self-reported by the company',
  pending_review: 'Pending review',
  expired: 'Expired',
  not_checked: 'Not checked',
  not_applicable: 'Not applicable',
})

const SOURCE_LABELS = Object.freeze({
  homeowner_released_project: 'Homeowner-released project record',
  state_license_registry: 'State license registry',
  insurer_certificate: 'Insurer certificate',
  business_registry: 'Business registry',
  company_self_reported: 'The company itself',
  not_collected: 'No source collected',
})

export const DIMENSION_LABELS = Object.freeze({
  business_identity: 'Business identity',
  license_jurisdiction: 'License and jurisdiction',
  insurance: 'Insurance',
  project_proof: 'Project proof',
  review_provenance: 'Review provenance',
})

export type DisplayedFact = {
  readonly dimension: string
  readonly statusLabel: string
  readonly sourceLabel: string
  readonly asOfLabel: string
  readonly expiresLabel: string | null
  readonly statement: string
  readonly isStale: boolean
}

/**
 * Every fact renders three things or it does not render: what the status is,
 * where it came from, and when it was checked. A status with no source and no
 * date is a rumour with a badge on it.
 */
export function displayFact(fact: VerificationFact, today: string): DisplayedFact {
  const status = effectiveStatus(fact, today)
  return {
    dimension: DIMENSION_LABELS[fact.dimension],
    statusLabel: STATUS_LABELS[status],
    sourceLabel: SOURCE_LABELS[fact.source],
    asOfLabel: `Checked ${fact.checkedAt}${fact.asOf ? ` · record as of ${fact.asOf}` : ''}`,
    expiresLabel: fact.expiresAt ? `Expires ${fact.expiresAt}` : null,
    statement: fact.statement,
    isStale: status === 'expired',
  }
}
