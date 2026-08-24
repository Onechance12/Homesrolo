import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requestHomeownerEmailCodeWithDependencies,
  verifyHomeownerEmailCodeWithDependencies,
  type EmailCodeHttpDependencies,
} from '../server/auth-http.ts'
import { emailCodeIsValid, type HomeownerAuthService } from '../server/auth.ts'
import {
  EmailCodeRateLimiter,
  emailCodeClientAddress,
  hmacEmailRateLimitSubject,
} from '../server/email-code-rate-limit.ts'
import {
  decodePendingEmailCode,
  emailCodeCooldownDeadline,
  EMAIL_CODE_PENDING_TTL_MS,
  encodePendingEmailCode,
} from '../email-code-pending.ts'

const APP_ORIGIN = 'https://app.homesrolo.com'
const SECRET = `rate_${'r'.repeat(43)}`

function post(body: unknown, ip = '203.0.113.10'): Request {
  return new Request(`${APP_ORIGIN}/api/v1/auth/email-code`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: APP_ORIGIN,
      'cf-connecting-ip': ip,
    },
    body: JSON.stringify(body),
  })
}

function dependencies(input: {
  readonly limiter?: EmailCodeRateLimiter
  readonly requestResult?: 'accepted' | 'rate_limited' | 'unavailable' | 'throw'
  readonly completion?: Awaited<ReturnType<HomeownerAuthService['completeEmailCode']>>
  readonly calls?: { requests: number; verifications: number }
} = {}): EmailCodeHttpDependencies {
  const calls = input.calls ?? { requests: 0, verifications: 0 }
  return {
    appOrigin: APP_ORIGIN,
    enabled: true,
    rateLimiter: input.limiter ?? new EmailCodeRateLimiter({ secret: SECRET }),
    auth: {
      async requestEmailCode() {
        calls.requests += 1
        if (input.requestResult === 'throw') throw new Error('private provider detail')
        return input.requestResult ?? 'accepted'
      },
      async completeEmailCode() {
        calls.verifications += 1
        return input.completion ?? { kind: 'invalid' }
      },
    },
  }
}

test('email codes are exactly six ASCII digits with no trimming', () => {
  assert.equal(emailCodeIsValid('012345'), true)
  for (const value of [
    '12345',
    '1234567',
    ' 123456',
    '123456 ',
    '１２３４５６',
    '١٢٣٤٥٦',
    '12345a',
    123456,
    null,
  ]) {
    assert.equal(emailCodeIsValid(value), false, String(value))
  }
})

test('pending code recovery is absolute, bounded, and never stores the OTP', () => {
  const now = 1_800_000_000_000
  const resendDeadline = emailCodeCooldownDeadline(60, now)
  const verifyDeadline = emailCodeCooldownDeadline(900, now)
  const encoded = encodePendingEmailCode(
    'person@example.com',
    resendDeadline,
    verifyDeadline,
    now,
  )
  const stored = JSON.parse(encoded) as Record<string, unknown>
  assert.deepEqual(Object.keys(stored).sort(), [
    'email', 'resendAvailableAt', 'savedAt', 'stage', 'verifyAvailableAt', 'version',
  ])
  assert.equal(Object.hasOwn(stored, 'code'), false)
  assert.equal(decodePendingEmailCode(encoded, now + 60_000)?.savedAt, now,
    'a reload preserves the original absolute age')
  assert.deepEqual(decodePendingEmailCode(encoded, now + 61_000), {
    version: 1,
    stage: 'code',
    email: 'person@example.com',
    resendAvailableAt: 0,
    verifyAvailableAt: verifyDeadline,
    savedAt: now,
  }, 'a reload preserves a verification lockout after the normal resend cooldown ends')
  const resendOnly = decodePendingEmailCode(
    encodePendingEmailCode('person@example.com', resendDeadline, 0, now),
    now + 1_000,
  )
  assert.equal(resendOnly?.resendAvailableAt, resendDeadline)
  assert.equal(resendOnly?.verifyAvailableAt, 0,
    'a normal resend cooldown never disables code verification')
  assert.equal(decodePendingEmailCode(encoded, now + EMAIL_CODE_PENDING_TTL_MS), null)
  assert.equal(decodePendingEmailCode(JSON.stringify({ ...stored, code: '123456' }), now), null)
  assert.equal(emailCodeCooldownDeadline(9_999, now), now + EMAIL_CODE_PENDING_TTL_MS)
  assert.equal(emailCodeCooldownDeadline('900', now), now + 60_000)
})

