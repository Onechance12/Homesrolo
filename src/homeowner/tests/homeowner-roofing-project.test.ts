import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HomeownerApiError,
  HomeownerApiService,
  homeownerApiProjectViewSchema,
} from '../homeowner-api.v1.ts'
import { createHomeownerHttpHandler } from '../homeowner-http.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerCommandPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerProject,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const body = (character: string) => character.repeat(43)
const principalRef = `hprn_${body('p')}`
const homeRef = `hhom_${body('h')}`
const projectRef = `hprj_${body('r')}`
const now = '2026-08-12T16:00:00.000Z'
const context = { sessionHandle: 'opaque-server-session' }

const principal: HomeownerPrincipal = {
  principalRef,
  status: 'active',
  emailVerified: true,
  sessionVersion: 1,
}

const membership: HomeownerMembership = {
  membershipRef: `hmbr_${body('m')}`,
  principalRef,
  homeRef,
  role: 'workspace_controller',
  basis: 'self_created_workspace',
  state: 'active',
  relationshipLabel: 'claimed_unverified',
  revision: 4,
  createdAt: now,
}

const project: HomeownerProject = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  projectRef,
  homeRef,
  controllerPrincipalRef: principalRef,
  title: 'Roof repair',
  category: 'roofing',
  status: 'planned',
  summary: 'Timing: As soon as possible\n\nLeak above the back room.',
  createdAt: now,
  updatedAt: now,
}

function repository(overrides: Partial<HomeownerRepositoryPort> = {}): HomeownerRepositoryPort {
  return {
    async listMemberships(_grant: AuthorizedHomeownerPrincipal) { return [membership] },
    async readMembership(readPrincipalRef, readHomeRef) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef ? membership : null
    },
    async readHome(_grant: AuthorizedHomeownerWorkspace) { return null },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects(grant) { return grant.homeRef === homeRef ? [project] : [] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
    ...overrides,
  }
}

function service(input: {
  repo?: HomeownerRepositoryPort
  commands?: HomeownerCommandPort
  persistence?: boolean
} = {}) {
  return new HomeownerApiService({
    identity: { async resolvePrincipal(handle) { return handle === context.sessionHandle ? principal : null } },
    repository: input.repo ?? repository(),
    commands: input.commands ?? {
      async createPrivateHomeWorkspace() { throw new Error('not used') },
      async createProject() { return project },
      async recordInitialIntake() { throw new Error('not used') },
    },
    now: () => now,
    capabilities: {
      magicLinkSignIn: true,
      persistence: input.persistence ?? true,
      projectQuotes: false,
      homeResearch: false,
      uploads: false,
      photoCheckups: false,
      projectReview: false,
      projectReviewAttachments: false,
      invitations: false,
      sharing: false,
    },
  })
}

test('roofing project creation derives scope, trade, status, title, summary, and time on the server', async () => {
  const capture: { commandInput?: Parameters<HomeownerCommandPort['createProject']>[0] } = {}
  const commands: HomeownerCommandPort = {
    async createPrivateHomeWorkspace() { throw new Error('not used') },
    async createProject(input) { capture.commandInput = input; return project },
    async recordInitialIntake() { throw new Error('not used') },
  }
  const result = await service({ commands }).startRoofingProject(context, homeRef, {
    commandRef: `hcmd_${body('c')}`,
    need: 'repair',
    timing: 'urgent',
    notes: 'Leak above the back room.',
  })
  const commandInput = capture.commandInput
  assert.ok(commandInput)
  assert.deepEqual(commandInput.command, {
    commandRef: `hcmd_${body('c')}`,
    title: 'Roof repair',
    category: 'roofing',
    status: 'planned',
    summary: 'Timing: As soon as possible\n\nLeak above the back room.',
    requestedAt: now,
  })
  assert.equal(commandInput.grant.principalRef, principalRef)
  assert.equal(commandInput.grant.homeRef, homeRef)
  assert.equal(commandInput.grant.membershipRevision, 4)
  assert.ok(homeownerApiProjectViewSchema.parse(result))
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /controllerPrincipalRef|membershipRef|principalRef|recordVersion/)
})

