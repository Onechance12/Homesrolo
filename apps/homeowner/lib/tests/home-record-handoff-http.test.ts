import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  handleHomeRecordHandoffHttp,
  homeRecordHandoffMutationEnvelopeAllowed,
  type HomeRecordHandoffHttpDependencies,
} from '../server/home-record-handoff-http.ts'
import { SESSION_COOKIE_NAME } from '../server/cookie.ts'

const origin = 'https://app.homesrolo.test'
const homeRef = `hhom_${'h'.repeat(43)}`
const shareId = `hshr_${'s'.repeat(43)}`
const sessionHandle = 'k'.repeat(43)
const preview = Object.freeze({ handoffRef: `hhof_${'o'.repeat(43)}`, state: 'received' })

function dependencies(overrides: Partial<HomeRecordHandoffHttpDependencies['service']> = {}): HomeRecordHandoffHttpDependencies {
  return {
    appOrigin: origin,
    service: {
      async list(context, requestedHomeRef) {
        assert.deepEqual(context, { sessionHandle })
        assert.equal(requestedHomeRef, homeRef)
        return [preview] as never
      },
      async preview(context, requestedHomeRef, requestedShareId) {
        assert.deepEqual(context, { sessionHandle })
        assert.equal(requestedHomeRef, homeRef)
        assert.equal(requestedShareId, shareId)
        return preview as never
      },
      async accept(context, requestedHomeRef, requestedShareId, input) {
        assert.deepEqual(context, { sessionHandle })
        assert.equal(requestedHomeRef, homeRef)
        assert.equal(requestedShareId, shareId)
        assert.deepEqual(input, { exact: 'browser body' })
        return { ...preview, state: 'accepted' } as never
      },
      async reject() { return { ...preview, state: 'rejected' } as never },
      async exportHomeRecord(context, requestedHomeRef) {
        assert.deepEqual(context, { sessionHandle })
        assert.equal(requestedHomeRef, homeRef)
        const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
        return {
          fileName: 'homesrolo-home-record.zip' as const,
          mediaType: 'application/zip' as const,
          byteLength: bytes.byteLength,
          payloadSha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
        }
      },
      ...overrides,
    },
  }
}

function get(path: string) {
  return new Request(`${origin}${path}`, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionHandle}`,
      'sec-fetch-site': 'same-origin',
    },
  })
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionHandle}`,
      origin,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

test('disabled handoff routes are undiscoverable and carry private response headers', async () => {
  const response = await handleHomeRecordHandoffHttp(
    get(`/api/v1/homes/${homeRef}/handoffs`),
    homeRef,
    { kind: 'list' },
    null,
  )
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: { code: 'not_found' } })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
})

test('list and preview use only the HttpOnly session handle and exact route refs', async () => {
  const listed = await handleHomeRecordHandoffHttp(
    get(`/api/v1/homes/${homeRef}/handoffs`),
    homeRef,
    { kind: 'list' },
    dependencies(),
  )
  assert.equal(listed.status, 200)
  assert.deepEqual(await listed.json(), { data: [preview] })

  const viewed = await handleHomeRecordHandoffHttp(
    get(`/api/v1/homes/${homeRef}/handoffs/${shareId}`),
    homeRef,
    { kind: 'preview', shareId },
    dependencies(),
  )
  assert.equal(viewed.status, 200)
  assert.deepEqual(await viewed.json(), { data: preview })

  const malformed = await handleHomeRecordHandoffHttp(
    get(`/api/v1/homes/${homeRef}/handoffs/hshr_short`),
    homeRef,
    { kind: 'preview', shareId: 'hshr_short' },
    dependencies(),
  )
  assert.equal(malformed.status, 400)
})

test('mutations require exact origin, bounded plain JSON, and pass no browser authority', async () => {
  const path = `/api/v1/homes/${homeRef}/handoffs/${shareId}/accept`
  const valid = post(path, { exact: 'browser body' })
  assert.equal(homeRecordHandoffMutationEnvelopeAllowed(valid, origin), true)
  const accepted = await handleHomeRecordHandoffHttp(
    valid,
    homeRef,
    { kind: 'accept', shareId },
    dependencies(),
  )
  assert.equal(accepted.status, 200)
  assert.deepEqual(await accepted.json(), { data: { ...preview, state: 'accepted' } })

  for (const request of [
    post(path, { exact: 'browser body' }, { origin: 'https://evil.test' }),
    post(path, { exact: 'browser body' }, { 'content-type': 'text/plain' }),
    post(path, { exact: 'browser body' }, { 'content-encoding': 'gzip' }),
    post(path, { text: 'x'.repeat(5000) }),
  ]) {
    const response = await handleHomeRecordHandoffHttp(
      request,
      homeRef,
      { kind: 'accept', shareId },
      dependencies(),
    )
    assert.ok(response.status === 400 || response.status === 403)
  }
})

test('service conflicts are bounded and never expose internal details', async () => {
  const response = await handleHomeRecordHandoffHttp(
    post(`/api/v1/homes/${homeRef}/handoffs/${shareId}/reject`, { exact: 'browser body' }),
    homeRef,
    { kind: 'reject', shareId },
    dependencies({ async reject() { throw new HomeownerApiError('conflict') } }),
  )
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: { code: 'conflict' } })
})

test('accepted-pro-file export is an exact no-store same-origin ZIP response', async () => {
  const response = await handleHomeRecordHandoffHttp(
    get(`/api/v1/homes/${homeRef}/home-record/export`),
    homeRef,
    { kind: 'export' },
    dependencies(),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/zip')
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox")
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
  assert.match(response.headers.get('digest') ?? '', /^sha-256=/)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
})
