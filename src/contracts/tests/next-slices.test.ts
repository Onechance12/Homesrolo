import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPANY_LINK_ASSERTION_VERSION,
  COMPANY_LINK_BINDING_VERSION,
  COMPANY_LINK_DESIGN_BLOCKERS,
  COMPANY_LINK_STATUS,
  COMPANY_LINK_STRUCTURAL_WARNING,
  CONTENT_MUST_NEVER_CARRY,
  LINKED_CONTENT_SOURCE,
  companyLinkAssertionSchema,
  companyLinkContentSchema,
  companyLinkPhase0Decision,
  companyLinkReplayKey,
  companyLinkSigningPayload,
  parseCompanyLinkAssertion,
  parseCompanyLinkBinding,
  parseCompanyLinkContent,
  parseCompanyLinkRevocation,
  COMPANY_LINK_REVOCATION_VERSION,
} from '../company-link.v1.ts'
import {
  CONTENT_CLASSES,
  HOME_FILE_RECORD_STATUS,
  PROHIBITED_CLASSES,
  RETENTION_CLASSES,
  isRealCalendarDate,
  parseContribution,
  parseWorkRecord,
  resolveVisibility,
  workRecordSchema,
} from '../home-file-record.v1.ts'
import {
  homeownerShareSha256,
  parseHomeownerShareRevocationReceipt,
} from '../homeowner-share.v1.ts'

const body = (c: string) => c.repeat(43).slice(0, 43)
const SIG = Buffer.alloc(64, 7).toString('base64url')

// =============================================================================
// company-link.v1
// =============================================================================

const assertion = {
  receiptVersion: COMPANY_LINK_ASSERTION_VERSION,
  issuer: 'jobrolo' as const,
  audience: 'homesrolo' as const,
  purpose: 'company_profile_control' as const,
  assertionId: `hcla_${body('a')}`,
  tenantRef: `htnt_${body('t')}`,
  companyRef: `hcmp_${body('c')}`,
  assertedByRole: 'owner' as const,
  assertedActorRef: `hactor_${body('o')}`,
  assertionPolicyVersion: 'jobrolo-company-control.v1' as const,
  assertedAt: '2026-08-09T12:00:00.000Z',
  expiresAt: '2026-09-09T12:00:00.000Z',
  signing: { algorithm: 'Ed25519' as const, keyId: 'jobrolo-2026-01', signature: SIG },
}

test('nothing in the company link claims to be implemented', () => {
  for (const [field, value] of Object.entries(COMPANY_LINK_STATUS)) {
    assert.equal(value, false, `COMPANY_LINK_STATUS.${field} must stay false until built`)
  }
  assert.match(COMPANY_LINK_ASSERTION_VERSION, /-draft$/)
  assert.match(COMPANY_LINK_BINDING_VERSION, /-draft$/)
  assert.match(COMPANY_LINK_STRUCTURAL_WARNING, /does not verify a signature/)
})

test('the assertion parses and is strict about issuer, audience, and id shapes', () => {
  assert.ok(companyLinkAssertionSchema.parse(assertion))
  assert.throws(() => companyLinkAssertionSchema.parse({ ...assertion, issuer: 'homesrolo' }),
    'only Jobrolo can assert that a tenant controls a business')
  assert.throws(() => companyLinkAssertionSchema.parse({ ...assertion, assertedByRole: 'crew' }))
  assert.throws(() => companyLinkAssertionSchema.parse({ ...assertion, tenantRef: 'Titan Reconstruction' }),
    'a tenant reference must be opaque, never a company name')
  assert.throws(() => companyLinkAssertionSchema.parse({ ...assertion, extra: 1 }))
})

test('replay identity reuses the homeowner-share derivation exactly', () => {
  assert.equal(
    companyLinkReplayKey(assertion),
    homeownerShareSha256([assertion.receiptVersion, assertion.issuer, assertion.assertionId]),
    'a second derivation would be a third protocol; there must only be one',
  )
})

