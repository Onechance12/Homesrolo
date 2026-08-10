import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePortMode } from '../port/mode.ts'
import { createRemotePort } from '../port/remote.ts'
import { portErrorForStatus, unwrapEnvelope, WireError, decodeSession } from '../port/wire.ts'
import type { JsonTransport, TransportRequest } from '../port/transport.ts'

/**
 * The remote adapter under a fake transport: no network exists anywhere in
 * this suite, which is exactly how the adapter is meant to be exercised.
 */

const REF = (prefix: string, c: string) => `${prefix}_${c.repeat(43)}`
const HOME = REF('hhom', 'b')
const PROJECT = REF('hprj', 'r')

const data = (value: unknown) => ({ kind: 'reply' as const, status: 200, body: { data: value } })

function transportReturning(status: number, body?: unknown): JsonTransport {
  return async () => ({ kind: 'reply', status, body })
}

function recordingTransport(replies: Record<string, unknown>) {
  const requests: TransportRequest[] = []
  const transport: JsonTransport = async request => {
    requests.push(request)
    const key = `${request.method} ${request.path}`
    if (key in replies) return data(replies[key])
    return { kind: 'reply', status: 404, body: { data: null } }
  }
  return { transport, requests }
}

const wireHome = {
  homeRef: HOME, alias: 'Wire House', locality: 'Wire Metro',
  projectCount: 1, openMaintenanceCount: 0, isSynthetic: false,
}

// --- mode selection -----------------------------------------------------------

test('the mode selector fails closed to synthetic on anything but exactly "remote"', () => {
  assert.equal(resolvePortMode('remote'), 'remote')
  for (const wrong of [undefined, '', 'synthetic', 'REMOTE', ' remote', 'remote ', 'live', 'prod', 'true', '1']) {
    assert.equal(resolvePortMode(wrong), 'synthetic', `${JSON.stringify(wrong)} must fail closed`)
  }
})

// --- status mapping -----------------------------------------------------------

test('every HTTP status maps to exactly the agreed PortError', () => {
  assert.equal(portErrorForStatus(401), 'not_signed_in')
  assert.equal(portErrorForStatus(403), 'forbidden')
  assert.equal(portErrorForStatus(404), 'not_found')
  assert.equal(portErrorForStatus(409), 'conflict')
  assert.equal(portErrorForStatus(422), 'invalid')
  assert.equal(portErrorForStatus(429), 'rate_limited')
  for (const status of [500, 502, 503, 301, 204, 418]) {
    assert.equal(portErrorForStatus(status), 'unavailable', `status ${status}`)
  }
})

test('the adapter surfaces mapped errors and treats network failure as unavailable', async () => {
  for (const [status, error] of [[401, 'not_signed_in'], [403, 'forbidden'], [404, 'not_found'],
    [409, 'conflict'], [422, 'invalid'], [429, 'rate_limited'], [500, 'unavailable']] as const) {
    const port = createRemotePort(transportReturning(status, { data: null }))
    const result = await port.listHomes()
    assert.deepEqual(result, { ok: false, error }, `status ${status}`)
  }
  const dead = createRemotePort(async () => ({ kind: 'network_failure' as const }))
  assert.deepEqual(await dead.listHomes(), { ok: false, error: 'unavailable' })
  const throwing = createRemotePort(async () => { throw new Error('boom') })
  assert.deepEqual(await throwing.listHomes(), { ok: false, error: 'unavailable' })
})

// --- strict decoding ----------------------------------------------------------

test('the envelope accepts exactly one key, data', () => {
  assert.equal(unwrapEnvelope({ data: 1 }), 1)
  assert.throws(() => unwrapEnvelope({ data: 1, extra: 2 }), WireError)
  assert.throws(() => unwrapEnvelope({ result: 1 }), WireError)
  assert.throws(() => unwrapEnvelope([1]), WireError)
  assert.throws(() => unwrapEnvelope('data'), WireError)
})

test('unknown keys, malformed refs, and impossible dates reject the response', async () => {
  const good = createRemotePort(transportReturning(200, { data: [wireHome] }))
  const okResult = await good.listHomes()
  assert.ok(okResult.ok)

  const cases: readonly unknown[] = [
    [{ ...wireHome, surprise: 'key' }],                        // unknown key
    [{ ...wireHome, homeRef: 'hhom_short' }],                  // malformed ref
    [{ ...wireHome, homeRef: REF('hwrk', 'b') }],              // wrong prefix
    [{ ...wireHome, isSynthetic: true }],                      // server claiming synthetic
    [{ ...wireHome, projectCount: '1' }],                      // wrong type
  ]
  for (const body of cases) {
    const port = createRemotePort(transportReturning(200, { data: body }))
    const result = await port.listHomes()
    assert.deepEqual(result, { ok: false, error: 'invalid' }, JSON.stringify(body).slice(0, 60))
  }

  const badDate = createRemotePort(transportReturning(200, {
    data: [{
      projectRef: PROJECT, homeRef: HOME, title: 'X', trade: 'Y',
      performedOn: '2026-02-30', status: 'completed', photoCount: 0, documentCount: 0,
      isSynthetic: false,
    }],
  }))
  assert.deepEqual(await badDate.listProjects(HOME), { ok: false, error: 'invalid' })
})

