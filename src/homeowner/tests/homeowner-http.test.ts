import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HomeownerApiService } from '../homeowner-api.v1.ts'
import { createHomeownerHttpHandler, HOMEOWNER_HTTP_WARNING } from '../homeowner-http.v1.ts'
import {
  HOMEOWNER_SYSTEM_KINDS,
  HOMEOWNER_RUNTIME_VERSION,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerCommandPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'
import type { HomeownerHomeRecordProfilePort } from '../home-record-profile.v1.ts'

const body = (character: string) => character.repeat(43)
const principalRef = `hprn_${body('p')}`
const homeRef = `hhom_${body('h')}`
const otherHomeRef = `hhom_${body('o')}`
const now = '2026-08-10T12:00:00.000Z'

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
  revision: 1,
  createdAt: now,
}

const repository: HomeownerRepositoryPort = {
  async listMemberships(_grant: AuthorizedHomeownerPrincipal) { return [membership] },
  async readMembership(readPrincipalRef, readHomeRef) {
    return readPrincipalRef === principalRef && readHomeRef === homeRef ? membership : null
  },
  async readHome(grant: AuthorizedHomeownerWorkspace) {
    if (grant.homeRef !== homeRef) return null
    return {
      recordVersion: HOMEOWNER_RUNTIME_VERSION,
      homeRef,
      createdByPrincipalRef: principalRef,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
      createdAt: now,
      updatedAt: now,
    }
  },
  async readPropertyFacts() { return null },
  async listSystems() { return [] },
  async listProjects() { return [] },
  async listArtifactMetadata() { return [] },
  async listWarranties() { return [] },
  async listMaintenance() { return [] },
}

