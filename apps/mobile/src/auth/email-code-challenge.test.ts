import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createEmailCodeChallenge,
  createEmailCodeChallengeStorage,
  EMAIL_CODE_CHALLENGE_KEY,
  EMAIL_CODE_CHALLENGE_LIFETIME_MS,
  emailCodeResendSeconds,
  normalizeSignInEmail,
  parseEmailCodeChallenge,
} from './email-code-challenge.ts'

const now = 1_800_000_000_000
const email = 'person@example.com'

function tabStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

test('challenge email is normalized and malformed addresses are rejected before sending', () => {
  assert.equal(normalizeSignInEmail('  Person@Example.COM  '), email)
  for (const value of ['', 'person', 'person@example', 'person @example.com', 'p@ex ample.com',
    'p\u0000@example.com', 'p\u007f@example.com', `${'p'.repeat(250)}@example.com`, null, {}, 1]) {
    assert.equal(normalizeSignInEmail(value), null)
  }
})

test('a requested challenge projects only email, send time, local expiry and code step', () => {
  assert.deepEqual(createEmailCodeChallenge(' Person@Example.com ', now), {
    email, sentAt: now, expiresAt: now + EMAIL_CODE_CHALLENGE_LIFETIME_MS, step: 'code',
  })
  for (const time of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(createEmailCodeChallenge(email, time), null)
  }
  assert.equal(createEmailCodeChallenge('invalid', now), null)
})

test('a new helper instance restores the same tab challenge after reload without extending its life', () => {
  const tab = tabStorage()
  const original = createEmailCodeChallenge(email, now)!
  assert.equal(createEmailCodeChallengeStorage(() => tab).write(original, now), true)
  const reloaded = createEmailCodeChallengeStorage(() => tab)
  assert.deepEqual(reloaded.read(now + 45_000), original)
  assert.equal(emailCodeResendSeconds(reloaded.read(now + 45_000), now + 45_000), 15)
  assert.equal(reloaded.read(now + 100_000)?.expiresAt, original.expiresAt)
})

test('expiration removes the challenge exactly at its deadline but never unrelated tab data', () => {
  const tab = tabStorage()
  tab.setItem('unrelated', 'leave this alone')
  const storage = createEmailCodeChallengeStorage(() => tab)
  const challenge = createEmailCodeChallenge(email, now)!
  storage.write(challenge, now)
  assert.deepEqual(storage.read(challenge.expiresAt - 1), challenge)
  assert.equal(storage.read(challenge.expiresAt), null)
  assert.equal(tab.getItem(EMAIL_CODE_CHALLENGE_KEY), null)
  assert.equal(tab.getItem('unrelated'), 'leave this alone')
})

test('resend countdown is sixty seconds, uses wall-clock time and never goes negative', () => {
  const challenge = createEmailCodeChallenge(email, now)!
  assert.equal(emailCodeResendSeconds(challenge, now), 60)
  assert.equal(emailCodeResendSeconds(challenge, now + 999), 60)
  assert.equal(emailCodeResendSeconds(challenge, now + 1_000), 59)
  assert.equal(emailCodeResendSeconds(challenge, now + 59_999), 1)
  assert.equal(emailCodeResendSeconds(challenge, now + 60_000), 0)
  assert.equal(emailCodeResendSeconds(challenge, now + 120_000), 0)
  assert.equal(emailCodeResendSeconds(null, now), 0)
})

test('already-received codes can recover across reload without fabricating a send time or cooldown', () => {
  const challenge = createEmailCodeChallenge(email, now, 'existing')!
  assert.equal(challenge.sentAt, null)
  assert.equal(emailCodeResendSeconds(challenge, now), 0)
  assert.deepEqual(parseEmailCodeChallenge(JSON.stringify(challenge), now + 30_000), challenge)
  assert.equal(parseEmailCodeChallenge(JSON.stringify(challenge), challenge.expiresAt), null)
})

test('malformed, extra-field, oversized and future challenges fail closed and are removed', () => {
  const valid = createEmailCodeChallenge(email, now)!
  const invalid = [
    '', '{', 'null', '[]', '"string"', 'x'.repeat(1_025),
    ...[
      { ...valid, code: '123456' }, { ...valid, token: 'secret' },
      { ...valid, principalRef: 'not-an-identity-source' }, { ...valid, step: 'email' },
      { ...valid, email: ' Person@Example.com ' }, { ...valid, email: null },
      { ...valid, sentAt: now + 1 }, { ...valid, sentAt: -1 }, { ...valid, sentAt: now + 0.5 },
      { ...valid, sentAt: 'unknown' }, { ...valid, expiresAt: valid.expiresAt + 1 },
      { ...valid, expiresAt: now }, { ...valid, expiresAt: valid.expiresAt - 0.5 },
      { email, expiresAt: valid.expiresAt, step: 'code' },
    ].map(value => JSON.stringify(value)),
  ]
  for (const raw of invalid) {
    const tab = tabStorage()
    tab.setItem(EMAIL_CODE_CHALLENGE_KEY, raw)
    assert.equal(createEmailCodeChallengeStorage(() => tab).read(now), null, raw)
    assert.equal(tab.getItem(EMAIL_CODE_CHALLENGE_KEY), null)
  }
})

