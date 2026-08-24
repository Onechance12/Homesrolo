import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerAuthService } from '../server/auth.ts'
import { validMagicLinkCallbackQuery } from '../server/auth-http.ts'
import { readHomeownerRuntimeConfiguration } from '../server/config.ts'
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  sessionCookie,
  sessionHandleFromCookieHeader,
} from '../server/cookie.ts'
import { hashSessionHandle, mintOpaqueRef } from '../server/supabase-provider.ts'

const CONFIG = {
  NODE_ENV: 'production',
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
    emailCodeSignInEnabled: false,
    projectQuotesEnabled: false,
    privateUploadsEnabled: false,
    photoCheckupsEnabled: false,
    jobroloAttachmentsEnabled: false,
  })
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'true',
  })?.emailCodeSignInEnabled, true)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PROJECT_QUOTES_ENABLED: 'true',
  })?.projectQuotesEnabled, true)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PRIVATE_UPLOADS_ENABLED: 'true',
  })?.privateUploadsEnabled, true)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PHOTO_CHECKUPS_ENABLED: 'true',
  })?.photoCheckupsEnabled, true)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_JOBROLO_ATTACHMENTS_ENABLED: 'true',
  })?.jobroloAttachmentsEnabled, true)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_JOBROLO_ATTACHMENTS_ENABLED: 'yes',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED: 'yes',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PROJECT_QUOTES_ENABLED: 'yes',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PRIVATE_UPLOADS_ENABLED: 'yes',
  }), null)
  assert.equal(readHomeownerRuntimeConfiguration({
    ...CONFIG,
    HOMESROLO_PHOTO_CHECKUPS_ENABLED: 'yes',
  }), null)
})

