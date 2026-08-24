import assert from 'node:assert/strict'
import test from 'node:test'
import { readHomeownerRuntimeConfiguration } from '../server/config.ts'

const CONFIG = {
  NODE_ENV: 'production',
  HOMESROLO_SUPABASE_URL: 'https://project.supabase.co',
  HOMESROLO_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(30)}`,
  HOMESROLO_SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`,
  HOMESROLO_APP_ORIGIN: 'https://app.homesrolo.com',
}

test('production pins byte-exact known app origins while explicit nonproduction origins stay local', () => {
  assert.equal(readHomeownerRuntimeConfiguration(CONFIG)?.appOrigin,
    'https://app.homesrolo.com')
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_APP_ORIGIN: 'https://homesrolo-homeowner-v2.onrender.com',
  })?.appOrigin, 'https://homesrolo-homeowner-v2.onrender.com')
  for (const origin of [
    'HTTPS://app.homesrolo.com',
    'https://APP.HOMESROLO.COM',
    'https://app.homesrolo.com:443',
    'https://homesrolo.com',
    'https://homesrolo-homeowner-v2.onrender.com/',
    'http://127.0.0.1:3100',
  ]) {
    assert.equal(readHomeownerRuntimeConfiguration({
      ...CONFIG,
      HOMESROLO_APP_ORIGIN: origin,
    }), null, origin)
  }
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    NODE_ENV: 'development',
    HOMESROLO_APP_ORIGIN: 'http://127.0.0.1:3100',
  })?.appOrigin, 'http://127.0.0.1:3100')
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    NODE_ENV: 'test',
    HOMESROLO_APP_ORIGIN: 'https://homeowner.example.test',
  })?.appOrigin, 'https://homeowner.example.test')
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    NODE_ENV: 'development',
    HOMESROLO_APP_ORIGIN: 'https://homeowner.example.test',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    NODE_ENV: undefined,
    HOMESROLO_APP_ORIGIN: 'http://localhost:3100',
  }), null)
})

test('email-code activation requires an independent server-only HMAC secret', () => {
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'true',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'true',
    HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET: 'short',
  }), null)
  for (const providerCredential of [
    CONFIG.HOMESROLO_SUPABASE_PUBLISHABLE_KEY,
    CONFIG.HOMESROLO_SUPABASE_SECRET_KEY,
  ]) {
    assert.equal(readHomeownerRuntimeConfiguration({
      ...CONFIG,
      HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'true',
      HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET: providerCredential,
    }), null, 'the limiter HMAC secret must not reuse a Supabase credential')
  }
  const configured = readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'true',
    HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET: `rate_${'r'.repeat(43)}`,
  })
  assert.equal(configured?.emailCodeSignInEnabled, true)
  assert.equal(configured?.emailCodeRateLimitSecret, `rate_${'r'.repeat(43)}`)
})
