/**
 * Verified-project reviews, V1 contract.
 *
 * The problem with every existing review surface is that anyone can write one.
 * That is why they fill up with competitor sabotage, paid five-star padding,
 * and reviews from customers who never existed — and why platforms then have to
 * police content they have no way to check.
 *
 * Homesrolo does not police. It makes the fake case unrepresentable:
 *
 *   A review must reference a released project. A released project only exists
 *   because a homeowner published a record of real work naming that company.
 *   No release, no review. There is no field for a review without one.
 *
 * That single binding removes the entire category. It also means this surface
 * will always be sparser than Angi, and sparse-and-real is the product.
 *
 * The FTC's rule on consumer reviews and testimonials (16 CFR part 465) bans
 * fake and insider reviews, buying positive sentiment, and suppressing negative
 * reviews. The rules below are written to make each of those structurally hard
 * rather than a policy someone promises to follow.
 */

import { z } from 'zod'

export const REVIEW_CONTRACT_VERSION = 'verified-project-review.v1' as const

/**
 * Reviews are scored per dimension. There is deliberately no overall star
 * rating and no aggregate headline number, for the same reason there is no
 * blanket verified badge: a single figure hides which part went wrong, and a
 * company that is meticulous but slow is not the same as one that is fast and
 * careless. A homeowner choosing between them needs to see which is which.
 */
export const REVIEW_DIMENSIONS = Object.freeze([
  'scope_accuracy',
  'schedule',
  'communication',
  'site_care',
  'warranty_followthrough',
] as const)

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number]

export const REVIEW_DIMENSION_LABELS: Readonly<Record<ReviewDimension, string>> = Object.freeze({
  scope_accuracy: 'Work matched the agreed scope',
  schedule: 'Kept to the schedule',
  communication: 'Communication',
  site_care: 'Care of the property',
  warranty_followthrough: 'Follow-through after completion',
})

/**
 * Moderation states. Note what is missing: there is no `deleted`. A review that
 * has been taken down still appears, showing that it was removed and why,
 * because silent deletion is indistinguishable from suppression and is exactly
 * what the FTC rule targets.
 */
export const REVIEW_STATES = Object.freeze([
  'published',
  'disputed_under_review',
  'removed_policy_violation',
  'removed_by_author',
] as const)

export type ReviewState = (typeof REVIEW_STATES)[number]

/** Relationships that must be disclosed on the review itself, not in a policy. */
export const REVIEW_DISCLOSURES = Object.freeze([
  'none',
  'incentive_offered',
  'employee_or_insider',
  'related_party',
] as const)

export type ReviewDisclosure = (typeof REVIEW_DISCLOSURES)[number]

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Opaque author handle. Never a name, email, address, or account identifier. */
const AUTHOR_REF = /^hrev_[A-Za-z0-9_-]{16}$/

const isoDate = z.string().regex(ISO_DATE)

const scoreSchema = z.object({
  dimension: z.enum(REVIEW_DIMENSIONS),
  /** Whole numbers 1-5. A dimension a homeowner skipped is simply absent. */
  score: z.number().int().min(1).max(5),
}).strict()

/**
 * A company's reply. It sits beside the review and never alters it: there is no
 * path by which responding edits, hides, scores, or reorders the original.
 */
const companyResponseSchema = z.object({
  respondedOn: isoDate,
  body: z.string().min(20).max(2000),
  /** Who at the company replied, by role. Never a personal name. */
  responderRole: z.enum(['owner', 'manager', 'office', 'field_lead']),
}).strict()