test('magic-link callback query preserves only bounded entry context and rejects ambiguity', () => {
  const handoff = `hshr_${'s'.repeat(43)}`
  assert.equal(validMagicLinkCallbackQuery(new URLSearchParams({
    token_hash: 't'.repeat(43), type: 'email',
  })), true)
  assert.equal(validMagicLinkCallbackQuery(new URLSearchParams({
    token_hash: 't'.repeat(43), type: 'email', intent: 'repair',
  })), true)
  assert.equal(validMagicLinkCallbackQuery(new URLSearchParams({
    token_hash: 't'.repeat(43), type: 'email', handoff,
  })), true)
  assert.equal(validMagicLinkCallbackQuery(new URLSearchParams({
    token_hash: 't'.repeat(43), type: 'email', intent: 'repair', handoff,
  })), true)
  for (const query of [
    'token_hash=x&type=email&intent=insurance_claim',
    'token_hash=x&type=email&next=https://evil.test',
    'token_hash=x&token_hash=y&type=email',
    'token_hash=x&type=email&intent=repair&intent=replacement',
    'token_hash=x&type=email&handoff=hshr_short',
    `token_hash=x&type=email&handoff=${handoff}&handoff=${handoff}`,
  ]) {
    assert.equal(validMagicLinkCallbackQuery(new URLSearchParams(query)), false, query)
  }
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

test('email link and code completion mint only opaque hashed Homesrolo sessions', async () => {
  const authCalls: unknown[] = []
  const rpcCalls: unknown[] = []
  const authClient = {
    auth: {
      async signInWithOtp(input: unknown) { authCalls.push(input); return { error: null } },
      async verifyOtp(input: unknown) {
        authCalls.push(input)
        return { data: { user: { id: '8aa09ae2-64f8-4bbb-81ac-e5f3515001a2', email: 'Person@Example.com' } }, error: null }
      },
      async getUser(input: unknown) {
        authCalls.push({ getUser: input })
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

  const handoff = `hshr_${'s'.repeat(43)}`
  assert.equal(await service.requestMagicLink(' Person@Example.com ', 'storm_damage', handoff), 'accepted')
  const handle = await service.completeMagicLink('t'.repeat(43))
  assert.ok(handle)
  assert.match(handle, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual(authCalls[0], {
    email: 'person@example.com',
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `https://app.homesrolo.com/auth/complete?intent=storm_damage&handoff=${handoff}`,
    },
  })
  assert.deepEqual(authCalls[1], { token_hash: 't'.repeat(43), type: 'email' })
  const completion = rpcCalls[0] as { name: string; input: Record<string, unknown> }
  assert.equal(completion.name, 'homesrolo_complete_magic_link')
  assert.equal(completion.input.p_email_canonical, 'person@example.com')
  assert.equal(completion.input.p_session_hash, hashSessionHandle(handle))
  assert.ok(!JSON.stringify(completion).includes(handle), 'the raw handle is cookie-only')

  const exchangedHandle = await service.completeProviderAccessToken(`header.${'x'.repeat(40)}.signature`)
  assert.ok(exchangedHandle)
  assert.deepEqual(authCalls[2], { getUser: `header.${'x'.repeat(40)}.signature` })
  assert.equal((rpcCalls[1] as { name: string }).name, 'homesrolo_complete_magic_link')

  assert.equal(await service.requestEmailCode(' Person@Example.com '), 'accepted')
  const codeCompletion = await service.completeEmailCode(' Person@Example.com ', '012345')
  assert.equal(codeCompletion.kind, 'complete')
  assert.deepEqual(authCalls[3], {
    email: 'person@example.com',
    options: { shouldCreateUser: true },
  })
  assert.deepEqual(authCalls[4], {
    email: 'person@example.com', token: '012345', type: 'email',
  })
  assert.equal((rpcCalls[2] as { name: string }).name, 'homesrolo_complete_magic_link')
  if (codeCompletion.kind === 'complete') {
    assert.equal(
      (rpcCalls[2] as { input: Record<string, unknown> }).input.p_session_hash,
      hashSessionHandle(codeCompletion.sessionHandle),
    )
  }

  await service.revokeSession(handle)
  const revocation = rpcCalls[3] as { name: string; input: Record<string, unknown> }
  assert.equal(revocation.name, 'homesrolo_revoke_homeowner_session')
  assert.equal(revocation.input.p_session_hash, hashSessionHandle(handle))
})

test('email-code verification separates bad codes, throttling, and provider outages', async () => {
  const configuration = readHomeownerRuntimeConfiguration(CONFIG)
  assert.ok(configuration)
  const statuses = new Map([
    ['111111', 400],
    ['222222', 429],
    ['333333', 0],
    ['444444', 503],
  ])
  const verifyCalls: unknown[] = []
  const authClient = {
    auth: {
      async signInWithOtp() { return { error: null } },
      async verifyOtp(input: { token: string }) {
        verifyCalls.push(input)
        if (input.token === '555555') throw new Error('network detail')
        return {
          data: { user: null },
          error: { status: statuses.get(input.token), message: 'provider detail' },
        }
      },
    },
  } as unknown as SupabaseClient
  const service = new HomeownerAuthService({
    auth: authClient,
    service: { async rpc() { throw new Error('must not persist') } } as unknown as SupabaseClient,
    configuration,
  })

  assert.deepEqual(await service.completeEmailCode('person@example.com', '12345'), { kind: 'invalid' })
  assert.equal(verifyCalls.length, 0, 'malformed codes never reach the provider')
  assert.deepEqual(await service.completeEmailCode('person@example.com', '111111'), { kind: 'invalid' })
  assert.deepEqual(await service.completeEmailCode('person@example.com', '222222'), { kind: 'rate_limited' })
  assert.deepEqual(await service.completeEmailCode('person@example.com', '333333'), { kind: 'unavailable' })
  assert.deepEqual(await service.completeEmailCode('person@example.com', '444444'), { kind: 'unavailable' })
  await assert.rejects(service.completeEmailCode('person@example.com', '555555'), /network detail/)
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

test('the roofing project migration is private, exact-home scoped, and receipt-backed', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608120002_homeowner_roofing_projects.sql',
  ), 'utf8')
  assert.match(migration, /create table if not exists public\.homesrolo_homeowner_projects/i)
  assert.match(migration, /alter table public\.homesrolo_homeowner_projects enable row level security/i)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_projects from public, anon, authenticated/i)
  assert.match(migration, /role in \('workspace_controller', 'member'\)/i)
  assert.match(migration, /membership_ref = p_membership_ref[\s\S]+revision = p_membership_revision[\s\S]+state = 'active'/i)
  assert.match(migration, /category, status,[\s\S]+values \([\s\S]+'roofing', 'planned'/i)
  assert.match(migration, /action in \('home\.create', 'intake\.record', 'project\.create'\)/i)
  assert.match(migration, /grant execute on function public\.homesrolo_create_homeowner_roofing_project[\s\S]+to service_role/i)
  assert.doesNotMatch(migration, /grant (select|insert|update|delete|execute)[\s\S]+to (anon|authenticated)/i)
})

test('the all-home project migration preserves exact-home receipts and bounded categories', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608210002_homeowner_all_projects.sql',
  ), 'utf8')
  assert.match(migration, /create or replace function public\.homesrolo_create_homeowner_project/i)
  assert.match(migration, /role in \('workspace_controller', 'member'\)/i)
  assert.match(migration, /membership_ref = p_membership_ref[\s\S]+revision = p_membership_revision[\s\S]+state = 'active'/i)
  for (const category of ['new_construction', 'appliances', 'pest', 'pool']) {
    assert.match(migration, new RegExp(`'${category}'`, 'i'))
  }
  assert.match(migration, /action = 'project\.create'/i)
  assert.match(migration, /command_digest_mismatch/i)
  assert.match(migration, /grant execute on function public\.homesrolo_create_homeowner_project[\s\S]+to service_role/i)
  assert.doesNotMatch(migration, /create policy|grant (select|insert|update|delete|execute)[\s\S]+to (anon|authenticated)/i)
})

test('private artifact migration keeps bytes private and every command exact-home scoped', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608120003_homeowner_private_artifacts.sql',
  ), 'utf8')
  assert.match(migration, /'homesrolo-homeowner-private'[\s\S]+false[\s\S]+26214400/i)
  assert.match(migration, /allowed_mime_types[\s\S]+application\/pdf[\s\S]+image\/jpeg[\s\S]+image\/png/i)
  assert.match(migration, /alter table public\.homesrolo_homeowner_artifacts enable row level security/i)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_artifacts from public, anon, authenticated/i)
  assert.match(migration, /foreign key \(project_ref, home_ref\)[\s\S]+references public\.homesrolo_homeowner_projects\(project_ref, home_ref\)/i)
  assert.match(migration, /role = 'workspace_controller'/i)
  assert.match(migration, /membership_ref = p_membership_ref[\s\S]+revision = p_membership_revision[\s\S]+state = 'active'/i)
  assert.match(migration, /unique \(controller_principal_ref, command_ref\)/i)
  assert.match(migration, /storage_key text not null unique check \(storage_key ~/i)
  assert.match(migration, /check \(storage_key = home_ref \|\| '\/' \|\| storage_object_ref\)/i)
  assert.match(migration, /action in \('home\.create', 'intake\.record', 'project\.create', 'artifact\.upload'\)/i)
  assert.doesNotMatch(migration, /create policy|public\s*=\s*true|to (anon|authenticated)/i)
})