test('the signing payload drops only the signature', () => {
  const payload = companyLinkSigningPayload(assertion)
  assert.ok(payload.includes('"keyId":"jobrolo-2026-01"'), 'key selection must be inside the signed bytes')
  assert.ok(payload.includes('"algorithm":"Ed25519"'))
  assert.equal(payload.includes(SIG), false, 'the signature cannot sign itself')
})

test('linked content is structurally incapable of verifying the company', () => {
  const content = {
    envelopeVersion: 'company-link.content.v1-draft' as const,
    companyRef: `hcmp_${body('c')}`,
    tenantRef: `htnt_${body('t')}`,
    submittedAt: '2026-08-09T12:00:00.000Z',
    summary: 'A sample company-authored description of the services offered.',
    draftedByAssistant: false,
    approvedByRole: 'owner' as const,
  }
  assert.ok(companyLinkContentSchema.parse(content))

  // Every field that would let a company verify itself is rejected.
  for (const forbidden of CONTENT_MUST_NEVER_CARRY) {
    assert.throws(
      () => companyLinkContentSchema.parse({ ...content, [forbidden]: 'x' }),
      `content must not be able to carry "${forbidden}"`,
    )
  }
  assert.equal(LINKED_CONTENT_SOURCE, 'company_self_reported')
})

test('assistant-drafted content is flagged and still needs company approval', () => {
  const drafted = {
    envelopeVersion: 'company-link.content.v1-draft' as const,
    companyRef: `hcmp_${body('c')}`,
    tenantRef: `htnt_${body('t')}`,
    submittedAt: '2026-08-09T12:00:00.000Z',
    summary: 'A sample description an assistant drafted for the company to review.',
    draftedByAssistant: true,
    approvedByRole: 'owner' as const,
  }
  const parsed = companyLinkContentSchema.parse(drafted)
  assert.equal(parsed.draftedByAssistant, true, 'the provenance of wording must survive')
  // There is no path that submits without an approving human role.
  const { approvedByRole: _dropped, ...unapproved } = drafted
  assert.throws(() => companyLinkContentSchema.parse(unapproved),
    'an assistant may propose, but a person approves')
})

test('phase 0 authorizes no company link', () => {
  const decision = companyLinkPhase0Decision()
  assert.equal(decision.authorized, false)
  assert.match(decision.reason, /phase0/)
})

// =============================================================================
// home-file-record.v1
// =============================================================================

const contribution = {
  recordVersion: 'home-file-record.v1-draft' as const,
  contributionRef: `hcon_${body('n')}`,
  homeRef: `hhom_${body('h')}`,
  submittingActorRef: `hactor_${body('s')}`,
  verifiedControllerRef: `hctl_${body('v')}`,
  contentClass: 'property_fact' as const,
  retentionClass: 'durable_property_record' as const,
  payloadSha256: 'a'.repeat(64),
  payloadVersion: 1,
  createdAt: '2026-08-09T12:00:00.000Z',
}

test('nothing in the home file record claims to be implemented', () => {
  for (const [field, value] of Object.entries(HOME_FILE_RECORD_STATUS)) {
    assert.equal(value, false, `HOME_FILE_RECORD_STATUS.${field} must stay false until built`)
  }
})

test('the submitting actor and the verified controller are separate fields', () => {
  const parsed = parseContribution(contribution)
  assert.notEqual(parsed.submittingActorRef, parsed.verifiedControllerRef)
  // Neither may be omitted: collapsing them is the bug this design exists to stop.
  const { verifiedControllerRef: _c, ...noController } = contribution
  assert.throws(() => parseContribution(noController))
  const { submittingActorRef: _s, ...noActor } = contribution
  assert.throws(() => parseContribution(noActor))
})

test('person data can never be classified as a durable property record', () => {
  for (const personClass of ['person_identifier', 'person_contact'] as const) {
    assert.throws(
      () => parseContribution({
        ...contribution,
        contentClass: personClass,
        retentionClass: 'durable_property_record',
      }),
      `${personClass} must stay deletable, or statutory deletion rights become impossible`,
    )
    // The same class with a deletable retention is fine.
    assert.ok(parseContribution({
      ...contribution,
      contentClass: personClass,
      retentionClass: 'deletable_on_request',
    }))
  }
})

