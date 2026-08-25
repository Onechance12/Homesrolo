import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HomeownerApiError,
  HomeownerApiService,
} from '../homeowner-api.v1.ts'
import { createHomeownerHttpHandler } from '../homeowner-http.v1.ts'
import {
  HOMEOWNER_PROJECT_WORKSPACE_VERSION,
  homeownerProjectWorkspaceCommandIntent,
  saveHomeownerProjectItemInputSchema,
  updateHomeownerProjectInputSchema,
  type HomeownerProjectActivity,
  type HomeownerProjectItem,
  type HomeownerProjectWorkspacePort,
} from '../homeowner-project-workspace.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type HomeownerCommandPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerProject,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principalRef = ref('hprn', 'p')
const homeRef = ref('hhom', 'h')
const otherHomeRef = ref('hhom', 'x')
const projectRef = ref('hprj', 'r')
const archivedProjectRef = ref('hprj', 'a')
const activityRef = ref('hact', 'n')
const itemRef = ref('hpit', 'i')
const commandRef = ref('hcmd', 'c')
const createdAt = '2026-08-24T12:00:00.000Z'
const now = '2026-08-25T12:00:00.000Z'
const context = { sessionHandle: 'opaque-session' }

const principal: HomeownerPrincipal = {
  principalRef,
  status: 'active',
  emailVerified: true,
  sessionVersion: 1,
}

const membership: HomeownerMembership = {
  membershipRef: ref('hmbr', 'm'),
  principalRef,
  homeRef,
  role: 'workspace_controller',
  basis: 'self_created_workspace',
  state: 'active',
  relationshipLabel: 'claimed_unverified',
  revision: 3,
  createdAt,
}

const project: HomeownerProject = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  projectRef,
  homeRef,
  controllerPrincipalRef: principalRef,
  title: 'Kitchen update',
  category: 'interior',
  status: 'planned',
  summary: 'Choose cabinets and counters.',
  revision: 1,
  createdAt,
  updatedAt: createdAt,
}

const archivedProject: HomeownerProject = {
  ...project,
  projectRef: archivedProjectRef,
  title: 'Old paint project',
  status: 'completed',
  revision: 2,
  archivedAt: now,
  updatedAt: now,
}

const activity: HomeownerProjectActivity = {
  recordVersion: HOMEOWNER_PROJECT_WORKSPACE_VERSION,
  activityRef,
  homeRef,
  projectRef,
  actorPrincipalRef: principalRef,
  kind: 'note',
  body: 'Cabinet samples arrived.',
  source: 'homeowner_entry',
  createdAt: now,
}