test('project quote migration is private, exact-project, receipt-backed, and revision safe', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608210001_homeowner_project_quotes.sql',
  ), 'utf8')
  assert.match(migration, /create table if not exists public\.homesrolo_homeowner_project_quotes/i)
  assert.match(migration, /alter table public\.homesrolo_homeowner_project_quotes enable row level security/i)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_project_quotes from public, anon, authenticated/i)
  assert.match(migration, /foreign key \(project_ref, home_ref, controller_principal_ref\)[\s\S]+homesrolo_homeowner_projects\([\s\S]*project_ref, home_ref, controller_principal_ref[\s\S]*\)/i)
  assert.match(migration, /foreign key \(artifact_ref, home_ref, project_ref, controller_principal_ref\)[\s\S]+homesrolo_homeowner_artifacts\([\s\S]*artifact_ref, home_ref, project_ref, controller_principal_ref[\s\S]*\)/i)
  assert.match(migration, /role = 'workspace_controller'/i)
  assert.match(migration, /kind = 'document'[\s\S]+media_type = 'application\/pdf'[\s\S]+state = 'available'/i)
  assert.match(migration, /revision <> p_expected_revision[\s\S]+quote_revision_conflict/i)
  assert.match(migration, /'quote\.create'[\s\S]+'quote\.save'/i)
  assert.match(migration, /command_digest_mismatch/i)
  assert.doesNotMatch(migration, /create policy|grant (select|insert|update|delete|execute)[\s\S]+to (anon|authenticated)/i)
})
