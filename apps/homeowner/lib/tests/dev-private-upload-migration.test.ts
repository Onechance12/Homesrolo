import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../../supabase/migrations/202608250002_homeowner_dev_private_uploads.sql',
), 'utf8')

test('development upload bucket is private, byte-bounded, and has no browser policy', () => {
  assert.match(migration, /'homesrolo-homeowner-dev-uploads'[\s\S]*false,[\s\S]*10485760,[\s\S]*application\/octet-stream/)
  assert.doesNotMatch(migration, /create\s+policy/i)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_dev_upload_reservations[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_retired_upload_buckets[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /storage_bucket in \([\s\S]*homesrolo-homeowner-private[\s\S]*homesrolo-homeowner-dev-uploads/)
})

test('reservation permanently charges authority and caps development storage below free tier', () => {
  assert.match(migration, /authorized_byte_length integer not null default 10485760[\s\S]*authorized_byte_length = 10485760/)
  assert.match(migration, /sum\(authorized_byte_length\)[\s\S]*v_home_bytes \+ 10485760 > 524288000/)
  assert.match(migration, /v_principal_bytes \+ 10485760 > 524288000/)
  assert.match(migration, /v_global_bytes \+ 10485760 > 629145600/)
  assert.doesNotMatch(migration, /delete from public\.homesrolo_homeowner_dev_upload_reservations/i)
  assert.doesNotMatch(migration, /update public\.homesrolo_homeowner_dev_upload_reservations[\s\S]{0,300}(objects_cleaned_at|staging_cleaned_at)/i)
  assert.match(migration, /sum\(authorized_byte_length\)[\s\S]*quota_released_at is null/)
  assert.match(migration, /homesrolo_retire_dev_homeowner_upload_bucket[\s\S]*upload_bucket_still_exists[\s\S]*artifact_still_references_bucket/)
  assert.match(migration, /homesrolo_homeowner_retired_upload_buckets[\s\S]*retired_upload_bucket_recreated/)
})

test('all upload RPCs authorize exact active controller or member and stay service-role only', () => {
  for (const name of [
    'homesrolo_reserve_dev_homeowner_artifact_upload',
    'homesrolo_issue_dev_homeowner_artifact_token',
    'homesrolo_claim_dev_homeowner_artifact_completion',
    'homesrolo_release_dev_homeowner_artifact_completion',
    'homesrolo_reject_dev_homeowner_artifact_upload',
    'homesrolo_finalize_dev_homeowner_artifact_upload',
    'homesrolo_retire_dev_homeowner_upload_bucket',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`))
  }
  assert.ok((migration.match(/state = 'active'[\s\S]{0,100}role in \('workspace_controller', 'member'\)/g) ?? []).length >= 6)
  assert.doesNotMatch(migration, /role in \('workspace_controller', 'member', 'viewer'\)/)
})

test('issuance, completion attempts, and DB-clock fenced leases are bounded', () => {
  assert.match(migration, /signed_upload_issuance_count between 0 and 3/)
  assert.match(migration, /completion_claim_count between 0 and 3/)
  assert.match(migration, /completion_claim_count <= signed_upload_issuance_count/)
  assert.match(migration, /completion_claim_count >= v_upload\.signed_upload_issuance_count/)
  assert.match(migration, /v_now timestamptz := clock_timestamp\(\)/)
  assert.match(migration, /completion_lease_expires_at = v_now \+ interval '2 minutes'/)
  assert.match(migration, /state = 'processing'[\s\S]*completion_lease_token = p_lease_token/)
  assert.ok((migration.match(/completion_lease_expires_at > v_now/g) ?? []).length >= 5,
    'capacity, finalize, release, and reject all use the authoritative live lease')
  assert.match(migration, /or v_upload\.completion_lease_expires_at <= v_now then[\s\S]*raise exception 'lease_mismatch'/)
  assert.match(migration, /state = 'processing'[\s\S]{0,150}completion_lease_token is not null[\s\S]{0,150}completion_lease_expires_at is not null[\s\S]{0,250}state <> 'processing'[\s\S]{0,150}completion_lease_token is null[\s\S]{0,150}completion_lease_expires_at is null/)
  assert.match(migration, /storage_bucket,[\s\S]*'homesrolo-homeowner-dev-uploads'/)
})

test('migration declarations are retry-safe at dashboard boundaries', () => {
  assert.match(migration, /create table if not exists public\.homesrolo_homeowner_retired_upload_buckets/)
  assert.match(migration, /create table if not exists public\.homesrolo_homeowner_dev_upload_reservations/)
  assert.ok((migration.match(/create index if not exists/g) ?? []).length >= 2)
  assert.match(migration, /on conflict \(id\) do update set[\s\S]*public = false/)
})
