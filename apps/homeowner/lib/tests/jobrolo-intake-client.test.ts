import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
  HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT,
  HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
  homesroloJobroloCanonicalJson,
  homesroloJobroloDisclosure,
  homesroloJobroloReceiptSigningMaterial,
  homesroloJobroloSha256,
  type HomesroloJobroloProjectIntake,
} from '../../../../src/contracts/homesrolo-jobrolo-project-intake.v1.ts'
import {
  JobroloIntakeDeliveryError,
  SignedJobroloIntakeClient,
  readJobroloIntakeClientConfiguration,
  readJobroloIntakeCredentialResidue,
} from '../server/jobrolo-intake-client.ts'

const SECRET = 'test-secret-value-with-at-least-thirty-two-bytes'
const NOW = '2026-08-12T15:00:00.000Z'
const NONCE = 'n'.repeat(32)
const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`

function intake(): HomesroloJobroloProjectIntake {
  const value: HomesroloJobroloProjectIntake = {
    contractVersion: HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
    submissionRef: ref('hsub', 's'),
    source: { homeRef: ref('hhom', 'h'), projectRef: ref('hprj', 'p') },
    submittedAt: NOW,
    consent: {
      version: HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
      acceptedAt: NOW,
      statementDigest: homesroloJobroloSha256(HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT),
      disclosureDigest: '',
    },
    homeowner: { name: 'Home Owner', email: 'home@example.com', preferredContact: 'email' },
    property: { label: 'Homeowner supplied location' },
    project: { title: 'Roof repair', category: 'roofing', status: 'planned', summary: 'Leak.' },
    attachments: [],
  }
  return {
    ...value,
    consent: {
      ...value.consent,
      disclosureDigest: homesroloJobroloSha256(homesroloJobroloDisclosure(value)),
    },
  }
}

const configuration = {
  endpoint: 'https://jobrolo.example.test/api/integrations/homesrolo/v1/project-intakes',
  clientId: 'homesrolo-production',
  sharedSecret: SECRET,
}

function signature(material: string) {
  return createHmac('sha256', SECRET).update(material, 'utf8').digest('base64url')
}

test('client configuration is default-off and pins the exact endpoint path', () => {
  assert.equal(readJobroloIntakeClientConfiguration({}), null)
  const environment = {
    HOMESROLO_JOBROLO_INTAKE_ENABLED: 'true',
    HOMESROLO_JOBROLO_INTAKE_URL: configuration.endpoint,
    HOMESROLO_JOBROLO_INTAKE_CLIENT_ID: configuration.clientId,
    HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET: configuration.sharedSecret,
  }
  assert.deepEqual(readJobroloIntakeClientConfiguration(environment), configuration)
  assert.equal(readJobroloIntakeClientConfiguration({
    ...environment,
    HOMESROLO_JOBROLO_INTAKE_URL: 'https://jobrolo.example.test/api/canvassing/leads',
  }), null)
  assert.equal(readJobroloIntakeClientConfiguration({
    ...environment,
    HOMESROLO_JOBROLO_INTAKE_ENABLED: 'false',
  }), null)
})

test('handoff separation sees disabled intake credentials and rejects partial residue', () => {
  assert.deepEqual(readJobroloIntakeCredentialResidue({}), {
    state: 'absent',
    credentials: null,
  })
  assert.deepEqual(readJobroloIntakeCredentialResidue({
    HOMESROLO_JOBROLO_INTAKE_ENABLED: 'false',
    HOMESROLO_JOBROLO_INTAKE_CLIENT_ID: configuration.clientId,
    HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET: configuration.sharedSecret,
  }), {
    state: 'valid',
    credentials: {
      clientId: configuration.clientId,
      sharedSecret: configuration.sharedSecret,
    },
  })
  for (const residue of [
    { HOMESROLO_JOBROLO_INTAKE_CLIENT_ID: configuration.clientId },
    { HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET: configuration.sharedSecret },
    {
      HOMESROLO_JOBROLO_INTAKE_CLIENT_ID: 'bad id',
      HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET: configuration.sharedSecret,
    },
    {
      HOMESROLO_JOBROLO_INTAKE_CLIENT_ID: configuration.clientId,
      HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET: 'short',
    },
  ]) {
    assert.deepEqual(readJobroloIntakeCredentialResidue(residue), {
      state: 'invalid',
      credentials: null,
    })
  }
})

test('signed client accepts only a receipt bound to its exact request', async () => {
  const request = intake()
  let observed: RequestInit | undefined
  const fetchImpl: typeof fetch = async (_url, init) => {
    observed = init
    const bodySha256 = (init?.headers as Record<string, string>)['x-homesrolo-body-sha256'] ?? ''
    const receipt = {
      contractVersion: HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
      submissionRef: request.submissionRef,
      receiptRef: ref('hjrc', 'r'),
      status: 'awaiting_chance_review' as const,
      acceptedAt: NOW,
      replayed: false,
      requestNonce: NONCE,
      requestBodySha256: bodySha256,
      disclosureDigest: request.consent.disclosureDigest,
    }
    const body = homesroloJobroloCanonicalJson(receipt)
    return new Response(body, {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'x-jobrolo-receipt-sha256': homesroloJobroloSha256(body),
        'x-jobrolo-receipt-signature': signature(homesroloJobroloReceiptSigningMaterial(receipt)),
      },
    })
  }
  const client = new SignedJobroloIntakeClient({
    configuration,
    fetchImpl,
    now: () => NOW,
    nonce: () => NONCE,
  })
  const receipt = await client.deliver(request)
  assert.equal(receipt.status, 'awaiting_chance_review')
  const headers = observed?.headers as Record<string, string>
  assert.equal(headers.authorization, `Homesrolo-HMAC ${configuration.clientId}`)
  assert.match(headers['x-homesrolo-signature'] ?? '', /^[A-Za-z0-9_-]{43}$/)
  assert.equal(observed?.redirect, 'error')
})

test('network and unsigned HTTP failures are unknown and never automatically retryable', async () => {
  const networkClient = new SignedJobroloIntakeClient({
    configuration,
    fetchImpl: async () => { throw new Error('network') },
    now: () => NOW,
    nonce: () => NONCE,
  })
  await assert.rejects(networkClient.deliver(intake()), (error: unknown) =>
    error instanceof JobroloIntakeDeliveryError && error.disposition === 'unknown_outcome')

  const rejectedClient = new SignedJobroloIntakeClient({
    configuration,
    fetchImpl: async () => new Response('{}', { status: 403, headers: { 'content-type': 'application/json' } }),
    now: () => NOW,
    nonce: () => NONCE,
  })
  await assert.rejects(rejectedClient.deliver(intake()), (error: unknown) =>
    error instanceof JobroloIntakeDeliveryError && error.disposition === 'unknown_outcome')
})