test('claim material has no class in this lane', () => {
  for (const prohibited of PROHIBITED_CLASSES) {
    assert.equal((CONTENT_CLASSES as readonly string[]).includes(prohibited), false,
      `${prohibited} must not be expressible as a content class`)
    assert.throws(() => parseContribution({ ...contribution, contentClass: prohibited }))
  }
})

test('content under legal hold cannot be tombstoned', () => {
  assert.throws(() => parseContribution({
    ...contribution,
    retentionClass: 'legal_hold',
    tombstonedAt: '2026-08-09T13:00:00.000Z',
  }))
  assert.ok(RETENTION_CLASSES.includes('legal_hold'))
})

test('a release must record who released it and when', () => {
  const base = {
    recordVersion: 'home-file-record.v1-draft' as const,
    workRecordRef: `hwrk_${body('w')}`,
    homeRef: `hhom_${body('h')}`,
    companyRef: `hcmp_${body('c')}`,
    performedOn: '2026-05-18',
    state: 'recorded' as const,
  }
  assert.ok(parseWorkRecord(base))
  assert.throws(() => parseWorkRecord({ ...base, state: 'released' }),
    'a release with no releasing controller is exactly the overclaim already retracted once')
  assert.ok(parseWorkRecord({
    ...base,
    state: 'released',
    releasedByControllerRef: `hctl_${body('v')}`,
    releasedAt: '2026-05-20T12:00:00.000Z',
  }))
  assert.throws(() => parseWorkRecord({
    ...base,
    state: 'release_revoked',
    releasedByControllerRef: `hctl_${body('v')}`,
    releasedAt: '2026-05-20T12:00:00.000Z',
  }), 'a revocation must record when')
  assert.ok(workRecordSchema)
})

// =============================================================================
// Visibility: two doors, and Phase 0 opens neither
// =============================================================================

test('visibility cannot be granted, and membership is not a basis', () => {
  const parsed = parseContribution(contribution)

  // No basis at all.
  assert.equal(resolveVisibility({ contribution: parsed }).visible, false)

  // Matching controller is a candidate basis, and still not access in Phase 0.
  const asController = resolveVisibility({
    contribution: parsed,
    viewerControllerRef: parsed.verifiedControllerRef,
  })
  assert.equal(asController.visible, false)
  assert.match(asController.reason, /phase0/)

  // A share for a DIFFERENT contribution grants nothing.
  const wrongShare = resolveVisibility({
    contribution: parsed,
    activeShareBinding: { contributionRef: `hcon_${body('z')}`, live: true },
  })
  assert.equal(wrongShare.visible, false)
  assert.equal(wrongShare.reason, 'no_candidate_basis')

  // An expired share grants nothing.
  const deadShare = resolveVisibility({
    contribution: parsed,
    activeShareBinding: { contributionRef: parsed.contributionRef, live: false },
  })
  assert.equal(deadShare.reason, 'no_candidate_basis')
})

test('the visibility resolver is not even given the fields that are not authority', () => {
  // Address, parcel, occupancy, and membership are absent from the signature by
  // design: a function cannot misuse an argument it never receives.
  const source = resolveVisibility.toString()
  for (const forbidden of ['address', 'parcel', 'geocode', 'occupan', 'membership']) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'),
      `the resolver must not reference ${forbidden}`)
  }
})


// =============================================================================
// Hardening: shapes that are well-formed but describe impossible events
// =============================================================================

