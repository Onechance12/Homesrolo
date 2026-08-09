import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REVIEW_DIMENSIONS,
  REVIEW_POLICY_STATEMENTS,
  isBodyVisible,
  orderReviews,
  parseVerifiedProjectReview,
  summariseDimensions,
  verifiedProjectReviewSchema,
} from '../review.v1.ts'
import * as reviewModule from '../review.v1.ts'
import {
  ACADEMY_COMMERCIAL_RULES,
  ACADEMY_COURSES,
  ASSESSMENT_PASS_MARK,
  CREDENTIAL_LIMITS,
  HOW_A_CREDENTIAL_IS_EARNED,
  academyCredentialSchema,
  effectiveCredentialState,
  parseAcademyCredential,
} from '../credential.v1.ts'
import {
  CLAIM_COMMERCIAL_RULES,
  CLAIM_DOES_NOT_GRANT,
  CLAIM_GRANTS,
  parseProfileClaim,
} from '../claiming.v1.ts'
import {
  SYNTHETIC_CLAIM,
  SYNTHETIC_CREDENTIALS,
  SYNTHETIC_REVIEWS,
  reviewsForCompany,
} from '../fixtures-engagement.ts'
import { SYNTHETIC_PROFILES, DEMO_PROFILE_SLUG, findSyntheticProfile } from '../fixtures.ts'
import { neutralOrder } from '../ordering.ts'
import { auditResponse } from '../../../../../src/constitution/detector.ts'

const TODAY = '2026-08-09'

// =============================================================================
// A review cannot exist without a released project
// =============================================================================

test('every review references a project the homeowner actually released', () => {
  const demo = findSyntheticProfile(DEMO_PROFILE_SLUG)
  assert.ok(demo)
  const released = new Set(
    demo.portfolioPreview.filter(item => item.homeownerReleased).map(item => item.id),
  )
  assert.ok(released.size > 0)

  for (const review of SYNTHETIC_REVIEWS) {
    assert.ok(
      released.has(review.releasedProjectRef),
      `${review.reviewId} points at "${review.releasedProjectRef}", which is not a released project`,
    )
  }
})

test('a review without a released project reference is unrepresentable', () => {
  const [sample] = SYNTHETIC_REVIEWS
  assert.ok(sample)
  const { releasedProjectRef: _dropped, ...withoutProject } = sample
  assert.throws(() => parseVerifiedProjectReview(withoutProject),
    'the field that makes fabrication impossible must be required')
  assert.throws(() => parseVerifiedProjectReview({ ...sample, releasedProjectRef: '' }))
})

test('reviews carry no author identity beyond an opaque handle', () => {
  const shape = Object.keys(verifiedProjectReviewSchema.shape)
  for (const identifying of ['authorName', 'email', 'phone', 'address', 'homeownerName', 'ipAddress']) {
    assert.equal(shape.includes(identifying), false, `a review must not carry "${identifying}"`)
  }
  for (const review of SYNTHETIC_REVIEWS) {
    assert.match(review.authorRef, /^hrev_[A-Za-z0-9_-]{16}$/)
  }
  const [sample] = SYNTHETIC_REVIEWS
  assert.ok(sample)
  assert.throws(() => parseVerifiedProjectReview({ ...sample, authorName: 'Jane Homeowner' }))
})

// =============================================================================
// Suppression is structurally hard
// =============================================================================

test('a removal or dispute must state its reason', () => {
  const [sample] = SYNTHETIC_REVIEWS
  assert.ok(sample)
  const { companyResponse: _r, ...base } = sample
  assert.throws(() => parseVerifiedProjectReview({ ...base, state: 'removed_policy_violation', stateReason: undefined }))
  assert.throws(() => parseVerifiedProjectReview({ ...base, state: 'disputed_under_review', stateReason: undefined }))
})

