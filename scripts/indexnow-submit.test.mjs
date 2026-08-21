import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArguments, selectCandidates, submitUrlList, validateUrls } from './indexnow-submit.mjs'

const SITEMAP_URLS = [
  'https://homesrolo.com/',
  'https://homesrolo.com/roof-watch/',
  'https://homesrolo.com/roof-watch/keller/',
]

test('IndexNow accepts only a clean canonical sitemap URL', () => {
  assert.deepEqual(
    validateUrls(['https://homesrolo.com/roof-watch/'], SITEMAP_URLS),
    ['https://homesrolo.com/roof-watch/'],
  )
  assert.throws(
    () => validateUrls(['https://homesrolo.com/roof-watch'], SITEMAP_URLS),
    /canonical trailing slash/,
  )
  assert.throws(
    () => validateUrls(['https://homesrolo.com/not-in-sitemap/'], SITEMAP_URLS),
    /not a current canonical sitemap entry/,
  )
  assert.throws(
    () => validateUrls(['https://homesrolo.com/roof-watch/?preview=1'], SITEMAP_URLS),
    /clean canonical page URL/,
  )
})

test('IndexNow command parsing keeps submission explicit', () => {
  assert.deepEqual(parseArguments([]), { submit: false, all: false, sitemap: `${process.cwd()}/apps/web/out/sitemap.xml`, urls: [] })
  assert.deepEqual(parseArguments(['--submit', '--url', 'https://homesrolo.com/roof-watch/']), {
    submit: true,
    all: false,
    sitemap: `${process.cwd()}/apps/web/out/sitemap.xml`,
    urls: ['https://homesrolo.com/roof-watch/'],
  })
  assert.deepEqual(parseArguments(['--all']), {
    submit: false,
    all: true,
    sitemap: `${process.cwd()}/apps/web/out/sitemap.xml`,
    urls: [],
  })
})

test('IndexNow requires an explicit subset or reviewed all-pages operation', () => {
  assert.throws(() => selectCandidates(parseArguments([]), SITEMAP_URLS), /provide at least one --url/)
  assert.deepEqual(selectCandidates(parseArguments(['--all']), SITEMAP_URLS), SITEMAP_URLS)
  assert.deepEqual(
    selectCandidates(parseArguments(['--url', SITEMAP_URLS[1]]), SITEMAP_URLS),
    [SITEMAP_URLS[1]],
  )
  assert.throws(
    () => selectCandidates(parseArguments(['--all', '--url', SITEMAP_URLS[1]]), SITEMAP_URLS),
    /choose either --all/,
  )
})

test('IndexNow verifies the live key and sends the exact reviewed payload', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (calls.length === 1) {
      return { ok: true, status: 200, text: async () => 'ae05831592254a7653354c33657a5584' }
    }
    return { ok: true, status: 202, headers: { get: () => null } }
  }

  const status = await submitUrlList([SITEMAP_URLS[1]], fetchImpl)
  assert.equal(status, 202)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], {
    url: 'https://homesrolo.com/ae05831592254a7653354c33657a5584.txt',
    options: { headers: { 'user-agent': 'Homesrolo-IndexNow/1.0' } },
  })
  assert.equal(calls[1].url, 'https://api.indexnow.org/indexnow')
  assert.equal(calls[1].options.method, 'POST')
  assert.deepEqual(calls[1].options.headers, { 'content-type': 'application/json; charset=utf-8' })
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    host: 'homesrolo.com',
    key: 'ae05831592254a7653354c33657a5584',
    keyLocation: 'https://homesrolo.com/ae05831592254a7653354c33657a5584.txt',
    urlList: [SITEMAP_URLS[1]],
  })
})

test('IndexNow blocks submission when the live key does not match', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, status: 200, text: async () => 'wrong-key' }
  }

  await assert.rejects(() => submitUrlList([SITEMAP_URLS[1]], fetchImpl), /public IndexNow key is not live/)
  assert.equal(calls, 1)
})

test('IndexNow reports HTTP errors and Retry-After guidance', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) {
      return { ok: true, status: 200, text: async () => 'ae05831592254a7653354c33657a5584' }
    }
    return { ok: false, status: 429, headers: { get: name => name === 'retry-after' ? '60' : null } }
  }

  await assert.rejects(() => submitUrlList([SITEMAP_URLS[1]], fetchImpl), /HTTP 429 \(retry after 60\)/)
})

test('IndexNow rejects undocumented success-class status codes', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) {
      return { ok: true, status: 200, text: async () => 'ae05831592254a7653354c33657a5584' }
    }
    return { ok: true, status: 204, headers: { get: () => null } }
  }

  await assert.rejects(() => submitUrlList([SITEMAP_URLS[1]], fetchImpl), /HTTP 204/)
})
