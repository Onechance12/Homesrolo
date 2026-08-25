import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  askRoloRequestSchema,
  OpenAIHomeAssistantClient,
  type AskRoloResult,
  type HomeAssistantClient,
  type HomeAssistantContext,
} from '../server/home-assistant.ts'
import {
  handleHomeAssistantRequestWithDependencies,
  type HomeAssistantHttpDependencies,
} from '../server/home-assistant-http.ts'
import { HomeResearchRateLimiter, readHomeResearchConfiguration } from '../server/home-research.ts'

const API_KEY = `sk-proj-${'a'.repeat(48)}`
const ORIGIN = 'https://app.homesrolo.com'
const HANDLE = 's'.repeat(43)
const HOME = `hhom_${'h'.repeat(43)}`
const PROJECT = `hprj_${'p'.repeat(43)}`
const VALID_BODY = Object.freeze({
  message: 'My AC stopped cooling yesterday and Cool Air is coming Friday.',
  history: [],
  destination: 'home' as const,
})

const CONTEXT: HomeAssistantContext = {
  home: { label: 'The Martin home', locality: 'Fort Worth, TX', projectCount: 1, documentCount: 2 },
  projects: [{
    projectRef: PROJECT,
    title: 'Spring AC service',
    category: 'hvac',
    status: 'completed',
    occurredOn: '2026-04-03',
    professionalLabel: 'Cool Air',
  }],
  files: [{ displayName: 'AC invoice.pdf', kind: 'document', projectRef: PROJECT }],
  systems: [{ kind: 'cooling', present: 'yes', installedOrReplacedYear: 2021 }],
}

test('Rolo input is bounded and carries no browser identity or address field', () => {
  assert.equal(askRoloRequestSchema.safeParse(VALID_BODY).success, true)
  for (const bad of [
    { ...VALID_BODY, message: '' },
    { ...VALID_BODY, message: 'x'.repeat(1_601) },
    { ...VALID_BODY, destination: 'https://evil.example' },
    { ...VALID_BODY, homeRef: HOME },
    { ...VALID_BODY, address: '123 Main Street' },
    { ...VALID_BODY, history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'hello' })) },
  ]) {
    assert.equal(askRoloRequestSchema.safeParse(bad).success, false)
  }
})

test('Rolo uses stateless structured Responses and returns a reviewable draft only', async () => {
  const configuration = readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })
  assert.ok(configuration)
  const outputText = JSON.stringify({
    answer: 'That sounds like an active cooling issue. I prepared one record for you to review.',
    proposedWork: {
      kind: 'issue',
      title: 'AC not cooling',
      category: 'hvac',
      status: 'in_progress',
      occurredOn: '2026-08-24',
      summary: 'Homeowner reported that the AC stopped cooling.',
      professionalLabel: 'Cool Air',
      firstUpdate: 'Service visit planned for Friday.',
    },
    destination: 'work',
    projectRef: PROJECT,
    followUpQuestions: ['Do you know which unit is affected?'],
  })
  let outbound: { readonly url: string; readonly init: RequestInit; readonly body: Record<string, unknown> } | null = null
  const client = new OpenAIHomeAssistantClient({
    configuration,
    async fetchImpl(input, init = {}) {
      outbound = {
        url: String(input),
        init,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      }
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: outputText }] }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await client.answer(VALID_BODY, CONTEXT)
  assert.ok(outbound)
  const captured = outbound as unknown as {
    readonly url: string
    readonly init: RequestInit
    readonly body: Record<string, unknown>
  }
  assert.equal(captured.url, 'https://api.openai.com/v1/responses')
  assert.equal(new Headers(captured.init.headers).get('authorization'), `Bearer ${API_KEY}`)
  assert.equal(captured.body.store, false)
  assert.equal(captured.body.model, 'gpt-5.6-luna')
  assert.equal(Object.hasOwn(captured.body, 'tools'), false)
  assert.ok(!JSON.stringify(captured.body).includes(API_KEY), 'the key is header-only')
  assert.equal(result.proposedWork?.title, 'AC not cooling')
  assert.equal(result.projectRef, PROJECT)
  assert.equal(result.disclosure, 'Nothing is saved until you review and approve it.')
})