test('a removed review stays in the list with its reason, body withheld', () => {
  const removed = SYNTHETIC_REVIEWS.find(review => review.state === 'removed_policy_violation')
  assert.ok(removed, 'the fixtures should demonstrate a removal')
  assert.equal(isBodyVisible(removed), false, 'a removed review must not show its text')
  assert.ok(removed.stateReason && removed.stateReason.length >= 12, 'a removal must say why')
  // The entry itself is still present, so the count cannot change silently.
  assert.ok(SYNTHETIC_REVIEWS.includes(removed))
  // There is no state that deletes.
  assert.equal(Object.keys(reviewModule).includes('deleteReview'), false)
})

test('a disputed review stays visible but is excluded from the averages', () => {
  const disputed = SYNTHETIC_REVIEWS.find(review => review.state === 'disputed_under_review')
  assert.ok(disputed)
  assert.equal(isBodyVisible(disputed), true, 'a contested review is not hidden while it is checked')

  const withDispute = summariseDimensions(SYNTHETIC_REVIEWS)
  const withoutDispute = summariseDimensions(
    SYNTHETIC_REVIEWS.filter(review => review.reviewId !== disputed.reviewId),
  )
  assert.deepEqual(withDispute, withoutDispute,
    'a disputed review must not move a number before it is resolved')
})

// =============================================================================
// No aggregate star rating
// =============================================================================

test('there is no single overall rating anywhere in the review model', () => {
  const shape = Object.keys(verifiedProjectReviewSchema.shape)
  for (const aggregate of ['rating', 'overallRating', 'stars', 'score']) {
    assert.equal(shape.includes(aggregate), false, `a review must not carry "${aggregate}"`)
  }
  for (const exported of Object.keys(reviewModule)) {
    assert.doesNotMatch(exported, /overall|aggregateScore|starRating/i,
      `${exported} would collapse the dimensions into one sortable number`)
  }
  const summaries = summariseDimensions(SYNTHETIC_REVIEWS)
  assert.ok(summaries.length > 1, 'summaries are per dimension, not one figure')
  for (const summary of summaries) {
    assert.ok(REVIEW_DIMENSIONS.includes(summary.dimension))
    assert.ok(summary.average >= 1 && summary.average <= 5)
    assert.ok(summary.count >= 1, 'an average must say how many scores it rests on')
  }
})

test('dimension averages are computed deterministically to one decimal place', () => {
  const summaries = summariseDimensions(SYNTHETIC_REVIEWS)
  for (const summary of summaries) {
    assert.equal(Math.round(summary.average * 10) / 10, summary.average)
  }
  assert.deepEqual(summariseDimensions(SYNTHETIC_REVIEWS), summariseDimensions([...SYNTHETIC_REVIEWS].reverse()))
})

// =============================================================================
// Company responses sit beside a review and never alter it
// =============================================================================

test('a company response cannot edit, rescore, or hide the review', () => {
  const responded = SYNTHETIC_REVIEWS.filter(review => review.companyResponse)
  assert.ok(responded.length >= 2, 'the demo should show responses to both praise and criticism')

  for (const review of responded) {
    const response = review.companyResponse
    assert.ok(response)
    // The response is a sibling record: it holds no scores and no state.
    assert.equal(Object.keys(response).sort().join(','), 'body,respondedOn,responderRole')
    assert.ok(response.respondedOn >= review.submittedOn, 'a response cannot predate the review')
    assert.doesNotMatch(response.responderRole, /^[A-Z]/, 'a responder is a role, never a personal name')
  }
})

test('the critical review is answered rather than removed', () => {
  const critical = SYNTHETIC_REVIEWS.find(review =>
    review.state === 'published' && review.scores.some(score => score.score <= 2))
  assert.ok(critical, 'a demo with only positive reviews demonstrates nothing')
  assert.ok(critical.companyResponse, 'the honest demo answers criticism')
})

test('reviews never move a company in the listing order', () => {
  const baseline = neutralOrder(SYNTHETIC_PROFILES).map(profile => profile.slug)
  const withReviews = SYNTHETIC_PROFILES.map(profile => ({
    ...profile,
    reviews: reviewsForCompany(profile.slug),
    reviewCount: reviewsForCompany(profile.slug).length,
    averageRating: 5,
  })) as unknown as typeof SYNTHETIC_PROFILES
  assert.deepEqual(neutralOrder(withReviews).map(profile => profile.slug), baseline)
})

