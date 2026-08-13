import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMMAND_REF_PATTERN, commandRefForAttempt, mintCommandRef } from '../port/command-ref.ts'
import { resolvePortMode } from '../port/mode.ts'
import { createRemotePort } from '../port/remote.ts'
import {
  EXPECTED_API_VERSION, WireError, decodeSession, portErrorForStatus, unwrapEnvelope,
} from '../port/wire.ts'
import type {
  ArtifactUploadTransportRequest, JsonTransport, TransportRequest,
} from '../port/transport.ts'

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
  projectReview: false,
  projectReviewAttachments: false,
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

const PROJECT = REF('hprj', 'r')
const PROJECT_VIEW = {
  projectRef: PROJECT,
  homeRef: HOME,
  title: 'Roof repair',
  category: 'roofing',
  status: 'planned',
  occurredOn: null,
  summary: 'Timing: As soon as possible\n\nLeak above the back room.',
  createdAt: '2026-08-12T16:00:00.000Z',
  updatedAt: '2026-08-12T16:00:00.000Z',
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

  const { projectReviewAttachments: _projectReviewAttachments, ...sixCaps } = CAPABILITIES
  assert.throws(() => decodeSession({ ...SIGNED_OUT, capabilities: sixCaps }, 'data'),
    WireError, 'all seven capability booleans are required')
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

test('the session decoder keeps project review and attachments distinct from generic sharing', () => {
  const decoded = decodeSession({
    ...SIGNED_IN,
    capabilities: {
      ...CAPABILITIES,
      projectReview: true,
      projectReviewAttachments: true,
      sharing: false,
    },
  }, 'data')
  assert.equal(decoded.capabilities.projectReview, true)
  assert.equal(decoded.capabilities.projectReviewAttachments, true)
  assert.equal(decoded.capabilities.sharing, false)
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

// --- create home: the one write (PR #15) --------------------------------------

const CMD = REF('hcmd', 'k')
const CREATE_INPUT = {
  commandRef: CMD,
  alias: 'The Wire House',
  locality: 'Wire Metro — North',
  homeType: 'house' as const,
  yearBuilt: 1987,
}

test('createHome sends exactly one POST with the exact strict command body', async () => {
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    return { kind: 'reply', status: 201, body: { data: HOME_SUMMARY } }
  })
  const result = await port.createHome(CREATE_INPUT)
  assert.ok(result.ok, 'a 201 with the exact summary is the one success')
  if (!result.ok) return
  assert.equal(result.value.source, 'server')
  assert.equal(result.value.homeRef, HOME)

  assert.equal(requests.length, 1, 'one attempt, one request')
  const request = requests[0]
  assert.ok(request)
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/api/v1/homes')
  assert.deepEqual(request.body, {
    commandRef: CMD,
    displayLabel: 'The Wire House',
    privateLocationLabel: 'Wire Metro — North',
  }, 'the body is homeownerApiCreateHomeInputSchema — three keys, nothing else')

  const wire = JSON.stringify(request)
  assert.ok(!/homeType|yearBuilt|systems|roof|heating|cooling|water_heater|gutters|foundation|precision/i.test(wire),
    'profile and systems facts are draft-only: no server contract exists for them')
  assert.ok(!/principal|requestedAt|role|member|basis|authoriz|controller|provider|storage|session|email/i.test(wire),
    'requestedAt and every authority fact are server-derived, never browser-supplied')
  assert.ok(!wire.includes('hprn_'), 'no principal ref crosses the wire from the browser')
})

test('one commandRef per attempt group: minted once, reused verbatim on retry', () => {
  const minted = mintCommandRef()
  assert.match(minted, COMMAND_REF_PATTERN, 'the mint matches opaqueRef("hcmd") exactly')
  assert.notEqual(mintCommandRef(), minted, 'distinct attempt groups mint distinct refs')
  assert.equal(commandRefForAttempt(minted), minted,
    'a RETRY of the same attempt group keeps the same ref, so the server can dedupe')
  assert.match(commandRefForAttempt(null), COMMAND_REF_PATTERN,
    'a new attempt group (edited draft) mints fresh')
})

test('a malformed commandRef or out-of-bounds label never becomes a request', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  for (const badRef of ['', 'hcmd_short', REF('hprn', 'p'), REF('hprj', 'r'),
    `${CMD}x`, 'hcmd_' + '!'.repeat(43)]) {
    assert.deepEqual(await port.createHome({ ...CREATE_INPUT, commandRef: badRef }),
      { ok: false, error: 'invalid' }, `ref ${badRef.slice(0, 16)}`)
  }
  for (const badLabels of [
    { alias: '   ' },
    { alias: 'x'.repeat(81) },
    { locality: '   ' },
    { locality: 'y'.repeat(201) },
  ]) {
    assert.deepEqual(await port.createHome({ ...CREATE_INPUT, ...badLabels }),
      { ok: false, error: 'invalid' }, JSON.stringify(badLabels).slice(0, 40))
  }
  assert.equal(requests.length, 0, 'nothing malformed may touch the wire')
})

