import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CORRECTIONS_COMMERCIAL_RULES,
  CORRECTIONS_CONTRACT_VERSION,
  CORRECTIONS_PROMISE,
  CORRECTIONS_STATUS,
  DISPUTE_GROUNDS,
  DISPUTE_STATES,
  disputeBadge,
  factDisputeSchema,
  isRealCalendarDate,
  isTerminal,
  parseFactDispute,
} from '../corrections.v1.ts'
import { auditResponse } from '../../../../../src/constitution/detector.ts'

const open = {
  contractVersion: CORRECTIONS_CONTRACT_VERSION,
  disputeId: 'sample-dispute-insurance',
  companySlug: 'demo',
  disputedDimension: 'insurance' as const,
  ground: 'out_of_date' as const,
  statement: 'The certificate shown expired but a current one was issued in July; the listing is stale.',
  submittedOn: '2026-08-01',
  state: 'under_review' as const,
  factIsContested: true,
  isSynthetic: true as const,
}

test('nothing in corrections claims to be operational', () => {
  for (const [field, value] of Object.entries(CORRECTIONS_STATUS)) {
    assert.equal(value, false, `CORRECTIONS_STATUS.${field} must stay false until built`)
  }
  assert.match(CORRECTIONS_CONTRACT_VERSION, /-draft$/)
})

test('a dispute targets one fact, never a whole profile', () => {
  assert.ok(parseFactDispute(open))
  // There is no field for a profile-wide grievance.
  const shape = Object.keys(factDisputeSchema.shape)
  assert.ok(shape.includes('disputedDimension'))
  for (const wholeProfile of ['profileDispute', 'takedownRequest', 'removeProfile']) {
    assert.equal(shape.includes(wholeProfile), false, `"${wholeProfile}" would conflate takedown with correction`)
  }
  const { disputedDimension: _dropped, ...noDimension } = open
  assert.throws(() => parseFactDispute(noDimension))
})

test('an open dispute must mark its fact contested', () => {
  assert.throws(() => parseFactDispute({ ...open, factIsContested: false }),
    'silence during review reads as endorsement of the published version')
  assert.equal(isTerminal('under_review'), false)
  assert.equal(isTerminal('rejected_fact_stands'), true)
})

test('every resolution records when, why, and who decided', () => {
  const resolved = {
    ...open,
    state: 'rejected_fact_stands' as const,
    resolvedOn: '2026-08-06',
    resolutionNote: 'The registry record was re-read on the resolution date and matches what is published.',
    resolvedByRole: 'directory_operator' as const,
    factIsContested: false,
  }
  assert.ok(parseFactDispute(resolved))
  assert.throws(() => parseFactDispute({ ...resolved, resolvedOn: undefined }))
  assert.throws(() => parseFactDispute({ ...resolved, resolutionNote: undefined }))
  assert.throws(() => parseFactDispute({ ...resolved, resolvedByRole: undefined }))
  assert.throws(() => parseFactDispute({ ...resolved, resolvedOn: '2026-07-01' }),
    'a dispute cannot be resolved before it was submitted')
})

test('an outcome where the fact stands is still a recorded outcome', () => {
  // The tempting shortcut is to record only successful corrections. That turns
  // the dispute log into a list of admissions.
  assert.ok((DISPUTE_STATES as readonly string[]).includes('rejected_fact_stands'))
  assert.match(disputeBadge({ ...open, state: 'rejected_fact_stands' }).label, /fact stands/)
  // And there is no state that simply deletes.
  for (const state of DISPUTE_STATES) {
    assert.doesNotMatch(state, /delete/i)
  }
})

test('a contested fact is shown as contested, not hidden', () => {
  const badge = disputeBadge(open)
  assert.match(badge.label, /Contested/)
  assert.equal(badge.tone, 'caution')
  for (const state of DISPUTE_STATES) {
    const label = disputeBadge({ ...open, state }).label
    assert.ok(label.length > 0, `${state} must render something rather than disappearing`)
  }
})

test('privacy grounds do not require proving the fact wrong', () => {
  assert.ok((DISPUTE_GROUNDS as readonly string[]).includes('privacy_residential_address'),
    'registry data routinely carries a sole proprietor home address')
  assert.ok(parseFactDispute({ ...open, ground: 'privacy_residential_address' }))
})

test('correcting a record is never gated on money, an account, or a claim', () => {
  assert.equal(CORRECTIONS_COMMERCIAL_RULES.disputeRequiresPayment, false)
  assert.equal(CORRECTIONS_COMMERCIAL_RULES.paymentAcceleratesReview, false)
  assert.equal(CORRECTIONS_COMMERCIAL_RULES.disputeRequiresClaimedProfile, false)
  assert.equal(CORRECTIONS_COMMERCIAL_RULES.disputeRequiresAccount, false)
  assert.equal(CORRECTIONS_COMMERCIAL_RULES.outcomeAffectsOrdering, false)
})

test('dispute dates must be real calendar dates, not merely date-shaped', () => {
  // A regex accepts 2026-02-30 and 2026-13-01. Both then sort perfectly
  // sensibly against real dates and produce a timeline that is silently wrong.
  for (const impossible of ['2026-02-30', '2026-13-01', '2026-04-31', '2025-02-29', '2026-00-10', '2026-01-32']) {
    assert.equal(isRealCalendarDate(impossible), false, `${impossible} is not a real date`)
    assert.throws(() => parseFactDispute({ ...open, submittedOn: impossible }),
      `submittedOn accepted the impossible date ${impossible}`)
  }
  // Leap years are real; the check must not be a blunt 28-day rule.
  assert.equal(isRealCalendarDate('2024-02-29'), true)
  assert.ok(parseFactDispute({ ...open, submittedOn: '2024-02-29' }))

  // Shape failures still fail.
  for (const malformed of ['2026-8-01', '20260801', '2026-08-01T00:00:00.000Z', '', 'yesterday']) {
    assert.equal(isRealCalendarDate(malformed), false)
    assert.throws(() => parseFactDispute({ ...open, submittedOn: malformed }))
  }
})

test('a resolution date is validated as strictly as a submission date', () => {
  const resolved = {
    ...open,
    state: 'upheld_fact_corrected' as const,
    resolvedOn: '2026-08-06',
    resolutionNote: 'The certificate was re-read against the issuer record and the published value was updated.',
    resolvedByRole: 'directory_operator' as const,
    factIsContested: false,
  }
  assert.ok(parseFactDispute(resolved))
  assert.throws(() => parseFactDispute({ ...resolved, resolvedOn: '2026-02-30' }),
    'an impossible resolution date must be rejected before the ordering check runs')
  // Same-day resolution is legitimate; only strictly-before is impossible.
  assert.ok(parseFactDispute({ ...resolved, resolvedOn: resolved.submittedOn }))
  assert.throws(() => parseFactDispute({ ...resolved, resolvedOn: '2026-07-31' }),
    'resolution one day before submission must be rejected')
})

test('the promise is stated as intent and passes the constitutional audit', () => {
  for (const line of CORRECTIONS_PROMISE) {
    assert.match(line, /^Intended: /, `promise must be marked as intent: "${line}"`)
    const audit = auditResponse(line)
    assert.deepEqual(audit.violations, [], `copy crosses a boundary: "${line}"`)
  }
  const joined = CORRECTIONS_PROMISE.join(' ').toLowerCase()
  assert.match(joined, /without an account/)
  assert.match(joined, /stays visible/)
  assert.match(joined, /residential address/)
})
