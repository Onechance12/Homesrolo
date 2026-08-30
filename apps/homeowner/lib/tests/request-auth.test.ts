import assert from 'node:assert/strict'
import test from 'node:test'
import { SESSION_COOKIE_NAME } from '../server/cookie.ts'
import {
  HOMEOWNER_NATIVE_CLIENT_HEADER,
  HOMEOWNER_NATIVE_CLIENT_V1,
  HOMEOWNER_PWA_CLIENT_V1,
  homeownerAuthenticationBootstrapChannel,
  homeownerMutationRequestAllowed,
  homeownerPwaLegacyUpgradeEnvelope,
  homeownerPwaSignOutEnvelope,
  homeownerRequestAuthentication,
} from '../server/request-auth.ts'

const ORIGIN = 'https://app.homesrolo.com'
const HANDLE = 's'.repeat(43)

function request(headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`${ORIGIN}/api/v1/session`, { method, headers })
}

test('request authentication resolves one explicit credential transport', () => {
  assert.deepEqual(homeownerRequestAuthentication(request()), {
    kind: 'anonymous', sessionHandle: null,
  })
  assert.deepEqual(homeownerRequestAuthentication(request({
    cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
  })), { kind: 'web', sessionHandle: HANDLE })
  assert.deepEqual(homeownerRequestAuthentication(request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
    authorization: `Bearer ${HANDLE}`,
  })), { kind: 'native', sessionHandle: HANDLE })
  assert.deepEqual(homeownerRequestAuthentication(request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
    authorization: `Bearer ${HANDLE}`,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
  })), { kind: 'invalid', sessionHandle: null })
})

test('ordinary PWA bearer authentication is retired outside the exact migration route', () => {
  const invalidPwaHeaders: readonly Record<string, string>[] = [
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
      origin: ORIGIN,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      cookie: 'theme=dark',
      origin: ORIGIN,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      origin: 'https://evil.test',
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      origin: ORIGIN,
      'sec-fetch-site': 'cross-site',
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      origin: ORIGIN,
    },
  ]
  for (const headers of invalidPwaHeaders) {
    assert.equal(homeownerRequestAuthentication(request(headers)).kind, 'invalid')
  }
})

test('native authentication is exact, bounded, and rejects mixed transports', () => {
  const invalidHeaders: readonly Record<string, string>[] = [
    {
      cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
      authorization: `Bearer ${HANDLE}`,
    },
    {
      cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
      authorization: 'Bearer short',
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
      authorization: `Bearer ${HANDLE}, Bearer ${HANDLE}`,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: 'native.v2',
      authorization: `Bearer ${HANDLE}`,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      origin: ORIGIN,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      cookie: 'theme=dark',
    },
  ]
  for (const headers of invalidHeaders) {
    assert.equal(homeownerRequestAuthentication(request(headers)).kind, 'invalid')
  }

  assert.deepEqual(homeownerRequestAuthentication(request({
    authorization: 'Bearer forged-but-not-a-native-contract',
  })), { kind: 'anonymous', sessionHandle: null }, 'unmarked identity headers remain inert')
})

test('browser mutation CSRF checks and native bearer transport stay separate', () => {
  const web = request({ origin: ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }, 'POST')
  const webAuth = homeownerRequestAuthentication(web)
  assert.equal(homeownerMutationRequestAllowed(web, ORIGIN, webAuth), true)

  const crossSite = request({
    origin: 'https://evil.test', cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
  }, 'POST')
  assert.equal(homeownerMutationRequestAllowed(
    crossSite, ORIGIN, homeownerRequestAuthentication(crossSite),
  ), false)

  const native = request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
    authorization: `Bearer ${HANDLE}`,
  }, 'POST')
  assert.equal(homeownerMutationRequestAllowed(
    native, ORIGIN, homeownerRequestAuthentication(native),
  ), true)

  const pwa = request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
    authorization: `Bearer ${HANDLE}`,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
  }, 'POST')
  assert.equal(homeownerMutationRequestAllowed(
    pwa, ORIGIN, homeownerRequestAuthentication(pwa),
  ), false)
  const invalidPwaMutationHeaders: readonly Record<string, string>[] = [
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
    },
    {
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      authorization: `Bearer ${HANDLE}`,
      origin: 'https://evil.test',
      'sec-fetch-site': 'cross-site',
    },
  ]
  for (const headers of invalidPwaMutationHeaders) {
    const candidate = request(headers, 'POST')
    assert.equal(homeownerMutationRequestAllowed(
      candidate, ORIGIN, homeownerRequestAuthentication(candidate),
    ), false)
  }
})

