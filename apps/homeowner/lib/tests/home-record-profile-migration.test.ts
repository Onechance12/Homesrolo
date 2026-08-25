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
  assert.match(functionBody, /v_receipt\.result->>'homeRef' is distinct from p_home_ref/)
  assert.match(functionBody, /p_address_country_code is null/)
  assert.match(functionBody, /p_systems is null/)
  assert.match(functionBody, /record_revision = record_revision \+ 1/)
  assert.match(functionBody, /interval '30 days'/)
  assert.match(functionBody, /offset 63/,
    'a home retains at most 64 exact-address update receipts after insertion')
  assert.match(functionBody, /'homeRef', v_home\.home_ref[\s\S]*'updatedAt', v_home\.record_updated_at/,
    'the receipt contains only the browser-safe Home Record v1 result')
  assert.doesNotMatch(functionBody, /to_jsonb\s*\(/,
    'rowtype expansion must not make future private columns enter a receipt')
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
  assert.match(readFunction, /role = 'workspace_controller'/)
  assert.doesNotMatch(readFunction, /role in \([^)]*member|role in \([^)]*viewer/,
    'the database repeats the controller-only read check')
  assert.doesNotMatch(readFunction, /to_jsonb\s*\(/,
    'future database columns cannot silently enter the browser projection')
  assert.match(migration, /revoke all on function public\.homesrolo_read_home_record[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.homesrolo_read_home_record[\s\S]*to service_role/)

  const providerRead = provider.slice(
    provider.indexOf('async readHomeRecordProfile'),
    provider.indexOf('async listProjects'),
  )
  assert.match(providerRead, /rpc\('homesrolo_read_home_record'/)
  assert.doesNotMatch(providerRead, /Promise\.all|\.from\(/,
    'the aggregate must not be assembled from separately committed reads')

  const providerHomeRead = provider.slice(
    provider.indexOf('async readHome(grant'),
    provider.indexOf('async readPropertyFacts'),
  )
  assert.match(providerHomeRead,
    /\.select\('home_ref,created_by_principal_ref,display_label,private_location_label,created_at,updated_at'\)/)
  assert.doesNotMatch(providerHomeRead, /\.select\('\*'\)|address_line_/,
    'generic home summaries never retrieve the exact address')
})

test('Home Record receipt storage is indexed, bounded, and explicitly projected', () => {
  assert.match(migration,
    /create index if not exists homesrolo_homeowner_command_receipts_home_ref_idx[\s\S]*\(home_ref\)/)
  assert.doesNotMatch(migration, /to_jsonb\s*\(/,
    'all affected RPC receipts use explicit field projections')
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
