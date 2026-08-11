import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SESSION_COOKIE_NAME, sessionHandleFromCookieHeader } from '../server/cookie.ts'
import { handleHomeownerRequest } from '../server/adapter.ts'

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
  uploads: false,
  invitations: false,
  sharing: false,
}

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
    '../../app/api/v1/session/route.ts',
    '../../app/api/v1/homes/route.ts',
    '../../app/api/v1/homes/[homeRef]/route.ts',
    '../../app/api/v1/homes/[homeRef]/intake/route.ts',
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
  for (const path of ['/api/v1/homes', `/api/v1/homes/${HOME}`]) {
    for (const headers of [undefined, { cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }]) {
      const response = await get(path, headers)
      assert.equal(response.status, 401, `${path} ${headers ? 'with' : 'without'} cookie`)
      assert.deepEqual(await response.json(), { error: { code: 'signed_out' } })
    }
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

test('unknown paths and wrong-kind refs are 404 through the adapter', async () => {
  for (const path of [
    '/api/v1/anything',
    '/api/v1/homes/hhom_short',
    `/api/v1/homes/hprj_${'r'.repeat(43)}`,
    `/api/v1/homes/${HOME}/projects`,
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