test('Rolo never exposes a work link unless the referenced project survives validation', async () => {
  const configuration = readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })
  assert.ok(configuration)
  const unknownProject = `hprj_${'x'.repeat(43)}`
  const client = new OpenAIHomeAssistantClient({
    configuration,
    async fetchImpl() {
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{
          type: 'output_text',
          text: JSON.stringify({
            answer: 'I could not find that saved record.',
            proposedWork: null,
            destination: 'work',
            projectRef: unknownProject,
            followUpQuestions: [],
          }),
        }] }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await client.answer(VALID_BODY, CONTEXT)
  assert.equal(result.projectRef, null)
  assert.equal(result.destination, null)
})

const RESULT: AskRoloResult = {
  requestRef: 'hask_00000000-0000-4000-8000-000000000000',
  answer: 'I found the saved work record.',
  proposedWork: null,
  destination: 'work',
  projectRef: PROJECT,
  followUpQuestions: [],
  disclosure: 'Nothing is saved until you review and approve it.',
}

function request(body: unknown = VALID_BODY, input: { origin?: string; cookie?: string } = {}) {
  return new Request(`${ORIGIN}/api/v1/homes/${HOME}/assistant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: input.origin ?? ORIGIN,
      cookie: input.cookie === undefined ? `hrolo_session=${HANDLE}` : input.cookie,
    },
    body: JSON.stringify(body),
  })
}

function dependencies(overrides: Partial<HomeAssistantHttpDependencies> = {}) {
  const client: HomeAssistantClient = { async answer() { return RESULT } }
  return {
    appOrigin: ORIGIN,
    client,
    async readContext() { return CONTEXT },
    rateLimiter: new HomeResearchRateLimiter(),
    ...overrides,
  } satisfies HomeAssistantHttpDependencies
}

test('Rolo HTTP fails closed before context or model access', async () => {
  let contextReads = 0
  let assistantCalls = 0
  const client: HomeAssistantClient = {
    async answer() { assistantCalls += 1; return RESULT },
  }
  const deps = dependencies({
    client,
    async readContext() { contextReads += 1; return CONTEXT },
  })
  assert.equal((await handleHomeAssistantRequestWithDependencies(
    request(), HOME, { ...deps, client: null },
  )).status, 503)
  assert.equal((await handleHomeAssistantRequestWithDependencies(
    request(VALID_BODY, { origin: 'https://evil.example' }), HOME, deps,
  )).status, 403)
  assert.equal((await handleHomeAssistantRequestWithDependencies(
    request(VALID_BODY, { cookie: '' }), HOME, deps,
  )).status, 401)
  assert.equal(contextReads, 0)
  assert.equal(assistantCalls, 0)
})

test('Rolo HTTP returns a private envelope and rate-limits duplicate turns', async () => {
  let assistantCalls = 0
  const deps = dependencies({
    client: { async answer() { assistantCalls += 1; return RESULT } },
    rateLimiter: new HomeResearchRateLimiter({ limit: 1, windowMs: 60_000 }),
  })
  const first = await handleHomeAssistantRequestWithDependencies(request(), HOME, deps)
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(await first.json(), { data: RESULT })
  const second = await handleHomeAssistantRequestWithDependencies(request(), HOME, deps)
  assert.equal(second.status, 429)
  assert.equal(assistantCalls, 1)
})

test('Rolo context loading receives the exact current project reference', async () => {
  let requestedProjectRef: string | undefined
  const deps = dependencies({
    async readContext(_sessionHandle, _homeRef, projectRef) {
      requestedProjectRef = projectRef
      return CONTEXT
    },
  })
  const response = await handleHomeAssistantRequestWithDependencies(
    request({ ...VALID_BODY, projectRef: PROJECT }), HOME, deps,
  )
  assert.equal(response.status, 200)
  assert.equal(requestedProjectRef, PROJECT)
})