test('rate-limit email subjects are canonical, opaque HMAC values', () => {
  const first = hmacEmailRateLimitSubject(SECRET, ' Person@Example.com ')
  const second = hmacEmailRateLimitSubject(SECRET, 'person@example.com')
  assert.equal(first, second)
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.ok(!first.includes('person'))
  assert.notEqual(first, hmacEmailRateLimitSubject(SECRET, 'other@example.com'))
  assert.throws(() => hmacEmailRateLimitSubject('too-short', 'person@example.com'),
    /invalid_rate_limit_secret/)
})

test('client addressing is bounded and malformed proxy data cannot bypass a shared bucket', () => {
  assert.equal(emailCodeClientAddress(post({}, '192.0.2.99')), '192.0.2.99')
  assert.equal(emailCodeClientAddress(post({}, '2001:db8::1')), '2001:db8::1')
  assert.equal(emailCodeClientAddress(post({}, 'not-an-ip')), 'unresolved')
  const cloudflareWins = new Request(`${APP_ORIGIN}/`, {
    headers: {
      'cf-connecting-ip': '198.51.100.5',
      'x-forwarded-for': '192.0.2.1, 192.0.2.2',
      'x-real-ip': '192.0.2.3',
    },
  })
  assert.equal(emailCodeClientAddress(cloudflareWins), '198.51.100.5')
  const spoofedForwardingOnly = new Request(`${APP_ORIGIN}/`, {
    headers: {
      'x-forwarded-for': '198.51.100.7',
      'x-real-ip': '198.51.100.8',
    },
  })
  assert.equal(emailCodeClientAddress(spoofedForwardingOnly), 'unresolved')
})

test('the limiter enforces resend, email, IP, and fail-closed capacity bounds', () => {
  let now = 0
  const pairLimiter = new EmailCodeRateLimiter({ secret: SECRET, now: () => now })
  assert.deepEqual(pairLimiter.consumeRequest(post({}), 'person@example.com'), { allowed: true })
  assert.deepEqual(pairLimiter.consumeRequest(post({}), 'person@example.com'), {
    allowed: false,
    retryAfterSeconds: 60,
  })
  now = 60_000
  assert.deepEqual(pairLimiter.consumeRequest(post({}), 'person@example.com'), { allowed: true })

  let emailNow = 0
  const emailLimiter = new EmailCodeRateLimiter({ secret: SECRET, now: () => emailNow })
  for (let index = 1; index <= 5; index += 1) {
    assert.deepEqual(
      emailLimiter.consumeRequest(post({}, `203.0.113.${index}`), 'person@example.com'),
      { allowed: true },
    )
    emailNow += 60_000
  }
  assert.equal(
    emailLimiter.consumeRequest(post({}, '203.0.113.99'), 'person@example.com').allowed,
    false,
  )

  const ipLimiter = new EmailCodeRateLimiter({ secret: SECRET })
  for (let index = 0; index < 30; index += 1) {
    assert.equal(ipLimiter.consumeRequest(post({}), `person${index}@example.com`).allowed, true)
  }
  assert.equal(ipLimiter.consumeRequest(post({}), 'blocked@example.com').allowed, false)

  const bounded = new EmailCodeRateLimiter({ secret: SECRET, maximumBuckets: 10 })
  assert.equal(bounded.consumeRequest(post({}), 'one@example.com').allowed, true)
  assert.equal(bounded.consumeRequest(post({}), 'two@example.com').allowed, true)
  assert.deepEqual(bounded.consumeRequest(post({}), 'three@example.com'), {
    allowed: false,
    retryAfterSeconds: 60,
  })
})

