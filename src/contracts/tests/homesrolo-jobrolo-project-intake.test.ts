import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
  HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT,
  HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
  homesroloJobroloCanonicalJson,
  homesroloJobroloDisclosure,
  homesroloJobroloProjectIntakeReceiptSchema,
  homesroloJobroloReceiptSigningMaterial,
  homesroloJobroloRequestSigningMaterial,
  homesroloJobroloSha256,
  parseHomesroloJobroloProjectIntake,
  type HomesroloJobroloProjectIntake,
} from '../homesrolo-jobrolo-project-intake.v1.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const SUBMITTED_AT = '2026-08-12T15:00:00.000Z'

function request() {
  const value = {
    contractVersion: HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    submissionRef: ref('hsub', 's'),
    source: { homeRef: ref('hhom', 'h'), projectRef: ref('hprj', 'p') },
    submittedAt: SUBMITTED_AT,
    consent: {
      version: HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
      acceptedAt: SUBMITTED_AT,
      statementDigest: homesroloJobroloSha256(HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT),
      disclosureDigest: '',
    },
    homeowner: {
      name: 'Home Owner',
      email: 'home@example.com',
      preferredContact: 'email' as const,
    },
    property: { label: 'The homeowner supplied property location' },
    project: {
      title: 'Roof repair',
      category: 'roofing' as const,
      status: 'planned' as const,
      summary: 'Timing: As soon as possible\n\nActive leak near the back room.',
    },
    attachments: [{
      artifactRef: ref('hart', 'a'),
      displayName: 'roof-photo.jpg',
      kind: 'photo' as const,
      mediaType: 'image/jpeg' as const,
      byteLength: 1024,
      sha256: 'a'.repeat(64),
      downloadUrl: 'https://storage.example.test/object/sign/private/token',
      downloadExpiresAt: '2026-08-12T15:05:00.000Z',
    }],
  }
  value.consent.disclosureDigest = homesroloJobroloSha256(homesroloJobroloDisclosure(value))
  return value
}

function withDisclosure(value: HomesroloJobroloProjectIntake): HomesroloJobroloProjectIntake {
  return {
    ...value,
    consent: {
      ...value.consent,
      disclosureDigest: homesroloJobroloSha256(homesroloJobroloDisclosure(value)),
    },
  }
}

test('project intake accepts only the minimized exact consent-bound envelope', () => {
  assert.deepEqual(parseHomesroloJobroloProjectIntake(request()), request())
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...request(),
    recipientUserId: 'browser-chosen-recipient',
  }))
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...request(),
    consent: { ...request().consent, statementDigest: '0'.repeat(64) },
  }), /consent statement digest/)
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...request(),
    homeowner: { ...request().homeowner, name: 'Changed after consent' },
  }), /disclosure digest/)
})

test('phone and text contact require one canonical phone number', () => {
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...request(),
    homeowner: { ...request().homeowner, preferredContact: 'text' },
  }))
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...request(),
    homeowner: { ...request().homeowner, preferredContact: 'phone', phone: '555-555-1212' },
  }))
  assert.doesNotThrow(() => parseHomesroloJobroloProjectIntake(withDisclosure({
    ...request(),
    homeowner: { ...request().homeowner, preferredContact: 'text', phone: '+12145551212' },
  })))
})

test('selected artifacts are unique, bounded, and expire within five minutes', () => {
  const base = request()
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...base,
    attachments: [base.attachments[0], { ...base.attachments[0] }],
  }))
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...base,
    attachments: [{
      ...base.attachments[0],
      downloadExpiresAt: '2026-08-12T15:05:00.001Z',
    }],
  }))
  assert.throws(() => parseHomesroloJobroloProjectIntake({
    ...base,
    attachments: [{ ...base.attachments[0], downloadUrl: 'http://storage.example.test/file' }],
  }))
})

test('canonical JSON, request signing, and signed receipt bind the exact exchange', () => {
  assert.equal(homesroloJobroloCanonicalJson({ z: 1, a: { d: 2, c: 3 } }),
    '{"a":{"c":3,"d":2},"z":1}')
  const bodySha256 = homesroloJobroloSha256(request())
  assert.equal(homesroloJobroloRequestSigningMaterial({
    method: 'POST',
    pathname: '/api/integrations/homesrolo/v1/project-intakes',
    timestamp: SUBMITTED_AT,
    nonce: 'n'.repeat(22),
    bodySha256,
  }), [
    HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    'POST',
    '/api/integrations/homesrolo/v1/project-intakes',
    SUBMITTED_AT,
    'n'.repeat(22),
    bodySha256,
  ].join('\n'))

  const receipt = homesroloJobroloProjectIntakeReceiptSchema.parse({
    contractVersion: HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    submissionRef: ref('hsub', 's'),
    receiptRef: ref('hjrc', 'r'),
    status: 'awaiting_chance_review',
    acceptedAt: SUBMITTED_AT,
    replayed: false,
    requestNonce: 'n'.repeat(22),
    requestBodySha256: bodySha256,
    disclosureDigest: request().consent.disclosureDigest,
  })
  assert.match(homesroloJobroloReceiptSigningMaterial(receipt), /awaiting_chance_review/)
  assert.match(homesroloJobroloReceiptSigningMaterial(receipt), new RegExp(bodySha256))
})
