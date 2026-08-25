import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  HomeownerApiError,
  HomeownerApiService,
  homeownerApiProjectQuoteViewSchema,
} from '../homeowner-api.v1.ts'
import { createHomeownerHttpHandler } from '../homeowner-http.v1.ts'
import {
  HOMEOWNER_PROJECT_QUOTE_VERSION,
  HOMEOWNER_PROJECT_QUOTE_WARNING,
  createHomeownerProjectQuoteInputSchema,
  homeownerProjectQuoteCommandIntent,
  homeownerProjectQuoteSchema,
  type HomeownerProjectQuote,
  type HomeownerProjectQuotePort,
} from '../homeowner-project-quotes.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type HomeownerArtifactMetadata,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerProject,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const body = (character: string) => character.repeat(43)
const principalRef = `hprn_${body('p')}`
const homeRef = `hhom_${body('h')}`
const projectRef = `hprj_${body('r')}`
const quoteRef = `hquo_${body('q')}`
const artifactRef = `hart_${body('a')}`
const now = '2026-08-21T15:00:00.000Z'
const context = { sessionHandle: 'opaque-session' }

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
  revision: 2,
  createdAt: now,
}

const project: HomeownerProject = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  projectRef,
  homeRef,
  controllerPrincipalRef: principalRef,
  title: 'Roof replacement',
  category: 'roofing',
  status: 'planned',
  summary: 'Comparing written proposals.',
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

const artifact: HomeownerArtifactMetadata = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  artifactRef,
  homeRef,
  projectRef,
  controllerPrincipalRef: principalRef,
  kind: 'document',
  displayName: 'Original proposal.pdf',
  mediaType: 'application/pdf',
  byteLength: 1200,
  payloadSha256: 'a'.repeat(64),
  storageObjectRef: `hobj_${body('o')}`,
  contentClass: 'homeowner_private',
  createdAt: now,
}

