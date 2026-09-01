import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const migration = readFileSync(path.join(
  import.meta.dirname,
  '../../../../supabase/migrations/202608280001_homeowner_artifact_photo_metadata.sql',
), 'utf8')
const householdAccessMigration = readFileSync(path.join(
  import.meta.dirname,
  '../../../../supabase/migrations/202609010004_household_artifact_metadata_access.sql',
), 'utf8')

test('the original artifact metadata migration is controller-only, available-only, revisioned, and same-home', () => {
  assert.match(migration, /role = 'workspace_controller'/)
  assert.doesNotMatch(migration, /role in \('workspace_controller', 'member'\)/)
  assert.match(migration, /role = 'workspace_controller'[\s\S]{0,80}for share;[\s\S]{0,80}if not found then raise exception 'membership_not_authorized'/i,
    'controller authority is locked against a concurrent revocation through commit')
  assert.match(migration, /artifact_ref = p_artifact_ref[\s\S]*home_ref = p_home_ref[\s\S]*state = 'available'[\s\S]*for update/i)
  assert.doesNotMatch(
    migration,
    /artifact_ref = p_artifact_ref[\s\S]{0,180}controller_principal_ref = p_principal_ref/i,
    'the current controller may organize a same-home file originally uploaded by a member',
  )
  assert.match(migration, /project_ref = p_project_ref and home_ref = p_home_ref/)
  assert.match(migration, /v_artifact\.revision <> p_expected_revision/)
  assert.match(migration, /revision = revision \+ 1/)
})

test('the household correction admits adults while holding current authority through commit', () => {
  const principal = householdAccessMigration.indexOf(
    'from public.homesrolo_homeowner_principals',
  )
  const membership = householdAccessMigration.indexOf(
    'from public.homesrolo_homeowner_memberships',
  )
  const receipt = householdAccessMigration.indexOf('select * into v_receipt')
  assert.ok(principal >= 0 && principal < membership && membership < receipt)
  assert.match(householdAccessMigration.slice(principal, membership),
    /status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)
  assert.match(householdAccessMigration.slice(membership, receipt),
    /role in \('workspace_controller', 'member'\)[\s\S]*for share;/)
  assert.doesNotMatch(householdAccessMigration, /'viewer'/)
  assert.match(householdAccessMigration,
    /artifact_ref = p_artifact_ref[\s\S]*home_ref = p_home_ref[\s\S]*state = 'available'[\s\S]*for update/i)
  assert.match(householdAccessMigration,
    /project_ref = p_project_ref[\s\S]*home_ref = p_home_ref[\s\S]*archived_at is null/i)
  assert.match(householdAccessMigration,
    /revoke all on function public\.homesrolo_update_homeowner_artifact_metadata[\s\S]*from public, anon, authenticated/i)
  assert.match(householdAccessMigration,
    /grant execute on function public\.homesrolo_update_homeowner_artifact_metadata[\s\S]*to service_role/i)
})

test('legacy server uploads use the same current adult authority before replay', () => {
  for (const [name, replayMarker] of [
    ['homesrolo_reserve_homeowner_artifact_upload', 'select * into v_artifact'],
    ['homesrolo_finalize_homeowner_artifact_upload', 'select * into v_artifact'],
  ] as const) {
    const start = householdAccessMigration.indexOf(
      `create or replace function public.${name}`,
    )
    const next = householdAccessMigration.indexOf(
      'create or replace function public.',
      start + 1,
    )
    const body = householdAccessMigration.slice(start, next < 0 ? undefined : next)
    const principal = body.indexOf('from public.homesrolo_homeowner_principals')
    const membership = body.indexOf('from public.homesrolo_homeowner_memberships')
    const replay = body.indexOf(replayMarker)
    assert.ok(start >= 0 && principal >= 0 && principal < membership && membership < replay)
    assert.match(body.slice(principal, membership),
      /status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)
    assert.match(body.slice(membership, replay),
      /role in \('workspace_controller', 'member'\)[\s\S]*for share;/)
    assert.doesNotMatch(body, /'viewer'/)
    assert.match(householdAccessMigration,
      new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*from public, anon, authenticated`, 'i'))
    assert.match(householdAccessMigration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*to service_role`, 'i'))
  }
})

test('artifact metadata receipts are home-scoped, replay-safe, and retain no storage secrets', () => {
  assert.match(migration, /action = 'artifact\.metadata\.update'/)
  assert.match(migration, /created_at < p_requested_at - interval '30 days'/)
  assert.match(migration, /where action = 'artifact\.metadata\.update'[\s\S]*offset 63/)
  assert.match(migration, /v_receipt\.home_ref is distinct from p_home_ref/)
  assert.match(migration, /v_receipt\.result ->> 'artifact_ref' is distinct from p_artifact_ref/)
  const safeReceipt = migration.match(/v_result := jsonb_build_object\([\s\S]*?\n  \);/)?.[0]
  assert.ok(safeReceipt)
  assert.doesNotMatch(safeReceipt,
    /storage|payload|digest|principal|byte_length|project_ref|observed_on|photo_phase|area_label|geo_/i)
  assert.match(migration, /rebuild the[\s\S]*result without retaining precise location[\s\S]*'geo_latitude', p_geo_latitude/i,
    'receipt replay reconstructs digest-bound metadata from the retry instead of storing it')
  assert.match(migration, /revoke all on function public\.homesrolo_update_homeowner_artifact_metadata[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.homesrolo_update_homeowner_artifact_metadata[\s\S]*to service_role/i)
})

test('geo metadata is all-or-none, explicit-device provenance, and never sourced from EXIF', () => {
  assert.match(migration, /num_nonnulls\([\s\S]*geo_latitude[\s\S]*geo_provenance[\s\S]*\) in \(0, 5\)/i)
  assert.match(migration, /geo_provenance = 'device_confirmed'/)
  assert.doesNotMatch(migration, /exif_(read|extract)|image_bytes|metadata_extract/i)
})
