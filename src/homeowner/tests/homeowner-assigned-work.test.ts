import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  HomeownerApiError,
  HomeownerApiService,
} from '../homeowner-api.v1.ts'
import {
  homeownerProjectWorkspaceCommandIntent,
  type HomeownerProjectWorkspacePort,
} from '../homeowner-project-workspace.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  createHomeownerProjectInputSchema,
  homeownerProjectCommandIntent,
  homeownerProjectSchema,
  homeownerProjectWorkKindSchema,
  type HomeownerCommandPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerProject,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principalRef = ref('hprn', 'p')
const memberPrincipalRef = ref('hprn', 'q')
const homeRef = ref('hhom', 'h')
const otherHomeRef = ref('hhom', 'x')
const actorMembershipRef = ref('hmbr', 'm')
const assignedMembershipRef = ref('hmbr', 'a')
const projectRef = ref('hprj', 'r')
const commandRef = ref('hcmd', 'c')
const now = '2026-08-30T12:00:00.000Z'
const later = '2026-08-30T13:00:00.000Z'
const context = { sessionHandle: 'opaque-session' }

const principal: HomeownerPrincipal = {
  principalRef,
  status: 'active',
  emailVerified: true,
  sessionVersion: 1,
}

const actorMembership: HomeownerMembership = {
  membershipRef: actorMembershipRef,
  principalRef,
  homeRef,
  role: 'workspace_controller',
  basis: 'self_created_workspace',
  state: 'active',
  relationshipLabel: 'claimed_unverified',
  revision: 2,
  createdAt: now,
}

const assigneeMembership: HomeownerMembership = {
  membershipRef: assignedMembershipRef,
  principalRef: memberPrincipalRef,
  homeRef,
  role: 'member',
  basis: 'accepted_invitation',
  state: 'active',
  relationshipLabel: 'invited_participant',
  revision: 1,
  createdAt: now,
}

function baseProject(overrides: Partial<HomeownerProject> = {}): HomeownerProject {
  return homeownerProjectSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    projectRef,
    homeRef,
    controllerPrincipalRef: principalRef,
    title: 'Patch the hallway wall',
    workKind: 'task',
    category: 'interior',
    status: 'planned',
    assignedMembershipRef,
    dueOn: '2026-09-05',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })
}

function makeService(options: {
  assigned?: HomeownerMembership | null
  initialProject?: HomeownerProject
} = {}) {
  let current = options.initialProject ?? baseProject()
  let receivedCreate: Parameters<HomeownerCommandPort['createProject']>[0] | null = null
  const assigned = options.assigned === undefined ? assigneeMembership : options.assigned
  const repository: HomeownerRepositoryPort = {
    async listMemberships() { return [actorMembership] },
    async readMembership(readPrincipalRef, readHomeRef) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef
        ? actorMembership
        : null
    },
    async readMembershipByRef() { return assigned },
    async readHome() { return null },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects() { return [current] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
  }
  const commands: HomeownerCommandPort = {
    async createPrivateHomeWorkspace() { throw new Error('not used') },
    async recordInitialIntake() { throw new Error('not used') },
    async createProject(input) {
      receivedCreate = input
      current = baseProject({
        title: input.command.title,
        workKind: input.command.workKind,
        category: input.command.category,
        status: input.command.status,
        ...(input.command.summary ? { summary: input.command.summary } : {}),
        ...(input.command.assignedMembershipRef
          ? { assignedMembershipRef: input.command.assignedMembershipRef }
          : {}),
        ...(input.command.dueOn ? { dueOn: input.command.dueOn } : {}),
        createdAt: input.command.requestedAt,
        updatedAt: input.command.requestedAt,
      })
      return current
    },
  }
  const workspace: HomeownerProjectWorkspacePort = {
    async readProject(_grant, readProjectRef) {
      return readProjectRef === projectRef ? current : null
    },
    async listProjectActivity() { return [] },
    async listProjectItems() { return [] },
    async appendProjectActivity() { throw new Error('not used') },
    async saveProjectItem() { throw new Error('not used') },
    async updateProject({ command }) {
      if (command.expectedRevision !== current.revision) {
        throw new HomeownerApiError('conflict')
      }
      current = baseProject({
        ...current,
        ...(command.workKind === undefined ? {} : { workKind: command.workKind }),
        ...(Object.hasOwn(command, 'assignedMembershipRef')
          ? command.assignedMembershipRef === null
            ? { assignedMembershipRef: undefined }
            : { assignedMembershipRef: command.assignedMembershipRef }
          : {}),
        ...(Object.hasOwn(command, 'dueOn')
          ? command.dueOn === null ? { dueOn: undefined } : { dueOn: command.dueOn }
          : {}),
        revision: current.revision + 1,
        updatedAt: command.requestedAt,
      })
      return current
    },
  }
  const service = new HomeownerApiService({
    identity: { async resolvePrincipal(handle) { return handle === context.sessionHandle ? principal : null } },
    repository,
    commands,
    projectWorkspace: workspace,
    now: () => now,
    capabilities: {
      emailCodeSignIn: true,
      magicLinkSignIn: false,
      persistence: true,
      projectQuotes: false,
      homeResearch: false,
      homeAssistant: false,
      homeAssistantVision: false,
      uploads: false,
      photoCheckups: false,
      projectReview: false,
      projectReviewAttachments: false,
      homeRecordHandoffs: false,
      invitations: false,
      sharing: false,
    },
  })
  return { service, getReceivedCreate: () => receivedCreate }
}

