import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const migration = readFileSync(path.join(
  import.meta.dirname,
  '../../../../supabase/migrations/202608250003_home_record_profile.sql',
), 'utf8')
const provider = readFileSync(path.join(
  import.meta.dirname,
  '../server/supabase-provider.ts',
), 'utf8')

test('Home Record migration keeps exact addresses private and complete', () => {
  for (const column of [
    'address_line_1', 'address_line_2', 'address_city', 'address_region_code',
    'address_postal_code', 'address_country_code', 'record_revision', 'record_updated_at',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`))
  }
  assert.match(migration, /address_country_code = 'US'/)
  assert.match(migration, /address_city is not null/)
  assert.match(migration, /address_region_code is not null/)
  assert.match(migration, /address_postal_code is not null/)
  assert.match(migration, /address_country_code is not null/)
  assert.match(migration, /address_postal_code ~ '\^\[0-9\]\{5\}/)
  assert.doesNotMatch(migration, /create policy|grant .* to authenticated|grant .* to anon/i,
    'the existing deny-by-default table does not gain a browser database policy')
  assert.doesNotMatch(migration, /measurement|square_foot|roof_area/i)
})

test('Home Record update is exact-controller, receipt-backed, and optimistic', () => {
  const functionBody = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_update_home_record'),
    migration.indexOf('-- Keep the older onboarding command'),
  )
  assert.match(functionBody, /role = 'workspace_controller'/)
  assert.match(functionBody, /revision = p_membership_revision/)
  assert.match(functionBody, /v_home\.record_revision <> p_expected_revision/)
  assert.match(functionBody, /home_record_revision_conflict/)
  assert.match(functionBody, /action = 'home_record\.update'/)
  assert.match(functionBody, /v_receipt\.home_ref is distinct from p_home_ref/)
  assert.match(functionBody, /p_address_country_code is null/)
  assert.match(functionBody, /p_systems is null/)
  assert.match(functionBody, /record_revision = record_revision \+ 1/)
  assert.ok(
    functionBody.indexOf("role = 'workspace_controller'")
      < functionBody.indexOf("action = 'home_record.update'"),
    'membership is rechecked before a prior receipt can be replayed',
  )
  assert.match(migration, /revoke all on function public\.homesrolo_update_home_record[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.homesrolo_update_home_record[\s\S]*to service_role/)
})

test('Home Record reads use one database snapshot with a fresh membership check', () => {
  const readFunction = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_read_home_record'),
    migration.indexOf('create or replace function public.homesrolo_update_home_record'),
  )
  assert.match(readFunction, /membership_ref = p_membership_ref/)
  assert.match(readFunction, /principal_ref = p_principal_ref/)
  assert.match(readFunction, /home_ref = p_home_ref/)
  assert.match(readFunction, /revision = p_membership_revision/)
  assert.match(readFunction, /state = 'active'/)
  assert.match(readFunction, /role in \('workspace_controller', 'member', 'viewer'\)/)
  assert.match(migration, /revoke all on function public\.homesrolo_read_home_record[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.homesrolo_read_home_record[\s\S]*to service_role/)

  const providerRead = provider.slice(
    provider.indexOf('async readHomeRecordProfile'),
    provider.indexOf('async listProjects'),
  )
  assert.match(providerRead, /rpc\('homesrolo_read_home_record'/)
  assert.doesNotMatch(providerRead, /Promise\.all|\.from\(/,
    'the aggregate must not be assembled from separately committed reads')
})

test('legacy intake participates in the same aggregate revision fence', () => {
  const legacy = migration.slice(migration.indexOf(
    'create or replace function public.homesrolo_record_initial_intake',
  ))
  assert.match(legacy, /homesrolo:home-record:/)
  assert.match(legacy, /record_revision = record_revision \+ 1/)
  assert.match(legacy, /initial_intake_already_recorded/)
  assert.match(legacy, /v_receipt\.result #>> '\{property_facts,home_ref\}'/)
  assert.ok(
    legacy.indexOf("role = 'workspace_controller'")
      < legacy.indexOf("action = 'intake.record'"),
    'legacy receipt replay also requires a current controller membership',
  )
})