test('an assertion or binding must expire after it begins', () => {
  assert.ok(parseCompanyLinkAssertion(assertion))
  assert.throws(() => parseCompanyLinkAssertion({ ...assertion, expiresAt: assertion.assertedAt }),
    /expire after/, 'equal instants are a zero-length authority')
  assert.throws(() => parseCompanyLinkAssertion({ ...assertion, expiresAt: '2026-08-08T12:00:00.000Z' }),
    /expire after/)

  const binding = {
    receiptVersion: COMPANY_LINK_BINDING_VERSION,
    issuer: 'homesrolo' as const,
    audience: 'jobrolo' as const,
    purpose: 'company_profile_control' as const,
    bindingId: `hbnd_${body('b')}`,
    companyRef: `hcmp_${body('c')}`,
    tenantRef: `htnt_${body('t')}`,
    assertionDigest: 'a'.repeat(64),
    boundAt: '2026-08-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:00:00.000Z',
    signing: { algorithm: 'Ed25519' as const, keyId: 'homesrolo-2026-01', signature: SIG },
  }
  assert.ok(parseCompanyLinkBinding(binding))
  assert.throws(() => parseCompanyLinkBinding({ ...binding, expiresAt: binding.boundAt }), /expire after/)
})

test('a revocation must cross between the two systems', () => {
  const revocation = {
    receiptVersion: COMPANY_LINK_REVOCATION_VERSION,
    issuer: 'jobrolo' as const,
    audience: 'homesrolo' as const,
    purpose: 'company_profile_control' as const,
    revocationId: `hclr_${body('r')}`,
    companyRef: `hcmp_${body('c')}`,
    revokedReceiptVersion: COMPANY_LINK_ASSERTION_VERSION,
    revokedReceiptRef: `hcla_${body('a')}`,
    reasonCode: 'control_withdrawn' as const,
    revokedAt: '2026-08-10T12:00:00.000Z',
    signing: { algorithm: 'Ed25519' as const, keyId: 'jobrolo-2026-01', signature: SIG },
  }
  assert.ok(parseCompanyLinkRevocation(revocation))

  for (const same of ['jobrolo', 'homesrolo'] as const) {
    assert.throws(
      () => parseCompanyLinkRevocation({ ...revocation, issuer: same, audience: same }),
      /opposite systems/,
      'a system revoking to itself is a local state change, not a wire event',
    )
  }
})

test('a revocation target version must match the referenced receipt type', () => {
  const base = {
    receiptVersion: COMPANY_LINK_REVOCATION_VERSION,
    issuer: 'jobrolo' as const,
    audience: 'homesrolo' as const,
    purpose: 'company_profile_control' as const,
    revocationId: `hclr_${body('r')}`,
    companyRef: `hcmp_${body('c')}`,
    reasonCode: 'control_withdrawn' as const,
    revokedAt: '2026-08-10T12:00:00.000Z',
    signing: { algorithm: 'Ed25519' as const, keyId: 'jobrolo-2026-01', signature: SIG },
  }
  // assertion version + binding ref
  assert.throws(() => parseCompanyLinkRevocation({
    ...base,
    revokedReceiptVersion: COMPANY_LINK_ASSERTION_VERSION,
    revokedReceiptRef: `hbnd_${body('b')}`,
  }), /does not match/)
  // binding version + assertion ref
  assert.throws(() => parseCompanyLinkRevocation({
    ...base,
    revokedReceiptVersion: COMPANY_LINK_BINDING_VERSION,
    revokedReceiptRef: `hcla_${body('a')}`,
  }), /does not match/)
  // matched pairs parse
  assert.ok(parseCompanyLinkRevocation({
    ...base,
    revokedReceiptVersion: COMPANY_LINK_BINDING_VERSION,
    revokedReceiptRef: `hbnd_${body('b')}`,
  }))
})

test('a content envelope carrying no content is not a change', () => {
  const empty = {
    envelopeVersion: 'company-link.content.v1-draft' as const,
    companyRef: `hcmp_${body('c')}`,
    tenantRef: `htnt_${body('t')}`,
    submittedAt: '2026-08-09T12:00:00.000Z',
    draftedByAssistant: false,
    approvedByRole: 'owner' as const,
  }
  assert.throws(() => parseCompanyLinkContent(empty), /at least one populated/)
  // Present but empty arrays are still nothing.
  assert.throws(() => parseCompanyLinkContent({ ...empty, photoRefs: [], serviceAreas: [] }),
    /at least one populated/)
  // One populated field is a valid partial update.
  assert.ok(parseCompanyLinkContent({ ...empty, serviceAreas: ['Sample Metro — North'] }))
})