test('createHome maps server errors and accepts nothing but a 201 summary', async () => {
  for (const [status, error] of [[401, 'not_signed_in'], [503, 'unavailable'],
    [400, 'invalid'], [409, 'conflict'], [429, 'rate_limited'], [500, 'unavailable'],
    [200, 'unavailable']] as const) {
    const port = createRemotePort(transportReturning(status, { data: HOME_SUMMARY }))
    assert.deepEqual(await port.createHome(CREATE_INPUT), { ok: false, error },
      `status ${status} (a 200 on a create route is off-contract, bounded as unavailable)`)
  }
  const dead = createRemotePort(async () => ({ kind: 'network_failure' as const }))
  assert.deepEqual(await dead.createHome(CREATE_INPUT), { ok: false, error: 'unavailable' })
  // A 201 whose body is not exactly the summary is a server bug, surfaced invalid.
  for (const body of [
    { data: { ...HOME_SUMMARY, extra: 1 } },
    { data: { ...HOME_SUMMARY, isSynthetic: false } },
    { data: HOME_SUMMARY, sibling: true },
    { data: null },
    undefined,
  ]) {
    const bad = createRemotePort(async () => ({ kind: 'reply' as const, status: 201, body }))
    assert.deepEqual(await bad.createHome(CREATE_INPUT), { ok: false, error: 'invalid' },
      JSON.stringify(body)?.slice(0, 60) ?? 'undefined body')
  }
})

// --- exact-home intake: the second write (PR #17) -----------------------------

const INTAKE_CMD = REF('hcmd', 'i')
const INTAKE_INPUT = {
  commandRef: INTAKE_CMD,
  homeType: 'house' as const,
  yearBuilt: { value: 1987, precision: 'approximate' as const },
  systems: [
    'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
  ].map((kind, index) => ({
    kind: kind as 'roof' | 'heating' | 'cooling' | 'water_heater' | 'gutters' | 'foundation',
    present: index === 0 ? 'yes' as const : 'unknown' as const,
    installedOrReplacedYear: index === 0
      ? { value: 2019, precision: 'approximate' as const }
      : null,
  })),
}

const INTAKE_VIEW = {
  homeRef: HOME,
  homeType: INTAKE_INPUT.homeType,
  yearBuilt: INTAKE_INPUT.yearBuilt,
  source: 'homeowner_recollection' as const,
  systems: INTAKE_INPUT.systems,
  updatedAt: '2026-08-11T16:00:00.000Z',
}

test('recordInitialIntake sends the exact body to one exact home', async () => {
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    return { kind: 'reply', status: 201, body: { data: INTAKE_VIEW } }
  })
  const result = await port.recordInitialIntake(HOME, INTAKE_INPUT)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.value.homeRef, HOME)
  assert.equal(result.value.source, 'homeowner_recollection')
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], {
    method: 'POST',
    path: `/api/v1/homes/${HOME}/intake`,
    body: INTAKE_INPUT,
  })
  assert.notEqual(INTAKE_CMD, CMD, 'create and intake use distinct command refs')
  const wire = JSON.stringify(requests[0])
  assert.ok(!/principal|controller|membership|role|source|requestedAt|revision|provider|storage|url/i.test(wire),
    'authority, provenance, time, revision, and provider data stay server-owned')
})

