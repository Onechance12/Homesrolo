import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HomeResearchRateLimiter,
  OpenAIHomeResearchClient,
  canonicalPublicSourceUrl,
  homeResearchRequestSchema,
  readHomeResearchConfiguration,
  type HomeResearchClient,
  type HomeResearchResult,
} from '../server/home-research.ts'
import {
  handleHomeResearchRequestWithDependencies,
  type HomeResearchHttpDependencies,
} from '../server/home-research-http.ts'

const API_KEY = `sk-proj-${'a'.repeat(48)}`
const ORIGIN = 'https://app.homesrolo.com'
const HANDLE = 's'.repeat(43)
const HOME = `hhom_${'h'.repeat(43)}`
const VALID_BODY = Object.freeze({
  address: '123 Main Street, Fort Worth, TX 76102',
  message: 'What reliable public facts can you find about this home?',
  consentToResearchThisAddressOnline: true as const,
  history: [],
})

test('AI configuration is exact-match default-off and keeps the API key server-owned', () => {
  assert.equal(readHomeResearchConfiguration({}), null)
  assert.equal(readHomeResearchConfiguration({ OPENAI_API_KEY: API_KEY }), null)
  assert.equal(readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'false',
    OPENAI_API_KEY: API_KEY,
  }), null)
  assert.equal(readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'yes',
    OPENAI_API_KEY: API_KEY,
  }), null)
  assert.deepEqual(readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  }), { apiKey: API_KEY, model: 'gpt-5.6-luna' })
})

test('research input requires explicit consent and bounded address/chat context', () => {
  assert.equal(homeResearchRequestSchema.safeParse(VALID_BODY).success, true)
  for (const bad of [
    { ...VALID_BODY, consentToResearchThisAddressOnline: false },
    { ...VALID_BODY, consentToResearchThisAddressOnline: undefined },
    { ...VALID_BODY, address: 'Main Street, Fort Worth, TX' },
    { ...VALID_BODY, address: 'https://example.com/123-main-street' },
    { ...VALID_BODY, address: `123 ${'x'.repeat(200)}` },
    { ...VALID_BODY, message: 'x'.repeat(801) },
    { ...VALID_BODY, ownerEmail: 'person@example.com' },
    {
      ...VALID_BODY,
      history: Array.from({ length: 5 }, () => ({ role: 'user', text: 'hello' })),
    },
  ]) {
    assert.equal(homeResearchRequestSchema.safeParse(bad).success, false)
  }
})

test('only public HTTPS sources cross the research boundary', () => {
  assert.equal(
    canonicalPublicSourceUrl('https://records.example.gov/home?id=1&utm_source=test#result'),
    'https://records.example.gov/home?id=1',
  )
  for (const rejected of [
    'http://records.example.gov/home',
    'https://127.0.0.1/private',
    'https://192.168.1.2/private',
    'https://[::1]/private',
    'https://localhost/private',
    'https://files.localhost/private',
    'https://[::ffff:127.0.0.1]/private',
    'https://[::ffff:7f00:1]/private',
    'https://user:pass@example.gov/private',
    'https://www.zillow.com/homedetails/example',
    'https://realtor.com/realestateandhomes-detail/example',
  ]) {
    assert.equal(canonicalPublicSourceUrl(rejected), null, rejected)
  }
})