test('review ordering is chronological and total', () => {
  const ordered = orderReviews(SYNTHETIC_REVIEWS).map(review => review.reviewId)
  assert.deepEqual(orderReviews([...SYNTHETIC_REVIEWS].reverse()).map(review => review.reviewId), ordered)
})

// =============================================================================
// Credentials are earned, never bought
// =============================================================================

test('no commercial path can produce or restore a credential', () => {
  assert.equal(ACADEMY_COMMERCIAL_RULES.credentialIsPurchasable, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.paymentCanAwardCredential, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.paymentCanRestoreCredential, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.credentialAffectsOrdering, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.credentialAffectsVerificationFacts, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.sponsorshipCanCreateCourse, false)
  assert.equal(ACADEMY_COMMERCIAL_RULES.assessmentPassMarkIsUniform, true)

  // The schema has no field a payment could occupy.
  const shape = Object.keys(academyCredentialSchema.shape)
  for (const commercial of ['price', 'paid', 'fee', 'sponsorshipTier', 'tier', 'purchasedOn', 'invoiceId']) {
    assert.equal(shape.includes(commercial), false, `a credential must not carry "${commercial}"`)
  }
})

test('a credential cannot be held without passing the uniform assessment', () => {
  const [sample] = SYNTHETIC_CREDENTIALS
  assert.ok(sample)
  assert.equal(ASSESSMENT_PASS_MARK, 80)
  assert.throws(() => parseAcademyCredential({ ...sample, assessmentScore: ASSESSMENT_PASS_MARK - 1 }),
    'a failing score cannot hold an earned credential')
  for (const credential of SYNTHETIC_CREDENTIALS) {
    if (credential.state === 'earned') {
      assert.ok(credential.assessmentScore >= ASSESSMENT_PASS_MARK)
    }
  }
})

test('credential expiry beats stored state, exactly as verification does', () => {
  const lapsed = SYNTHETIC_CREDENTIALS.find(credential => credential.credentialId === 'sample-cred-money')
  assert.ok(lapsed)
  assert.equal(lapsed.state, 'earned', 'stored as earned')
  assert.equal(effectiveCredentialState(lapsed, TODAY), 'expired', 'but lapsed today')
  assert.equal(effectiveCredentialState(lapsed, '2026-01-01'), 'earned')
})

test('a credential must expire and a lost credential must say why', () => {
  const [sample] = SYNTHETIC_CREDENTIALS
  assert.ok(sample)
  assert.throws(() => parseAcademyCredential({ ...sample, expiresOn: sample.earnedOn }),
    'a permanent badge is not a statement about the present')
  assert.throws(() => parseAcademyCredential({ ...sample, state: 'withdrawn', stateReason: undefined }))

  const suspended = SYNTHETIC_CREDENTIALS.find(credential => credential.state === 'suspended_pending_review')
  assert.ok(suspended, 'the demo should show a credential that is not in good standing')
  assert.ok(suspended.stateReason)
})

test('credentials never move a company in the listing order', () => {
  const baseline = neutralOrder(SYNTHETIC_PROFILES).map(profile => profile.slug)
  const decorated = SYNTHETIC_PROFILES.map(profile => ({
    ...profile,
    credentials: SYNTHETIC_CREDENTIALS,
    credentialCount: SYNTHETIC_CREDENTIALS.length,
  })) as unknown as typeof SYNTHETIC_PROFILES
  assert.deepEqual(neutralOrder(decorated).map(profile => profile.slug), baseline)
})

test('the curriculum is substantive and every course renews', () => {
  assert.ok(ACADEMY_COURSES.length >= 6)
  const ids = new Set<string>()
  for (const course of ACADEMY_COURSES) {
    assert.ok(course.hours >= 4, `${course.id} should be real coursework`)
    assert.ok(course.renewalYears >= 2 && course.renewalYears <= 3)
    assert.ok(course.covers.length >= 4, `${course.id} needs a real syllabus`)
    assert.ok(course.why.length > 60)
    assert.equal(ids.has(course.id), false, 'course ids must be unique')
    ids.add(course.id)
  }
  // The two that keep contractors out of trouble must exist.
  assert.ok(ids.has('ethics-consumer-protection'))
  assert.ok(ids.has('claim-boundaries'))
})