test('generic project creation records historical work across the home', async () => {
  const historical: HomeownerProject = {
    ...project,
    title: 'Kitchen remodel',
    category: 'interior',
    status: 'completed',
    occurredOn: '2024-06-15',
    summary: 'Cabinets, counters, and lighting replaced.',
  }
  const capture: { commandInput?: Parameters<HomeownerCommandPort['createProject']>[0] } = {}
  const commands: HomeownerCommandPort = {
    async createPrivateHomeWorkspace() { throw new Error('not used') },
    async createProject(input) { capture.commandInput = input; return historical },
    async recordInitialIntake() { throw new Error('not used') },
  }
  const result = await service({ commands }).createProject(context, homeRef, {
    commandRef: `hcmd_${body('g')}`,
    title: 'Kitchen remodel',
    category: 'interior',
    status: 'completed',
    occurredOn: '2024-06-15',
    summary: 'Cabinets, counters, and lighting replaced.',
  })
  assert.deepEqual(capture.commandInput?.command, {
    commandRef: `hcmd_${body('g')}`,
    title: 'Kitchen remodel',
    category: 'interior',
    status: 'completed',
    occurredOn: '2024-06-15',
    summary: 'Cabinets, counters, and lighting replaced.',
    requestedAt: now,
  })
  assert.equal(result.category, 'interior')
  assert.equal(result.occurredOn, '2024-06-15')

  const unknownDateProject: HomeownerProject = {
    ...historical,
    title: 'Unclear old project',
    category: 'other',
    summary: undefined,
    occurredOn: undefined,
  }
  const unknownDate = await service({
    commands: {
      ...commands,
      async createProject() { return unknownDateProject },
    },
  }).createProject(context, homeRef, {
    commandRef: `hcmd_${body('x')}`,
    title: 'Unclear old project',
    category: 'other',
    status: 'completed',
    summary: '',
  })
  assert.equal(unknownDate.occurredOn, null)
  assert.equal(unknownDate.summary, '')
})

test('roofing creation rejects browser authority, stale/revoked scope, disabled persistence, and incoherent output', async () => {
  await assert.rejects(
    service().startRoofingProject(context, homeRef, {
      commandRef: `hcmd_${body('c')}`,
      need: 'repair',
      timing: 'urgent',
      principalRef,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  const revoked: HomeownerMembership = { ...membership, state: 'revoked', revokedAt: now }
  await assert.rejects(
    service({ repo: repository({ async readMembership() { return revoked } }) })
      .startRoofingProject(context, homeRef, {
        commandRef: `hcmd_${body('c')}`, need: 'repair', timing: 'urgent',
      }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  await assert.rejects(
    service({ persistence: false }).startRoofingProject(context, homeRef, {
      commandRef: `hcmd_${body('c')}`, need: 'repair', timing: 'urgent',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
  const commands: HomeownerCommandPort = {
    async createPrivateHomeWorkspace() { throw new Error('not used') },
    async createProject() { return { ...project, status: 'completed' } },
    async recordInitialIntake() { throw new Error('not used') },
  }
  await assert.rejects(
    service({ commands }).startRoofingProject(context, homeRef, {
      commandRef: `hcmd_${body('c')}`, need: 'repair', timing: 'urgent',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})

test('project list and exact-project reads fresh-check one home and expose no authority fields', async () => {
  const listed = await service().listProjects(context, homeRef)
  const exact = await service().readProject(context, homeRef, projectRef)
  assert.deepEqual(listed, [exact])
  assert.equal(exact.projectRef, projectRef)
  assert.equal(exact.occurredOn, null)
  await assert.rejects(
    service().readProject(context, homeRef, `hprj_${body('x')}`),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
})

test('HTTP exposes exact reads plus bounded generic and roof-intent project commands', async () => {
  const handle = createHomeownerHttpHandler(service())
  const base = {
    search: '',
    sessionHandle: context.sessionHandle,
  }
  const list = await handle({
    ...base, method: 'GET', pathname: `/api/v1/homes/${homeRef}/projects`,
    hasBody: false, jsonBody: undefined,
  })
  const exact = await handle({
    ...base, method: 'GET', pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}`,
    hasBody: false, jsonBody: undefined,
  })
  const created = await handle({
    ...base, method: 'POST', pathname: `/api/v1/homes/${homeRef}/roofing-projects`,
    hasBody: true,
    jsonBody: { commandRef: `hcmd_${body('c')}`, need: 'repair', timing: 'urgent', notes: 'Leak above the back room.' },
  })
  assert.equal(list.status, 200)
  assert.equal(exact.status, 200)
  assert.equal(created.status, 201)
  assert.deepEqual(Object.keys(created.body as object), ['data'])

  const genericCreate = await handle({
    ...base, method: 'POST', pathname: `/api/v1/homes/${homeRef}/projects`,
    hasBody: true,
    jsonBody: {
      commandRef: `hcmd_${body('g')}`,
      title: 'Roof repair',
      category: 'roofing',
      status: 'planned',
      summary: 'Timing: As soon as possible\n\nLeak above the back room.',
    },
  })
  assert.equal(genericCreate.status, 201)
})