test('OpenAI transport hard-codes stateless structured web research and returns only tool-backed citations', async () => {
  const publicUrl = 'https://records.example.gov/property/123'
  const permitUrl = 'https://permits.example.gov/case/456'
  const outputText = JSON.stringify({
    answer: 'The county record proposes a 1998 build year; confirm it before saving.',
    answerSourceUrls: [publicUrl, 'https://www.zillow.com/homedetails/123'],
    proposedFacts: [
      {
        field: 'year_built',
        value: '1998',
        confidence: 'medium',
        sourceUrls: [`${publicUrl}?utm_source=chat`],
      },
      {
        field: 'roof',
        value: 'Replaced in 2024',
        confidence: 'low',
        sourceUrls: ['https://invented.example/roof'],
      },
      {
        field: 'permit',
        value: 'Permit 456 was issued in 2024',
        confidence: 'high',
        sourceUrls: [permitUrl],
      },
    ],
    limitations: ['Public records can lag behind completed work.'],
    followUpQuestions: ['Do you have the closing disclosure to compare?'],
  })
  let outbound: { url: string; init: RequestInit; body: Record<string, unknown> } | null = null
  const configuration = readHomeResearchConfiguration({
    HOMESROLO_AI_ENABLED: 'true',
    OPENAI_API_KEY: API_KEY,
  })
  assert.ok(configuration)
  const client = new OpenAIHomeResearchClient({
    configuration,
    async fetchImpl(input, init = {}) {
      outbound = {
        url: String(input),
        init,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      }
      return new Response(JSON.stringify({
        output: [
          {
            type: 'web_search_call',
            action: {
              type: 'search',
              sources: [
                { type: 'url', title: 'County property record', url: publicUrl },
                { type: 'url', title: 'City permit record', url: permitUrl },
                { type: 'url', title: 'Blocked listing', url: 'https://www.zillow.com/homedetails/123' },
                { type: 'url', title: 'Private address', url: 'https://127.0.0.1/internal' },
              ],
            },
          },
          { type: 'message', content: [{ type: 'output_text', text: outputText }] },
        ],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })
  const result = await client.research(VALID_BODY)
  assert.ok(outbound)
  // TypeScript cannot prove an injected async transport executed its closure;
  // the runtime assertion above establishes the captured request for this test.
  const captured = outbound as unknown as {
    url: string
    init: RequestInit
    body: Record<string, unknown>
  }
  assert.equal(captured.url, 'https://api.openai.com/v1/responses')
  assert.equal(new Headers(captured.init.headers).get('authorization'), `Bearer ${API_KEY}`)
  assert.match(new Headers(captured.init.headers).get('x-client-request-id') ?? '', /^hres_[0-9a-f-]{36}$/)
  assert.equal(captured.body.model, 'gpt-5.6-luna')
  assert.equal(captured.body.store, false)
  assert.equal(captured.body.max_output_tokens, 1_200)
  assert.deepEqual(captured.body.include, ['web_search_call.action.sources'])
  assert.deepEqual(captured.body.tools, [{
    type: 'web_search',
    search_context_size: 'low',
    filters: { blocked_domains: ['zillow.com', 'realtor.com', 'redfin.com', 'trulia.com'] },
  }])
  assert.ok(!JSON.stringify(captured.body).includes(API_KEY), 'the key is header-only')
  assert.deepEqual(result.sources, [
    { title: 'County property record', url: publicUrl },
    { title: 'City permit record', url: permitUrl },
  ])
  assert.deepEqual(result.answerSourceUrls, [publicUrl])
  assert.deepEqual(result.proposedFacts.map(fact => fact.field), ['year_built', 'permit'])
  assert.equal(JSON.stringify(result).includes(VALID_BODY.address), false, 'the private address is not echoed')
  assert.match(result.disclosure, /Confirm proposed facts/)
})

test('process-local limiter enforces a bounded request window', () => {
  let now = 1_000
  const limiter = new HomeResearchRateLimiter({ limit: 2, windowMs: 10_000, now: () => now })
  assert.deepEqual(limiter.consume('opaque-digest'), { allowed: true })
  assert.deepEqual(limiter.consume('opaque-digest'), { allowed: true })
  assert.deepEqual(limiter.consume('opaque-digest'), { allowed: false, retryAfterSeconds: 10 })
  now += 10_000
  assert.deepEqual(limiter.consume('opaque-digest'), { allowed: true })
})

function request(body: unknown = VALID_BODY, input: { origin?: string; cookie?: string; method?: string } = {}) {
  return new Request(`${ORIGIN}/api/v1/homes/${HOME}/research`, {
    method: input.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.origin === undefined ? { origin: ORIGIN } : { origin: input.origin }),
      ...(input.cookie === undefined ? { cookie: `hrolo_session=${HANDLE}` } : { cookie: input.cookie }),
    },
    ...(input.method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })
}

const RESULT: HomeResearchResult = {
  requestRef: 'hres_00000000-0000-4000-8000-000000000000',
  answer: 'A sourced answer.',
  answerSourceUrls: ['https://records.example.gov/home'],
  proposedFacts: [],
  sources: [{ title: 'Public record', url: 'https://records.example.gov/home' }],
  limitations: [],
  followUpQuestions: [],
  disclosure: 'Research is a draft. Confirm proposed facts before adding them to your home record.',
}

function dependencies(overrides: Partial<HomeResearchHttpDependencies> = {}) {
  const client: HomeResearchClient = { async research() { return RESULT } }
  return {
    appOrigin: ORIGIN,
    client,
    async authorizeHome() {},
    rateLimiter: new HomeResearchRateLimiter(),
    ...overrides,
  } satisfies HomeResearchHttpDependencies
}

test('research HTTP route fails closed before OpenAI unless gate, origin, consent, session, and home access pass', async () => {
  let researchCalls = 0
  let authorizationCalls = 0
  const client: HomeResearchClient = {
    async research() { researchCalls += 1; return RESULT },
  }
  const deps = dependencies({
    client,
    async authorizeHome() { authorizationCalls += 1 },
  })

  const unavailable = await handleHomeResearchRequestWithDependencies(
    request(), HOME, { ...deps, client: null },
  )
  assert.equal(unavailable.status, 503)
  const wrongOrigin = await handleHomeResearchRequestWithDependencies(
    request(VALID_BODY, { origin: 'https://evil.example' }), HOME, deps,
  )
  assert.equal(wrongOrigin.status, 403)
  const noConsent = await handleHomeResearchRequestWithDependencies(
    request({ ...VALID_BODY, consentToResearchThisAddressOnline: false }), HOME, deps,
  )
  assert.equal(noConsent.status, 400)
  const signedOut = await handleHomeResearchRequestWithDependencies(
    request(VALID_BODY, { cookie: '' }), HOME, deps,
  )
  assert.equal(signedOut.status, 401)
  assert.equal(authorizationCalls, 0)
  assert.equal(researchCalls, 0)

  const notFound = await handleHomeResearchRequestWithDependencies(request(), HOME, dependencies({
    client,
    async authorizeHome() { throw new HomeownerApiError('not_found') },
  }))
  assert.equal(notFound.status, 404)
  assert.equal(researchCalls, 0)
})

test('research HTTP route returns a private no-store envelope and rate limits before a second model call', async () => {
  let researchCalls = 0
  const client: HomeResearchClient = {
    async research() { researchCalls += 1; return RESULT },
  }
  const deps = dependencies({
    client,
    rateLimiter: new HomeResearchRateLimiter({ limit: 1, windowMs: 60_000 }),
  })
  const first = await handleHomeResearchRequestWithDependencies(request(), HOME, deps)
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(await first.json(), { data: RESULT })

  const second = await handleHomeResearchRequestWithDependencies(request(), HOME, deps)
  assert.equal(second.status, 429)
  assert.ok(Number(second.headers.get('retry-after')) > 0)
  assert.deepEqual(await second.json(), { error: { code: 'rate_limited' } })
  assert.equal(researchCalls, 1)
})
