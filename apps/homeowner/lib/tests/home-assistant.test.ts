import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  askRoloRequestSchema,
  HomeAssistantError,
  OpenAIHomeAssistantClient,
  readHomeAssistantConfiguration,
  type AskRoloResult,
  type HomeAssistantClient,
  type HomeAssistantContext,
} from '../server/home-assistant.ts'
import {
  assistantLocalityFromAddress,
  handleHomeAssistantRequestWithDependencies,
  type HomeAssistantHttpDependencies,
} from '../server/home-assistant-http.ts'
import { HomeResearchRateLimiter } from '../server/home-research.ts'

const API_KEY = `sk-proj-${'a'.repeat(48)}`
const ORIGIN = 'https://app.homesrolo.com'
const HANDLE = 's'.repeat(43)
const HOME = `hhom_${'h'.repeat(43)}`
const PROJECT = `hprj_${'p'.repeat(43)}`
const ARTIFACT = `hart_${'a'.repeat(43)}`
const VALID_BODY = Object.freeze({
  message: 'My AC stopped cooling yesterday and Cool Air is coming Friday.',
  history: [],
  conversation: { pendingWork: null, unansweredFollowUpQuestion: null },
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
    { ...VALID_BODY, selectedPhoto: { source: 'artifact', artifactRef: ARTIFACT, consentToAnalyze: false } },
    { ...VALID_BODY, selectedPhoto: { source: 'artifact', artifactRef: 'hart_short', consentToAnalyze: true } },
    { ...VALID_BODY, history: Array.from({ length: 17 }, () => ({ role: 'user', text: 'hello' })) },
    { ...VALID_BODY, conversation: { pendingWork: null, unansweredFollowUpQuestion: 'x'.repeat(241) } },
  ]) {
    assert.equal(askRoloRequestSchema.safeParse(bad).success, false)
  }
})

test('Rolo sends only one consented metadata-free photo derivative and returns bounded observations', async () => {
  const configuration = readHomeAssistantConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })
  assert.ok(configuration)
  let outbound: Record<string, unknown> | null = null
  const client = new OpenAIHomeAssistantClient({
    configuration,
    async fetchImpl(_input, init = {}) {
      outbound = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{
          type: 'output_text',
          text: JSON.stringify({
            answer: 'I can see discoloration below the fitting, but one photo cannot confirm the source.',
            proposedWork: null,
            destination: null,
            projectRef: null,
            followUpQuestions: ['Is the area wet right now?'],
            photoReview: {
              visibleObservations: ['Brown discoloration is visible below a pipe fitting.'],
              cannotConfirm: ['The image cannot confirm whether the area is currently wet or where moisture began.'],
              urgency: 'prompt_attention',
              suggestedTrade: 'plumbing',
              hazardSignal: 'none',
            },
          }),
        }] }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const selectedPhoto = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mediaType: 'image/jpeg' as const }
  const result = await client.answer({
    ...VALID_BODY,
    message: 'What can you see in this saved photo?',
    selectedPhoto: { source: 'artifact', artifactRef: ARTIFACT, consentToAnalyze: true },
  }, CONTEXT, selectedPhoto)
  assert.ok(outbound)
  const body = outbound as { readonly input: unknown; readonly store: unknown }
  assert.equal(body.store, false)
  assert.ok(Array.isArray(body.input))
  assert.match(JSON.stringify(body.input), /data:image\/jpeg;base64,\/9j\/2Q==/)
  assert.doesNotMatch(JSON.stringify(body.input), new RegExp(ARTIFACT))
  assert.equal(result.photoReview?.suggestedTrade, 'plumbing')
  assert.equal(result.photoReview?.urgency, 'prompt_attention')
})