test('OTP bootstrap separates the native bearer envelope from same-origin cookie channels', () => {
  assert.equal(homeownerAuthenticationBootstrapChannel(
    request({ origin: ORIGIN }, 'POST'), ORIGIN,
  ), 'web')
  assert.equal(homeownerAuthenticationBootstrapChannel(request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
  }, 'POST'), ORIGIN), 'native')
  assert.equal(homeownerAuthenticationBootstrapChannel(request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
  }, 'POST'), ORIGIN), 'pwa')

  const invalidBootstrapHeaders: readonly Record<string, string>[] = [
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: 'native.v2' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, origin: ORIGIN },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, cookie: 'theme=dark' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, authorization: `Bearer ${HANDLE}` },
    { origin: ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`, authorization: `Bearer ${HANDLE}` },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1 },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1, origin: 'https://evil.test' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1, origin: ORIGIN, cookie: 'theme=dark' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1, origin: ORIGIN, authorization: `Bearer ${HANDLE}` },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1, origin: ORIGIN, 'sec-fetch-site': 'cross-site' },
  ]
  for (const headers of invalidBootstrapHeaders) {
    assert.equal(homeownerAuthenticationBootstrapChannel(request(headers, 'POST'), ORIGIN), 'invalid')
  }
})

function exactPwaBridgeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    ...headers,
  }
}

test('PWA upgrade accepts one old bearer or one cookie only on its exact envelope', () => {
  const valid = request(exactPwaBridgeHeaders({
    cookie: `theme=dark; ${SESSION_COOKIE_NAME}=${HANDLE}`,
  }), 'POST')
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(valid, ORIGIN), {
    source: 'cookie', sessionHandle: HANDLE,
  })
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(
    request(exactPwaBridgeHeaders(), 'POST'), ORIGIN,
  ), { source: 'none', sessionHandle: null })
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(
    request({
      [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_PWA_CLIENT_V1,
      origin: ORIGIN,
    }, 'POST'), ORIGIN,
  ), { source: 'none', sessionHandle: null },
  'hosting proxies may omit Fetch Metadata after exact Origin validation')
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(
    request(exactPwaBridgeHeaders({ authorization: `Bearer ${HANDLE}` }), 'POST'), ORIGIN,
  ), { source: 'bearer', sessionHandle: HANDLE })
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(
    request(exactPwaBridgeHeaders({
      authorization: `Bearer ${HANDLE}`,
      cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`,
    }), 'POST'), ORIGIN,
  ), { source: 'matching_credentials', sessionHandle: HANDLE })

  const invalidRequests = [
    request(exactPwaBridgeHeaders({
      authorization: `Bearer ${HANDLE}`,
      cookie: `${SESSION_COOKIE_NAME}=${'x'.repeat(43)}`,
    }), 'POST'),
    request(exactPwaBridgeHeaders({
      authorization: `Bearer ${HANDLE}`,
      cookie: `${SESSION_COOKIE_NAME}=${HANDLE}; ${SESSION_COOKIE_NAME}=${HANDLE}`,
    }), 'POST'),
    request(exactPwaBridgeHeaders({ origin: 'https://evil.test' }), 'POST'),
    request(exactPwaBridgeHeaders({ 'sec-fetch-site': 'cross-site' }), 'POST'),
    request(exactPwaBridgeHeaders({ 'sec-fetch-mode': 'navigate' }), 'POST'),
    request(exactPwaBridgeHeaders({ 'sec-fetch-dest': 'document' }), 'POST'),
    request(exactPwaBridgeHeaders({ 'content-type': 'application/json' }), 'POST'),
    new Request(`${ORIGIN}/api/v1/session?token=nope`, {
      method: 'POST', headers: exactPwaBridgeHeaders({ cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }),
    }),
    request(exactPwaBridgeHeaders({ cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }), 'GET'),
  ]
  for (const candidate of invalidRequests) {
    assert.equal(homeownerPwaLegacyUpgradeEnvelope(candidate, ORIGIN), null)
  }
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(request(exactPwaBridgeHeaders({
    cookie: `${SESSION_COOKIE_NAME}=${HANDLE}; ${SESSION_COOKIE_NAME}=${HANDLE}`,
  }), 'POST'), ORIGIN), { source: 'invalid_cookie', sessionHandle: null },
  'the exact bridge may clear but never authenticate an ambiguous cookie')
})

test('PWA bridge tolerates a production-normalized empty request stream', () => {
  const normalized = new Request(`${ORIGIN}/api/v1/auth/pwa-upgrade`, {
    method: 'POST',
    headers: exactPwaBridgeHeaders({ authorization: `Bearer ${HANDLE}` }),
    body: new Uint8Array(0),
  })
  assert.notEqual(normalized.body, null)
  assert.deepEqual(homeownerPwaLegacyUpgradeEnvelope(normalized, ORIGIN), {
    source: 'bearer', sessionHandle: HANDLE,
  })
})

test('PWA signout alone may bind one bearer and one legacy cookie', () => {
  const exact = request(exactPwaBridgeHeaders({
    authorization: `Bearer ${HANDLE}`,
    cookie: `${SESSION_COOKIE_NAME}=${'b'.repeat(43)}; theme=dark`,
  }), 'POST')
  assert.deepEqual(homeownerPwaSignOutEnvelope(exact, ORIGIN), {
    bearerSessionHandle: HANDLE,
    legacySessionHandle: 'b'.repeat(43),
  })
  assert.equal(homeownerRequestAuthentication(exact).kind, 'invalid',
    'the general boundary continues to reject the same mixed credentials')
  assert.deepEqual(homeownerPwaSignOutEnvelope(
    request(exactPwaBridgeHeaders({ authorization: `Bearer ${HANDLE}` }), 'POST'), ORIGIN,
  ), { bearerSessionHandle: HANDLE, legacySessionHandle: null })
  assert.equal(homeownerPwaSignOutEnvelope(
    request(exactPwaBridgeHeaders({ cookie: `${SESSION_COOKIE_NAME}=${HANDLE}` }), 'POST'), ORIGIN,
  ), null)
  assert.deepEqual(homeownerPwaSignOutEnvelope(request(exactPwaBridgeHeaders({
    authorization: `Bearer ${HANDLE}`,
    cookie: `${SESSION_COOKIE_NAME}=${HANDLE}; ${SESSION_COOKIE_NAME}=${HANDLE}`,
  }), 'POST'), ORIGIN), {
    bearerSessionHandle: HANDLE,
    legacySessionHandle: null,
  }, 'a valid bearer can sign out and expire, but never adopt, an ambiguous cookie')
})
