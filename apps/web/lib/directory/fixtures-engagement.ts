/**
 * Synthetic reviews, credentials, and claims.
 *
 * Deliberately not a wall of five stars. The set includes a critical review, a
 * disputed one, a removed one, an expired credential, and a suspended one,
 * because the honest cases are the ones a demo normally hides and the ones the
 * design has to handle.
 *
 * Every review here references a released project from `fixtures.ts`. That is
 * not decoration: a review without one cannot be constructed.
 */

import { DEMO_PROFILE_SLUG } from './fixtures.ts'
import { REVIEW_CONTRACT_VERSION, type VerifiedProjectReview } from './review.v1.ts'
import { CREDENTIAL_CONTRACT_VERSION, type AcademyCredential } from './credential.v1.ts'
import { CLAIM_CONTRACT_VERSION, type ProfileClaim } from './claiming.v1.ts'

export const SYNTHETIC_REVIEWS: readonly VerifiedProjectReview[] = Object.freeze([
  {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reviewId: 'sample-review-roof',
    releasedProjectRef: 'sample-roof-replacement',
    companySlug: DEMO_PROFILE_SLUG,
    authorRef: 'hrev_aaaaaaaaaaaaaaaa',
    submittedOn: '2026-06-02',
    state: 'published',
    scores: [
      { dimension: 'scope_accuracy', score: 5 },
      { dimension: 'schedule', score: 4 },
      { dimension: 'communication', score: 5 },
      { dimension: 'site_care', score: 5 },
      { dimension: 'warranty_followthrough', score: 4 },
    ],
    body:
      'Sample review text. The crew arrived when they said they would, replaced the decking they found soft '
      + 'rather than covering it, and walked the roof with me afterwards. Weather pushed the finish by two days '
      + 'and I was told the same afternoon it happened. The handover pack had the shingle product line and the '
      + 'warranty registration already completed.',
    disclosure: 'none',
    companyResponse: {
      respondedOn: '2026-06-04',
      body:
        'Sample response text. Thank you for noting the decking. We photograph anything soft before we cover it '
        + 'so there is a record either way, and we would rather lose two days to weather than rush a dry-in.',
      responderRole: 'owner',
    },
    isSynthetic: true,
  },
  {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reviewId: 'sample-review-gutter',
    releasedProjectRef: 'sample-gutter-run',
    companySlug: DEMO_PROFILE_SLUG,
    authorRef: 'hrev_bbbbbbbbbbbbbbbb',
    submittedOn: '2026-06-21',
    state: 'published',
    scores: [
      { dimension: 'scope_accuracy', score: 4 },
      { dimension: 'schedule', score: 2 },
      { dimension: 'communication', score: 2 },
      { dimension: 'site_care', score: 4 },
    ],
    body:
      'Sample critical review. The gutter work itself is straight and the downspouts drain away from the house '
      + 'properly. Getting it scheduled took three attempts and two unreturned calls, and nobody told me the '
      + 'crew would arrive a day early. The work is fine. The coordination was not.',
    disclosure: 'none',
    companyResponse: {
      respondedOn: '2026-06-23',
      body:
        'Sample response text. This is a fair description and the scheduling failure was ours. We have moved to '
        + 'a single named coordinator per job so a homeowner is not chasing a general line, and we should have '
        + 'called before moving the date forward.',
      responderRole: 'manager',
    },
    isSynthetic: true,
  },
  {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reviewId: 'sample-review-disputed',
    releasedProjectRef: 'sample-roof-replacement',
    companySlug: DEMO_PROFILE_SLUG,
    authorRef: 'hrev_cccccccccccccccc',
    submittedOn: '2026-07-11',
    state: 'disputed_under_review',
    stateReason:
      'The company disputes that this reviewer is the homeowner named on the released project. Under review; '
      + 'the text stays visible and the scores are excluded from the averages until it is resolved.',
    scores: [
      { dimension: 'scope_accuracy', score: 1 },
      { dimension: 'communication', score: 1 },
    ],
    body:
      'Sample disputed review. Retained here to show what a contested review looks like while it is being '
      + 'checked. It is neither hidden nor counted, because doing either one before the facts are known would '
      + 'be taking a side.',
    disclosure: 'none',
    isSynthetic: true,
  },
  {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reviewId: 'sample-review-removed',
    releasedProjectRef: 'sample-gutter-run',
    companySlug: DEMO_PROFILE_SLUG,
    authorRef: 'hrev_dddddddddddddddd',
    submittedOn: '2026-05-05',
    state: 'removed_policy_violation',
    stateReason: 'Removed because it named an individual employee and included their personal contact details.',
    scores: [{ dimension: 'communication', score: 2 }],
    body:
      'Sample removed review. The text is withheld, but the entry stays so the count never changes quietly and '
      + 'a removal is always visible with its reason.',
    disclosure: 'none',
    isSynthetic: true,
  },
])

