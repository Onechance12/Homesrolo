import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'
import {
  JOBROLO_HANDOFF_ARTIFACT_TIMEOUT_MS,
  JOBROLO_HANDOFF_TRANSPORT_VERSION,
  JobroloHandoffTransportError,
  SignedJobroloHandoffClient,
  jobroloHandoffRequestSigningMaterial,
  jobroloHandoffResponseSigningMaterial,
  readJobroloHandoffClientConfiguration,
} from '../server/jobrolo-handoff-client.ts'
import { HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES } from '../../../../src/homeowner/home-record-handoff.v1.ts'

const SECRET = 'dedicated-handoff-secret-at-least-thirty-two-bytes'
const NOW = '2026-08-24T15:00:00.000Z'
const NONCE = 'n'.repeat(32)
const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const shareId = ref('hshr', 's')
const recipientRef = ref('hrcp', 'r')
const artifactRef = ref('hproj', 'a')

const configuration = {
  origin: 'https://jobrolo.example.test',
  clientId: 'homesrolo-handoff-test',
  sharedSecret: SECRET,
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(value: string) {
  return createHmac('sha256', SECRET).update(value, 'utf8').digest('base64url')
}

function signedResponse(input: {
  readonly request: RequestInit
  readonly pathname: string
  readonly body: string | Uint8Array
  readonly status?: number
  readonly contentType: string
  readonly extraHeaders?: Readonly<Record<string, string>>
}) {
  const requestHeaders = input.request.headers as Record<string, string>
  const bodyBytes = typeof input.body === 'string'
    ? Uint8Array.from(Buffer.from(input.body, 'utf8'))
    : input.body
  const responseSha256 = sha256(bodyBytes)
  const status = input.status ?? 200
  const responseSignature = hmac(jobroloHandoffResponseSigningMaterial({
    pathname: input.pathname,
    requestTimestamp: requestHeaders['x-homesrolo-timestamp']!,
    requestNonce: requestHeaders['x-homesrolo-nonce']!,
    requestBodySha256: requestHeaders['x-homesrolo-body-sha256']!,
    statusCode: status,
    contentType: input.contentType,
    responseBodySha256: responseSha256,
  }))
  return new Response(Uint8Array.from(bodyBytes).buffer, {
    status,
    headers: {
      'content-type': input.contentType,
      'content-length': String(bodyBytes.byteLength),
      'x-jobrolo-transport-version': JOBROLO_HANDOFF_TRANSPORT_VERSION,
      'x-jobrolo-response-sha256': responseSha256,
      'x-jobrolo-response-signature': responseSignature,
      ...input.extraHeaders,
    },
  })
}

test('handoff client configuration is independently default-off and pins an origin only', () => {
  assert.equal(readJobroloHandoffClientConfiguration({}), null)
  const environment = {
    HOMESROLO_JOBROLO_HANDOFF_ENABLED: 'true',
    HOMESROLO_JOBROLO_HANDOFF_ORIGIN: configuration.origin,
    HOMESROLO_JOBROLO_HANDOFF_CLIENT_ID: configuration.clientId,
    HOMESROLO_JOBROLO_HANDOFF_SHARED_SECRET: configuration.sharedSecret,
  }
  assert.deepEqual(readJobroloHandoffClientConfiguration(environment), configuration)
  assert.equal(readJobroloHandoffClientConfiguration({
    ...environment,
    HOMESROLO_JOBROLO_HANDOFF_ORIGIN: `${configuration.origin}/api/other`,
  }), null)
  assert.equal(readJobroloHandoffClientConfiguration({
    ...environment,
    HOMESROLO_JOBROLO_HANDOFF_ENABLED: 'false',
  }), null)
})

test('claim request and JSON response are exact-path, nonce, digest, and HMAC bound', async () => {
  let observed: RequestInit | undefined
  const pathname = `/api/integrations/homesrolo/v1/project-handoffs/${shareId}/claim`
  const fetchImpl: typeof fetch = async (url, request) => {
    observed = request
    assert.equal(new URL(String(url)).pathname, pathname)
    return signedResponse({
      request: request!,
      pathname,
      body: JSON.stringify({ manifest: { exact: true }, authorization: { signed: true } }),
      contentType: 'application/json; charset=utf-8',
    })
  }
  const client = new SignedJobroloHandoffClient({
    configuration,
    fetchImpl,
    now: () => NOW,
    nonce: () => NONCE,
  })
  const result = await client.claim({ shareId, recipientRef })
  assert.equal(result.state, 'active')
  const headers = observed?.headers as Record<string, string>
  const body = String(observed?.body)
  const bodySha256 = sha256(body)
  assert.equal(headers.authorization, `Homesrolo-Handoff-HMAC ${configuration.clientId}`)
  assert.equal(headers['x-homesrolo-body-sha256'], bodySha256)
  assert.equal(headers['x-homesrolo-signature'], hmac(jobroloHandoffRequestSigningMaterial({
    method: 'POST',
    pathname,
    timestamp: NOW,
    nonce: NONCE,
    bodySha256,
  })))
  assert.equal(observed?.redirect, 'error')
})

test('artifact responses require request-bound HMAC, descriptor digest, and exact bytes', async () => {
  const pathname = `/api/integrations/homesrolo/v1/project-handoffs/${shareId}/artifacts/${artifactRef}`
  const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF\n'))
  let observed: RequestInit | undefined
  const fetchImpl: typeof fetch = async (_url, request) => {
    observed = request
    return signedResponse({
      request: request!,
      pathname,
      body: bytes,
      contentType: 'application/pdf',
      extraHeaders: { 'x-jobrolo-artifact-sha256': sha256(bytes) },
    })
  }
  const client = new SignedJobroloHandoffClient({
    configuration,
    fetchImpl,
    now: () => NOW,
    nonce: () => NONCE,
  })
  const result = await client.fetchArtifact({
    shareId,
    artifactRef,
    manifestDigest: 'a'.repeat(64),
    consent: {} as never,
  })
  assert.equal(result.payloadSha256, sha256(bytes))
  assert.deepEqual(result.bytes, bytes)
  assert.equal((observed?.headers as Record<string, string>).accept, 'application/pdf')
  assert.equal(JOBROLO_HANDOFF_ARTIFACT_TIMEOUT_MS, 15_000)
  assert.equal(HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES, 1024 * 1024)

  const tampered = new SignedJobroloHandoffClient({
    configuration,
    fetchImpl: async (_url, request) => {
      const response = signedResponse({
        request: request!,
        pathname,
        body: bytes,
        contentType: 'application/pdf',
        extraHeaders: { 'x-jobrolo-artifact-sha256': sha256(bytes) },
      })
      response.headers.set('x-jobrolo-response-signature', 'x'.repeat(43))
      return response
    },
    now: () => NOW,
    nonce: () => NONCE,
  })
  await assert.rejects(tampered.fetchArtifact({
    shareId,
    artifactRef,
    manifestDigest: 'a'.repeat(64),
    consent: {} as never,
  }), (error: unknown) => error instanceof JobroloHandoffTransportError
    && error.disposition === 'unknown_outcome')
})

test('artifact transport rejects photos and advertised bytes above the completion-PDF cap', async () => {
  const pathname = `/api/integrations/homesrolo/v1/project-handoffs/${shareId}/artifacts/${artifactRef}`
  const pdf = Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF\n'))
  for (const fetchImpl of [
    (async (_url: URL | RequestInfo, request?: RequestInit) => signedResponse({
      request: request!,
      pathname,
      body: Uint8Array.from([0xff, 0xd8, 0xff]),
      contentType: 'image/jpeg',
      extraHeaders: { 'x-jobrolo-artifact-sha256': sha256(Uint8Array.from([0xff, 0xd8, 0xff])) },
    })) as typeof fetch,
    (async (_url: URL | RequestInfo, request?: RequestInit) => signedResponse({
      request: request!,
      pathname,
      body: pdf,
      contentType: 'application/pdf',
      extraHeaders: {
        'content-length': String(HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES + 1),
        'x-jobrolo-artifact-sha256': sha256(pdf),
      },
    })) as typeof fetch,
  ]) {
    const client = new SignedJobroloHandoffClient({
      configuration,
      fetchImpl,
      now: () => NOW,
      nonce: () => NONCE,
    })
    await assert.rejects(client.fetchArtifact({
      shareId,
      artifactRef,
      manifestDigest: 'a'.repeat(64),
      consent: {} as never,
    }), (error: unknown) => error instanceof JobroloHandoffTransportError
      && error.disposition === 'unknown_outcome')
  }
})
