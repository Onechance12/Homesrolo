import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOMEOWNER_RUNTIME_STATUS,
  HOMEOWNER_RUNTIME_VERSION,
  HOMEOWNER_RUNTIME_WARNING,
  authorizeHomeownerWorkspace,
  homeownerArtifactMetadataSchema,
  homeownerMembershipSchema,
  homeownerPrincipalSchema,
  privateHomeProfileSchema,
  parseHomeownerMembership,
} from '../homeowner-runtime.v1.ts'

const body = (character: string) => character.repeat(43).slice(0, 43)
const principalRef = `hprn_${body('p')}`
const otherPrincipalRef = `hprn_${body('q')}`
const homeRef = `hhom_${body('h')}`
const otherHomeRef = `hhom_${body('z')}`
const now = '2026-08-10T12:00:00.000Z'

const principal = {
  principalRef,
  status: 'active' as const,
  emailVerified: true,
  sessionVersion: 1,
}

const membership = {
  membershipRef: `hmbr_${body('m')}`,
  principalRef,
  homeRef,
  role: 'workspace_controller' as const,
  basis: 'self_created_workspace' as const,
  state: 'active' as const,
  relationshipLabel: 'claimed_unverified' as const,
  revision: 1,
  createdAt: now,
}

test('runtime status describes contracts without claiming live infrastructure', () => {
  assert.equal(HOMEOWNER_RUNTIME_STATUS.contractsImplemented, true)
  for (const [name, value] of Object.entries(HOMEOWNER_RUNTIME_STATUS)) {
    if (name !== 'contractsImplemented') assert.equal(value, false, name)
  }
  assert.match(HOMEOWNER_RUNTIME_WARNING, /do not prove ownership/)
})

test('exact active membership authorizes only its server-derived principal and home', () => {
  const decision = authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: homeRef,
    action: 'project.create',
    recheckedAt: now,
  })
  assert.equal(decision.authorized, true)
  if (decision.authorized) {
    assert.equal(decision.principalRef, principalRef)
    assert.equal(decision.homeRef, homeRef)
    assert.equal(decision.membershipRevision, 1)
  }

  assert.deepEqual(authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: otherHomeRef,
    action: 'workspace.read',
    recheckedAt: now,
  }), { authorized: false, reason: 'home_mismatch' })

  assert.deepEqual(authorizeHomeownerWorkspace({
    principal: { ...principal, principalRef: otherPrincipalRef },
    membership,
    requestedHomeRef: homeRef,
    action: 'workspace.read',
    recheckedAt: now,
  }), { authorized: false, reason: 'principal_mismatch' })
})

test('inactive, unverified, pending, and revoked authority fail closed', () => {
  const decide = (principalPatch: object, membershipPatch: object) =>
    authorizeHomeownerWorkspace({
      principal: { ...principal, ...principalPatch },
      membership: { ...membership, ...membershipPatch },
      requestedHomeRef: homeRef,
      action: 'workspace.read',
      recheckedAt: now,
    })

  assert.deepEqual(decide({ status: 'disabled' }, {}),
    { authorized: false, reason: 'principal_inactive' })
  assert.deepEqual(decide({ emailVerified: false }, {}),
    { authorized: false, reason: 'email_unverified' })
  assert.deepEqual(decide({}, { state: 'pending' }),
    { authorized: false, reason: 'membership_inactive' })
  assert.deepEqual(decide({}, { state: 'revoked', revokedAt: now }),
    { authorized: false, reason: 'membership_inactive' })
})

test('self-created home relationship remains an unverified claim', () => {
  assert.ok(parseHomeownerMembership(membership))
  assert.throws(() => parseHomeownerMembership({
    ...membership,
    relationshipLabel: 'verified_controller',
  }))
  assert.throws(() => parseHomeownerMembership({
    ...membership,
    basis: 'accepted_invitation',
  }))
  assert.throws(() => parseHomeownerMembership({
    ...membership,
    state: 'revoked',
  }))
})

test('viewer cannot mutate and membership never grants third-party contribution access', () => {
  const viewer = { ...membership, role: 'viewer' as const }
  assert.equal(authorizeHomeownerWorkspace({
    principal,
    membership: viewer,
    requestedHomeRef: homeRef,
    action: 'workspace.read',
    recheckedAt: now,
  }).authorized, true)
  assert.deepEqual(authorizeHomeownerWorkspace({
    principal,
    membership: viewer,
    requestedHomeRef: homeRef,
    action: 'project.create',
    recheckedAt: now,
  }), { authorized: false, reason: 'role_denied' })

  assert.equal('contribution.read' in Object.fromEntries(
    ['workspace.read', 'artifact.read_metadata'].map(action => [action, true]),
  ), false)
})

test('browser/provider identity, raw URLs, and extra authority claims are rejected', () => {
  assert.throws(() => homeownerPrincipalSchema.parse({
    ...principal,
    email: 'person@example.com',
  }))
  assert.throws(() => homeownerMembershipSchema.parse({
    ...membership,
    address: '123 Example Street',
  }))

  const artifact = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    artifactRef: `hart_${body('a')}`,
    homeRef,
    controllerPrincipalRef: principalRef,
    kind: 'document' as const,
    displayName: 'Roof warranty',
    mediaType: 'application/pdf',
    byteLength: 1234,
    payloadSha256: 'a'.repeat(64),
    storageObjectRef: `hobj_${body('o')}`,
    contentClass: 'homeowner_private' as const,
    createdAt: now,
  }
  assert.ok(homeownerArtifactMetadataSchema.parse(artifact))
  assert.throws(() => homeownerArtifactMetadataSchema.parse({
    ...artifact,
    publicUrl: 'https://example.com/private.pdf',
  }))
  assert.throws(() => homeownerArtifactMetadataSchema.parse({
    ...artifact,
    providerObjectId: 'bucket/key',
  }))
})

test('private profile is strict and address-like labels never become canonical IDs', () => {
  const profile = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    homeRef,
    createdByPrincipalRef: principalRef,
    displayLabel: 'Our home',
    privateLocationLabel: 'A homeowner-entered location label',
    createdAt: now,
    updatedAt: now,
  }
  assert.ok(privateHomeProfileSchema.parse(profile))
  assert.throws(() => privateHomeProfileSchema.parse({
    ...profile,
    homeRef: '123 Example Street',
  }))
  assert.throws(() => privateHomeProfileSchema.parse({
    ...profile,
    public: true,
  }))
})
