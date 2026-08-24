import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../../supabase/migrations/202608240001_homeowner_inbound_handoffs.sql',
), 'utf8')

test('service role can read handoff rows but may mutate them only through narrow RPCs', () => {
  for (const table of [
    'homesrolo_homeowner_handoff_recipients',
    'homesrolo_homeowner_handoffs',
    'homesrolo_homeowner_handoff_replay_conflicts',
    'homesrolo_homeowner_handoff_items',
    'homesrolo_homeowner_handoff_acceptance_commands',
    'homesrolo_homeowner_handoff_rejection_commands',
    'homesrolo_homeowner_handoff_claim_attempts',
  ]) {
    assert.match(migration, new RegExp(
      `revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role`,
    ), `${table} explicitly removes inherited service-role CRUD grants`)
  }
  const grantsStart = migration.indexOf(
    '-- The application reads exact private records directly',
  )
  const grantsEnd = migration.indexOf(
    '-- Immutability guards ensure even privileged application code',
    grantsStart,
  )
  assert.ok(grantsStart >= 0 && grantsEnd > grantsStart)
  const grants = migration.slice(grantsStart, grantsEnd)
  for (const table of [
    'homesrolo_homeowner_handoff_recipients',
    'homesrolo_homeowner_handoffs',
    'homesrolo_homeowner_handoff_items',
    'homesrolo_homeowner_handoff_acceptance_commands',
    'homesrolo_homeowner_handoff_rejection_commands',
  ]) {
    assert.match(grants, new RegExp(`grant select on table public\\.${table}\\s+to service_role`))
  }
  assert.doesNotMatch(grants, /grant\s+(?:[^;]*\b)?(?:insert|update|delete)\b[^;]*to service_role/i,
    'direct service-role writes would bypass exact revision and replay guards')
  assert.doesNotMatch(grants, /homesrolo_homeowner_handoff_replay_conflicts\s+to service_role/,
    'replay conflicts are written and reviewed only inside narrow RPCs')
})

test('exact-share claim admission is private, persisted, digest-only, and bounded', () => {
  const ledgerStart = migration.indexOf(
    'create table public.homesrolo_homeowner_handoff_claim_attempts',
  )
  const ledgerEnd = migration.indexOf(
    'alter table public.homesrolo_homeowner_handoff_recipients',
    ledgerStart,
  )
  assert.ok(ledgerStart >= 0 && ledgerEnd > ledgerStart)
  const ledger = migration.slice(ledgerStart, ledgerEnd)
  assert.match(ledger, /claim_digest text not null check \(claim_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/)
  assert.doesNotMatch(ledger, /\bshare_id\b/i,
    'the admission ledger must not retain guessed share IDs')
  assert.match(migration,
    /alter table public\.homesrolo_homeowner_handoff_claim_attempts enable row level security/)
  assert.match(migration,
    /revoke all on table public\.homesrolo_homeowner_handoff_claim_attempts\s+from public, anon, authenticated, service_role/)

  const functionStart = migration.indexOf(
    'create or replace function public.homesrolo_reserve_homeowner_handoff_claim_attempt',
  )
  const functionEnd = migration.indexOf(
    'create or replace function public.homesrolo_receive_homeowner_handoff',
    functionStart,
  )
  assert.ok(functionStart >= 0 && functionEnd > functionStart)
  const reservation = migration.slice(functionStart, functionEnd)
  assert.match(reservation, /security definer/)
  assert.match(reservation, /role = 'workspace_controller'/)
  assert.match(reservation, /revision = p_membership_revision/)
  assert.match(reservation, /revision = p_recipient_binding_revision/)
  assert.match(reservation, /controller_principal_ref = p_principal_ref/)
  assert.match(reservation, /home_ref = p_home_ref/)
  assert.match(reservation, /homesrolo:handoff-claim-attempts:global/)
  assert.match(reservation, /attempted_at < v_now - interval '24 hours'/)
  assert.match(reservation, /attempted_at >= v_now - interval '1 hour'/)
  assert.match(reservation, /v_scope_count >= 10/)
  assert.match(reservation, /v_global_count >= 100000/)
  assert.ok(
    reservation.indexOf('insert into public.homesrolo_homeowner_handoff_claim_attempts')
      > reservation.indexOf('v_scope_count >= 10'),
    'the durable attempt is inserted only after all admission checks',
  )
  assert.match(migration,
    /grant execute on function public\.homesrolo_reserve_homeowner_handoff_claim_attempt\([\s\S]*?\) to service_role/)
})

test('recipient revocation is an exact, revision-checked service-role RPC', () => {
  const start = migration.indexOf(
    'create or replace function public.homesrolo_revoke_homeowner_handoff_recipient',
  )
  const end = migration.indexOf(
    'create or replace function public.homesrolo_receive_homeowner_handoff',
    start,
  )
  assert.ok(start >= 0 && end > start)
  const revocation = migration.slice(start, end)
  assert.match(revocation, /security definer/)
  assert.match(revocation, /role = 'workspace_controller'/)
  assert.match(revocation, /revision = p_membership_revision/)
  assert.match(revocation, /v_recipient\.home_ref <> p_home_ref/)
  assert.match(revocation, /v_recipient\.controller_principal_ref <> p_principal_ref/)
  assert.match(revocation, /v_recipient\.revision <> p_expected_recipient_revision/)
  assert.match(revocation, /set state = 'revoked'/)
  assert.match(migration,
    /grant execute on function public\.homesrolo_revoke_homeowner_handoff_recipient\([\s\S]*?\) to service_role/)
})

test('the inbound migration has no measurement import or recipient catalog', () => {
  assert.doesNotMatch(migration, /\bmeasurements?\b/i)
  assert.doesNotMatch(migration, /recipient_(catalog|discovery)|discover_homeowner_handoff/i)
})