test('assigned Work contracts add task, assignee, and a real due date without a second model', () => {
  assert.equal(homeownerProjectWorkKindSchema.parse('task'), 'task')
  assert.equal(homeownerProjectWorkKindSchema.safeParse('chore').success, false)
  const command = createHomeownerProjectInputSchema.parse({
    commandRef,
    title: 'Patch the hallway wall',
    workKind: 'task',
    category: 'interior',
    status: 'planned',
    assignedMembershipRef,
    dueOn: '2026-09-05',
    requestedAt: now,
  })
  assert.equal(command.assignedMembershipRef, assignedMembershipRef)
  assert.equal(command.dueOn, '2026-09-05')
  assert.equal(createHomeownerProjectInputSchema.safeParse({
    ...command,
    dueOn: '2026-02-30',
  }).success, false)

  const retry = { ...command, requestedAt: later }
  assert.deepEqual(homeownerProjectCommandIntent(command), homeownerProjectCommandIntent(retry))
  assert.deepEqual(
    homeownerProjectWorkspaceCommandIntent({
      commandRef,
      projectRef,
      expectedRevision: 1,
      assignedMembershipRef,
      dueOn: '2026-09-05',
      requestedAt: now,
    }),
    homeownerProjectWorkspaceCommandIntent({
      commandRef,
      projectRef,
      expectedRevision: 1,
      assignedMembershipRef,
      dueOn: '2026-09-05',
      requestedAt: later,
    }),
  )
})

test('create exposes only the exact home membership ref and keeps initial activity atomic', async () => {
  const { service, getReceivedCreate } = makeService()
  const created = await service.createProject(context, homeRef, {
    commandRef,
    title: 'Patch the hallway wall',
    workKind: 'task',
    category: 'interior',
    status: 'planned',
    assignedMembershipRef,
    dueOn: '2026-09-05',
    initialActivity: { kind: 'note', body: 'Photo reviewed with Rolo.' },
  })
  assert.equal(created.workKind, 'task')
  assert.equal(created.assignedMembershipRef, assignedMembershipRef)
  assert.equal(created.dueOn, '2026-09-05')
  assert.equal(getReceivedCreate()?.command.initialActivity?.body, 'Photo reviewed with Rolo.')
  const encoded = JSON.stringify(created)
  assert.doesNotMatch(encoded, /principalRef|email/i)
})

test('assignment rejects wrong-home, revoked, viewer, and missing authoritative memberships', async () => {
  const candidates: Array<HomeownerMembership | null> = [
    { ...assigneeMembership, homeRef: otherHomeRef },
    { ...assigneeMembership, state: 'revoked', revokedAt: later },
    { ...assigneeMembership, role: 'viewer' },
    null,
  ]
  for (const assigned of candidates) {
    await assert.rejects(
      makeService({ assigned }).service.createProject(context, homeRef, {
        commandRef,
        title: 'Patch the hallway wall',
        workKind: 'task',
        category: 'interior',
        status: 'planned',
        assignedMembershipRef,
      }),
      (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
    )
  }
})

test('assignment and due date update and clear under optimistic revision', async () => {
  const { service } = makeService()
  const cleared = await service.updateProject(context, homeRef, projectRef, {
    commandRef,
    expectedRevision: 1,
    assignedMembershipRef: null,
    dueOn: null,
  })
  assert.equal(cleared.assignedMembershipRef, null)
  assert.equal(cleared.dueOn, null)
  assert.equal(cleared.revision, 2)

  await assert.rejects(
    service.updateProject(context, homeRef, projectRef, {
      commandRef: ref('hcmd', 'd'),
      expectedRevision: 1,
      dueOn: '2026-09-10',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict',
  )
})

test('assigned Work migration validates exact-home active members inside atomic RPCs', () => {
  const migration = readFileSync(new URL(
    '../../../supabase/migrations/202608300002_assigned_work.sql',
    import.meta.url,
  ), 'utf8')
  assert.match(migration, /role in \('workspace_controller', 'member'\)/)
  assert.match(migration, /home_ref = p_home_ref/)
  assert.match(migration, /state = 'active'/)
  assert.match(migration, /assigned_membership_not_authorized/)
  assert.match(migration, /unique index if not exists homesrolo_homeowner_memberships_ref_home_idx/)
  assert.match(migration,
    /foreign key \(assigned_membership_ref, home_ref\)[\s\S]*references public\.homesrolo_homeowner_memberships\(membership_ref, home_ref\)/)
  assert.match(migration, /insert into public\.homesrolo_homeowner_project_activity/)
  assert.match(migration, /command_digest_mismatch/)
  assert.match(migration, /project_revision_conflict/)

  const createRpc = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_create_homeowner_project('),
    migration.indexOf('-- Bounded updates preserve optimistic revision'),
  )
  const updateRpc = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_update_homeowner_project('),
    migration.indexOf('commit;'),
  )
  for (const [action, rpc] of [
    ['project.create', createRpc],
    ['project.update', updateRpc],
  ] as const) {
    const receiptReplay = rpc.indexOf(`and action = '${action}'`)
    const assigneeValidation = rpc.indexOf('assigned_membership_not_authorized')
    assert.ok(receiptReplay >= 0 && receiptReplay < assigneeValidation,
      `${action} must replay its terminal receipt before mutable assignee access`)
    assert.match(rpc,
      /insert into public\.homesrolo_homeowner_command_receipts \(\s*principal_ref, command_ref, action, command_digest, result, created_at, home_ref\s*\)/)
    assert.match(rpc,
      new RegExp(`'${action.replace('.', '\\.')}', p_command_digest,\\s*v_result, p_requested_at, p_home_ref`))
  }
})
