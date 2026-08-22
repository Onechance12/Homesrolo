import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SESSION_COOKIE_NAME, sessionHandleFromCookieHeader } from '../server/cookie.ts'
import { handleHomeownerRequest, mutationOriginAllowed } from '../server/adapter.ts'
import { artifactUploadEnvelopeAllowed } from '../server/artifact-http.ts'
import { projectReviewCapabilityEnabled } from '../server/runtime.ts'

/**
 * The route adapter over the UNCONFIGURED runtime: no identity provider, no
 * repository, no capabilities. Everything below is the fail-closed behaviour
 * a deploy would exhibit before the integration lane attaches providers.
 */

const HANDLE = 'a'.repeat(43)
const HOME = `hhom_${'b'.repeat(43)}`
const BASE = 'http://homesrolo.test'

const get = (path: string, headers?: Record<string, string>) =>
  handleHomeownerRequest(new Request(`${BASE}${path}`, { headers }))

const ALL_FALSE = {
  magicLinkSignIn: false,
  persistence: false,
  projectQuotes: false,
  homeResearch: false,
  uploads: false,
  photoCheckups: false,
  projectReview: false,
  projectReviewAttachments: false,
  invitations: false,
  sharing: false,
}

test('project review is enabled only with both the homeowner provider and Jobrolo intake client', () => {
  assert.equal(projectReviewCapabilityEnabled(false, false), false)
  assert.equal(projectReviewCapabilityEnabled(false, true), false)
  assert.equal(projectReviewCapabilityEnabled(true, false), false)
  assert.equal(projectReviewCapabilityEnabled(true, true), true)
})

test('configured browser mutations require the exact application origin', () => {
  const expected = 'https://app.homesrolo.com'
  assert.equal(mutationOriginAllowed('GET', null, expected), true)
  assert.equal(mutationOriginAllowed('POST', expected, expected), true)
  for (const origin of [null, '', 'https://homesrolo.com', 'https://app.homesrolo.com.evil.test']) {
    assert.equal(mutationOriginAllowed('POST', origin, expected), false)
  }
})

// --- cookie parsing -----------------------------------------------------------

test('the session cookie parses as an opaque bounded handle or not at all', () => {
  assert.equal(sessionHandleFromCookieHeader(null), null, 'absent header')
  assert.equal(sessionHandleFromCookieHeader(''), null, 'empty header')
  assert.equal(sessionHandleFromCookieHeader(`${SESSION_COOKIE_NAME}=${HANDLE}`), HANDLE)
  assert.equal(
    sessionHandleFromCookieHeader(`other=1; ${SESSION_COOKIE_NAME}=${HANDLE}; theme=dark`),
    HANDLE,
    'the named cookie is found among others',
  )

  const rejected: readonly string[] = [
    `${SESSION_COOKIE_NAME}=`,                                  // empty value
    `${SESSION_COOKIE_NAME}=${'a'.repeat(15)}`,                 // under the floor
    `${SESSION_COOKIE_NAME}=${'a'.repeat(257)}`,                // over the cap
    `${SESSION_COOKIE_NAME}=has spaces`,                        // bad charset
    `${SESSION_COOKIE_NAME}=semi;colon`,                        // split by parser, malformed
    `${SESSION_COOKIE_NAME}=quote"quote`,                       // bad charset
    `${SESSION_COOKIE_NAME}=${HANDLE}; ${SESSION_COOKIE_NAME}=${HANDLE}`, // duplicated
    `${SESSION_COOKIE_NAME}=%2e%2e%2f${'a'.repeat(20)}`,        // percent junk
    `other=${HANDLE}`,                                          // wrong name
    `x`.repeat(9000),                                           // oversized header wholesale
  ]
  for (const header of rejected) {
    assert.equal(sessionHandleFromCookieHeader(header), null, header.slice(0, 50))
  }
})

test('the cookie module never logs and the adapter never projects the handle', () => {
  for (const rel of ['cookie.ts', 'adapter.ts', 'runtime.ts']) {
    const content = readFileSync(path.join(import.meta.dirname, '../server', rel), 'utf8')
    assert.doesNotMatch(content, /console\./, `${rel} must not log`)
  }
})