test('calendar dates are validated, not pattern-matched', () => {
  assert.equal(isRealCalendarDate('2026-05-18'), true)
  for (const impossible of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '20260518']) {
    assert.equal(isRealCalendarDate(impossible), false, `${impossible} must be refused`)
  }
  const base = {
    recordVersion: 'home-file-record.v1-draft' as const,
    workRecordRef: `hwrk_${body('w')}`,
    homeRef: `hhom_${body('h')}`,
    companyRef: `hcmp_${body('c')}`,
    performedOn: '2026-02-30',
    state: 'recorded' as const,
  }
  assert.throws(() => parseWorkRecord(base), 'an impossible performedOn must be refused')
})

test('a release cannot predate the work, and a revocation cannot predate the release', () => {
  const base = {
    recordVersion: 'home-file-record.v1-draft' as const,
    workRecordRef: `hwrk_${body('w')}`,
    homeRef: `hhom_${body('h')}`,
    companyRef: `hcmp_${body('c')}`,
    performedOn: '2026-05-18',
    releasedByControllerRef: `hctl_${body('v')}`,
  }
  assert.throws(() => parseWorkRecord({
    ...base, state: 'released', releasedAt: '2026-05-17T12:00:00.000Z',
  }), /predate the work/)

  assert.throws(() => parseWorkRecord({
    ...base,
    state: 'release_revoked',
    releasedAt: '2026-05-20T12:00:00.000Z',
    revokedAt: '2026-05-19T12:00:00.000Z',
  }), /predate the release/)

  assert.ok(parseWorkRecord({
    ...base,
    state: 'release_revoked',
    releasedAt: '2026-05-20T12:00:00.000Z',
    revokedAt: '2026-06-01T12:00:00.000Z',
  }))
})

test('a contribution cannot supersede itself or be tombstoned before it existed', () => {
  assert.throws(() => parseContribution({ ...contribution, supersededBy: contribution.contributionRef }),
    /supersede itself/)
  assert.ok(parseContribution({ ...contribution, supersededBy: `hcon_${body('z')}` }))

  assert.throws(() => parseContribution({
    ...contribution,
    tombstonedAt: '2026-08-08T12:00:00.000Z',
  }), /tombstoned before/)
  assert.ok(parseContribution({ ...contribution, tombstonedAt: '2026-08-10T12:00:00.000Z' }))
})

// =============================================================================
// Pre-merge hardening: signature canonicality and cross-field state consistency
// =============================================================================

/**
 * The company-link signing proof must behave exactly as the reviewed
 * homeowner-share proof does. Restating the rule in a second file is a drift
 * risk, so this drives both validators over the same values rather than
 * asserting the rule twice.
 */
const shareRevocation = {
  receiptVersion: 'homeowner-share.revocation.v1' as const,
  issuer: 'jobrolo' as const,
  audience: 'homesrolo' as const,
  purpose: 'homeowner_work_records' as const,
  revocationId: `hrev_${body('v')}`,
  shareId: `hshr_${body('s')}`,
  recipientRef: `hrcp_${body('r')}`,
  manifestDigest: 'a'.repeat(64),
  revokedReceiptVersion: 'homeowner-share.authorization.v1' as const,
  revokedReceiptRef: `hauth_${body('a')}`,
  reasonCode: 'authorization_withdrawn' as const,
  revokedAt: '2026-08-09T12:00:00.000Z',
  signing: { algorithm: 'Ed25519' as const, keyId: 'jobrolo-2026-01', signature: SIG },
}

/**
 * 86 base64url characters carry 516 bits; an Ed25519 signature is 512. The four
 * spare bits in the final character are where a second spelling of the same
 * signature hides — regex-valid, decoding to the right 64 bytes, and a distinct
 * string. `Buffer.from` normalises them away, which is what makes the re-encode
 * comparison the check that matters.
 */