export const SYNTHETIC_CREDENTIALS: readonly AcademyCredential[] = Object.freeze([
  {
    contractVersion: CREDENTIAL_CONTRACT_VERSION,
    credentialId: 'sample-cred-ethics',
    companySlug: DEMO_PROFILE_SLUG,
    courseId: 'ethics-consumer-protection',
    state: 'earned',
    earnedOn: '2026-03-14',
    expiresOn: '2028-03-14',
    hoursCompleted: 6,
    assessmentScore: 92,
    isSynthetic: true,
  },
  {
    contractVersion: CREDENTIAL_CONTRACT_VERSION,
    credentialId: 'sample-cred-claim-boundaries',
    companySlug: DEMO_PROFILE_SLUG,
    courseId: 'claim-boundaries',
    state: 'earned',
    earnedOn: '2026-04-02',
    expiresOn: '2028-04-02',
    hoursCompleted: 5,
    assessmentScore: 86,
    isSynthetic: true,
  },
  {
    contractVersion: CREDENTIAL_CONTRACT_VERSION,
    credentialId: 'sample-cred-money',
    companySlug: DEMO_PROFILE_SLUG,
    courseId: 'money-management',
    state: 'earned',
    // Deliberately already lapsed, so the demo shows expiry beating stored state.
    earnedOn: '2023-05-20',
    expiresOn: '2026-05-20',
    hoursCompleted: 8,
    assessmentScore: 88,
    isSynthetic: true,
  },
  {
    contractVersion: CREDENTIAL_CONTRACT_VERSION,
    credentialId: 'sample-cred-estimating',
    companySlug: DEMO_PROFILE_SLUG,
    courseId: 'estimating-scope',
    state: 'suspended_pending_review',
    earnedOn: '2026-02-10',
    expiresOn: '2029-02-10',
    hoursCompleted: 6,
    assessmentScore: 84,
    stateReason:
      'Suspended while a conduct report about scope documentation on an unrelated job is reviewed. Suspension '
      + 'is shown rather than removed, so the record is complete either way.',
    isSynthetic: true,
  },
])

export const SYNTHETIC_CLAIM: ProfileClaim = Object.freeze<ProfileClaim>({
  contractVersion: CLAIM_CONTRACT_VERSION,
  companySlug: DEMO_PROFILE_SLUG,
  state: 'claimed',
  claimedOn: '2026-02-01',
  controlEvidence: ['registered_agent_match', 'domain_control'],
  isSynthetic: true,
})

export function reviewsForCompany(slug: string): VerifiedProjectReview[] {
  return SYNTHETIC_REVIEWS.filter(review => review.companySlug === slug)
}

export function credentialsForCompany(slug: string): AcademyCredential[] {
  return SYNTHETIC_CREDENTIALS.filter(credential => credential.companySlug === slug)
}

export function claimForCompany(slug: string): ProfileClaim | undefined {
  return SYNTHETIC_CLAIM.companySlug === slug ? SYNTHETIC_CLAIM : undefined
}