const commands: HomeownerCommandPort = {
  async createPrivateHomeWorkspace() {
    return {
      home: {
        recordVersion: HOMEOWNER_RUNTIME_VERSION,
        homeRef,
        createdByPrincipalRef: principalRef,
        displayLabel: 'Our home',
        privateLocationLabel: 'Private location',
        createdAt: now,
        updatedAt: now,
      },
      membership,
    }
  },
  async createProject() { throw new Error('not used') },
  async recordInitialIntake() {
    return {
      propertyFacts: {
        recordVersion: HOMEOWNER_RUNTIME_VERSION,
        propertyFactsRef: `hfac_${body('f')}`,
        homeRef,
        controllerPrincipalRef: principalRef,
        homeType: 'house',
        yearBuilt: { value: 1988, precision: 'approximate' },
        source: 'homeowner_recollection',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      systems: HOMEOWNER_SYSTEM_KINDS.map((kind, index) => ({
        recordVersion: HOMEOWNER_RUNTIME_VERSION,
        systemRef: `hsys_${body(String.fromCharCode(97 + index))}`,
        homeRef,
        controllerPrincipalRef: principalRef,
        kind,
        present: 'unknown' as const,
        installedOrReplacedYear: null,
        source: 'homeowner_recollection' as const,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })),
    }
  },
}

const homeRecordProfile: HomeownerHomeRecordProfilePort = {
  async readHomeRecordProfile() {
    return {
      recordVersion: 'home-record-profile.v1',
      homeRef,
      revision: 1,
      address: null,
      homeType: 'unknown',
      yearBuilt: null,
      systems: HOMEOWNER_SYSTEM_KINDS.map(kind => ({
        kind,
        present: 'unknown' as const,
        installedOrReplacedYear: null,
      })),
      source: 'homeowner_recollection',
      updatedAt: now,
    }
  },
  async updateHomeRecordProfile(input) {
    return {
      recordVersion: 'home-record-profile.v1',
      homeRef: input.grant.homeRef,
      revision: input.command.expectedRevision + 1,
      address: input.command.address,
      homeType: input.command.homeType,
      yearBuilt: input.command.yearBuilt,
      systems: input.command.systems,
      source: 'homeowner_recollection',
      updatedAt: input.command.requestedAt,
    }
  },
}

function handler() {
  const service = new HomeownerApiService({
    identity: {
      async resolvePrincipal(sessionHandle) {
        return sessionHandle === 'server-cookie-session' ? principal : null
      },
    },
    repository,
    commands,
    homeRecordProfile,
    now: () => now,
    capabilities: {
      emailCodeSignIn: false,
      magicLinkSignIn: false,
      persistence: true,
      projectQuotes: false,
      homeResearch: false,
      homeAssistant: false,
      uploads: true,
      photoCheckups: false,
      projectReview: false,
      projectReviewAttachments: false,
      homeRecordHandoffs: false,
      invitations: false,
      sharing: false,
    },
  })
  return createHomeownerHttpHandler(service)
}

const request = (overrides: Partial<Parameters<ReturnType<typeof handler>>[0]> = {}) => ({
  method: 'GET',
  pathname: '/api/v1/session',
  search: '',
  hasBody: false,
  jsonBody: undefined,
  sessionHandle: 'server-cookie-session',
  ...overrides,
})

test('browser reads, including the controller-only Home Record, use one safe no-store envelope', async () => {
  const handle = handler()
  const session = await handle(request())
  const homes = await handle(request({ pathname: '/api/v1/homes' }))
  const home = await handle(request({ pathname: `/api/v1/homes/${homeRef}` }))
  const record = await handle(request({ pathname: `/api/v1/homes/${homeRef}/record` }))
  const artifacts = await handle(request({ pathname: `/api/v1/homes/${homeRef}/artifacts` }))

  for (const response of [session, homes, home, record, artifacts]) {
    assert.equal(response.status, 200)
    assert.deepEqual(Object.keys(response.body as object), ['data'])
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
  }
  assert.equal((home.body as { data: { homeRef: string } }).data.homeRef, homeRef)
  assert.equal(JSON.stringify(home.body).includes('homeRecord'), false,
    'the generic v1 home response remains backward-compatible and address-free')
  assert.equal((record.body as { data: { homeRef: string } }).data.homeRef, homeRef)
})

test('missing or invalid server session is signed out without leaking a principal', async () => {
  const handle = handler()
  const session = await handle(request({ sessionHandle: null }))
  assert.equal(session.status, 200)
  assert.equal((session.body as { data: { kind: string } }).data.kind, 'signed_out')
  assert.equal(JSON.stringify(session.body).includes('hprn_'), false)

  const homes = await handle(request({ pathname: '/api/v1/homes', sessionHandle: null }))
  assert.deepEqual(homes.body, { error: { code: 'signed_out' } })
  assert.equal(homes.status, 401)
})

test('browser identity claims in query or body are rejected before service access', async () => {
  const handle = handler()
  for (const attemptedClaim of [
    request({ pathname: '/api/v1/homes', search: `?principalRef=${principalRef}` }),
    request({ pathname: '/api/v1/homes', hasBody: true }),
    request({
      pathname: `/api/v1/homes/${homeRef}/record`,
      search: `?principalRef=${principalRef}`,
    }),
    request({ pathname: `/api/v1/homes/${homeRef}/record`, hasBody: true }),
  ]) {
    const response = await handle(attemptedClaim)
    assert.equal(response.status, 400)
    assert.deepEqual(response.body, { error: { code: 'invalid_request' } })
  }
})

test('unknown, malformed, cross-home, and write routes fail closed', async () => {
  const handle = handler()
  const cases = [
    [request({ pathname: '/api/v1/homes/hhom_short' }), 404],
    [request({ pathname: `/api/v1/homes/${otherHomeRef}` }), 404],
    [request({ pathname: '/api/v1/projects' }), 404],
    [request({ method: 'POST', pathname: '/api/v1/projects', hasBody: true, jsonBody: {} }), 404],
  ] as const
  for (const [input, status] of cases) {
    const response = await handle(input)
    assert.equal(response.status, status)
    const serialized = JSON.stringify(response.body)
    assert.equal(serialized.includes('stack'), false)
    assert.equal(serialized.includes(principalRef), false)
    assert.equal(serialized.includes(otherHomeRef), false)
  }
})

test('unexpected repository errors are a generic unavailable problem', async () => {
  const broken = new HomeownerApiService({
    identity: { async resolvePrincipal() { return principal } },
    repository: { ...repository, async listMemberships() { throw new Error('private database detail') } },
    commands,
    now: () => now,
    capabilities: {
      emailCodeSignIn: false,
      magicLinkSignIn: false,
      persistence: false,
      projectQuotes: false,
      homeResearch: false,
      homeAssistant: false,
      uploads: false,
      photoCheckups: false,
      projectReview: false,
      projectReviewAttachments: false,
      homeRecordHandoffs: false,
      invitations: false,
      sharing: false,
    },
  })
  const response = await createHomeownerHttpHandler(broken)(request({ pathname: '/api/v1/homes' }))
  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { error: { code: 'unavailable' } })
  assert.equal(JSON.stringify(response.body).includes('database'), false)
  assert.match(HOMEOWNER_HTTP_WARNING, /no open-ended mutation/)
})

