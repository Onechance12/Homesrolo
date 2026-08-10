import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePortMode } from '../port/mode.ts'
import { createRemotePort } from '../port/remote.ts'
import {
  EXPECTED_API_VERSION, WireError, decodeSession, portErrorForStatus, unwrapEnvelope,
} from '../port/wire.ts'
import type { JsonTransport, TransportRequest } from '../port/transport.ts'

/**
 * The remote adapter under a fake transport, against the EXACT payloads of
 * homeowner-api.v1 (PR #8). No network exists anywhere in this suite.
 */

const REF = (prefix: string, c: string) => `${prefix}_${c.repeat(43)}`
const HOME = REF('hhom', 'b')

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

/** Exactly homeownerApiCapabilitiesSchema. */
const CAPABILITIES = {
  magicLinkSignIn: false,
  persistence: false,
  uploads: false,
  invitations: false,
  sharing: false,
}

/** Exactly homeownerApiSessionSchema, signed_out and signed_in. */
const SIGNED_OUT = { apiVersion: EXPECTED_API_VERSION, kind: 'signed_out', capabilities: CAPABILITIES }
const SIGNED_IN = {
  apiVersion: EXPECTED_API_VERSION,
  kind: 'signed_in',
  principalRef: REF('hprn', 'p'),
  capabilities: CAPABILITIES,
}

/** Exactly homeownerApiHomeSummarySchema. */
const HOME_SUMMARY = {
  homeRef: HOME,
  displayLabel: 'The Wire House',
  privateLocationLabel: 'Wire Metro — North',
  relationshipLabel: 'claimed_unverified',
}

