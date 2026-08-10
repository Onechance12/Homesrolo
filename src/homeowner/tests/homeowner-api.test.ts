import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOMEOWNER_API_VERSION,
  HOMEOWNER_API_WARNING,
  HomeownerApiError,
  HomeownerApiService,
  homeownerApiHomeViewSchema,
} from '../homeowner-api.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const body = (character: string) => character.repeat(43).slice(0, 43)
const principalRef = `hprn_${body('p')}`
const otherPrincipalRef = `hprn_${body('q')}`
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

const home = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  homeRef,
  createdByPrincipalRef: principalRef,
  displayLabel: 'Our home',
  privateLocationLabel: 'A private homeowner location label',
  createdAt: now,
  updatedAt: now,
} as const

function repository(overrides: Partial<HomeownerRepositoryPort> = {}): HomeownerRepositoryPort {
  return {
    async listMemberships(_authorization: AuthorizedHomeownerPrincipal) { return [membership] },
    async readMembership(readPrincipalRef: string, readHomeRef: string) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef ? membership : null
    },
    async readHome(grant: AuthorizedHomeownerWorkspace) {
      return grant.homeRef === homeRef ? home : null
    },
    async listProjects() { return [] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
    ...overrides,
  }
}

const capabilities = {
  magicLinkSignIn: false,
  persistence: false,
  uploads: false,
  invitations: false,
  sharing: false,
}

function service(input: {
  resolvedPrincipal?: HomeownerPrincipal | null
  repository?: HomeownerRepositoryPort
} = {}) {
  return new HomeownerApiService({
    identity: {
      async resolvePrincipal(sessionHandle: string) {
        assert.equal(sessionHandle, 'server-session-handle')
        return input.resolvedPrincipal === undefined ? principal : input.resolvedPrincipal
      },
    },
    repository: input.repository ?? repository(),
    now: () => now,
    capabilities,
  })
}

const context = { sessionHandle: 'server-session-handle' }

test('session projection is truthful and never exposes a session or provider identity', async () => {
  const signedIn = await service().readSession(context)
  assert.deepEqual(signedIn, {
    apiVersion: HOMEOWNER_API_VERSION,
    kind: 'signed_in',
    principalRef,
    capabilities,
  })
  assert.equal('sessionHandle' in signedIn, false)
  assert.equal('providerId' in signedIn, false)
  assert.match(HOMEOWNER_API_WARNING, /remain unavailable/)

  const signedOut = await service({ resolvedPrincipal: null }).readSession(context)
  assert.equal(signedOut.kind, 'signed_out')
  assert.equal('principalRef' in signedOut, false)
})

test('inactive or unverified principals receive the signed-out projection', async () => {
  const disabled = await service({
    resolvedPrincipal: { ...principal, status: 'disabled' },
  }).readSession(context)
  const unverified = await service({
    resolvedPrincipal: { ...principal, emailVerified: false },
  }).readSession(context)
  assert.equal(disabled.kind, 'signed_out')
  assert.equal(unverified.kind, 'signed_out')
})

test('home listing fresh-checks every membership and skips inactive or mismatched rows', async () => {
  const revoked: HomeownerMembership = { ...membership, state: 'revoked', revokedAt: now }
  const mismatched: HomeownerMembership = {
    ...membership,
    membershipRef: `hmbr_${body('n')}`,
    principalRef: otherPrincipalRef,
    homeRef: otherHomeRef,
  }
  const repo = repository({
    async listMemberships() { return [revoked, mismatched, membership] },
  })
  assert.deepEqual(await service({ repository: repo }).listHomes(context), [{
    homeRef,
    displayLabel: 'Our home',
    privateLocationLabel: 'A private homeowner location label',
    relationshipLabel: 'claimed_unverified',
  }])
})

test('exact home read rechecks membership and projects no authority or storage fields', async () => {
  const repo = repository({
    async listProjects() { return [{ projectRef: `hprj_${body('j')}` }] as never },
    async listArtifactMetadata() {
      return [
        { kind: 'document', storageObjectRef: `hobj_${body('s')}` },
        { kind: 'photo', storageObjectRef: `hobj_${body('t')}` },
      ] as never
    },
    async listWarranties() { return [{ warrantyRef: `hwty_${body('w')}` }] as never },
    async listMaintenance() { return [{ maintenanceRef: `hmnt_${body('x')}` }] as never },
  })
  const view = await service({ repository: repo }).readHome(context, homeRef)
  assert.ok(homeownerApiHomeViewSchema.parse(view))
  assert.equal(view.projectCount, 1)
  assert.equal(view.documentCount, 1)
  assert.equal(view.warrantyCount, 1)
  assert.equal(view.maintenanceCount, 1)
  assert.equal('createdByPrincipalRef' in view, false)
  assert.equal('membershipRef' in view, false)
  assert.equal('storageObjectRef' in view, false)
})

test('malformed, cross-home, and revoked reads fail closed without revealing authority', async () => {
  await assert.rejects(
    service().readHome(context, '123 Example Street'),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  await assert.rejects(
    service().readHome(context, otherHomeRef),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  const revokedRepo = repository({
    async readMembership() { return { ...membership, state: 'revoked', revokedAt: now } },
  })
  await assert.rejects(
    service({ repository: revokedRepo }).readHome(context, homeRef),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
})

test('strict browser projections reject raw URLs, provider ids, and extra authority claims', () => {
  const base = {
    homeRef,
    displayLabel: 'Our home',
    privateLocationLabel: 'A private homeowner location label',
    relationshipLabel: 'claimed_unverified',
    projectCount: 0,
    documentCount: 0,
    warrantyCount: 0,
    maintenanceCount: 0,
    updatedAt: now,
  }
  assert.ok(homeownerApiHomeViewSchema.parse(base))
  for (const extra of [
    { providerId: 'provider-home-1' },
    { storageObjectRef: `hobj_${body('s')}` },
    { publicUrl: 'https://example.com/private.pdf' },
    { verifiedOwner: true },
    { controllerPrincipalRef: principalRef },
  ]) {
    assert.throws(() => homeownerApiHomeViewSchema.parse({ ...base, ...extra }))
  }
})