function nonCanonicalVariant(canonical: string): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const head = canonical.slice(0, 85)
  for (const candidate of ALPHABET) {
    const variant = `${head}${candidate}`
    if (variant === canonical) continue
    const decoded = Buffer.from(variant, 'base64url')
    if (decoded.byteLength === 64 && decoded.equals(Buffer.from(canonical, 'base64url'))) {
      return variant
    }
  }
  throw new Error('no non-canonical variant exists for this signature')
}

test('company-link signature validation matches homeowner-share exactly', () => {
  const shareAccepts = (signature: string) => {
    try {
      parseHomeownerShareRevocationReceipt({ ...shareRevocation, signing: { ...shareRevocation.signing, signature } })
      return true
    } catch { return false }
  }
  const linkAccepts = (signature: string) => {
    try {
      parseCompanyLinkAssertion({ ...assertion, signing: { ...assertion.signing, signature } })
      return true
    } catch { return false }
  }

  const wrongLength32 = Buffer.alloc(32, 9).toString('base64url')
  const wrongLength65 = Buffer.alloc(65, 9).toString('base64url')
  const padded = Buffer.alloc(64, 7).toString('base64')
  const candidates = [
    SIG,                                  // canonical, 64 bytes
    Buffer.alloc(64, 0).toString('base64url'),
    nonCanonicalVariant(SIG),             // regex-valid, decodes to 64 bytes, wrong spelling
    wrongLength32,                        // 43 chars, fails the regex
    wrongLength65,                        // 87 chars, fails the regex
    padded,                               // standard base64: '+' '/' '=' outside the alphabet
    `${wrongLength32}${wrongLength32}`,   // 86 chars of the right shape, 64.5 bytes of content
    'z'.repeat(86),
    '',
  ]
  for (const candidate of candidates) {
    assert.equal(linkAccepts(candidate), shareAccepts(candidate),
      `company-link and homeowner-share disagree about ${JSON.stringify(candidate.slice(0, 20))}`)
  }

  // And the specific rules, stated so a failure names the cause.
  assert.ok(linkAccepts(SIG))
  assert.equal(linkAccepts(nonCanonicalVariant(SIG)), false, 'a second spelling would give a replay cache two keys')
  assert.equal(linkAccepts(wrongLength32), false, 'a 32-byte value is not an Ed25519 signature')
  assert.equal(linkAccepts(wrongLength65), false, 'a 65-byte value is not an Ed25519 signature')
  assert.equal(linkAccepts(padded), false, 'standard base64 is a different encoding')
})

test('every company-link receipt type rejects a non-canonical signature', () => {
  const bad = nonCanonicalVariant(SIG)
  assert.throws(() => parseCompanyLinkAssertion({ ...assertion, signing: { ...assertion.signing, signature: bad } }))
  assert.throws(() => parseCompanyLinkBinding({
    receiptVersion: COMPANY_LINK_BINDING_VERSION,
    issuer: 'homesrolo',
    audience: 'jobrolo',
    purpose: 'company_profile_control',
    bindingId: `hbnd_${body('b')}`,
    companyRef: `hcmp_${body('c')}`,
    tenantRef: `htnt_${body('t')}`,
    assertionDigest: 'a'.repeat(64),
    boundAt: '2026-08-09T12:00:00.000Z',
    expiresAt: '2026-09-09T12:00:00.000Z',
    signing: { algorithm: 'Ed25519', keyId: 'homesrolo-2026-01', signature: bad },
  }))
  assert.throws(() => parseCompanyLinkRevocation({
    receiptVersion: COMPANY_LINK_REVOCATION_VERSION,
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: 'company_profile_control',
    revocationId: `hclr_${body('r')}`,
    companyRef: `hcmp_${body('c')}`,
    revokedReceiptVersion: COMPANY_LINK_ASSERTION_VERSION,
    revokedReceiptRef: `hcla_${body('a')}`,
    reasonCode: 'control_withdrawn',
    revokedAt: '2026-08-10T12:00:00.000Z',
    signing: { algorithm: 'Ed25519', keyId: 'jobrolo-2026-01', signature: bad },
  }))
})