test('intake rejects malformed scope and incomplete or duplicate systems before the wire', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  assert.deepEqual(await port.recordInitialIntake('hhom_short', INTAKE_INPUT),
    { ok: false, error: 'invalid' })
  assert.deepEqual(await port.recordInitialIntake(HOME, {
    ...INTAKE_INPUT,
    systems: INTAKE_INPUT.systems.slice(0, -1),
  }), { ok: false, error: 'invalid' })
  assert.deepEqual(await port.recordInitialIntake(HOME, {
    ...INTAKE_INPUT,
    systems: INTAKE_INPUT.systems.map(system => ({ ...system, kind: 'roof' as const })),
  }), { ok: false, error: 'invalid' })
  assert.equal(requests.length, 0)
})

test('intake accepts only a 201 exact-home, six-system, source-labeled projection', async () => {
  const malformed = [
    { ...INTAKE_VIEW, homeRef: REF('hhom', 'x') },
    { ...INTAKE_VIEW, source: 'verified' },
    { ...INTAKE_VIEW, systems: INTAKE_VIEW.systems.slice(0, -1) },
    { ...INTAKE_VIEW, systems: INTAKE_VIEW.systems.map(system => ({ ...system, kind: 'roof' })) },
    { ...INTAKE_VIEW, updatedAt: '2026-08-11T16:00:00Z' },
    { ...INTAKE_VIEW, principalRef: REF('hprn', 'p') },
  ]
  for (const body of malformed) {
    const port = createRemotePort(async () => ({
      kind: 'reply' as const,
      status: 201,
      body: { data: body },
    }))
    assert.deepEqual(await port.recordInitialIntake(HOME, INTAKE_INPUT),
      { ok: false, error: 'invalid' })
  }
  for (const [status, error] of [[401, 'not_signed_in'], [503, 'unavailable'],
    [400, 'invalid'], [409, 'conflict'], [429, 'rate_limited'], [200, 'unavailable']] as const) {
    const port = createRemotePort(transportReturning(status, { data: INTAKE_VIEW }))
    assert.deepEqual(await port.recordInitialIntake(HOME, INTAKE_INPUT),
      { ok: false, error }, `status ${status}`)
  }
})

test('project reads decode only the safe project projection and stay exact-home scoped', async () => {
  const { transport, requests } = recordingTransport({
    [`GET /api/v1/homes/${HOME}/projects`]: [PROJECT_VIEW],
    [`GET /api/v1/homes/${HOME}/projects/${PROJECT}`]: PROJECT_VIEW,
  })
  const port = createRemotePort(transport)
  const listed = await port.listProjects(HOME)
  const exact = await port.getProject(HOME, PROJECT)
  assert.ok(listed.ok && exact.ok)
  if (!listed.ok || !exact.ok) return
  assert.equal(listed.value[0]?.trade, 'Roofing')
  assert.equal(exact.value.status, 'planned')
  assert.equal(exact.value.isSynthetic, false)
  assert.equal(exact.value.contractor, '')
  assert.deepEqual(requests, [
    { method: 'GET', path: `/api/v1/homes/${HOME}/projects` },
    { method: 'GET', path: `/api/v1/homes/${HOME}/projects/${PROJECT}` },
  ])

  const crossHome = createRemotePort(transportReturning(200, {
    data: { ...PROJECT_VIEW, homeRef: REF('hhom', 'x') },
  }))
  assert.deepEqual(await crossHome.getProject(HOME, PROJECT), { ok: false, error: 'invalid' })
})

