import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(new URL('../../../../supabase/migrations/202609050003_home_property_research.sql', import.meta.url), 'utf8')
function body(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0)
  return migration.slice(start, migration.indexOf('\n$$;', start) + 4)
}

test('property snapshot storage is additive, deny-by-default and RPC-only', () => {
  for (const table of ['homesrolo_home_property_snapshots', 'homesrolo_home_property_receipts', 'homesrolo_property_lookup_limits']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`))
  }
  assert.doesNotMatch(migration, /create policy|grant (?:select|insert|update|delete)|alter table public\.homesrolo_private_homes|homeowner_command_receipts/)
  for (const rpc of ['homesrolo_consume_property_lookup', 'homesrolo_read_property_snapshot', 'homesrolo_save_property_snapshot']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[^;]+from public, anon, authenticated`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`))
    assert.match(body(rpc), /security definer set search_path = public, pg_temp/)
  }
})

test('property snapshot save locks fresh authority and binds exact saved address before replay', () => {
  const save = body('homesrolo_save_property_snapshot')
  assert.match(save, /homesrolo:home-record:/)
  assert.match(save, /status = 'active' and email_verified = true\s+for share/)
  assert.match(save, /state = 'active' and role = 'workspace_controller'\s+for share/)
  assert.match(save, /p_address is distinct from v_address/)
  assert.ok(save.indexOf('property_address_mismatch') < save.indexOf('select * into v_receipt'))
  assert.match(save, /v_receipt\.command_digest <> p_command_digest or v_receipt\.home_ref <> p_home_ref/)
  assert.match(save, /v_snapshot\.reviewed_facts is distinct from p_facts/)
  assert.match(save, /v_snapshot\.original_lookup is distinct from v_lookup/)
  assert.match(save, /property_snapshot_exists/)
  assert.doesNotMatch(save, /update public\.|delete from public\.|to_jsonb\(/)
})

test('property snapshot readers are current controllers or adult members, never viewers or pro grants', () => {
  const read = body('homesrolo_read_property_snapshot')
  assert.match(read, /status = 'active' and email_verified = true\s+for share/)
  assert.match(read, /principal_ref = p_principal_ref and home_ref = p_home_ref/)
  assert.match(read, /state = 'active' and role in \('workspace_controller', 'member'\)\s+for share/)
  assert.match(read, /homesrolo:home-record:/)
  assert.match(read, /where home_ref = p_home_ref for share/)
  assert.match(read, /'address', v_snapshot\.address, 'facts', v_snapshot\.reviewed_facts/)
  assert.doesNotMatch(read, /v_snapshot\.address is distinct from v_address then return null/)
  assert.doesNotMatch(read, /role in \([^)]*viewer|professional_|to_jsonb\(/)
})

test('shared lookup limits have fixed principal/global ceilings and touch no home records', () => {
  const limiter = body('homesrolo_consume_property_lookup')
  assert.match(limiter, /pg_advisory_xact_lock\(hashtextextended\('homesrolo:property-lookup:global'/)
  assert.match(limiter, /coalesce\(v_global, 0\) >= 1000 or coalesce\(v_principal, 0\) >= 8/)
  assert.match(limiter, /window_started_at <= v_now - interval '10 minutes'/)
  assert.doesNotMatch(limiter, /\bp_limit\b|\bp_window\b|session|address|homesrolo_private_homes|property_snapshots|property_receipts/)
  const receipts = migration.slice(migration.indexOf('create table public.homesrolo_home_property_receipts'), migration.indexOf('-- One ten-minute'))
  assert.doesNotMatch(receipts, /address|jsonb|lookup|session/)
})