test('valid email-code requests never disclose provider or throttle state', async () => {
  const envelopes: { status: number; body: unknown }[] = []
  for (const requestResult of ['accepted', 'rate_limited', 'unavailable', 'throw'] as const) {
    const response = await requestHomeownerEmailCodeWithDependencies(
      post({ email: 'person@example.com' }),
      dependencies({ requestResult }),
    )
    envelopes.push({ status: response.status, body: await response.json() })
  }
  assert.deepEqual(envelopes, Array.from({ length: 4 }, () => ({
    status: 202,
    body: { data: { accepted: true } },
  })))

  const calls = { requests: 0, verifications: 0 }
  const shared = dependencies({ calls })
  assert.equal((await requestHomeownerEmailCodeWithDependencies(
    post({ email: 'person@example.com' }), shared,
  )).status, 202)
  assert.equal((await requestHomeownerEmailCodeWithDependencies(
    post({ email: 'person@example.com' }), shared,
  )).status, 202)
  assert.equal(calls.requests, 1, 'silent local throttling avoids the second provider send')
})

test('email-code routes fail closed unless every server dependency and the release gate are live', async () => {
  const calls = { requests: 0, verifications: 0 }
  const configured = dependencies({ calls })
  const disabled: EmailCodeHttpDependencies = { ...configured, enabled: false }
  const missingLimiter: EmailCodeHttpDependencies = { ...configured, rateLimiter: null }
  const missingAuth: EmailCodeHttpDependencies = { ...configured, auth: null }
  const missingOrigin: EmailCodeHttpDependencies = { ...configured, appOrigin: null }
  for (const candidate of [disabled, missingLimiter, missingAuth, missingOrigin]) {
    const requestResponse = await requestHomeownerEmailCodeWithDependencies(
      post({ email: 'person@example.com' }),
      candidate,
    )
    assert.equal(requestResponse.status, 503)
    assert.deepEqual(await requestResponse.json(), { error: { code: 'unavailable' } })
    const verifyResponse = await verifyHomeownerEmailCodeWithDependencies(
      post({ email: 'person@example.com', code: '012345' }),
      candidate,
    )
    assert.equal(verifyResponse.status, 503)
    assert.deepEqual(await verifyResponse.json(), { error: { code: 'unavailable' } })
  }
  assert.deepEqual(calls, { requests: 0, verifications: 0 })
})

test('email-code HTTP validation is bounded and malformed codes never reach the provider', async () => {
  const calls = { requests: 0, verifications: 0 }
  for (const code of ['12345', ' 123456', '123456 ', '１２３４５６', '12345a']) {
    const response = await verifyHomeownerEmailCodeWithDependencies(
      post({ email: 'person@example.com', code }),
      dependencies({ calls }),
    )
    assert.equal(response.status, 400, code)
    assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } })
  }
  assert.equal(calls.verifications, 0)

  const oversized = new Request(`${APP_ORIGIN}/api/v1/auth/email-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
    body: JSON.stringify({ email: `${'a'.repeat(1_100)}@example.com` }),
  })
  const response = await requestHomeownerEmailCodeWithDependencies(oversized, dependencies({ calls }))
  assert.equal(response.status, 400)
  assert.equal(calls.requests, 0)
})

test('verification has a generic invalid response and stops before a ninth provider attempt', async () => {
  let now = 1_800_000_000_000
  const calls = { requests: 0, verifications: 0 }
  const limiter = new EmailCodeRateLimiter({ secret: SECRET, now: () => now })
  const shared = dependencies({ calls, limiter, completion: { kind: 'invalid' } })
  for (let index = 0; index < 8; index += 1) {
    const response = await verifyHomeownerEmailCodeWithDependencies(
      post({ email: 'person@example.com', code: '012345' }),
      shared,
    )
    assert.equal(response.status, 422)
    assert.deepEqual(await response.json(), { error: { code: 'invalid_code' } })
  }
  const limited = await verifyHomeownerEmailCodeWithDependencies(
    post({ email: 'person@example.com', code: '012345' }),
    shared,
  )
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), {
    error: { code: 'rate_limited', retryAfterSeconds: 900 },
  })
  assert.equal(limited.headers.get('retry-after'), '900')
  assert.equal(calls.verifications, 8)
  now += 900_000
  const afterCooldown = await verifyHomeownerEmailCodeWithDependencies(
    post({ email: 'person@example.com', code: '012345' }),
    shared,
  )
  assert.equal(afterCooldown.status, 422)
  assert.equal(calls.verifications, 9)
})