/** Exactly homeownerApiHomeViewSchema. */
const HOME_VIEW = {
  ...HOME_SUMMARY,
  projectCount: 3,
  documentCount: 8,
  warrantyCount: 2,
  maintenanceCount: 4,
  updatedAt: '2026-08-10T16:00:00.000Z',
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
  assert.equal(portErrorForStatus(400), 'invalid')
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

// --- envelope -----------------------------------------------------------------

test('the envelope accepts exactly one key, data (a route-adapter requirement)', () => {
  assert.equal(unwrapEnvelope({ data: 1 }), 1)
  assert.throws(() => unwrapEnvelope({ data: 1, extra: 2 }), WireError)
  assert.throws(() => unwrapEnvelope({ result: 1 }), WireError)
  assert.throws(() => unwrapEnvelope([1]), WireError)
  assert.throws(() => unwrapEnvelope('data'), WireError)
})

// --- session: exact PR #8 shape -----------------------------------------------

test('the session decoder accepts exactly the homeowner-api.v1 shapes', async () => {
  const out = decodeSession(SIGNED_OUT, 'data')
  assert.equal(out.kind, 'signed_out')
  assert.deepEqual(out.capabilities, CAPABILITIES)

  const inn = decodeSession(SIGNED_IN, 'data')
  assert.equal(inn.kind, 'signed_in')
  if (inn.kind !== 'signed_in') return
  assert.equal(inn.session.principalRef, SIGNED_IN.principalRef)
  assert.equal(inn.session.displayName, null,
    'the server names no one; the UI renders a neutral label')
  assert.equal(inn.session.isSynthetic, false)
})

test('sessions missing apiVersion, capability keys, or carrying extras are rejected', () => {
  const { apiVersion: _dropped, ...noVersion } = SIGNED_OUT
  assert.throws(() => decodeSession(noVersion, 'data'), WireError, 'apiVersion is required')
  assert.throws(() => decodeSession({ ...SIGNED_OUT, apiVersion: 'homeowner-api.v2' }, 'data'),
    WireError, 'a different version is not silently accepted')

  const { persistence: _p, ...fourCaps } = CAPABILITIES
  assert.throws(() => decodeSession({ ...SIGNED_OUT, capabilities: fourCaps }, 'data'),
    WireError, 'all five capability booleans are required')
  assert.throws(() => decodeSession(
    { ...SIGNED_OUT, capabilities: { ...CAPABILITIES, surprise: true } }, 'data',
  ), WireError, 'unknown capability keys are rejected')

  // The OLD guessed Phase-2 payload must now be rejected, not tolerated.
  assert.throws(() => decodeSession({
    kind: 'signed_in',
    capabilities: { magicLinkSignIn: true },
    session: { principalRef: REF('hprn', 'p'), displayName: 'A', isSynthetic: false },
  }, 'data'), WireError, 'the pre-PR#8 guessed shape is dead')

  assert.throws(() => decodeSession({ ...SIGNED_IN, displayName: 'Someone' }, 'data'),
    WireError, 'the server does not send a display name and the client does not accept one')
  assert.throws(() => decodeSession({ ...SIGNED_IN, isSynthetic: false }, 'data'),
    WireError, 'no synthetic marker exists on the wire')
  assert.throws(() => decodeSession({ ...SIGNED_IN, principalRef: 'hprn_short' }, 'data'),
    WireError, 'malformed principal refs are rejected')
})

test('a failed or malformed session read is signed_out with no capabilities', async () => {
  for (const body of [{ data: { kind: 'weird' } }, { data: SIGNED_OUT, extra: 1 }, undefined]) {
    const port = createRemotePort(transportReturning(200, body))
    const session = await port.getSession()
    assert.equal(session.kind, 'signed_out')
    assert.deepEqual(session.capabilities, CAPABILITIES,
      'no capability is guessed on from a broken read')
  }
})

// --- homes: exact PR #8 shapes ------------------------------------------------

test('the home list accepts exactly HomeownerApiHomeSummary and nothing more', async () => {
  const port = createRemotePort(transportReturning(200, { data: [HOME_SUMMARY] }))
  const result = await port.listHomes()
  assert.ok(result.ok)
  if (!result.ok) return
  const entry = result.value[0]
  assert.ok(entry)
  assert.equal(entry.source, 'server')
  if (entry.source !== 'server') return
  assert.equal(entry.displayLabel, 'The Wire House')
  assert.equal(entry.relationshipLabel, 'claimed_unverified')

  // Old guessed shapes and padded shapes are rejected.
  const rejected: readonly unknown[] = [
    [{ ...HOME_SUMMARY, displayLabel: '' }],                      // server min(1) mirrored
    [{ ...HOME_SUMMARY, displayLabel: ' padded ' }],              // server trim mirrored
    [{ ...HOME_SUMMARY, displayLabel: 'x'.repeat(81) }],          // server max(80) mirrored
    [{ ...HOME_SUMMARY, privateLocationLabel: 'y'.repeat(201) }], // server max(200) mirrored
    [{ ...HOME_SUMMARY, projectCount: 3 }],                       // counts are view-only
    [{ ...HOME_SUMMARY, isSynthetic: false }],                    // no marker on the wire
    [{ ...HOME_SUMMARY, alias: 'x' }],                            // pre-PR#8 field name
    [{ homeRef: HOME, alias: 'x', locality: 'y', projectCount: 1, openMaintenanceCount: 0, isSynthetic: false }],
    [{ ...HOME_SUMMARY, homeRef: REF('hprj', 'b') }],             // wrong prefix
    [{ ...HOME_SUMMARY, relationshipLabel: 'owner' }],            // unknown label
    [{ ...HOME_SUMMARY, storageObjectRef: 'hobj_x' }],            // storage internals
    [{ ...HOME_SUMMARY, providerId: 'auth0|123' }],               // provider identifiers
  ]
  for (const body of rejected) {
    const bad = createRemotePort(transportReturning(200, { data: body }))
    assert.deepEqual(await bad.listHomes(), { ok: false, error: 'invalid' },
      JSON.stringify(body).slice(0, 70))
  }
})

test('the home view accepts exactly HomeownerApiHomeView', async () => {
  const port = createRemotePort(transportReturning(200, { data: HOME_VIEW }))
  const result = await port.getHome(HOME)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.value.source, 'server')
  if (result.value.source !== 'server') return
  assert.equal(result.value.projectCount, 3)
  assert.equal(result.value.maintenanceCount, 4)
  assert.equal(result.value.updatedAt, '2026-08-10T16:00:00.000Z')

  const rejected: readonly unknown[] = [
    HOME_SUMMARY,                                                  // counts are required on the view
    { ...HOME_VIEW, yearBuilt: 1987 },                             // pre-PR#8 field
    { ...HOME_VIEW, keyFacts: [] },                                // pre-PR#8 field
    { ...HOME_VIEW, homeType: 'house' },                           // pre-PR#8 field
    { ...HOME_VIEW, projectCount: -1 },                            // negative count
    { ...HOME_VIEW, updatedAt: '2026-08-10T16:00:00+02:00' },      // offset not allowed
    { ...HOME_VIEW, updatedAt: '2026-08-10' },                     // date is not a datetime
    { ...HOME_VIEW, updatedAt: '2026-08-10T16:00:00Z' },           // second precision only
    { ...HOME_VIEW, updatedAt: '2026-08-10T16:00:00.000000Z' },    // microsecond precision
    { ...HOME_VIEW, updatedAt: '2026-02-30T16:00:00.000Z' },       // impossible date
    { ...HOME_VIEW, displayLabel: '' },                            // empty label
    { ...HOME_VIEW, displayLabel: ' padded ' },                    // untrimmed label
    { ...HOME_VIEW, displayLabel: 'x'.repeat(81) },                // over the 80 cap
    { ...HOME_VIEW, privateLocationLabel: 'y'.repeat(201) },       // over the 200 cap
  ]
  for (const body of rejected) {
    const bad = createRemotePort(transportReturning(200, { data: body }))
    assert.deepEqual(await bad.getHome(HOME), { ok: false, error: 'invalid' },
      JSON.stringify(body).slice(0, 70))
  }
})

