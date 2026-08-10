/**
 * corrections.v1 — DRAFT contract for contesting a published fact.
 *
 * This is the prerequisite for publishing anything about a real company.
 * A statement about a business with no route for that business to contest it is
 * the liability, and retrofitting a dispute trail onto a live directory is far
 * harder than building it first. See docs/LEGAL_POSTURE.md §2.
 *
 * Four rules shape the whole model:
 *
 *   1. A dispute targets ONE fact, never the profile. "Take my page down"
 *      is not a correction; it is a takedown, which is a separate decision.
 *   2. A contested fact stays visible, marked contested. Hiding it while it is
 *      reviewed sides with the complainant; ignoring it sides with the
 *      publisher. Showing the contest sides with the reader.
 *   3. Every outcome is itself a dated, sourced record. A resolution that
 *      leaves no trace is indistinguishable from a quiet edit.
 *   4. Nothing here is conditioned on payment, on claiming a profile, or on any
 *      commercial relationship. A company that never signs up can still correct
 *      what was said about it.
 */

import { z } from 'zod'

export const CORRECTIONS_CONTRACT_VERSION = 'corrections.v1-draft' as const

/** Nothing is built: no operator, no queue, no notification, no runtime. */
export const CORRECTIONS_STATUS = Object.freeze({
  intakeImplemented: false,
  operatorAssignmentImplemented: false,
  notificationImplemented: false,
  takedownPathImplemented: false,
  presentableAsOperational: false,
} as const)

export const DISPUTE_GROUNDS = Object.freeze([
  'factually_incorrect',
  'out_of_date',
  'wrong_company',
  'not_the_business_owner_of_record',
  'privacy_residential_address',
  'source_misread',
] as const)

export type DisputeGround = (typeof DISPUTE_GROUNDS)[number]

/**
 * Terminal states are outcomes, not disappearances. There is no `deleted`, for
 * the same reason the review model has none.
 */
export const DISPUTE_STATES = Object.freeze([
  'submitted',
  'under_review',
  'upheld_fact_corrected',
  'upheld_fact_withdrawn',
  'rejected_fact_stands',
  'partially_upheld',
] as const)

export type DisputeState = (typeof DISPUTE_STATES)[number]

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const factDisputeSchema = z.object({
  contractVersion: z.literal(CORRECTIONS_CONTRACT_VERSION),
  disputeId: z.string().regex(SLUG),
  companySlug: z.string().regex(SLUG),
  /**
   * The single fact under dispute. Required: a dispute against a whole profile
   * is not expressible, because "everything is wrong" cannot be adjudicated.
   */
  disputedDimension: z.enum([
    'business_identity',
    'license_jurisdiction',
    'insurance',
    'project_proof',
    'review_provenance',
  ]),
  ground: z.enum(DISPUTE_GROUNDS),
  /** What the complainant says is wrong, in their words. */
  statement: z.string().min(20).max(2000),
  submittedOn: z.string().regex(ISO_DATE),
  state: z.enum(DISPUTE_STATES),
  /** Required once the dispute leaves `submitted`. */
  resolvedOn: z.string().regex(ISO_DATE).optional(),
  /** Required on any resolution. The reader is owed the reasoning. */
  resolutionNote: z.string().min(20).max(2000).optional(),
  /**
   * Who decided, by role. Never a personal name — an operator is accountable to
   * the company, not exposed to it.
   */
  resolvedByRole: z.enum(['directory_operator', 'escalation_reviewer']).optional(),
  /** True while the fact must render as contested. */
  factIsContested: z.boolean(),
  isSynthetic: z.literal(true),
}).strict()

export type FactDispute = z.infer<typeof factDisputeSchema>

const TERMINAL: readonly DisputeState[] = Object.freeze([
  'upheld_fact_corrected',
  'upheld_fact_withdrawn',
  'rejected_fact_stands',
  'partially_upheld',
])

export function isTerminal(state: DisputeState): boolean {
  return TERMINAL.includes(state)
}

export function parseFactDispute(input: unknown): FactDispute {
  const dispute = factDisputeSchema.parse(input)

  if (isTerminal(dispute.state)) {
    if (!dispute.resolvedOn) throw new Error('A resolved dispute must record when it was resolved')
    if (!dispute.resolutionNote) throw new Error('A resolved dispute must record why')
    if (!dispute.resolvedByRole) throw new Error('A resolved dispute must record who decided')
    if (dispute.resolvedOn < dispute.submittedOn) {
      throw new Error('A dispute cannot be resolved before it was submitted')
    }
  }
  // While open, the fact must show as contested. Silence during review reads as
  // endorsement of the published version.
  if (!isTerminal(dispute.state) && !dispute.factIsContested) {
    throw new Error('An open dispute must mark its fact contested')
  }
  return dispute
}

/**
 * How a disputed fact renders. A contested fact is neither hidden nor trusted:
 * it is shown with the contest attached, so a reader can weigh both.
 */
export function disputeBadge(dispute: FactDispute): { label: string; tone: 'caution' | 'neutral' } {
  switch (dispute.state) {
    case 'submitted':
    case 'under_review':
      return { label: 'Contested — under review', tone: 'caution' }
    case 'upheld_fact_corrected':
      return { label: 'Corrected after dispute', tone: 'neutral' }
    case 'upheld_fact_withdrawn':
      return { label: 'Withdrawn after dispute', tone: 'neutral' }
    case 'partially_upheld':
      return { label: 'Partly corrected after dispute', tone: 'neutral' }
    case 'rejected_fact_stands':
      return { label: 'Disputed, reviewed, fact stands', tone: 'neutral' }
  }
}

export const CORRECTIONS_COMMERCIAL_RULES = Object.freeze({
  disputeRequiresPayment: false,
  paymentAcceleratesReview: false,
  disputeRequiresClaimedProfile: false,
  disputeRequiresAccount: false,
  outcomeAffectsOrdering: false,
} as const)

export const CORRECTIONS_PROMISE: readonly string[] = Object.freeze([
  'Intended: any company can contest any individual fact published about it, without an account, a claimed '
    + 'profile, or a payment.',
  'Intended: a contested fact stays visible and is marked contested while it is reviewed, because hiding it '
    + 'and ignoring it both take a side.',
  'Intended: every outcome carries its own date, reasoning, and deciding role, including outcomes where the '
    + 'fact stands.',
  'Intended: a takedown request is handled as a separate decision from a factual correction, and a removal is '
    + 'shown rather than silently applied.',
  'Intended: a residential address published from registry data is removed on request as a privacy matter, '
    + 'without requiring the company to prove the fact wrong.',
])