test('credential limits disclaim licensure, workmanship, and purchase', () => {
  const joined = CREDENTIAL_LIMITS.join(' ').toLowerCase()
  assert.match(joined, /not a licence/)
  assert.match(joined, /not a guarantee of workmanship/)
  assert.match(joined, /cannot be bought/)
  assert.match(joined, /does not affect/)
  assert.ok(HOW_A_CREDENTIAL_IS_EARNED.length >= 4)
})

// =============================================================================
// Claiming grants management, never confirmation
// =============================================================================

test('claiming confirms control and nothing else', () => {
  assert.equal(CLAIM_COMMERCIAL_RULES.claimConfirmsAnyFact, false)
  assert.equal(CLAIM_COMMERCIAL_RULES.claimAffectsOrdering, false)
  assert.equal(CLAIM_COMMERCIAL_RULES.claimCanRemoveReviews, false)
  assert.equal(CLAIM_COMMERCIAL_RULES.claimingRequiresPayment, false)
  assert.equal(CLAIM_COMMERCIAL_RULES.paymentAcceleratesClaim, false)

  const grants = CLAIM_GRANTS.join(' ').toLowerCase()
  assert.doesNotMatch(grants, /verified|badge|certified/, 'claiming must not read as verification')

  const withheld = CLAIM_DOES_NOT_GRANT.join(' ').toLowerCase()
  assert.match(withheld, /does not confirm any verification fact/)
  assert.match(withheld, /does not remove/)
  assert.match(withheld, /does not change the listing/)
})

test('a claimed profile must record how control was shown and when', () => {
  assert.ok(parseProfileClaim(SYNTHETIC_CLAIM))
  assert.throws(() => parseProfileClaim({ ...SYNTHETIC_CLAIM, controlEvidence: [] }))
  assert.throws(() => parseProfileClaim({ ...SYNTHETIC_CLAIM, claimedOn: undefined }))
  assert.throws(() => parseProfileClaim({ ...SYNTHETIC_CLAIM, state: 'claim_revoked', stateReason: undefined }))
})

test('claiming the demo profile did not confirm any fact on it', () => {
  const demo = findSyntheticProfile(DEMO_PROFILE_SLUG)
  assert.ok(demo)
  assert.equal(SYNTHETIC_CLAIM.state, 'claimed')
  // The licence dimension stays self-reported despite the profile being claimed.
  const licence = demo.verificationFacts.find(fact => fact.dimension === 'license_jurisdiction')
  assert.ok(licence)
  assert.equal(licence.status, 'self_reported',
    'claiming a profile must not upgrade a fact on it')
})

// =============================================================================
// Everything shown to a homeowner passes the constitution
// =============================================================================

test('all review, credential, and claim prose passes the response audit', () => {
  const prose = [
    ...REVIEW_POLICY_STATEMENTS,
    ...CREDENTIAL_LIMITS,
    ...HOW_A_CREDENTIAL_IS_EARNED,
    ...CLAIM_GRANTS,
    ...CLAIM_DOES_NOT_GRANT,
    ...ACADEMY_COURSES.flatMap(course => [course.title, course.why, ...course.covers]),
    ...SYNTHETIC_REVIEWS.flatMap(review => [
      review.body,
      review.stateReason ?? '',
      review.companyResponse?.body ?? '',
    ]),
    ...SYNTHETIC_CREDENTIALS.map(credential => credential.stateReason ?? ''),
  ].filter(text => text.length > 0)

  for (const text of prose) {
    const audit = auditResponse(text)
    assert.deepEqual(audit.violations, [],
      `copy crosses a boundary (${audit.violations.join(', ')}): "${text}"`)
  }
})

test('the review policy names the practices it structurally prevents', () => {
  const joined = REVIEW_POLICY_STATEMENTS.join(' ').toLowerCase()
  assert.match(joined, /released a project record/)
  assert.match(joined, /screening for happy customers/)
  assert.match(joined, /nobody can pay/)
  assert.match(joined, /removed review still appears/)
})