test('POST /api/v1/homes accepts only the strict command and returns one safe summary', async () => {
  const handle = handler()
  const response = await handle(request({
    method: 'POST',
    pathname: '/api/v1/homes',
    hasBody: true,
    jsonBody: {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
    },
  }))
  assert.equal(response.status, 201)
  assert.deepEqual(response.body, { data: {
    homeRef,
    displayLabel: 'Our home',
    privateLocationLabel: 'Private location',
    relationshipLabel: 'claimed_unverified',
  } })
  assert.equal(JSON.stringify(response.body).includes(principalRef), false)

  for (const jsonBody of [
    undefined,
    null,
    { commandRef: `hcmd_${body('c')}`, displayLabel: 'Our home' },
    {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
      role: 'workspace_controller',
    },
  ]) {
    const rejected = await handle(request({
      method: 'POST', pathname: '/api/v1/homes', hasBody: true, jsonBody,
    }))
    assert.equal(rejected.status, 400)
  }
})

test('POST exact-home intake accepts only a complete recollection command', async () => {
  const handle = handler()
  const jsonBody = {
    commandRef: `hcmd_${body('i')}`,
    homeType: 'house',
    yearBuilt: { value: 1988, precision: 'approximate' },
    systems: HOMEOWNER_SYSTEM_KINDS.map(kind => ({
      kind,
      present: 'unknown',
      installedOrReplacedYear: null,
    })),
  }
  const response = await handle(request({
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/intake`,
    hasBody: true,
    jsonBody,
  }))
  assert.equal(response.status, 201)
  assert.equal((response.body as { data: { source: string } }).data.source,
    'homeowner_recollection')
  assert.equal(JSON.stringify(response.body).includes(principalRef), false)

  for (const rejectedBody of [
    { ...jsonBody, requestedAt: now },
    { ...jsonBody, role: 'workspace_controller' },
    { ...jsonBody, systems: jsonBody.systems.slice(0, -1) },
    { ...jsonBody, systems: jsonBody.systems.map(system => ({ ...system, kind: 'roof' })) },
  ]) {
    const rejected = await handle(request({
      method: 'POST',
      pathname: `/api/v1/homes/${homeRef}/intake`,
      hasBody: true,
      jsonBody: rejectedBody,
    }))
    assert.equal(rejected.status, 400)
  }
})

test('POST exact-home record accepts only a revision-backed private address and facts command', async () => {
  const handle = handler()
  const jsonBody = {
    commandRef: `hcmd_${body('d')}`,
    expectedRevision: 1,
    address: {
      line1: '123 Main Street',
      line2: null,
      city: 'Fort Worth',
      regionCode: 'TX',
      postalCode: '76102',
      countryCode: 'US',
    },
    homeType: 'house',
    yearBuilt: { value: 1988, precision: 'approximate' },
    systems: HOMEOWNER_SYSTEM_KINDS.map(kind => ({
      kind,
      present: 'unknown',
      installedOrReplacedYear: null,
    })),
  }
  const response = await handle(request({
    method: 'POST',
    pathname: `/api/v1/homes/${homeRef}/record`,
    hasBody: true,
    jsonBody,
  }))
  assert.equal(response.status, 200)
  assert.equal((response.body as { data: { revision: number } }).data.revision, 2)
  assert.equal(JSON.stringify(response.body).includes(principalRef), false)

  for (const rejectedBody of [
    { ...jsonBody, expectedRevision: 0 },
    { ...jsonBody, role: 'workspace_controller' },
    { ...jsonBody, address: { ...jsonBody.address, postalCode: 'bad' } },
    { ...jsonBody, systems: jsonBody.systems.slice(0, -1) },
  ]) {
    const rejected = await handle(request({
      method: 'POST',
      pathname: `/api/v1/homes/${homeRef}/record`,
      hasBody: true,
      jsonBody: rejectedBody,
    }))
    assert.equal(rejected.status, 400)
  }
})