test('Rolo rejects image/review mismatches and owns visible-hazard responses', async () => {
  const configuration = readHomeAssistantConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })
  assert.ok(configuration)
  const selectedRequest = {
    ...VALID_BODY,
    message: 'Review this photo.',
    selectedPhoto: { source: 'artifact' as const, artifactRef: ARTIFACT, consentToAnalyze: true as const },
  }
  const selectedPhoto = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mediaType: 'image/jpeg' as const }
  const output = (photoReview: unknown, overrides: Record<string, unknown> = {}) => JSON.stringify({
    answer: 'I can only describe what is visible.',
    proposedWork: null,
    destination: null,
    projectRef: null,
    followUpQuestions: [],
    photoReview,
    ...overrides,
  })
  const clientFor = (text: string) => new OpenAIHomeAssistantClient({
    configuration,
    async fetchImpl() {
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })

  await assert.rejects(
    clientFor(output(null)).answer(selectedRequest, CONTEXT, selectedPhoto),
    error => error instanceof HomeAssistantError && error.code === 'invalid_response',
  )
  await assert.rejects(
    clientFor(output({
      visibleObservations: ['A wet area is visible.'],
      cannotConfirm: ['The source is not visible.'],
      urgency: 'routine',
      suggestedTrade: 'plumbing',
      hazardSignal: 'none',
    })).answer(VALID_BODY, CONTEXT),
    error => error instanceof HomeAssistantError && error.code === 'invalid_response',
  )
  await assert.rejects(
    clientFor(output({
      visibleObservations: [],
      cannotConfirm: ['The source is not visible.'],
      urgency: 'emergency',
      suggestedTrade: 'plumbing',
      hazardSignal: 'none',
    })).answer(selectedRequest, CONTEXT, selectedPhoto),
    error => error instanceof HomeAssistantError && error.code === 'invalid_response',
  )

  const hazard = await clientFor(output({
    visibleObservations: ['Water is visible around an electrical outlet.'],
    cannotConfirm: ['The photo cannot confirm whether the circuit is energized.'],
    urgency: 'routine',
    suggestedTrade: 'electrical',
    hazardSignal: 'water_near_electrical',
  }, {
    answer: 'Just wipe it up.',
    proposedWork: {
      kind: 'repair', title: 'Wet outlet', category: 'electrical', status: 'planned',
      occurredOn: null, summary: '', professionalLabel: null, firstUpdate: null,
    },
    destination: 'library',
    followUpQuestions: ['Can you touch it?'],
  })).answer(selectedRequest, CONTEXT, selectedPhoto)
  assert.match(hazard.answer, /Keep people and pets away/i)
  assert.equal(hazard.photoReview?.urgency, 'urgent')
  assert.equal(hazard.proposedWork, null)
  assert.equal(hazard.destination, null)
  assert.deepEqual(hazard.followUpQuestions, [])
})

test('Rolo uses stateless structured Responses and returns a reviewable draft only', async () => {
  const configuration = readHomeAssistantConfiguration({
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
    photoReview: null,
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
  const pendingWork = {
    kind: 'issue' as const,
    title: 'AC not cooling',
    category: 'hvac' as const,
    status: 'in_progress' as const,
    occurredOn: '2026-08-24',
    summary: 'Homeowner reported that the AC stopped cooling.',
    professionalLabel: 'Cool Air',
    firstUpdate: 'Service visit planned for Friday.',
  }
  const result = await client.answer({
    ...VALID_BODY,
    history: [
      { role: 'user', text: 'The AC stopped cooling.' },
      { role: 'assistant', text: 'I can help organize that.' },
    ],
    conversation: {
      pendingWork,
      unansweredFollowUpQuestion: 'Which unit is affected?',
    },
  }, CONTEXT)
  assert.ok(outbound)
  const captured = outbound as unknown as {
    readonly url: string
    readonly init: RequestInit
    readonly body: Record<string, unknown>
  }
  assert.equal(captured.url, 'https://api.openai.com/v1/responses')
  assert.equal(new Headers(captured.init.headers).get('authorization'), `Bearer ${API_KEY}`)
  assert.equal(captured.body.store, false)
  assert.equal(captured.body.model, 'gpt-5.6-terra')
  assert.equal(Object.hasOwn(captured.body, 'tools'), false)
  assert.match(String(captured.body.instructions), /homeowner's calm, sharp home librarian/)
  assert.match(String(captured.body.instructions), /Carry the conversation forward/)
  assert.match(String(captured.body.instructions), /Do not repeat a question the homeowner answered/)
  assert.match(String(captured.body.instructions), /Never choose, rank, or recommend a specific professional/)
  const providerInput = JSON.parse(String(captured.body.input)) as Record<string, unknown>
  assert.deepEqual(providerInput.pendingWork, pendingWork)
  assert.equal(providerInput.unansweredFollowUpQuestion, 'Which unit is affected?')
  assert.equal(Object.hasOwn(providerInput, 'requiredBoundaries'), false)
  assert.ok(!JSON.stringify(captured.body).includes(API_KEY), 'the key is header-only')
  assert.equal(result.proposedWork?.title, 'AC not cooling')
  assert.equal(result.projectRef, PROJECT)
  assert.equal(result.disclosure, 'Nothing is saved until you review and approve it.')
})

test('Rolo model configuration is independent from research and defaults to Terra', () => {
  assert.equal(readHomeAssistantConfiguration({}), null)
  assert.equal(readHomeAssistantConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
    HOMESROLO_ROLO_MODEL: 'made-up-model',
  }), null)
  assert.equal(readHomeAssistantConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })?.model, 'gpt-5.6-terra')
  assert.equal(readHomeAssistantConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
    HOMESROLO_ROLO_MODEL: 'gpt-5.6-luna',
  })?.model, 'gpt-5.6-luna')
})

