/**
 * Profile claiming, V1 contract. Model only — no auth, no account, no runtime.
 *
 * Claiming answers one question: does this person control this business? It
 * answers nothing else. The distinction matters because every other directory
 * blurs it — you claim a listing, and a badge appears — which teaches
 * homeowners that a claimed profile is a checked profile. It is not.
 *
 *   Claiming lets a company MANAGE a listing.
 *   It never CONFIRMS a fact about that listing.
 *
 * So a claimed profile with nothing verified looks exactly as thin as an
 * unclaimed one, and the only thing claiming visibly changes is the company's
 * ability to respond and to submit evidence for checking.
 */

import { z } from 'zod'

export const CLAIM_CONTRACT_VERSION = 'profile-claim.v1-draft' as const

/**
 * No claiming system exists. There is no account, no control check, no
 * registered-agent lookup, no domain validation, and nobody to review a
 * dispute. A `controlEvidence` entry is a label in a fixture, not evidence.
 */
export const CLAIM_VERIFICATION_STATUS = Object.freeze({
  controlCheckImplemented: false,
  identityOfClaimantVerified: false,
  disputeProcessImplemented: false,
  /** The only line that matters for user-facing copy. */
  presentableAsVerifiedControl: false,
} as const)

export const CLAIM_DEMO_DISCLAIMER =
  'Draft demonstration only. No claiming system exists: nobody checked a registry, a domain, or an identity, '
  + 'and the control evidence listed is a synthetic label rather than something that was verified.'

export const CLAIM_STATES = Object.freeze([
  'unclaimed',
  'claim_pending_control_check',
  'claimed',
  'claim_disputed',
  'claim_revoked',
] as const)

export type ClaimState = (typeof CLAIM_STATES)[number]

/**
 * Ways control can be demonstrated. All of them prove control of the business,
 * and none of them proves the business is any good.
 */
export const CONTROL_EVIDENCE_KINDS = Object.freeze([
  'registered_agent_match',
  'domain_control',
  'business_phone_callback',
  'registry_officer_match',
  'postal_verification',
] as const)

export type ControlEvidenceKind = (typeof CONTROL_EVIDENCE_KINDS)[number]

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const profileClaimSchema = z.object({
  contractVersion: z.literal(CLAIM_CONTRACT_VERSION),
  companySlug: z.string().regex(SLUG),
  state: z.enum(CLAIM_STATES),
  /** Absent while unclaimed. Never a personal name — a role and an opaque ref. */
  claimedOn: z.string().regex(ISO_DATE).optional(),
  controlEvidence: z.array(z.enum(CONTROL_EVIDENCE_KINDS)).max(5),
  stateReason: z.string().min(12).max(300).optional(),
  isSynthetic: z.literal(true),
}).strict()

export type ProfileClaim = z.infer<typeof profileClaimSchema>

export function parseProfileClaim(input: unknown): ProfileClaim {
  const claim = profileClaimSchema.parse(input)
  if (claim.state === 'claimed' && claim.controlEvidence.length === 0) {
    throw new Error('A claimed profile must record how control was demonstrated')
  }
  if (claim.state === 'claimed' && !claim.claimedOn) {
    throw new Error('A claimed profile must record when it was claimed')
  }
  if ((claim.state === 'claim_disputed' || claim.state === 'claim_revoked') && !claim.stateReason) {
    throw new Error('A disputed or revoked claim must say why')
  }
  return claim
}

/** What claiming grants. Deliberately short, and deliberately not "verified". */
export const CLAIM_GRANTS: readonly string[] = Object.freeze([
  'Respond once to any review on the listing.',
  'Submit evidence for a verification fact to be checked. Submitting is not confirming; Homesrolo still checks '
    + 'the source and records what it found.',
  'Correct factual details such as trade categories and service areas.',
  'Contest an individual fact through the corrections process.',
  'Enrol in Academy coursework.',
])

/** What claiming does not grant. This is the list other directories skip. */
export const CLAIM_DOES_NOT_GRANT: readonly string[] = Object.freeze([
  'It does not confirm any verification fact. A claimed profile with nothing checked shows nothing checked.',
  'It does not remove, reorder, hide, or soften a review.',
  'It does not change the listing’s position in any list.',
  'It does not create a badge, a tier, or a membership level.',
  'It does not require, and cannot be accelerated by, any payment.',
])

export const CLAIM_COMMERCIAL_RULES = Object.freeze({
  claimingRequiresPayment: false,
  paymentAcceleratesClaim: false,
  claimConfirmsAnyFact: false,
  claimAffectsOrdering: false,
  claimCanRemoveReviews: false,
} as const)