const item: HomeownerProjectItem = {
  recordVersion: HOMEOWNER_PROJECT_WORKSPACE_VERSION,
  itemRef,
  homeRef,
  projectRef,
  createdByPrincipalRef: principalRef,
  kind: 'material',
  label: 'White oak cabinet fronts',
  detail: 'Compare matte and natural finishes.',
  state: 'considering',
  source: 'homeowner_entry',
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

function repository(member: HomeownerMembership = membership): HomeownerRepositoryPort {
  return {
    async listMemberships() { return [member] },
    async readMembership(readPrincipalRef, readHomeRef) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef ? member : null
    },
    async readHome() { return null },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    // Archived rows are deliberately absent from default project lists.
    async listProjects(grant) { return grant.homeRef === homeRef ? [project] : [] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
  }
}

function workspace(overrides: Partial<HomeownerProjectWorkspacePort> = {}): HomeownerProjectWorkspacePort {
  return {
    async readProject(grant, requestedProjectRef) {
      if (grant.homeRef !== homeRef) return null
      if (requestedProjectRef === projectRef) return project
      if (requestedProjectRef === archivedProjectRef) return archivedProject
      return null
    },
    async listProjectActivity() { return [activity] },
    async listProjectItems() { return [item] },
    async updateProject({ command }) {
      if (command.expectedRevision !== project.revision) throw new HomeownerApiError('conflict')
      return {
        ...project,
        ...(command.title === undefined ? {} : { title: command.title }),
        ...(command.category === undefined ? {} : { category: command.category }),
        ...(command.status === undefined ? {} : { status: command.status }),
        ...(Object.hasOwn(command, 'occurredOn')
          ? command.occurredOn === null ? { occurredOn: undefined } : { occurredOn: command.occurredOn }
          : {}),
        ...(Object.hasOwn(command, 'summary')
          ? command.summary ? { summary: command.summary } : { summary: undefined }
          : {}),
        ...(Object.hasOwn(command, 'professionalLabel')
          ? command.professionalLabel
            ? { professionalLabel: command.professionalLabel }
            : { professionalLabel: undefined }
          : {}),
        ...(Object.hasOwn(command, 'archived')
          ? command.archived ? { archivedAt: command.requestedAt } : { archivedAt: undefined }
          : {}),
        revision: project.revision + 1,
        updatedAt: command.requestedAt,
      }
    },
    async appendProjectActivity({ command, grant }) {
      return {
        ...activity,
        actorPrincipalRef: grant.principalRef,
        kind: command.kind,
        body: command.body,
        createdAt: command.requestedAt,
      }
    },
    async saveProjectItem({ command, grant }) {
      return {
        ...item,
        itemRef: command.itemRef ?? itemRef,
        createdByPrincipalRef: grant.principalRef,
        kind: command.kind,
        label: command.label,
        ...(command.detail ? { detail: command.detail } : { detail: undefined }),
        state: command.state,
        revision: command.expectedRevision === undefined ? 1 : command.expectedRevision + 1,
        updatedAt: command.requestedAt,
      }
    },
    ...overrides,
  }
}

const commands: HomeownerCommandPort = {
  async createPrivateHomeWorkspace() { throw new Error('not used') },
  async createProject() { return project },
  async recordInitialIntake() { throw new Error('not used') },
}

function service(options: {
  membership?: HomeownerMembership
  projectWorkspace?: HomeownerProjectWorkspacePort
} = {}) {
  return new HomeownerApiService({
    identity: {
      async resolvePrincipal(handle) { return handle === context.sessionHandle ? principal : null },
    },
    repository: repository(options.membership),
    commands,
    projectWorkspace: options.projectWorkspace ?? workspace(),
    now: () => now,
    capabilities: {
      emailCodeSignIn: false,
      magicLinkSignIn: true,
      persistence: true,
      projectQuotes: false,
      homeResearch: false,
      uploads: false,
      photoCheckups: false,
      projectReview: false,
      projectReviewAttachments: false,
      homeRecordHandoffs: false,
      invitations: false,
      sharing: false,
    },
  })
}

test('workspace command contracts are strict, revisioned, and idempotency-stable', () => {
  const first = updateHomeownerProjectInputSchema.parse({
    commandRef,
    projectRef,
    expectedRevision: 1,
    archived: true,
    requestedAt: createdAt,
  })
  const retry = { ...first, requestedAt: now }
  assert.deepEqual(
    homeownerProjectWorkspaceCommandIntent(first),
    homeownerProjectWorkspaceCommandIntent(retry),
  )
  assert.equal(updateHomeownerProjectInputSchema.safeParse({
    commandRef, projectRef, expectedRevision: 1, requestedAt: now,
  }).success, false, 'an empty update is rejected')
  assert.equal(saveHomeownerProjectItemInputSchema.safeParse({
    commandRef, projectRef, itemRef, kind: 'material', label: 'Tile',
    state: 'chosen', requestedAt: now,
  }).success, false, 'item updates require an expected revision')
  assert.equal(saveHomeownerProjectItemInputSchema.safeParse({
    commandRef, projectRef, expectedRevision: 1, kind: 'material', label: 'Tile',
    state: 'chosen', requestedAt: now,
  }).success, false, 'a revision cannot be supplied without an exact item')
})

test('default lists exclude archives while an exact authenticated read still resolves them', async () => {
  const api = service()
  const listed = await api.listProjects(context, homeRef)
  assert.deepEqual(listed.map(value => value.projectRef), [projectRef])
  const exact = await api.readProject(context, homeRef, archivedProjectRef)
  assert.equal(exact.archived, true)
  assert.equal(exact.archivedAt, now)
  assert.equal(exact.revision, 2)
})

test('project workspace commands enforce authentication, home scope, roles, and revisions', async () => {
  const api = service()
  await assert.rejects(
    api.updateProject({ sessionHandle: null }, homeRef, projectRef, {
      commandRef, expectedRevision: 1, archived: true,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'signed_out',
  )
  await assert.rejects(
    api.updateProject(context, otherHomeRef, projectRef, {
      commandRef, expectedRevision: 1, archived: true,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  await assert.rejects(
    api.updateProject(context, homeRef, projectRef, {
      commandRef, expectedRevision: 9, archived: true,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict',
  )
  const viewer: HomeownerMembership = { ...membership, role: 'viewer' }
  await assert.rejects(
    service({ membership: viewer }).updateProject(context, homeRef, projectRef, {
      commandRef, expectedRevision: 1, archived: true,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )

  const archived = await api.updateProject(context, homeRef, projectRef, {
    commandRef,
    expectedRevision: 1,
    title: 'Kitchen remodel',
    professionalLabel: 'Sample Cabinet Company',
    archived: true,
  })
  assert.equal(archived.revision, 2)
  assert.equal(archived.archived, true)
  assert.equal(archived.professionalLabel, 'Sample Cabinet Company')
})

test('activity is append-only in the API and project items use optimistic revisions', async () => {
  const api = service()
  const added = await api.appendProjectActivity(context, homeRef, projectRef, {
    commandRef,
    kind: 'milestone',
    body: '  Cabinet design approved.  ',
  })
  assert.equal(added.body, 'Cabinet design approved.')
  assert.equal(JSON.stringify(added).includes('actorPrincipalRef'), false)
  assert.equal((await api.listProjectActivity(context, homeRef, projectRef)).length, 1)

  const created = await api.saveProjectItem(context, homeRef, projectRef, {
    commandRef,
    kind: 'wishlist',
    label: '  Pendant lights  ',
    detail: '  Warm brass finish.  ',
    state: 'considering',
  })
  assert.equal(created.revision, 1)
  assert.equal(created.label, 'Pendant lights')

  const saved = await api.saveProjectItem(context, homeRef, projectRef, {
    commandRef: ref('hcmd', 'd'),
    itemRef,
    expectedRevision: 1,
    kind: 'material',
    label: 'White oak cabinet fronts',
    detail: 'Natural finish selected.',
    state: 'chosen',
  })
  assert.equal(saved.revision, 2)
  assert.equal(saved.state, 'chosen')
})

test('HTTP exposes only bounded POST workspace actions with stable status semantics', async () => {
  const handle = createHomeownerHttpHandler(service())
  const base = { search: '', sessionHandle: context.sessionHandle }
  const update = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/update`,
    hasBody: true,
    jsonBody: { commandRef, expectedRevision: 1, archived: true },
  })
  const activityList = await handle({
    ...base,
    method: 'GET',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/activity`,
    hasBody: false,
    jsonBody: undefined,
  })
  const activityCreate = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/activity`,
    hasBody: true,
    jsonBody: { commandRef, kind: 'note', body: 'Cabinet samples arrived.' },
  })
  const itemCreate = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/items`,
    hasBody: true,
    jsonBody: {
      commandRef, kind: 'material', label: 'White oak', state: 'considering',
    },
  })
  const itemUpdate = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/items`,
    hasBody: true,
    jsonBody: {
      commandRef: ref('hcmd', 'd'), itemRef, expectedRevision: 1,
      kind: 'material', label: 'White oak', state: 'chosen',
    },
  })
  assert.equal(update.status, 200)
  assert.equal(activityList.status, 200)
  assert.equal(activityCreate.status, 201)
  assert.equal(itemCreate.status, 201)
  assert.equal(itemUpdate.status, 200)

  const methodDenied = await handle({
    ...base,
    method: 'DELETE',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/activity`,
    hasBody: false,
    jsonBody: undefined,
  })
  assert.equal(methodDenied.status, 405)
})
