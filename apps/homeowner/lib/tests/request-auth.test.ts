import assert from 'node:assert/strict'
import test from 'node:test'
import { SESSION_COOKIE_NAME } from '../server/cookie.ts'
import {
  HOMEOWNER_NATIVE_CLIENT_HEADER,
  HOMEOWNER_NATIVE_CLIENT_V1,
  homeownerAuthenticationBootstrapChannel,
  homeownerMutationRequestAllowed,
  homeownerRequestAuthentication,
} from '../server/request-auth.ts'

const ORIGIN = 'https://app.homesrolo.com'
const HANDLE = 's'.repeat(43)

function request(headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`${ORIGIN}/api/v1/session`, { method, headers })
}

test('request authentication resolves one opaque web or native transport', () => {
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
})

test('OTP bootstrap exposes a native channel only for the empty native.v1 envelope', () => {
  assert.equal(homeownerAuthenticationBootstrapChannel(
    request({ origin: ORIGIN }, 'POST'), ORIGIN,
  ), 'web')
  assert.equal(homeownerAuthenticationBootstrapChannel(request({
    [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1,
  }, 'POST'), ORIGIN), 'native')

  const invalidBootstrapHeaders: readonly Record<string, string>[] = [
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: 'native.v2' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, origin: ORIGIN },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, cookie: 'theme=dark' },
    { [HOMEOWNER_NATIVE_CLIENT_HEADER]: HOMEOWNER_NATIVE_CLIENT_V1, authorization: `Bearer ${HANDLE}` },
    { origin: ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${HANDLE}`, authorization: `Bearer ${HANDLE}` },
  ]
  for (const headers of invalidBootstrapHeaders) {
    assert.equal(homeownerAuthenticationBootstrapChannel(request(headers, 'POST'), ORIGIN), 'invalid')
  }
})