test('startRoofingProject sends one narrow request and rejects authority or unknown enums', async () => {
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    return { kind: 'reply', status: 201, body: { data: PROJECT_VIEW } }
  })
  const input = {
    commandRef: REF('hcmd', 'r'),
    need: 'repair' as const,
    timing: 'urgent' as const,
    notes: '  Leak above the back room.  ',
  }
  const result = await port.startRoofingProject(HOME, input)
  assert.ok(result.ok)
  assert.deepEqual(requests, [{
    method: 'POST',
    path: `/api/v1/homes/${HOME}/roofing-projects`,
    body: {
      commandRef: input.commandRef,
      need: 'repair',
      timing: 'urgent',
      notes: 'Leak above the back room.',
    },
  }])
  assert.doesNotMatch(JSON.stringify(requests[0]), /principal|membership|role|status|category|provider/i)

  const blocked = recordingTransport({})
  const bad = createRemotePort(blocked.transport)
  assert.deepEqual(await bad.startRoofingProject(HOME, { ...input, commandRef: REF('hprn', 'p') }),
    { ok: false, error: 'invalid' })
  assert.deepEqual(await bad.startRoofingProject(HOME, { ...input, notes: 'x'.repeat(1501) }),
    { ok: false, error: 'invalid' })
  assert.equal(blocked.requests.length, 0)
})

// --- the narrowed surface -----------------------------------------------------

test('remaining undefined routes return unavailable without ever building a request', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  const results = await Promise.all([
    port.addProject(HOME, { title: 'T', trade: 'G', performedOn: '2026-08-01', contractor: 'C', summary: 'S' }),
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

test('private artifacts list and upload through exact-home routes with safe projections', async () => {
  const artifactRef = REF('hart', 'a')
  const wireArtifact = {
    artifactRef,
    homeRef: HOME,
    projectRef: null,
    kind: 'document',
    displayName: 'Roof contract.pdf',
    mediaType: 'application/pdf',
    byteLength: 128,
    createdAt: '2026-08-10T16:00:00.000Z',
  }
  const { transport, requests } = recordingTransport({
    [`GET /api/v1/homes/${HOME}/artifacts`]: [wireArtifact],
  })
  const uploads: ArtifactUploadTransportRequest[] = []
  const port = createRemotePort(transport, async request => {
    uploads.push(request)
    return { kind: 'reply', status: 201, body: { data: wireArtifact } }
  })
  const listed = await port.listDocuments(HOME)
  assert.ok(listed.ok)
  if (!listed.ok) return
  assert.equal(listed.value[0]?.kind, 'document')
  assert.equal(listed.value[0]?.downloadHref,
    `/api/v1/homes/${HOME}/artifacts/${artifactRef}/content`)
  assert.equal(JSON.stringify(listed.value).includes('storage'), false)

  const file = new File([new TextEncoder().encode('%PDF-1.7')], 'contract.pdf', {
    type: 'text/plain',
  })
  const uploaded = await port.uploadPrivateArtifact(HOME, {
    commandRef: REF('hcmd', 'u'),
    kind: 'document',
    file,
  })
  assert.ok(uploaded.ok)
  assert.deepEqual(requests, [{ method: 'GET', path: `/api/v1/homes/${HOME}/artifacts` }])
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0]?.path, `/api/v1/homes/${HOME}/artifacts`)
  assert.equal(uploads[0]?.commandRef, REF('hcmd', 'u'))
  assert.equal('principalRef' in (uploads[0] ?? {}), false)
})

test('artifact client rejects malformed refs, oversized files, and leaked server fields', async () => {
  let called = 0
  const port = createRemotePort(async () => ({
    kind: 'reply',
    status: 200,
    body: { data: [] },
  }), async () => {
    called += 1
    return { kind: 'reply', status: 503, body: {} }
  })
  const oversized = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.pdf')
  assert.deepEqual(await port.uploadPrivateArtifact(HOME, {
    commandRef: REF('hcmd', 'u'), kind: 'document', file: oversized,
  }), { ok: false, error: 'invalid' })
  assert.deepEqual(await port.listDocuments(REF('hprj', 'x')), { ok: false, error: 'not_found' })
  assert.equal(called, 0)

  const leaked = createRemotePort(async () => ({
    kind: 'reply',
    status: 200,
    body: { data: [{
      artifactRef: REF('hart', 'a'), homeRef: HOME, projectRef: null,
      kind: 'document', displayName: 'contract.pdf', mediaType: 'application/pdf',
      byteLength: 10, createdAt: '2026-08-10T16:00:00.000Z',
      storageObjectRef: REF('hobj', 's'),
    }] },
  }))
  assert.deepEqual(await leaked.listDocuments(HOME), { ok: false, error: 'invalid' })
})

test('project review uses a server preview and submits only its exact reviewed digest', async () => {
  const ARTIFACT = REF('hart', 'a')
  const DISCLOSURE = 'd'.repeat(64)
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    const operation = (request.body as { operation?: unknown } | undefined)?.operation
    if (operation === 'preview') return {
      kind: 'reply', status: 200, body: { data: {
        projectRef: PROJECT,
        disclosureDigest: DISCLOSURE,
        homeowner: { name: 'Home Owner', email: 'owner@example.com', preferredContact: 'email' },
        property: { label: 'Fort Worth, Texas' },
        project: { title: 'Roof repair', category: 'roofing', status: 'planned', summary: 'Active leak.' },
        attachments: [{
          artifactRef: ARTIFACT, displayName: 'roof.jpg', kind: 'photo',
          mediaType: 'image/jpeg', byteLength: 123,
        }],
        consentText: 'I agree to send this exact request to Chance\u2019s private Jobrolo review inbox.',
      } },
    }
    return {
      kind: 'reply', status: 201, body: { data: {
        submissionRef: REF('hsub', 's'), projectRef: PROJECT,
        status: 'awaiting_chance_review', submittedAt: '2026-08-12T20:00:00.000Z',
        message: 'Sent to Chance\u2019s private review inbox.',
      } },
    }
  })
  const preview = await port.previewProjectForReview(HOME, PROJECT, {
    name: ' Home Owner ', preferredContact: 'email', selectedArtifactRefs: [ARTIFACT],
  })
  assert.ok(preview.ok)
  const submitted = await port.submitProjectForReview(HOME, PROJECT, {
    commandRef: REF('hcmd', 'c'),
    reviewedDisclosureDigest: DISCLOSURE,
    name: 'Home Owner', preferredContact: 'email', selectedArtifactRefs: [ARTIFACT],
    consentAccepted: true,
  })
  assert.ok(submitted.ok)
  assert.deepEqual(requests.map(request => request.body), [
    {
      operation: 'preview', name: 'Home Owner', preferredContact: 'email',
      selectedArtifactRefs: [ARTIFACT],
    },
    {
      operation: 'submit', commandRef: REF('hcmd', 'c'), reviewedDisclosureDigest: DISCLOSURE,
      name: 'Home Owner', preferredContact: 'email', selectedArtifactRefs: [ARTIFACT],
      consentAccepted: true,
    },
  ])
})

