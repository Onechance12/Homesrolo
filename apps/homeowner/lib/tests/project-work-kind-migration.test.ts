import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../../supabase/migrations/202608250004_homeowner_project_work_kind.sql',
), 'utf8')
const provider = readFileSync(path.resolve(
  import.meta.dirname,
  '../server/supabase-provider.ts',
), 'utf8')

test('work kind extends the existing project spine without creating parallel storage', () => {
  assert.match(migration, /alter table public\.homesrolo_homeowner_projects[\s\S]*add column if not exists work_kind text not null default 'project'/)
  assert.match(migration, /check \(work_kind in \('project', 'issue', 'repair', 'service', 'incident'\)\)/)
  assert.doesNotMatch(migration, /create table/i)
  assert.doesNotMatch(migration, /measurement/i)
  assert.doesNotMatch(migration, /create policy|grant .* to authenticated|grant .* to anon/i)
})

test('work-kind writes retain exact-home membership, receipt, and revision protections', () => {
  const create = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_create_homeowner_project'),
    migration.indexOf('-- The new update overload'),
  )
  const update = migration.slice(migration.indexOf('-- The new update overload'))
  for (const body of [create, update]) {
    assert.match(body, /membership_ref = p_membership_ref/)
    assert.match(body, /principal_ref = p_principal_ref/)
    assert.match(body, /home_ref = p_home_ref/)
    assert.match(body, /revision = p_membership_revision/)
    assert.match(body, /state = 'active'/)
    assert.match(body, /role in \('workspace_controller', 'member'\)/)
    assert.match(body, /homesrolo_homeowner_command_receipts/)
  }
  assert.match(update, /v_project\.revision <> p_expected_revision/)
  assert.match(update, /work_kind = case when p_set_work_kind then p_work_kind else work_kind end/)
  assert.match(migration, /revoke all on function public\.homesrolo_create_homeowner_project[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /revoke all on function public\.homesrolo_update_homeowner_project[\s\S]*from public, anon, authenticated/)
  assert.ok((migration.match(/grant execute on function public\.homesrolo_(?:create|update)_homeowner_project[\s\S]*?to service_role/g) ?? []).length >= 2)
})

test('the provider sends the discriminator through the existing project RPCs', () => {
  assert.match(provider, /p_work_kind: input\.command\.workKind/)
  assert.match(provider, /p_set_work_kind: Object\.hasOwn\(command, 'workKind'\)/)
  assert.match(provider, /workKind: typeof row\.work_kind === 'string' \? row\.work_kind : undefined/)
})
