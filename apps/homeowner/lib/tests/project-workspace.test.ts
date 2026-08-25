import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import type {
  AuthorizedHomeownerAction,
  AuthorizedHomeownerWorkspace,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import type {
  AppendHomeownerProjectActivityInput,
  SaveHomeownerProjectItemInput,
  UpdateHomeownerProjectInput,
} from '../../../../src/homeowner/homeowner-project-workspace.v1.ts'
import { createRemotePort } from '../port/remote.ts'
import type { JsonTransport, TransportRequest } from '../port/transport.ts'
import { SupabaseHomeownerProvider } from '../server/supabase-provider.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principalRef = ref('hprn', 'p')
const homeRef = ref('hhom', 'h')
const projectRef = ref('hprj', 'r')
const itemRef = ref('hpit', 'i')
const activityRef = ref('hact', 'a')
const commandRef = ref('hcmd', 'c')
const createdAt = '2026-08-24T12:00:00.000Z'
const requestedAt = '2026-08-25T12:00:00.000Z'

const readGrant: AuthorizedHomeownerWorkspace = {
  authorized: true,
  principalRef,
  homeRef,
  membershipRef: ref('hmbr', 'm'),
  membershipRevision: 4,
  action: 'workspace.read',
  recheckedAt: requestedAt,
}

const projectRow = {
  project_ref: projectRef,
  home_ref: homeRef,
  controller_principal_ref: principalRef,
  title: 'Kitchen update',
  category: 'interior',
  status: 'planned',
  occurred_on: null,
  summary: 'Choose materials.',
  professional_label: null,
  revision: 1,
  archived_at: null,
  created_at: createdAt,
  updated_at: createdAt,
}

test('Supabase provider excludes archives from default lists but reads exact archived refs', async () => {
  const filters: unknown[] = []
  const listChain = {
    select() { return this },
    eq(key: string, value: unknown) { filters.push(['eq', key, value]); return this },
    is(key: string, value: unknown) { filters.push(['is', key, value]); return this },
    async order() { return { data: [projectRow], error: null } },
  }
  const listProvider = new SupabaseHomeownerProvider({
    from(name: string) {
      assert.equal(name, 'homesrolo_homeowner_projects')
      return listChain
    },
  } as unknown as SupabaseClient)
  assert.equal((await listProvider.listProjects(readGrant)).length, 1)
  assert.deepEqual(filters, [
    ['eq', 'home_ref', homeRef],
    ['is', 'archived_at', null],
  ])

  const exactFilters: unknown[] = []
  const archivedAt = requestedAt
  const exactChain = {
    select() { return this },
    eq(key: string, value: unknown) { exactFilters.push([key, value]); return this },
    async maybeSingle() {
      return {
        data: { ...projectRow, revision: 2, archived_at: archivedAt, updated_at: archivedAt },
        error: null,
      }
    },
  }
  const exactProvider = new SupabaseHomeownerProvider({
    from() { return exactChain },
  } as unknown as SupabaseClient)
  const exact = await exactProvider.readProject(readGrant, projectRef)
  assert.equal(exact?.archivedAt, archivedAt)
  assert.deepEqual(exactFilters, [['home_ref', homeRef], ['project_ref', projectRef]])
})

test('Supabase workspace commands preserve exact grant fields and stable receipt digests', async () => {
  const calls: { name: string; input: Record<string, unknown> }[] = []
  const client = {
    async rpc(name: string, input: Record<string, unknown>) {
      calls.push({ name, input })
      if (name === 'homesrolo_update_homeowner_project') {
        return {
          data: {
            ...projectRow,
            title: input.p_title,
            work_kind: input.p_work_kind,
            professional_label: input.p_professional_label,
            revision: 2,
            archived_at: input.p_requested_at,
            updated_at: input.p_requested_at,
          },
          error: null,
        }
      }
      if (name === 'homesrolo_append_homeowner_project_activity') {
        return {
          data: {
            activity_ref: activityRef,
            home_ref: homeRef,
            project_ref: projectRef,
            actor_principal_ref: principalRef,
            kind: input.p_kind,
            body: input.p_body,
            source: 'homeowner_entry',
            created_at: input.p_requested_at,
          },
          error: null,
        }
      }
      return {
        data: {
          item_ref: input.p_item_ref,
          home_ref: homeRef,
          project_ref: projectRef,
          created_by_principal_ref: principalRef,
          kind: input.p_kind,
          label: input.p_label,
          detail: input.p_detail,
          state: input.p_state,
          source: 'homeowner_entry',
          revision: input.p_expected_revision === null ? 1 : 2,
          created_at: createdAt,
          updated_at: input.p_requested_at,
        },
        error: null,
      }
    },
  } as unknown as SupabaseClient
  const provider = new SupabaseHomeownerProvider(client)
  const updateGrant: AuthorizedHomeownerAction<'project.update'> = {
    ...readGrant,
    action: 'project.update',
  }
  const update: UpdateHomeownerProjectInput = {
    commandRef,
    projectRef,
    expectedRevision: 1,
    title: 'Kitchen remodel',
    workKind: 'service',
    professionalLabel: 'Sample Cabinets',
    archived: true,
    requestedAt,
  }
  const updated = await provider.updateProject({ grant: updateGrant, command: update })
  assert.equal(updated.revision, 2)
  assert.equal(updated.workKind, 'service')
  assert.equal(updated.archivedAt, requestedAt)
  assert.equal(calls[0]?.input.p_membership_revision, 4)
  assert.equal(calls[0]?.input.p_home_ref, homeRef)
  assert.equal(calls[0]?.input.p_project_ref, projectRef)
  assert.equal(calls[0]?.input.p_set_title, true)
  assert.equal(calls[0]?.input.p_set_work_kind, true)
  assert.equal(calls[0]?.input.p_work_kind, 'service')
  assert.equal(calls[0]?.input.p_set_status, false)

  await provider.updateProject({
    grant: updateGrant,
    command: { ...update, requestedAt: '2026-08-25T12:05:00.000Z' },
  })
  assert.equal(calls[0]?.input.p_command_digest, calls[1]?.input.p_command_digest,
    'server execution time is excluded from receipt intent')

  const activityGrant: AuthorizedHomeownerAction<'project.activity.append'> = {
    ...readGrant,
    action: 'project.activity.append',
  }
  const activityCommand: AppendHomeownerProjectActivityInput = {
    commandRef: ref('hcmd', 'a'),
    projectRef,
    kind: 'note',
    body: 'Cabinet samples arrived.',
    requestedAt,
  }
  assert.equal((await provider.appendProjectActivity({
    grant: activityGrant,
    command: activityCommand,
  })).activityRef, activityRef)

  const itemGrant: AuthorizedHomeownerAction<'project.item.save'> = {
    ...readGrant,
    action: 'project.item.save',
  }
  const itemCommand: SaveHomeownerProjectItemInput = {
    commandRef: ref('hcmd', 'i'),
    projectRef,
    itemRef,
    expectedRevision: 1,
    kind: 'material',
    label: 'White oak cabinet fronts',
    detail: 'Natural finish selected.',
    state: 'chosen',
    requestedAt,
  }
  assert.equal((await provider.saveProjectItem({ grant: itemGrant, command: itemCommand })).revision, 2)
})

test('Supabase provider maps project and item revision conflicts without leaking details', async () => {
  const provider = new SupabaseHomeownerProvider({
    async rpc(name: string) {
      return {
        data: null,
        error: { message: name.includes('project_item')
          ? 'project_item_revision_conflict'
          : 'project_revision_conflict' },
      }
    },
  } as unknown as SupabaseClient)
  await assert.rejects(provider.updateProject({
    grant: { ...readGrant, action: 'project.update' },
    command: {
      commandRef,
      projectRef,
      expectedRevision: 1,
      title: 'New title',
      requestedAt,
    },
  }), (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict')
  await assert.rejects(provider.saveProjectItem({
    grant: { ...readGrant, action: 'project.item.save' },
    command: {
      commandRef,
      projectRef,
      itemRef,
      expectedRevision: 1,
      kind: 'material',
      label: 'White oak',
      state: 'chosen',
      requestedAt,
    },
  }), (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict')
})

test('remote port uses native-safe JSON contracts for update, activity, and items', async () => {
  const requests: TransportRequest[] = []
  const projectView = {
    projectRef,
    homeRef,
    title: 'Kitchen remodel',
    category: 'interior',
    status: 'planned',
    occurredOn: null,
    summary: 'Choose materials.',
    professionalLabel: 'Sample Cabinets',
    revision: 2,
    archived: true,
    archivedAt: requestedAt,
    createdAt,
    updatedAt: requestedAt,
  }
  const activityView = {
    activityRef,
    homeRef,
    projectRef,
    kind: 'note',
    body: 'Cabinet samples arrived.',
    source: 'homeowner_entry',
    createdAt: requestedAt,
  }
  const itemView = {
    itemRef,
    homeRef,
    projectRef,
    kind: 'material',
    label: 'White oak',
    detail: '',
    state: 'considering',
    source: 'homeowner_entry',
    revision: 1,
    createdAt: requestedAt,
    updatedAt: requestedAt,
  }
  const transport: JsonTransport = async request => {
    requests.push(request)
    if (request.path.endsWith('/update')) {
      return { kind: 'reply', status: 200, body: { data: projectView } }
    }
    if (request.path.endsWith('/activity')) {
      return {
        kind: 'reply',
        status: request.method === 'GET' ? 200 : 201,
        body: { data: request.method === 'GET' ? [activityView] : activityView },
      }
    }
    const updating = request.method === 'POST'
      && typeof request.body === 'object'
      && request.body !== null
      && Object.hasOwn(request.body, 'itemRef')
    return {
      kind: 'reply',
      status: request.method === 'GET' ? 200 : updating ? 200 : 201,
      body: {
        data: request.method === 'GET'
          ? [itemView]
          : updating ? { ...itemView, state: 'chosen', revision: 2 } : itemView,
      },
    }
  }
  const port = createRemotePort(transport)
  assert.equal((await port.updateProject(homeRef, projectRef, {
    commandRef,
    expectedRevision: 1,
    title: ' Kitchen remodel ',
    professionalLabel: ' Sample Cabinets ',
    archived: true,
  })).ok, true)
  assert.equal((await port.listProjectActivity(homeRef, projectRef)).ok, true)
  assert.equal((await port.addProjectActivity(homeRef, projectRef, {
    commandRef,
    kind: 'note',
    body: ' Cabinet samples arrived. ',
  })).ok, true)
  assert.equal((await port.listProjectItems(homeRef, projectRef)).ok, true)
  assert.equal((await port.saveProjectItem(homeRef, projectRef, {
    commandRef,
    kind: 'material',
    label: ' White oak ',
    state: 'considering',
  })).ok, true)
  assert.equal((await port.saveProjectItem(homeRef, projectRef, {
    commandRef: ref('hcmd', 'u'),
    itemRef,
    expectedRevision: 1,
    kind: 'material',
    label: 'White oak',
    state: 'chosen',
  })).ok, true)
  assert.deepEqual(requests[0], {
    method: 'POST',
    path: `/api/v1/homes/${homeRef}/projects/${projectRef}/update`,
    body: {
      commandRef,
      expectedRevision: 1,
      title: 'Kitchen remodel',
      professionalLabel: 'Sample Cabinets',
      archived: true,
    },
  })
  const beforeInvalid = requests.length
  assert.deepEqual(await port.saveProjectItem(homeRef, projectRef, {
    commandRef,
    itemRef,
    kind: 'material',
    label: 'White oak',
    state: 'chosen',
  }), { ok: false, error: 'invalid' })
  assert.equal(requests.length, beforeInvalid)

  const conflict = createRemotePort(async () => ({
    kind: 'reply', status: 409, body: { error: { code: 'conflict' } },
  }))
  assert.deepEqual(await conflict.updateProject(homeRef, projectRef, {
    commandRef, expectedRevision: 1, archived: true,
  }), { ok: false, error: 'conflict' })
})

test('project workspace migration is exact-home, receipt-backed, and append-only', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608250001_homeowner_project_workspace.sql',
  ), 'utf8')
  for (const table of [
    'homesrolo_homeowner_project_activity',
    'homesrolo_homeowner_project_items',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(migration, new RegExp(
      `revoke all on table public\\.${table} from public, anon, authenticated`,
      'i',
    ))
  }
  assert.match(migration, /before update or delete on public\.homesrolo_homeowner_project_activity/i)
  assert.match(migration, /project_activity_is_append_only/i)
  assert.match(migration, /grant select, insert on table public\.homesrolo_homeowner_project_activity to service_role/i)
  assert.doesNotMatch(migration, /grant[^;]*update[^;]*homesrolo_homeowner_project_activity/i)
  assert.doesNotMatch(migration, /delete from public\.homesrolo_homeowner_projects/i)
  assert.match(migration, /p_expected_revision is null or p_expected_revision < 1[\s\S]+invalid_expected_revision/i)
  assert.match(migration, /p_expected_revision is not null and p_expected_revision < 1[\s\S]+invalid_expected_revision/i)
  assert.match(migration, /p_set_title is null[\s\S]+p_set_archived is null[\s\S]+invalid_project_update_flags/i)
  assert.doesNotMatch(migration, /add constraint homesrolo_projects_ref_home_unique/i)
  assert.match(migration, /project_category_has_roof_records/i)
  assert.match(migration, /homesrolo_homeowner_project_quotes[\s\S]+homesrolo_homeowner_project_submissions/i)
  assert.match(migration, /revision <> p_expected_revision[\s\S]+project_revision_conflict/i)
  assert.match(migration, /v_item\.revision <> p_expected_revision[\s\S]+project_item_revision_conflict/i)
  assert.match(migration, /project_ref = p_project_ref and home_ref = p_home_ref/gi)
  assert.match(migration, /membership_ref = p_membership_ref[\s\S]+revision = p_membership_revision[\s\S]+state = 'active'/i)
  for (const action of ['project.update', 'project.activity.append', 'project.item.save']) {
    assert.match(migration, new RegExp(`action = '${action.replaceAll('.', '\\.')}'`, 'i'))
    assert.match(migration, new RegExp(`:${action.replaceAll('.', '\\.')}'`, 'i'))
  }
  assert.equal(
    [...migration.matchAll(/membership_not_authorized/gi)].length,
    3,
    'every workspace mutation must re-check current membership before receipt replay',
  )
  assert.equal([...migration.matchAll(/select \* into v_receipt/gi)].length, 3)
  assert.ok(
    migration.indexOf('membership_not_authorized') < migration.indexOf('select * into v_receipt'),
    'project update must not replay a receipt after membership is revoked',
  )
  assert.match(migration, /command_digest_mismatch/gi)
  assert.doesNotMatch(migration, /create policy|to (anon|authenticated)/i)
})

test('work kind migration reuses the project table and keeps old callers compatible', () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/202608250004_homeowner_project_work_kind.sql',
  ), 'utf8')
  assert.match(migration, /add column if not exists work_kind text not null default 'project'/i)
  assert.match(migration, /work_kind in \('project', 'issue', 'repair', 'service', 'incident'\)/i)
  assert.match(migration, /p_work_kind text/i)
  assert.match(migration, /p_set_work_kind boolean/i)
  assert.match(migration, /work_kind = case when p_set_work_kind then p_work_kind else work_kind end/i)
  assert.doesNotMatch(migration, /create table[^;]*work_kind/i)
})