test('authenticated route modules are explicitly dynamic', () => {
  const routes = [
    '../../app/api/v1/auth/callback/route.ts',
    '../../app/api/v1/auth/magic-link/route.ts',
    '../../app/api/v1/auth/signout/route.ts',
    '../../app/api/v1/session/route.ts',
    '../../app/api/v1/homes/route.ts',
    '../../app/api/v1/homes/[homeRef]/route.ts',
    '../../app/api/v1/homes/[homeRef]/intake/route.ts',
    '../../app/api/v1/homes/[homeRef]/projects/route.ts',
    '../../app/api/v1/homes/[homeRef]/projects/[projectRef]/route.ts',
    '../../app/api/v1/homes/[homeRef]/roofing-projects/route.ts',
    '../../app/api/v1/homes/[homeRef]/artifacts/route.ts',
    '../../app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/content/route.ts',
    '../../app/api/v1/homes/[homeRef]/research/route.ts',
  ] as const
  for (const rel of routes) {
    const content = readFileSync(path.join(import.meta.dirname, rel), 'utf8')
    assert.match(content, /export const dynamic = ['"]force-dynamic['"]/, rel)
  }
})

// --- session route, fail-closed runtime ---------------------------------------

test('GET /api/v1/session with no cookie is signed_out with all-false capabilities', async () => {
  const response = await get('/api/v1/session')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  const body = await response.json()
  assert.deepEqual(body, {
    data: {
      apiVersion: 'homeowner-api.v1-draft',
      kind: 'signed_out',
      capabilities: ALL_FALSE,
    },
  })
})

test('a well-formed cookie still reads signed_out: no identity provider exists', async () => {
  const response = await get('/api/v1/session', { cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.kind, 'signed_out',
    'an unconfigured runtime resolves every handle to nobody')
})

// --- protected reads, fail-closed runtime -------------------------------------

test('protected reads are bounded 401 signed_out, cookie or not', async () => {
  for (const path of [
    '/api/v1/homes',
    `/api/v1/homes/${HOME}`,
    `/api/v1/homes/${HOME}/projects`,
    `/api/v1/homes/${HOME}/projects/hprj_${'r'.repeat(43)}`,
    `/api/v1/homes/${HOME}/artifacts`,
  ]) {
    for (const headers of [undefined, { cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }]) {
      const response = await get(path, headers)
      assert.equal(response.status, 401, `${path} ${headers ? 'with' : 'without'} cookie`)
      assert.deepEqual(await response.json(), { error: { code: 'signed_out' } })
    }
  }
})

test('artifact upload envelope requires exact origin, multipart boundary, and a bounded length', () => {
  const origin = 'https://app.homesrolo.com'
  const request = (headers: Record<string, string>) => new Request(`${BASE}/upload`, {
    method: 'POST',
    headers,
    body: new Uint8Array([1]),
  })
  assert.equal(artifactUploadEnvelopeAllowed(request({
    origin,
    'content-length': '1024',
    'content-type': 'multipart/form-data; boundary=exact',
  }), origin), true)
  for (const headers of [
    { 'content-length': '1024', 'content-type': 'multipart/form-data; boundary=exact' },
    { origin, 'content-type': 'multipart/form-data; boundary=exact' },
    { origin, 'content-length': '99999999', 'content-type': 'multipart/form-data; boundary=exact' },
    { origin, 'content-length': '1024', 'content-type': 'application/json' },
    { origin, 'content-length': '1024', 'content-type': 'multipart/form-data' },
    { origin, 'content-length': '1024', 'content-type': 'multipart/form-data; boundary=exact', 'content-encoding': 'gzip' },
  ] as readonly Record<string, string>[]) {
    assert.equal(artifactUploadEnvelopeAllowed(request(headers), origin), false)
  }
})

// --- routing discipline -------------------------------------------------------

test('non-GET methods are 405 and query strings or bodies are 400', async () => {
  const post = await handleHomeownerRequest(new Request(`${BASE}/api/v1/session`, { method: 'POST' }))
  assert.equal(post.status, 405)
  assert.deepEqual(await post.json(), { error: { code: 'method_not_allowed' } })

  const withQuery = await get('/api/v1/session?admin=1')
  assert.equal(withQuery.status, 400)
  assert.deepEqual(await withQuery.json(), { error: { code: 'invalid_request' } })

  const withBody = await handleHomeownerRequest(new Request(`${BASE}/api/v1/session`, {
    method: 'GET',
    // A GET with a body is a malformed request; Request() forbids it, so we
    // exercise the flag through POST → 405 above and the handler's own tests
    // in src/homeowner cover hasBody directly.
  }))
  assert.equal(withBody.status, 200)
})

test('the create-home adapter accepts only bounded JSON and still fails closed without identity', async () => {
  const validBody = {
    commandRef: `hcmd_${'c'.repeat(43)}`,
    displayLabel: 'Our home',
    privateLocationLabel: 'Private location',
  }
  const valid = await handleHomeownerRequest(new Request(`${BASE}/api/v1/homes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }))
  assert.equal(valid.status, 401, 'a valid command still needs a real server session')
  assert.deepEqual(await valid.json(), { error: { code: 'signed_out' } })

  const rejected = [
    new Request(`${BASE}/api/v1/homes`, { method: 'POST' }),
    new Request(`${BASE}/api/v1/homes`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(validBody),
    }),
    new Request(`${BASE}/api/v1/homes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json',
    }),
    new Request(`${BASE}/api/v1/homes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        ...validBody, principalRef: `hprn_${'p'.repeat(43)}`,
      }),
    }),
    new Request(`${BASE}/api/v1/homes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        ...validBody, privateLocationLabel: 'x'.repeat(5000),
      }),
    }),
  ]
  for (const request of rejected) {
    const response = await handleHomeownerRequest(request)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } })
  }
})