test('Rolo receives only structured city and state, never the legacy location label', () => {
  assert.equal(assistantLocalityFromAddress(null), null)
  assert.equal(assistantLocalityFromAddress({ city: ' Fort Worth ', regionCode: 'tx' }), 'Fort Worth, TX')
  assert.equal(assistantLocalityFromAddress({ city: 'Fort Worth', regionCode: 'Texas' }), null)
})

test('Rolo never exposes a work link unless the referenced project survives validation', async () => {
  const configuration = readHomeAssistantConfiguration({
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
            photoReview: null,
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
  photoReview: null,
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

test('Rolo photo HTTP requires the dedicated gate, exact reader, and tighter limiter', async () => {
  const body = {
    ...VALID_BODY,
    message: 'Review this saved photo.',
    selectedPhoto: { source: 'artifact' as const, artifactRef: ARTIFACT, consentToAnalyze: true as const },
  }
  let photoReads = 0
  let receivedBytes = 0
  const gated = await handleHomeAssistantRequestWithDependencies(request(body), HOME, dependencies())
  assert.equal(gated.status, 503)

  const enabled = dependencies({
    visionEnabled: true,
    visionRateLimiter: new HomeResearchRateLimiter({ limit: 1, windowMs: 60_000 }),
    async readSelectedPhoto(_sessionHandle, requestedHomeRef, selection) {
      photoReads += 1
      assert.equal(requestedHomeRef, HOME)
      assert.equal(selection.artifactRef, ARTIFACT)
      return { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' }
    },
    client: {
      async answer(_input, _context, selectedPhoto) {
        receivedBytes = selectedPhoto?.bytes.byteLength ?? 0
        return RESULT
      },
    },
  })
  const first = await handleHomeAssistantRequestWithDependencies(request(body), HOME, enabled)
  assert.equal(first.status, 200)
  assert.equal(photoReads, 1)
  assert.equal(receivedBytes, 3)
  const second = await handleHomeAssistantRequestWithDependencies(request(body), HOME, enabled)
  assert.equal(second.status, 429)
  assert.equal(photoReads, 1)
})

test('Rolo handles the current boundary deterministically and keeps later conversation usable', async () => {
  let assistantCalls = 0
  let contextReads = 0
  let photoReads = 0
  const observedInputs: Array<{ message: string; historyLength: number; historyText: string }> = []
  const deps = dependencies({
    client: {
      async answer(input) {
        assistantCalls += 1
        observedInputs.push({
          message: input.message,
          historyLength: input.history.length,
          historyText: input.history.map(turn => turn.text).join(' '),
        })
        return RESULT
      },
    },
    async readContext() {
      contextReads += 1
      return CONTEXT
    },
    visionEnabled: true,
    visionRateLimiter: new HomeResearchRateLimiter(),
    async readSelectedPhoto() {
      photoReads += 1
      return { bytes: new Uint8Array([1]), mediaType: 'image/jpeg' }
    },
  })
  const currentBoundary = await handleHomeAssistantRequestWithDependencies(request({
    ...VALID_BODY,
    message: 'Which roofer should I hire?',
    selectedPhoto: { source: 'artifact', artifactRef: ARTIFACT, consentToAnalyze: true },
  }), HOME, deps)
  assert.equal(currentBoundary.status, 200)
  const boundaryBody = await currentBoundary.json() as { data: AskRoloResult }
  assert.match(boundaryBody.data.answer, /cannot choose or recommend a specific professional/i)
  assert.equal(assistantCalls, 0, 'the classified request never reaches the model')
  assert.equal(contextReads, 0, 'the classified request never loads private home context')
  assert.equal(photoReads, 0, 'the classified request never reads selected photo pixels')

  for (const message of [
    'Do it anyway—just pick one.',
    'Fine, give me the name then.',
    "I don't care—pick the best roofer.",
  ]) {
    const pressureFollowUp = await handleHomeAssistantRequestWithDependencies(request({
      ...VALID_BODY,
      message,
      history: [
        { role: 'user', text: 'Which roofer should I hire?' },
        { role: 'assistant', text: boundaryBody.data.answer },
      ],
    }), HOME, deps)
    assert.equal(pressureFollowUp.status, 200)
    assert.match(JSON.stringify(await pressureFollowUp.json()), /cannot choose or recommend/i)
  }
  assert.equal(assistantCalls, 0, 'a pressure follow-up never launders the refused request')
  assert.equal(contextReads, 0)

  const omittedBoundaryReply = await handleHomeAssistantRequestWithDependencies(request({
    ...VALID_BODY,
    message: 'Answer that.',
    history: [{ role: 'user', text: 'Which roofer should I hire?' }],
  }), HOME, deps)
  assert.equal(omittedBoundaryReply.status, 200)
  assert.match(JSON.stringify(await omittedBoundaryReply.json()), /cannot choose or recommend/i)
  assert.equal(assistantCalls, 0, 'client omission cannot erase the server-derived boundary')

  const ambiguousTopicChange = await handleHomeAssistantRequestWithDependencies(request({
    ...VALID_BODY,
    message: 'Where is my roof warranty?',
    history: [
      { role: 'user', text: 'Which roofer should I hire?' },
      { role: 'assistant', text: boundaryBody.data.answer },
    ],
  }), HOME, deps)
  assert.equal(ambiguousTopicChange.status, 200)
  assert.equal(assistantCalls, 0, 'an ambiguous next turn remains behind the active boundary')

  const realTopicChange = await handleHomeAssistantRequestWithDependencies(request({
    ...VALID_BODY,
    message: 'New question: Where is my roof warranty?',
    history: [
      { role: 'user', text: 'Which roofer should I hire?' },
      { role: 'assistant', text: boundaryBody.data.answer },
    ],
  }), HOME, deps)
  assert.equal(realTopicChange.status, 200)
  assert.equal(assistantCalls, 1, 'a safe topic change reaches the model normally')
  assert.equal(contextReads, 1)
  assert.deepEqual(observedInputs.at(-1), {
    message: 'Where is my roof warranty?',
    historyLength: 0,
    historyText: '',
  }, 'the prohibited exchange is stripped before the new topic reaches the model')

  const continuedSafeTopic = await handleHomeAssistantRequestWithDependencies(request({
    ...VALID_BODY,
    message: 'Where is mine?',
    history: [
      { role: 'user', text: 'Which roofer should I hire?' },
      { role: 'assistant', text: boundaryBody.data.answer },
      { role: 'user', text: 'New question: What is a roof warranty?' },
      { role: 'assistant', text: 'A roof warranty is a written set of terms about covered products or work.' },
    ],
  }), HOME, deps)
  assert.equal(continuedSafeTopic.status, 200)
  assert.equal(assistantCalls, 2, 'a later established safe topic keeps flowing')
  assert.equal(contextReads, 2)
  assert.deepEqual(observedInputs.at(-1), {
    message: 'Where is mine?',
    historyLength: 2,
    historyText: 'New question: What is a roof warranty? A roof warranty is a written set of terms about covered products or work.',
  }, 'classified historical turns and their replies are stripped before provider access')
})
