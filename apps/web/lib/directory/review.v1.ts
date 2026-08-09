/**
 * Project-linked reviews, V1 DRAFT contract. Synthetic demonstration only.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO
 * ---------------------------------------------------------------------------
 * An earlier version of this file claimed that requiring `releasedProjectRef`
 * makes fabricated reviews "unrepresentable". **That was wrong, and the claim
 * is retracted.**
 *
 * `releasedProjectRef` is a slug-shaped string. Nothing in this repository:
 *
 *   - verifies a signed homeowner release for that project;
 *   - checks an authoritative current-state ledger that the release exists, is
 *     still live, and names this company;
 *   - binds the review author to the homeowner who made the release; or
 *   - authenticates anyone at all, since there is no account system.
 *
 * A format-validated reference proves format. Anyone able to construct a record
 * could put any slug in that field. The demo holds together only because every
 * fixture is hand-written and synthetic.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT ACTUALLY IS
 * ---------------------------------------------------------------------------
 * A **draft activation invariant**: a precondition a future implementation must
 * satisfy before this surface may carry any weight. The field exists so the
 * shape is fixed early and the missing checks are named, not so that today's
 * data means anything.
 *
 * Until every item in REVIEW_ACTIVATION_REQUIREMENTS is implemented, **no
 * review may be presented to anyone as verified-project proof.** See
 * REVIEW_PROOF_STATUS, which is asserted by tests and rendered in the UI.
 *
 * The FTC's rule on consumer reviews and testimonials (16 CFR part 465) bans
 * fake and insider reviews, buying positive sentiment, and suppressing negative
 * reviews. The design intent below is aimed at those failure modes. Intent is
 * not enforcement, and none of it is enforced yet.
 */

import { z } from 'zod'

export const REVIEW_CONTRACT_VERSION = 'project-linked-review.v1-draft' as const

/**
 * The checks that must exist before a review can be described as proof of
 * anything. Every one of them is missing today.
 */
export const REVIEW_ACTIVATION_REQUIREMENTS: readonly string[] = Object.freeze([
  'A signed homeowner release for the referenced project, verified against a trusted key.',
  'An authoritative current-state check that the release is live, not revoked, and names this company.',
  'A binding between the review author and the homeowner who made that release.',
  'An authenticated account system, so an author is a person rather than a string.',
  'A moderation and corrections process with a recorded operator and audit trail.',
])

/**
 * Machine-readable honesty. Asserted by tests and rendered on every surface
 * that shows a review, so the UI cannot drift ahead of the implementation.
 *
 * Flipping any of these to true without building the corresponding check is a
 * test failure, not a copy change.
 */
export const REVIEW_PROOF_STATUS = Object.freeze({
  signedReleaseVerified: false,
  currentStateLedgerChecked: false,
  authorBoundToReleasingHomeowner: false,
  authorAuthenticated: false,
  /** The only line that matters for user-facing copy. */
  presentableAsVerifiedProof: false,
} as const)

/** Rendered wherever reviews appear. Deliberately blunt. */
export const REVIEW_PROOF_DISCLAIMER =
  'Draft demonstration only. These reviews are synthetic and prove nothing. A project reference here is a '
  + 'format-checked string, not a verified homeowner release: nothing checks a signature, a current-state '
  + 'ledger, or who the author is. No review will be shown as verified-project proof until those checks exist.'

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
   * The project this review claims to be about.
   *
   * Format-validated only. This is a *draft activation invariant*: a future
   * implementation must resolve it against a signed, currently-live homeowner
   * release before the review means anything. Today it means nothing beyond
   * "this string is slug-shaped".
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

/**
 * Design intent for a future implementation. These are commitments about what
 * will be built, not descriptions of what runs today — nothing here is
 * enforced, because there is no runtime.
 */
export const REVIEW_POLICY_INTENT: readonly string[] = Object.freeze([
  'Intended: a review will require a signed, currently-live homeowner release naming the company, verified at '
    + 'submission and rechecked at display. None of that verification exists yet, so today the project '
    + 'reference is a format-checked string and proves nothing.',
  'Intended: Homesrolo will not filter which homeowners are invited to review, and a company will not choose '
    + 'who is asked. Screening for happy customers before inviting feedback is to be prohibited.',
  'Intended: nobody can pay to add, remove, reorder, or soften a review. Ordering already reads company name '
    + 'only, so no review affects position in any list.',
  'Intended: a company may respond once to any review, beside it, without editing, hiding, or rescoring it.',
  'Intended: a removed review still appears, marked removed with a reason, because silent deletion is '
    + 'indistinguishable from suppression.',
  'Intended: any incentive, employment, or family relationship behind a review is disclosed on the review.',
])