export const verifiedProjectReviewSchema = z.object({
  contractVersion: z.literal(REVIEW_CONTRACT_VERSION),
  reviewId: z.string().regex(SLUG),
  /**
   * The released project this review is about. Required, always. This is the
   * field that makes a fabricated review unrepresentable.
   */
  releasedProjectRef: z.string().regex(SLUG),
  companySlug: z.string().regex(SLUG),
  authorRef: z.string().regex(AUTHOR_REF),
  submittedOn: isoDate,
  state: z.enum(REVIEW_STATES),
  /** Required when the state is a removal, so a takedown always states a reason. */
  stateReason: z.string().min(12).max(300).optional(),
  scores: z.array(scoreSchema).min(1).max(REVIEW_DIMENSIONS.length),
  body: z.string().min(30).max(4000),
  disclosure: z.enum(REVIEW_DISCLOSURES),
  /** Set when a homeowner edited. The original stays in the version history. */
  editedOn: isoDate.optional(),
  companyResponse: companyResponseSchema.optional(),
  isSynthetic: z.literal(true),
}).strict()

export type VerifiedProjectReview = z.infer<typeof verifiedProjectReviewSchema>
export type CompanyResponse = z.infer<typeof companyResponseSchema>

export function parseVerifiedProjectReview(input: unknown): VerifiedProjectReview {
  const review = verifiedProjectReviewSchema.parse(input)

  if (review.state.startsWith('removed') && !review.stateReason) {
    throw new Error('A removed review must state why it was removed')
  }
  if (review.state === 'disputed_under_review' && !review.stateReason) {
    throw new Error('A disputed review must state what is disputed')
  }
  return review
}

/**
 * Whether a review's text is shown. A removed review still appears in the list
 * as a placeholder with its reason, so the count never silently changes.
 */
export function isBodyVisible(review: VerifiedProjectReview): boolean {
  return review.state === 'published' || review.state === 'disputed_under_review'
}

export type DimensionSummary = {
  readonly dimension: ReviewDimension
  readonly label: string
  readonly average: number
  readonly count: number
}

/**
 * Per-dimension averages over published reviews only.
 *
 * There is deliberately no `overallRating`. Collapsing five dimensions into one
 * number is the same mistake as a blanket verified badge, and it is the number
 * every other platform then sorts by — which is how review scores become worth
 * buying. Ordering never reads any of this.
 *
 * Disputed reviews are excluded from the arithmetic but still displayed, so a
 * contested claim cannot move a number while it is unresolved, and cannot be
 * made to disappear either.
 */
export function summariseDimensions(reviews: readonly VerifiedProjectReview[]): DimensionSummary[] {
  const published = reviews.filter(review => review.state === 'published')
  const summaries: DimensionSummary[] = []

  for (const dimension of REVIEW_DIMENSIONS) {
    const scores = published
      .flatMap(review => review.scores)
      .filter(score => score.dimension === dimension)
      .map(score => score.score)

    if (scores.length === 0) continue

    const total = scores.reduce((sum, score) => sum + score, 0)
    summaries.push({
      dimension,
      label: REVIEW_DIMENSION_LABELS[dimension],
      // One decimal place, computed deterministically.
      average: Math.round((total / scores.length) * 10) / 10,
      count: scores.length,
    })
  }

  return summaries
}

/** Chronological, newest first, ties broken by id so the order is total. */
export function orderReviews(reviews: readonly VerifiedProjectReview[]): VerifiedProjectReview[] {
  return [...reviews].sort((left, right) => {
    if (left.submittedOn !== right.submittedOn) return left.submittedOn < right.submittedOn ? 1 : -1
    return left.reviewId < right.reviewId ? -1 : 1
  })
}

export const REVIEW_POLICY_STATEMENTS: readonly string[] = Object.freeze([
  'A review can only be written by a homeowner who released a project record naming that company. There is no '
    + 'way to submit a review without one, which is what makes fabricated reviews unrepresentable rather than '
    + 'merely against the rules.',
  'Homesrolo does not filter which homeowners are invited to review, and a company cannot choose who is asked. '
    + 'Screening for happy customers before inviting feedback is prohibited.',
  'Nobody can pay to add, remove, reorder, or soften a review, and no review affects a company’s position in '
    + 'any list.',
  'A company may respond once to any review. The response sits beside the review and never edits, hides, or '
    + 'rescores it.',
  'A removed review still appears, marked as removed with the reason. Silent deletion is indistinguishable '
    + 'from suppression.',
  'Any incentive, employment, or family relationship behind a review is disclosed on the review itself.',
])