test('a timeline href from the server must be an app-internal route', async () => {
  const entry = (href: string | null) => ([{
    entryRef: 'e1', homeRef: HOME, kind: 'project', on: '2026-05-18',
    title: 'T', detail: 'D', href, isSynthetic: false,
  }])
  const internal = createRemotePort(transportReturning(200, { data: entry(`/home/${HOME}/projects/${PROJECT}`) }))
  assert.ok((await internal.listTimeline(HOME)).ok)
  for (const hostile of ['https://evil.example/x', '//evil.example', 'javascript:alert(1)', '/companies/x']) {
    const port = createRemotePort(transportReturning(200, { data: entry(hostile) }))
    assert.deepEqual(await port.listTimeline(HOME), { ok: false, error: 'invalid' }, hostile)
  }
})

test('the session decoder is strict and a failed session read is signed_out', async () => {
  const live = decodeSession({
    kind: 'signed_out', capabilities: { magicLinkSignIn: true },
  }, 'data')
  assert.equal(live.kind, 'signed_out')
  assert.equal(live.capabilities.magicLinkSignIn, true)

  assert.throws(() => decodeSession({ kind: 'signed_out' }, 'data'), WireError,
    'capabilities are required, not assumed')
  assert.throws(() => decodeSession({
    kind: 'signed_in', capabilities: { magicLinkSignIn: true },
    session: { principalRef: REF('hprn', 'p'), displayName: 'A', isSynthetic: true },
  }, 'data'), WireError, 'a server session claiming to be synthetic is malformed')

  const broken = createRemotePort(transportReturning(200, { data: { kind: 'weird' } }))
  const session = await broken.getSession()
  assert.equal(session.kind, 'signed_out')
  assert.equal(session.capabilities.magicLinkSignIn, false,
    'a failed session read reports no capabilities rather than guessed ones')
})

// --- request construction -----------------------------------------------------

test('the browser sends paths and typed bodies, never a principal or authority claim', async () => {
  const { transport, requests } = recordingTransport({
    [`GET /api/v1/homes`]: [wireHome],
    [`GET /api/v1/homes/${HOME}`]: { ...wireHome, yearBuilt: null, homeType: 'house', keyFacts: [] },
    [`GET /api/v1/homes/${HOME}/projects`]: [],
    [`GET /api/v1/homes/${HOME}/documents`]: [],
    [`GET /api/v1/homes/${HOME}/warranties`]: [],
    [`GET /api/v1/homes/${HOME}/timeline`]: [],
    [`GET /api/v1/homes/${HOME}/maintenance`]: [],
    [`POST /api/v1/homes`]: wireHome,
    [`POST /api/v1/session/magic-link`]: { accepted: true },
  })
  const port = createRemotePort(transport)
  await port.getSession()
  await port.listHomes()
  await port.getHome(HOME)
  await port.listProjects(HOME)
  await port.listDocuments(HOME)
  await port.listWarranties(HOME)
  await port.listTimeline(HOME)
  await port.listMaintenance(HOME)
  await port.createHome({ alias: 'A', locality: 'B', homeType: 'house', yearBuilt: null })
  await port.requestMagicLink('person@example.com')
  await port.signOut()

  for (const request of requests) {
    const wire = JSON.stringify(request)
    assert.ok(request.path.startsWith('/api/v1'), `same-origin path only: ${request.path}`)
    assert.ok(!/^https?:|^\/\//.test(request.path), 'never an absolute URL')
    assert.ok(!wire.includes('hprn_'), 'a principal ref never crosses the wire from the browser')
    assert.ok(!wire.includes('principal'), 'no principal field is ever sent')
    assert.ok(!/authoriz|grant|role|provider/i.test(wire), `no authority claim in ${wire.slice(0, 80)}`)
  }
})

test('a malformed ref never becomes a request path', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  for (const hostile of ['../admin', 'hhom_short', 'hhom_' + 'x'.repeat(44), '', 'x/y', 'hhom_a b']) {
    const result = await port.getHome(hostile)
    assert.deepEqual(result, { ok: false, error: 'not_found' }, hostile)
  }
  assert.equal(requests.length, 0, 'no request may be built from a malformed ref')
})

// --- magic link ---------------------------------------------------------------

test('magic-link acceptance is only ever what the server said', async () => {
  const accepted = createRemotePort(transportReturning(202, { data: { accepted: true } }))
  assert.deepEqual(await accepted.requestMagicLink('a@example.com'),
    { ok: true, value: { accepted: true } })

  const limited = createRemotePort(transportReturning(429, {}))
  assert.deepEqual(await limited.requestMagicLink('a@example.com'),
    { ok: false, error: 'rate_limited' })

  const rejected = createRemotePort(transportReturning(422, {}))
  assert.deepEqual(await rejected.requestMagicLink('a@example.com'),
    { ok: false, error: 'invalid' })

  const down = createRemotePort(async () => ({ kind: 'network_failure' as const }))
  assert.deepEqual(await down.requestMagicLink('a@example.com'),
    { ok: false, error: 'unavailable' })

  // A 200 with a non-conforming body is not an acceptance.
  const weird = createRemotePort(transportReturning(200, { data: { accepted: true, sent: 'yes' } }))
  assert.deepEqual(await weird.requestMagicLink('a@example.com'),
    { ok: false, error: 'invalid' })
})

test('the demo doorway does not exist in remote mode', async () => {
  const port = createRemotePort(transportReturning(200, { data: null }))
  await assert.rejects(() => port.enterDemoSession('x'), /synthetic-mode only/)
})