test('a work record may not carry evidence its state contradicts', () => {
  const base = {
    recordVersion: 'home-file-record.v1-draft' as const,
    workRecordRef: `hwrk_${body('w')}`,
    homeRef: `hhom_${body('h')}`,
    companyRef: `hcmp_${body('c')}`,
    performedOn: '2026-05-18',
  }
  const controller = `hctl_${body('v')}`
  const releasedAt = '2026-05-20T12:00:00.000Z'
  const revokedAt = '2026-06-01T12:00:00.000Z'

  // Not-yet-released states carry no release or revocation evidence at all. A
  // `recorded` row holding `releasedAt` is a published record wearing a private
  // state, and every reader that trusts the state is then wrong.
  for (const state of ['recorded', 'release_proposed'] as const) {
    assert.ok(parseWorkRecord({ ...base, state }))
    assert.throws(() => parseWorkRecord({ ...base, state, releasedAt }), /may not carry release or revocation/)
    assert.throws(() => parseWorkRecord({ ...base, state, releasedByControllerRef: controller }),
      /may not carry release or revocation/)
    assert.throws(() => parseWorkRecord({ ...base, state, revokedAt }), /may not carry release or revocation/)
  }

  // Released requires both release fields and no revocation field.
  assert.ok(parseWorkRecord({ ...base, state: 'released', releasedByControllerRef: controller, releasedAt }))
  assert.throws(() => parseWorkRecord({ ...base, state: 'released', releasedAt }), /missing releasedByControllerRef/)
  assert.throws(() => parseWorkRecord({ ...base, state: 'released', releasedByControllerRef: controller }),
    /missing releasedAt/)
  assert.throws(() => parseWorkRecord({
    ...base, state: 'released', releasedByControllerRef: controller, releasedAt, revokedAt,
  }), /may not carry revocation fields/)

  // Revoked requires the whole history: what was released, by whom, and when it
  // was withdrawn. A revocation with no release describes nothing.
  assert.ok(parseWorkRecord({
    ...base, state: 'release_revoked', releasedByControllerRef: controller, releasedAt, revokedAt,
  }))
  assert.throws(() => parseWorkRecord({ ...base, state: 'release_revoked', revokedAt }),
    /missing releasedByControllerRef, releasedAt/)
  assert.throws(() => parseWorkRecord({
    ...base, state: 'release_revoked', releasedByControllerRef: controller, releasedAt,
  }), /missing revokedAt/)
})

test('open design questions are recorded as blockers, not answered', () => {
  // Item 4 of the pre-merge brief: document what is unsettled, invent nothing.
  // These constants exist so that shipping transport without settling them is a
  // visible omission. The test therefore checks both that the blockers are
  // stated AND that the schemas still refuse to answer them.
  assert.ok(COMPANY_LINK_DESIGN_BLOCKERS.length >= 6)
  for (const blocker of COMPANY_LINK_DESIGN_BLOCKERS) {
    assert.match(blocker, /^Blocker: /, `must read as unresolved: "${blocker}"`)
  }
  const joined = COMPANY_LINK_DESIGN_BLOCKERS.join(' ')
  for (const topic of [/transport envelope/, /revision/, /digest/, /unsigned/, /TTL caps/, /revocation/]) {
    assert.match(joined, topic)
  }

  // No transport, revision, or TTL cap was invented in the schemas.
  const contentFields = Object.keys(companyLinkContentSchema.shape)
  for (const invented of ['revision', 'sequence', 'signing', 'envelope', 'transport', 'digest']) {
    assert.equal(contentFields.includes(invented), false,
      `"${invented}" would be answering a blocker instead of recording it`)
  }
  // A ten-year assertion still validates, because no cap has been agreed. This
  // asserts the gap deliberately: when Jobrolo settles a cap, this line must
  // fail and be updated, rather than the gap persisting unnoticed.
  assert.ok(parseCompanyLinkAssertion({ ...assertion, expiresAt: '2036-08-09T12:00:00.000Z' }),
    'no TTL cap is agreed yet; COMPANY_LINK_DESIGN_BLOCKERS records this')
  assert.equal(COMPANY_LINK_STATUS.transportImplemented, false)
})