test('magic-link request and sign-out use only their exact same-origin routes', async () => {
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    if (request.path.endsWith('/magic-link')) {
      return { kind: 'reply', status: 202, body: { data: { accepted: true } } }
    }
    return { kind: 'reply', status: 200, body: { data: { signedOut: true } } }
  })
  assert.deepEqual(await port.requestMagicLink(' Person@Example.com '), {
    ok: true, value: { accepted: true },
  })
  assert.deepEqual(await port.requestMagicLink(' Person@Example.com ', 'storm_damage'), {
    ok: true, value: { accepted: true },
  })
  assert.deepEqual(await port.requestMagicLink(
    ' Person@Example.com ',
    'insurance_claim' as 'repair',
  ), { ok: false, error: 'invalid' })
  await port.signOut()
  assert.deepEqual(requests, [
    { method: 'POST', path: '/api/v1/auth/magic-link', body: { email: 'person@example.com' } },
    {
      method: 'POST',
      path: '/api/v1/auth/magic-link',
      body: { email: 'person@example.com', intent: 'storm_damage' },
    },
    { method: 'POST', path: '/api/v1/auth/signout' },
  ])
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

test('signOut fails loudly when the server does not confirm revocation', async () => {
  const { transport, requests } = recordingTransport({})
  const port = createRemotePort(transport)
  await assert.rejects(() => port.signOut(), /sign-out failed/)
  assert.deepEqual(requests, [{ method: 'POST', path: '/api/v1/auth/signout' }])
})

test('the demo doorway does not exist in remote mode', async () => {
  const port = createRemotePort(transportReturning(200, { data: null }))
  await assert.rejects(() => port.enterDemoSession('x'), /synthetic-mode only/)
})
