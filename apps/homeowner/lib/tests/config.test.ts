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

test('production pins the byte-exact app origin while explicit nonproduction origins stay local', () => {
  assert.equal(readHomeownerRuntimeConfiguration(CONFIG)?.appOrigin,
    'https://app.homesrolo.com')
  for (const origin of [
    'HTTPS://app.homesrolo.com',
    'https://APP.HOMESROLO.COM',
    'https://app.homesrolo.com:443',
    'https://homesrolo.com',
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
