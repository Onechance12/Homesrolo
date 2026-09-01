import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const rolloutGuardMigration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../../supabase/migrations/202609010000_safe_household_rollout_guards.sql',
), 'utf8')
const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../../supabase/migrations/202609010002_homeowner_principal_identity_continuity.sql',
), 'utf8')

function beforeTransitionalIdentityFunction(): string {
  const end = rolloutGuardMigration.indexOf(
    'create or replace function public.homesrolo_complete_magic_link',
  )
  assert.ok(end > 0)
  return rolloutGuardMigration.slice(0, end)
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}`)
  const revoke = source.indexOf(`revoke all on function public.${name}`, start)
  assert.ok(start >= 0 && revoke > start)
  return source.slice(start, revoke)
}

test('identity continuity refuses ambiguous existing emails before enforcing uniqueness', () => {
  const preflight = beforeTransitionalIdentityFunction()
  const canonicalGuard = preflight.indexOf(
    'where email_canonical <> lower(btrim(email_canonical))',
  )
  const canonicalFailure = preflight.indexOf(
    'homeowner_principal_email_noncanonical_requires_reconciliation',
  )
  const guard = preflight.indexOf('having count(*) > 1')
  const failure = preflight.indexOf('homeowner_principal_email_duplicates_require_reconciliation')
  const canonicalConstraint = preflight.indexOf(
    'homesrolo_homeowner_principals_email_canonical_form_check',
  )
  const uniqueIndex = preflight.indexOf('create unique index homesrolo_homeowner_principals_email_canonical_uidx')
  assert.ok(canonicalGuard >= 0 && canonicalFailure > canonicalGuard)
  assert.match(preflight, /group by lower\(btrim\(email_canonical\)\)/)
  assert.ok(guard > canonicalFailure && failure > guard)
  assert.ok(canonicalConstraint > failure && uniqueIndex > canonicalConstraint)
  assert.match(preflight,
    /update public\.homesrolo_homeowner_principals[\s\S]*set session_version = session_version \+ 1/i,
    'the controlled cutover invalidates sessions whose historical email rotation cannot be inferred')
  assert.doesNotMatch(preflight, /set email_canonical|set provider_user_id/i)
  assert.doesNotMatch(preflight, /delete from public\.homesrolo_homeowner_principals/i)
  assert.doesNotMatch(preflight, /homesrolo_homeowner_memberships|homesrolo_private_homes/i)
})

test('the predeploy identity function versions changes without guessing subject rotation', () => {
  const transitional = functionBody(rolloutGuardMigration, 'homesrolo_complete_magic_link')
  assert.match(transitional,
    /pg_advisory_xact_lock[\s\S]*homesrolo:homeowner-principal-identity/)
  assert.match(transitional,
    /where provider_user_id = p_provider_user_id[\s\S]*for update/)
  assert.doesNotMatch(transitional, /where email_canonical = p_email_canonical/)
  assert.match(transitional,
    /email_canonical is distinct from p_email_canonical[\s\S]*session_version/)
  assert.match(transitional, /insert into public\.homesrolo_homeowner_sessions/)
  assert.match(rolloutGuardMigration,
    /revoke all on function public\.homesrolo_complete_magic_link\([\s\S]*from public, anon, authenticated/)
  assert.match(rolloutGuardMigration,
    /grant execute on function public\.homesrolo_complete_magic_link\([\s\S]*to service_role/)
})

test('verified provider subject rotation keeps one principal and invalidates old sessions', () => {
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*homesrolo:homeowner-principal-identity/)
  assert.match(migration, /where provider_user_id = p_provider_user_id[\s\S]*for update/)
  assert.match(migration, /where email_canonical = p_email_canonical[\s\S]*for update/)
  assert.match(migration, /v_by_provider\.principal_ref <> v_by_email\.principal_ref[\s\S]*homeowner_principal_identity_conflict/)
  assert.match(migration, /set provider_user_id = p_provider_user_id[\s\S]*session_version = session_version \+ 1/)
  assert.match(migration, /email_canonical is distinct from p_email_canonical[\s\S]*then 1 else 0/)
  assert.match(migration, /v_principal\.principal_ref, v_principal\.session_version/)
})

test('identity reconciliation remains narrow and service-role-only', () => {
  const functionStart = migration.indexOf('create or replace function public.homesrolo_complete_magic_link')
  const functionEnd = migration.indexOf('revoke all on function public.homesrolo_complete_magic_link')
  const body = migration.slice(functionStart, functionEnd)
  assert.doesNotMatch(body, /homesrolo_homeowner_memberships|homesrolo_private_homes|conversation|artifact/i)
  assert.match(migration, /revoke all on function public\.homesrolo_complete_magic_link\([\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.homesrolo_complete_magic_link\([\s\S]*to service_role/)
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:public|anon|authenticated)/i)
})

test('the staged guard owns identity DDL and the final migration replaces only the function', () => {
  assert.equal((rolloutGuardMigration.match(
    /homesrolo_homeowner_principals_email_canonical_form_check/g,
  ) ?? []).length, 1)
  assert.equal((rolloutGuardMigration.match(
    /create unique index homesrolo_homeowner_principals_email_canonical_uidx/g,
  ) ?? []).length, 1)
  assert.doesNotMatch(migration,
    /homesrolo_homeowner_principals_email_canonical_form_check|homesrolo_homeowner_principals_email_canonical_uidx/)
  assert.equal((migration.match(/create or replace function public\./g) ?? []).length, 1)
  assert.doesNotMatch(migration, /alter table|create (?:unique )?index/i)
})