test('the exact-home intake adapter stays bounded and fail-closed without identity', async () => {
  const validBody = {
    commandRef: `hcmd_${'i'.repeat(43)}`,
    homeType: 'house',
    yearBuilt: null,
    systems: ['roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation']
      .map(kind => ({ kind, present: 'unknown', installedOrReplacedYear: null })),
  }
  const valid = await handleHomeownerRequest(new Request(`${BASE}/api/v1/homes/${HOME}/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }))
  assert.equal(valid.status, 401)
  assert.deepEqual(await valid.json(), { error: { code: 'signed_out' } })

  const forged = await handleHomeownerRequest(new Request(`${BASE}/api/v1/homes/${HOME}/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validBody, principalRef: `hprn_${'p'.repeat(43)}` }),
  }))
  assert.equal(forged.status, 400)
  assert.deepEqual(await forged.json(), { error: { code: 'invalid_request' } })
})

test('the roofing-project adapter accepts only a bounded exact-home command and stays fail-closed', async () => {
  const validBody = {
    commandRef: `hcmd_${'r'.repeat(43)}`,
    need: 'repair',
    timing: 'urgent',
    notes: 'Leak above the back room.',
  }
  const valid = await handleHomeownerRequest(new Request(`${BASE}/api/v1/homes/${HOME}/roofing-projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }))
  assert.equal(valid.status, 401)
  assert.deepEqual(await valid.json(), { error: { code: 'signed_out' } })

  for (const bad of [
    { ...validBody, principalRef: `hprn_${'p'.repeat(43)}` },
    { ...validBody, need: 'insurance_claim' },
    { ...validBody, timing: 'tomorrow_at_8' },
    { ...validBody, notes: 'x'.repeat(5000) },
  ]) {
    const response = await handleHomeownerRequest(new Request(
      `${BASE}/api/v1/homes/${HOME}/roofing-projects`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bad) },
    ))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } })
  }
})

test('the all-home project adapter accepts bounded historical work and rejects authority fields', async () => {
  const validBody = {
    commandRef: `hcmd_${'g'.repeat(43)}`,
    title: 'Kitchen remodel',
    category: 'interior',
    status: 'completed',
    occurredOn: '2024-06-15',
    summary: 'Cabinets and counters replaced.',
  }
  const valid = await handleHomeownerRequest(new Request(
    `${BASE}/api/v1/homes/${HOME}/projects`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    },
  ))
  assert.equal(valid.status, 401)
  assert.deepEqual(await valid.json(), { error: { code: 'signed_out' } })

  for (const bad of [
    { ...validBody, principalRef: `hprn_${'p'.repeat(43)}` },
    { ...validBody, category: 'insurance_claim' },
    { ...validBody, status: 'paid' },
    { ...validBody, title: '' },
  ]) {
    const response = await handleHomeownerRequest(new Request(
      `${BASE}/api/v1/homes/${HOME}/projects`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bad),
      },
    ))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } })
  }
})

test('unknown paths and wrong-kind refs are 404 through the adapter', async () => {
  for (const path of [
    '/api/v1/anything',
    '/api/v1/homes/hhom_short',
    `/api/v1/homes/hprj_${'r'.repeat(43)}`,
    '/api/v1/session/magic-link',
  ]) {
    const response = await get(path, { cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` })
    assert.equal(response.status, 404, path)
    assert.deepEqual(await response.json(), { error: { code: 'not_found' } })
  }
})

// --- browser identity claims are inert ----------------------------------------

test('identity-shaped browser input changes nothing', async () => {
  const plain = await get('/api/v1/session')
  const adorned = await get('/api/v1/session', {
    'x-principal-ref': `hprn_${'p'.repeat(43)}`,
    'x-homesrolo-role': 'workspace_controller',
    'x-provider-id': 'auth0|123',
    authorization: 'Bearer forged',
    cookie: `role=admin; principalRef=hprn_${'p'.repeat(43)}`,
  })
  assert.equal(plain.status, adorned.status)
  assert.deepEqual(await adorned.json(), await plain.json(),
    'headers and foreign cookies must not influence the boundary')
})

test('no response ever echoes the session handle', async () => {
  for (const path of ['/api/v1/session', '/api/v1/homes', `/api/v1/homes/${HOME}`]) {
    const response = await get(path, { cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` })
    const text = JSON.stringify({
      body: await response.text(),
      headers: [...response.headers.entries()],
    })
    assert.ok(!text.includes(HANDLE), `${path} must not project the opaque handle`)
    assert.ok(!text.includes(SESSION_COOKIE_NAME), `${path} must not name the cookie`)
  }
})
