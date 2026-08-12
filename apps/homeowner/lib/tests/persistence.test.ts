import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerAuthService } from '../server/auth.ts'
import { readHomeownerRuntimeConfiguration } from '../server/config.ts'
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  sessionCookie,
  sessionHandleFromCookieHeader,
} from '../server/cookie.ts'
import { hashSessionHandle, mintOpaqueRef } from '../server/supabase-provider.ts'

const CONFIG = {
  HOMESROLO_SUPABASE_URL: 'https://project.supabase.co',
  HOMESROLO_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(30)}`,
  HOMESROLO_SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`,
  HOMESROLO_APP_ORIGIN: 'https://app.homesrolo.com',
}

test('runtime configuration is all-or-nothing and HTTPS-only outside local development', () => {
  assert.equal(readHomeownerRuntimeConfiguration({}), null)
  assert.equal(readHomeownerRuntimeConfiguration({ ...CONFIG, HOMESROLO_SUPABASE_SECRET_KEY: undefined }), null)
  assert.equal(readHomeownerRuntimeConfiguration({ ...CONFIG, HOMESROLO_APP_ORIGIN: 'http://homesrolo.test' }), null)
  assert.deepEqual(readHomeownerRuntimeConfiguration(CONFIG), {
    supabaseUrl: 'https://project.supabase.co',
    publishableKey: CONFIG.HOMESROLO_SUPABASE_PUBLISHABLE_KEY,
    secretKey: CONFIG.HOMESROLO_SUPABASE_SECRET_KEY,
    appOrigin: 'https://app.homesrolo.com',
  })
})

test('opaque sessions are hashed at rest and cookies carry the browser security attributes', () => {
  const handle = 's'.repeat(43)
  assert.match(hashSessionHandle(handle), /^[a-f0-9]{64}$/)
  assert.notEqual(hashSessionHandle(handle), handle)
  const setCookie = sessionCookie(handle)
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE_NAME}=${handle};`))
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=']) {
    assert.match(setCookie, new RegExp(attribute.replace('/', '\\/')))
  }
  assert.equal(sessionHandleFromCookieHeader(setCookie), handle)
  assert.match(clearSessionCookie(), /Max-Age=0/)
  assert.match(mintOpaqueRef('hprn'), /^hprn_[A-Za-z0-9_-]{43}$/)
})

test('magic-link completion mints a Homesrolo session and sends only its hash to persistence', async () => {
  const authCalls: unknown[] = []
  const rpcCalls: unknown[] = []
  const authClient = {
    auth: {
      async signInWithOtp(input: unknown) { authCalls.push(input); return { error: null } },
      async verifyOtp(input: unknown) {
        authCalls.push(input)
        return { data: { user: { id: '8aa09ae2-64f8-4bbb-81ac-e5f3515001a2', email: 'Person@Example.com' } }, error: null }
      },
    },
  } as unknown as SupabaseClient
  const serviceClient = {
    async rpc(name: string, input: Record<string, unknown>) {
      rpcCalls.push({ name, input })
      return { data: { principal_ref: `hprn_${'p'.repeat(43)}`, status: 'active' }, error: null }
    },
  } as unknown as SupabaseClient
  const configuration = readHomeownerRuntimeConfiguration(CONFIG)
  assert.ok(configuration)
  const service = new HomeownerAuthService({
    auth: authClient,
    service: serviceClient,
    configuration,
    now: () => new Date('2026-08-12T10:00:00.000Z'),
  })

  assert.equal(await service.requestMagicLink(' Person@Example.com '), 'accepted')
  const handle = await service.completeMagicLink('t'.repeat(43))
  assert.ok(handle)
  assert.match(handle, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual(authCalls[0], {
    email: 'person@example.com',
    options: {
      shouldCreateUser: true,
      emailRedirectTo: 'https://app.homesrolo.com/api/v1/auth/callback',
    },
  })
  assert.deepEqual(authCalls[1], { token_hash: 't'.repeat(43), type: 'email' })
  const completion = rpcCalls[0] as { name: string; input: Record<string, unknown> }
  assert.equal(completion.name, 'homesrolo_complete_magic_link')
  assert.equal(completion.input.p_email_canonical, 'person@example.com')
  assert.equal(completion.input.p_session_hash, hashSessionHandle(handle))
  assert.ok(!JSON.stringify(completion).includes(handle), 'the raw handle is cookie-only')

  await service.revokeSession(handle)
  const revocation = rpcCalls[1] as { name: string; input: Record<string, unknown> }
  assert.equal(revocation.name, 'homesrolo_revoke_homeowner_session')
  assert.equal(revocation.input.p_session_hash, hashSessionHandle(handle))
})

test('the migration is deny-by-default and exposes only narrow service functions', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608120001_homeowner_runtime.sql',
  ), 'utf8')
  const tables = [
    'homesrolo_homeowner_principals',
    'homesrolo_homeowner_sessions',
    'homesrolo_private_homes',
    'homesrolo_homeowner_memberships',
    'homesrolo_homeowner_property_facts',
    'homesrolo_homeowner_systems',
    'homesrolo_homeowner_command_receipts',
  ]
  for (const table of tables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'))
  }
  assert.match(migration, /security definer/gi)
  assert.match(migration, /grant execute on function public\.homesrolo_complete_magic_link[\s\S]+to service_role/i)
  assert.doesNotMatch(migration, /grant execute[\s\S]+to (anon|authenticated)/i)
})