test('writer strips runtime code, credentials and identity fields from its persistence allow-list', () => {
  const tab = tabStorage()
  const challenge = createEmailCodeChallenge(email, now)!
  const extra = { ...challenge, code: '123456', token: 'synthetic-token',
    access_token: 'synthetic-access-token', principalRef: 'synthetic-principal' }
  assert.equal(createEmailCodeChallengeStorage(() => tab).write(extra, now), true)
  assert.deepEqual(JSON.parse(tab.getItem(EMAIL_CODE_CHALLENGE_KEY)!), challenge)
  assert.deepEqual(Object.keys(JSON.parse(tab.getItem(EMAIL_CODE_CHALLENGE_KEY)!)).sort(),
    ['email', 'expiresAt', 'sentAt', 'step'])
})

test('blocked sessionStorage, quota failures and native no-storage all remain optional', () => {
  const failure = () => { throw new Error('blocked') }
  const challenge = createEmailCodeChallenge(email, now)!
  for (const provider of [failure, () => null, () => ({
    getItem: failure, setItem: failure, removeItem: failure,
  })]) {
    const storage = createEmailCodeChallengeStorage(provider)
    assert.equal(storage.read(now), null)
    assert.equal(storage.write(challenge, now), false)
    assert.doesNotThrow(() => storage.clear())
    assert.doesNotThrow(() => storage.clearMatching(challenge, now))
  }
})

test('clear removes only this tab challenge and independent tab instances cannot inherit it', () => {
  const first = tabStorage()
  const second = tabStorage()
  const storage = createEmailCodeChallengeStorage(() => first)
  first.setItem('unrelated', 'keep')
  storage.write(createEmailCodeChallenge(email, now)!, now)
  assert.equal(createEmailCodeChallengeStorage(() => second).read(now), null)
  storage.clear()
  assert.equal(first.getItem(EMAIL_CODE_CHALLENGE_KEY), null)
  assert.equal(first.getItem('unrelated'), 'keep')
})

test('a late verification completion cannot clear a newer sign-in challenge', () => {
  const tab = tabStorage()
  const storage = createEmailCodeChallengeStorage(() => tab)
  const old = createEmailCodeChallenge(email, now)!
  const newer = createEmailCodeChallenge('other@example.com', now + 1_000)!
  storage.write(newer, now + 1_000)
  storage.clearMatching(old, now + 2_000)
  assert.deepEqual(storage.read(now + 2_000), newer)
  storage.clearMatching(newer, now + 2_000)
  assert.equal(storage.read(now + 2_000), null)
  storage.write(old, now)
  storage.clearMatching(old, old.expiresAt + 1)
  assert.equal(tab.getItem(EMAIL_CODE_CHALLENGE_KEY), null, 'accepted slow verification clears its own expired step')
})

test('sign-in integration retains gated destination and existing-code recovery sends no new email', () => {
  const screen = readFileSync(new URL('../../app/sign-in.tsx', import.meta.url), 'utf8')
  // Structural checks only; browser acceptance testing verifies real mounting and layout.
  assert.match(screen, /postSignInDestination\(returnTo\)/)
  assert.match(screen, /typedDestination === '\/start'/)
  assert.match(screen, /if \(state.kind !== 'signed_in'\) return[\s\S]*?challengeStorage\.clear\(\)/)
  assert.match(screen, /const returnToEmail = useCallback\([\s\S]*?challengeStorage\.clear\(\)/)
  assert.match(screen, /current >= challenge\.expiresAt[\s\S]*?returnToEmail\(/)
  assert.match(screen, /function useExistingCode\(\)[\s\S]*?createEmailCodeChallenge\(normalizedEmail, Date.now\(\), 'existing'\)/)
  const recovery = screen.split('function useExistingCode()')[1]?.split('async function finishSignIn()')[0] ?? ''
  assert.doesNotMatch(recovery, /requestCode|sendCode/)
  assert.match(screen, /autoComplete="one-time-code"/)
  assert.match(screen, /textContentType="oneTimeCode"/)
  assert.match(screen, /accessibilityRole="alert"/)
  assert.match(screen, /Request received\. If this email can sign in, look for a six-digit code/)
  assert.doesNotMatch(screen, /We sent a six-digit|localStorage|setStep/)
})

test('accepted-code session recovery rechecks the session without resubmitting a consumed OTP', () => {
  const screen = readFileSync(new URL('../../app/sign-in.tsx', import.meta.url), 'utf8')
  const finish = screen.split('async function finishSignIn()')[1]?.split('async function retrySessionCheck()')[0] ?? ''
  assert.match(finish, /await verifyCode\(challenge.email, code\)[\s\S]*?challengeStorage.clearMatching\(challenge\)[\s\S]*?setCode\(''\)[\s\S]*?setChallenge\(null\)[\s\S]*?setVerificationAccepted\(true\)/)
  const retry = screen.split('async function retrySessionCheck()')[1]?.split('if (!ready')[0] ?? ''
  assert.match(retry, /await refreshSession\(\)/)
  assert.doesNotMatch(retry, /verifyCode\(|requestCode\(/)
  assert.match(screen, /if \(verificationAccepted\)[\s\S]*?Retry sign-in check/)
  assert.match(screen, /setVerificationAccepted\(false\)/)
})