const quote: HomeownerProjectQuote = {
  recordVersion: HOMEOWNER_PROJECT_QUOTE_VERSION,
  quoteRef,
  homeRef,
  projectRef,
  controllerPrincipalRef: principalRef,
  contractorLabel: 'Proposal from Northside Roofing',
  proposalDate: '2026-08-20',
  artifactRef,
  scope: {
    valleys: { status: 'allowance', detail: 'Open metal allowance; amount not stated.' },
    flashing_transitions: { status: 'included', detail: 'Wall flashing named.' },
  },
  notes: 'Homeowner-entered working notes.',
  source: 'homeowner_entry',
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

function repository(overrides: Partial<HomeownerRepositoryPort> = {}): HomeownerRepositoryPort {
  return {
    async listMemberships() { return [membership] },
    async readMembership(readPrincipalRef, readHomeRef) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef ? membership : null
    },
    async readHome() { return null },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects() { return [project] },
    async listArtifactMetadata() { return [artifact] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
    ...overrides,
  }
}

function quotePort(overrides: Partial<HomeownerProjectQuotePort> = {}): HomeownerProjectQuotePort {
  return {
    async listProjectQuotes() { return [quote] },
    async createProjectQuote() { return quote },
    async saveProjectQuote() { return { ...quote, revision: 2, updatedAt: now } },
    ...overrides,
  }
}

function service(input: {
  readonly repository?: HomeownerRepositoryPort
  readonly quotes?: HomeownerProjectQuotePort
  readonly persistence?: boolean
  readonly projectQuotes?: boolean
} = {}) {
  return new HomeownerApiService({
    identity: { async resolvePrincipal(handle) { return handle === context.sessionHandle ? principal : null } },
    repository: input.repository ?? repository(),
    commands: {
      async createPrivateHomeWorkspace() { throw new Error('not used') },
      async createProject() { throw new Error('not used') },
      async recordInitialIntake() { throw new Error('not used') },
    },
    projectQuotes: input.quotes ?? quotePort(),
    now: () => now,
    capabilities: {
      emailCodeSignIn: false,
      magicLinkSignIn: true,
      persistence: input.persistence ?? true,
      projectQuotes: input.projectQuotes ?? true,
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

const createInput = {
  commandRef: `hcmd_${body('c')}`,
  contractorLabel: 'Proposal from Northside Roofing',
  proposalDate: '2026-08-20',
  artifactRef,
  scope: quote.scope,
  notes: 'Homeowner-entered working notes.',
}

test('quote contract keeps unreviewed rows absent and cannot represent price scoring', () => {
  const parsed = createHomeownerProjectQuoteInputSchema.parse({
    ...createInput,
    projectRef,
    requestedAt: now,
  })
  assert.equal('measurement' in parsed.scope, false)
  assert.equal(parsed.scope.valleys?.status, 'allowance')
  for (const invalid of [
    { ...parsed, scope: { measurement: { status: 'unreviewed' } } },
    { ...parsed, scope: { measurement: { status: null } } },
    { ...parsed, scope: { score: { status: 'included' } } },
    { ...parsed, fairPrice: true },
    { ...parsed, amount: 12000 },
  ]) {
    assert.equal(createHomeownerProjectQuoteInputSchema.safeParse(invalid).success, false)
  }
  assert.match(HOMEOWNER_PROJECT_QUOTE_WARNING, /does not rate the price/i)
  assert.deepEqual(
    homeownerProjectQuoteCommandIntent(parsed),
    homeownerProjectQuoteCommandIntent({ ...parsed, requestedAt: '2026-08-21T15:05:00.000Z' }),
    'a server execution timestamp cannot change retry identity',
  )
})

test('database quote invariants reject null statuses and tie project and artifact controllers', () => {
  const migration = readFileSync(
    'supabase/migrations/202608210001_homeowner_project_quotes.sql',
    'utf8',
  )
  assert.match(migration, /jsonb_typeof\(item\.value -> 'status'\) <> 'string'/)
  assert.match(migration, /foreign key \(project_ref, home_ref, controller_principal_ref\)/)
  assert.match(
    migration,
    /foreign key \(artifact_ref, home_ref, project_ref, controller_principal_ref\)/,
  )
})

test('Supabase project and quote receipts exclude server execution time from stable intent', () => {
  const provider = readFileSync('apps/homeowner/lib/server/supabase-provider.ts', 'utf8')
  const homeCreate = provider.slice(
    provider.indexOf('async createPrivateHomeWorkspace'),
    provider.indexOf('async createProject('),
  )
  const projectCreate = provider.slice(
    provider.indexOf('async createProject('),
    provider.indexOf('async createProjectQuote'),
  )
  const quoteCreate = provider.slice(
    provider.indexOf('async createProjectQuote'),
    provider.indexOf('async saveProjectQuote'),
  )
  const quoteSave = provider.slice(
    provider.indexOf('async saveProjectQuote'),
    provider.indexOf('async recordInitialIntake'),
  )
  assert.match(homeCreate, /p_command_digest: digest\(input\.command\)/)
  assert.match(projectCreate, /digest\(homeownerProjectCommandIntent\(input\.command\)\)/)
  assert.match(quoteCreate, /digest\(homeownerProjectQuoteCommandIntent\(input\.command\)\)/)
  assert.match(quoteSave, /digest\(homeownerProjectQuoteCommandIntent\(input\.command\)\)/)
})

test('create and list are exact-home private projections with no authority or ranking fields', async () => {
  const captured: unknown[] = []
  const quotes = quotePort({
    async createProjectQuote(input) { captured.push(input); return quote },
  })
  const created = await service({ quotes }).createProjectQuote(context, homeRef, projectRef, createInput)
  assert.equal(captured.length, 1)
  assert.deepEqual((captured[0] as { command: unknown }).command, {
    ...createInput,
    projectRef,
    requestedAt: now,
  })
  const listed = await service().listProjectQuotes(context, homeRef, projectRef)
  assert.deepEqual(listed, [created])
  assert.ok(homeownerApiProjectQuoteViewSchema.parse(created))
  const serialized = JSON.stringify(created)
  assert.doesNotMatch(serialized, /controllerPrincipalRef|commandDigest|storage|payloadSha|jobrolo|score|rank|fairPrice/i)
})

test('list rejects a quote whose controller does not match its roofing project', async () => {
  await assert.rejects(
    service({
      quotes: quotePort({
        async listProjectQuotes() {
          return [{ ...quote, controllerPrincipalRef: `hprn_${body('x')}` }]
        },
      }),
    }).listProjectQuotes(context, homeRef, projectRef),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})

test('quote routes stay unavailable until the independent release gate is enabled', async () => {
  let called = false
  await assert.rejects(
    service({
      projectQuotes: false,
      quotes: quotePort({ async listProjectQuotes() { called = true; return [] } }),
    }).listProjectQuotes(context, homeRef, projectRef),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
  assert.equal(called, false)
})

test('quote creation rejects cross-project, non-PDF, and non-roofing source records', async () => {
  const crossProjectArtifact = { ...artifact, projectRef: `hprj_${body('x')}` }
  const imageArtifact = { ...artifact, mediaType: 'image/jpeg' as const }
  const nonRoofing = { ...project, category: 'interior' as const }
  for (const repo of [
    repository({ async listArtifactMetadata() { return [crossProjectArtifact] } }),
    repository({ async listArtifactMetadata() { return [imageArtifact] } }),
    repository({ async listProjects() { return [nonRoofing] } }),
  ]) {
    await assert.rejects(
      service({ repository: repo }).createProjectQuote(context, homeRef, projectRef, createInput),
      (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
    )
  }
})

test('revision-backed save forwards one full private replacement and rejects incoherent output', async () => {
  const captured: unknown[] = []
  const quotes = quotePort({
    async saveProjectQuote(input) {
      captured.push(input)
      return { ...quote, revision: 2 }
    },
  })
  const saved = await service({ quotes }).saveProjectQuote(context, homeRef, projectRef, quoteRef, {
    ...createInput,
    commandRef: `hcmd_${body('s')}`,
    expectedRevision: 1,
  })
  assert.equal(saved.revision, 2)
  assert.equal((captured[0] as { command: { expectedRevision: number } }).command.expectedRevision, 1)

  await assert.rejects(
    service({ quotes: quotePort({ async saveProjectQuote() { return { ...quote, revision: 8 } } }) })
      .saveProjectQuote(context, homeRef, projectRef, quoteRef, {
        ...createInput, commandRef: `hcmd_${body('s')}`, expectedRevision: 1,
      }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})

test('HTTP exposes only strict list, create, and optimistic save routes', async () => {
  const handle = createHomeownerHttpHandler(service())
  const base = { search: '', sessionHandle: context.sessionHandle }
  const listed = await handle({
    ...base,
    method: 'GET',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/quotes`,
    hasBody: false,
    jsonBody: undefined,
  })
  const created = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/quotes`,
    hasBody: true,
    jsonBody: createInput,
  })
  const saved = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/quotes/${quoteRef}`,
    hasBody: true,
    jsonBody: { ...createInput, commandRef: `hcmd_${body('s')}`, expectedRevision: 1 },
  })
  assert.equal(listed.status, 200)
  assert.equal(created.status, 201)
  assert.equal(saved.status, 200)

  const widened = await handle({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/quotes`,
    hasBody: true,
    jsonBody: { ...createInput, jobroloTenantId: 'tenant', priceScore: 99 },
  })
  assert.equal(widened.status, 400)

  const conflicted = await createHomeownerHttpHandler(service({
    quotes: quotePort({
      async saveProjectQuote() { throw new HomeownerApiError('conflict') },
    }),
  }))({
    ...base,
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/projects/${projectRef}/quotes/${quoteRef}`,
    hasBody: true,
    jsonBody: { ...createInput, commandRef: `hcmd_${body('z')}`, expectedRevision: 1 },
  })
  assert.equal(conflicted.status, 409)
})

test('domain record parser enforces revision and honest homeowner source', () => {
  assert.ok(homeownerProjectQuoteSchema.parse(quote))
  assert.equal(homeownerProjectQuoteSchema.safeParse({ ...quote, revision: 0 }).success, false)
  assert.equal(homeownerProjectQuoteSchema.safeParse({ ...quote, source: 'verified_contractor' }).success, false)
})