// --- the narrowed surface -----------------------------------------------------

test('undefined routes return unavailable without ever building a request', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  const results = await Promise.all([
    port.requestMagicLink('a@example.com'),
    port.createHome({ alias: 'A', locality: 'B', homeType: 'house', yearBuilt: null }),
    port.listProjects(HOME),
    port.getProject(HOME, REF('hprj', 'r')),
    port.addProject(HOME, { title: 'T', trade: 'G', performedOn: '2026-08-01', contractor: 'C', summary: 'S' }),
    port.listDocuments(HOME),
    port.listWarranties(HOME),
    port.listTimeline(HOME),
    port.listMaintenance(HOME),
  ])
  for (const result of results) {
    assert.deepEqual(result, { ok: false, error: 'unavailable' },
      'a route the server has not defined must refuse, not guess')
  }
  assert.equal(requests.length, 0,
    'no request may be sent to a route homeowner-api.v1 does not define')
})

// --- request construction -----------------------------------------------------

test('the browser sends validated paths only, never principal identity', async () => {
  const { transport, requests } = recordingTransport({
    ['GET /api/v1/homes']: [HOME_SUMMARY],
    [`GET /api/v1/homes/${HOME}`]: HOME_VIEW,
  })
  const port = createRemotePort(transport)
  await port.getSession()
  await port.listHomes()
  await port.getHome(HOME)

  assert.deepEqual(requests.map(r => `${r.method} ${r.path}`), [
    'GET /api/v1/session',
    'GET /api/v1/homes',
    `GET /api/v1/homes/${HOME}`,
  ])
  for (const request of requests) {
    const wire = JSON.stringify(request)
    assert.ok(request.path.startsWith('/api/v1'), `same-origin path only: ${request.path}`)
    assert.ok(!/^https?:|^\/\//.test(request.path), 'never an absolute URL')
    assert.ok(!wire.includes('hprn_'), 'a principal ref never crosses the wire from the browser')
    assert.ok(!/principal|provider|authoriz|grant|role|storage/i.test(wire),
      `no identity or authority claim in ${wire.slice(0, 80)}`)
    assert.equal(request.body, undefined, 'the three defined routes are reads; no body exists')
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

test('a well-formed ref of the wrong kind never reaches a home route', async () => {
  // These are perfectly valid opaque refs — of other types. getHome takes an
  // hhom_ ref and nothing else; a principal or project ref in a home route
  // would be the client asking the server a confused question.
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  for (const wrongKind of [REF('hprn', 'p'), REF('hprj', 'r'), REF('hdoc', 'd'), REF('hcmd', 'c')]) {
    const result = await port.getHome(wrongKind)
    assert.deepEqual(result, { ok: false, error: 'not_found' }, wrongKind.slice(0, 10))
  }
  assert.equal(requests.length, 0, 'wrong-kind refs must be rejected before the wire')
})

test('signOut fails loudly instead of pretending a session ended', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  await assert.rejects(() => port.signOut(), /no defined route/)
  assert.equal(requests.length, 0)
})

test('the demo doorway does not exist in remote mode', async () => {
  const port = createRemotePort(transportReturning(200, { data: null }))
  await assert.rejects(() => port.enterDemoSession('x'), /synthetic-mode only/)
})
