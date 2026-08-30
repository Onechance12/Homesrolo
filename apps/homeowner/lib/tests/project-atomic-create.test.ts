import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthorizedHomeownerAction } from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import { SupabaseHomeownerProvider } from '../server/supabase-provider.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principalRef = ref('hprn', 'p')
const homeRef = ref('hhom', 'h')
const commandRef = ref('hcmd', 'c')
const requestedAt = '2026-08-25T18:00:00.000Z'

const grant: AuthorizedHomeownerAction<'project.create'> = {
  authorized: true,
  principalRef,
  homeRef,
  membershipRef: ref('hmbr', 'm'),
  membershipRevision: 4,
  action: 'project.create',
  recheckedAt: requestedAt,
}

test('Supabase project create sends one digest-bound atomic project command', async () => {
  const calls: { name: string; input: Record<string, unknown> }[] = []
  const client = {
    async rpc(name: string, input: Record<string, unknown>) {
      calls.push({ name, input })
      return {
        data: {
          project_ref: input.p_project_ref,
          home_ref: homeRef,
          controller_principal_ref: principalRef,
          title: input.p_title,
          work_kind: input.p_work_kind,
          category: input.p_category,
          status: input.p_status,
          occurred_on: input.p_occurred_on,
          summary: input.p_summary,
          professional_label: input.p_professional_label,
          assigned_membership_ref: input.p_assigned_membership_ref,
          due_on: input.p_due_on,
          revision: 1,
          archived_at: null,
          created_at: input.p_requested_at,
          updated_at: input.p_requested_at,
        },
        error: null,
      }
    },
  } as unknown as SupabaseClient
  const provider = new SupabaseHomeownerProvider(client)
  const command = {
    commandRef,
    title: 'Kitchen remodel',
    workKind: 'project' as const,
    category: 'interior' as const,
    status: 'completed' as const,
    occurredOn: '2026-08-20',
    summary: 'Cabinets and counters completed.',
    professionalLabel: 'Sample Cabinet Company',
    assignedMembershipRef: ref('hmbr', 'a'),
    dueOn: '2026-09-05',
    initialActivity: { kind: 'milestone' as const, body: 'Final walkthrough recorded.' },
    requestedAt,
  }

  const created = await provider.createProject({ grant, command })
  assert.equal(created.professionalLabel, 'Sample Cabinet Company')
  assert.equal(calls[0]?.name, 'homesrolo_create_homeowner_project')
  assert.equal(calls[0]?.input.p_professional_label, 'Sample Cabinet Company')
  assert.equal(calls[0]?.input.p_assigned_membership_ref, ref('hmbr', 'a'))
  assert.equal(calls[0]?.input.p_due_on, '2026-09-05')
  assert.match(String(calls[0]?.input.p_initial_activity_ref), /^hact_[A-Za-z0-9_-]{43}$/)
  assert.equal(calls[0]?.input.p_initial_activity_kind, 'milestone')
  assert.equal(calls[0]?.input.p_initial_activity_body, 'Final walkthrough recorded.')

  await provider.createProject({
    grant,
    command: { ...command, requestedAt: '2026-08-25T18:05:00.000Z' },
  })
  assert.equal(calls[0]?.input.p_command_digest, calls[1]?.input.p_command_digest,
    'server execution time remains excluded from the atomic create receipt intent')
})

test('atomic create migration authorizes before replay and commits extras before one receipt', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608250005_homeowner_atomic_project_create.sql',
  ), 'utf8')
  const prior = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608250004_homeowner_project_work_kind.sql',
  ), 'utf8')
  const body = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_create_homeowner_project'),
    migration.indexOf('revoke all on function public.homesrolo_create_homeowner_project'),
  )

  assert.match(prior, /p_summary text,[\s\S]*p_requested_at timestamptz/,
    'the earlier create overload remains available to rolling clients')
  assert.doesNotMatch(migration, /drop function/i)
  assert.match(body, /p_professional_label text/)
  assert.match(body, /p_initial_activity_ref text[\s\S]*p_initial_activity_kind text[\s\S]*p_initial_activity_body text/)
  assert.match(body, /num_nonnulls\([\s\S]*\) not in \(0, 3\)/)
  assert.match(body, /pg_advisory_xact_lock/)
  assert.match(body, /command_digest_mismatch/)

  const membershipCheck = body.indexOf('if not exists (')
  const receiptRead = body.indexOf('select * into v_receipt')
  const projectInsert = body.indexOf('insert into public.homesrolo_homeowner_projects')
  const activityInsert = body.indexOf('insert into public.homesrolo_homeowner_project_activity')
  const receiptInsert = body.indexOf('insert into public.homesrolo_homeowner_command_receipts')
  assert.ok(membershipCheck >= 0 && membershipCheck < receiptRead,
    'revoked membership cannot replay an earlier create receipt')
  assert.ok(receiptRead < projectInsert && projectInsert < activityInsert
    && activityInsert < receiptInsert,
    'the project and optional activity are committed before the one create receipt')
  assert.match(body, /professional_label, created_at, updated_at/)
  assert.match(migration, /revoke all on function public\.homesrolo_create_homeowner_project\([\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.homesrolo_create_homeowner_project\([\s\S]*to service_role/)
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/i)
})
