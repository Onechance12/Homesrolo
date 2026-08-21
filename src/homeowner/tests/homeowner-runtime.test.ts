import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOMEOWNER_RUNTIME_STATUS,
  HOMEOWNER_RUNTIME_VERSION,
  HOMEOWNER_RUNTIME_WARNING,
  HOMEOWNER_SYSTEM_KINDS,
  authorizeHomeownerWorkspace,
  authorizePrivateHomeCreation,
  createHomeWorkspaceInputSchema,
  homeownerProjectCommandIntent,
  createHomeownerProjectInputSchema,
  homeownerArtifactMetadataSchema,
  homeownerMaintenanceSchema,
  homeownerMembershipSchema,
  homeownerPrincipalSchema,
  homeownerPropertyFactsSchema,
  homeownerSystemSchema,
  homeownerWarrantySchema,
  parseHomeownerMaintenance,
  parseHomeownerPropertyFacts,
  privateHomeProfileSchema,
  parseHomeownerMembership,
  parseHomeownerWarranty,
  parseHomeownerSystem,
  recordHomeownerIntakeInputSchema,
  requireHomeownerActionGrant,
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

test('runtime status names the implemented private foundation without claiming later systems', () => {
  assert.equal(HOMEOWNER_RUNTIME_STATUS.contractsImplemented, true)
  assert.equal(HOMEOWNER_RUNTIME_STATUS.authenticationImplemented, true)
  assert.equal(HOMEOWNER_RUNTIME_STATUS.persistenceImplemented, true)
  assert.equal(HOMEOWNER_RUNTIME_STATUS.objectStorageImplemented, true)
  assert.equal(HOMEOWNER_RUNTIME_STATUS.uploadsImplemented, true)
  assert.equal(HOMEOWNER_RUNTIME_STATUS.jobroloTransportImplemented, true)
  for (const name of [
    'invitationsImplemented', 'publicSharingImplemented',
    'productionReady',
  ] as const) {
    assert.equal(HOMEOWNER_RUNTIME_STATUS[name], false, name)
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

test('private artifact upload is controller-only and does not grant disclosure authority', () => {
  assert.equal(authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: homeRef,
    action: 'artifact.upload',
    recheckedAt: now,
  }).authorized, true)
  assert.deepEqual(authorizeHomeownerWorkspace({
    principal,
    membership: { ...membership, role: 'member' },
    requestedHomeRef: homeRef,
    action: 'artifact.upload',
    recheckedAt: now,
  }), { authorized: false, reason: 'role_denied' })
  assert.equal('project.submit_for_review' in Object.fromEntries(
    ['artifact.upload', 'artifact.read_metadata'].map(action => [action, true]),
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

test('private home creation requires an active verified principal but proves no ownership', () => {
  assert.deepEqual(authorizePrivateHomeCreation(principal), {
    authorized: true,
    principalRef,
  })
  assert.deepEqual(authorizePrivateHomeCreation({ ...principal, emailVerified: false }), {
    authorized: false,
    reason: 'email_unverified',
  })
  assert.deepEqual(authorizePrivateHomeCreation({ ...principal, status: 'disabled' }), {
    authorized: false,
    reason: 'principal_inactive',
  })

  assert.ok(createHomeWorkspaceInputSchema.parse({
    commandRef: `hcmd_${body('c')}`,
    displayLabel: 'Our home',
    privateLocationLabel: 'A private location label',
    requestedAt: now,
  }))
  assert.throws(() => createHomeWorkspaceInputSchema.parse({
    commandRef: `hcmd_${body('c')}`,
    displayLabel: 'Our home',
    privateLocationLabel: 'A private location label',
    requestedAt: now,
    verifiedOwner: true,
  }))
})

test('initial intake preserves uncertainty and requires every system exactly once', () => {
  const systems = HOMEOWNER_SYSTEM_KINDS.map((kind, index) => ({
    kind,
    present: index === 1 ? 'unknown' as const : 'yes' as const,
    installedOrReplacedYear: index === 1
      ? null
      : { value: 2019 + index, precision: index === 0 ? 'approximate' as const : 'exact' as const },
  }))
  const command = {
    commandRef: `hcmd_${body('i')}`,
    homeType: 'house' as const,
    yearBuilt: { value: 1987, precision: 'approximate' as const },
    systems,
    requestedAt: now,
  }
  const parsed = recordHomeownerIntakeInputSchema.parse(command)
  assert.deepEqual(parsed.yearBuilt, { value: 1987, precision: 'approximate' })
  assert.deepEqual(parsed.systems[0]?.installedOrReplacedYear,
    { value: 2019, precision: 'approximate' })

  assert.throws(() => recordHomeownerIntakeInputSchema.parse({
    ...command,
    systems: [...systems.slice(0, -1), systems[0]],
  }), /each supported system exactly once/)
  assert.throws(() => recordHomeownerIntakeInputSchema.parse({
    ...command,
    systems: systems.map(system => system.kind === 'heating'
      ? { ...system, installedOrReplacedYear: { value: 2020, precision: 'exact' } }
      : system),
  }), /only a present system may carry a year/)
  assert.throws(() => recordHomeownerIntakeInputSchema.parse({
    ...command,
    yearBuilt: { value: 2027, precision: 'exact' },
  }), /year built may not be in the future/)
  assert.throws(() => recordHomeownerIntakeInputSchema.parse({
    ...command,
    controllerPrincipalRef: principalRef,
  }), /unrecognized/i)
})

test('persisted home facts and systems remain recollection, never upgraded to proof', () => {
  const facts = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    propertyFactsRef: `hfac_${body('f')}`,
    homeRef,
    controllerPrincipalRef: principalRef,
    homeType: 'house' as const,
    yearBuilt: { value: 1987, precision: 'approximate' as const },
    source: 'homeowner_recollection' as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
  const system = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    systemRef: `hsys_${body('s')}`,
    homeRef,
    controllerPrincipalRef: principalRef,
    kind: 'roof' as const,
    present: 'yes' as const,
    installedOrReplacedYear: { value: 2019, precision: 'approximate' as const },
    source: 'homeowner_recollection' as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
  assert.ok(homeownerPropertyFactsSchema.parse(facts))
  assert.ok(parseHomeownerPropertyFacts(facts))
  assert.ok(homeownerSystemSchema.parse(system))
  assert.ok(parseHomeownerSystem(system))
  assert.throws(() => homeownerPropertyFactsSchema.parse({ ...facts, source: 'verified' }))
  assert.throws(() => homeownerSystemSchema.parse({ ...system, verified: true }))
  assert.throws(() => parseHomeownerSystem({
    ...system,
    present: 'no',
  }), /only a present system/i)
  assert.throws(() => parseHomeownerSystem({
    ...system,
    installedOrReplacedYear: { value: 2027, precision: 'exact' },
  }), /future/i)
})

test('only a fresh controller grant may record the initial intake', () => {
  const controller = authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: homeRef,
    action: 'intake.record',
    recheckedAt: now,
  })
  assert.equal(requireHomeownerActionGrant(controller, 'intake.record')?.action, 'intake.record')

  const member = authorizeHomeownerWorkspace({
    principal,
    membership: { ...membership, role: 'member' },
    requestedHomeRef: homeRef,
    action: 'intake.record',
    recheckedAt: now,
  })
  assert.deepEqual(member, { authorized: false, reason: 'role_denied' })
})

test('project commands use the runtime vocabulary and reject impossible dates', () => {
  const command = {
    commandRef: `hcmd_${body('d')}`,
    title: 'Roof replacement',
    category: 'roofing' as const,
    status: 'completed' as const,
    occurredOn: '2026-05-12',
    requestedAt: now,
  }
  assert.ok(createHomeownerProjectInputSchema.parse(command))
  assert.deepEqual(
    homeownerProjectCommandIntent(command),
    {
      commandRef: command.commandRef,
      title: command.title,
      category: command.category,
      status: command.status,
      occurredOn: command.occurredOn,
    },
    'receipt intent excludes server execution time so retries are stable',
  )
  assert.deepEqual(
    homeownerProjectCommandIntent({ ...command, requestedAt: '2026-08-10T12:05:00.000Z' }),
    homeownerProjectCommandIntent(command),
  )
  assert.throws(() => createHomeownerProjectInputSchema.parse({
    ...command,
    status: 'recorded',
  }))
  assert.throws(() => createHomeownerProjectInputSchema.parse({
    ...command,
    occurredOn: '2026-02-30',
  }))

  const readGrant = authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: homeRef,
    action: 'workspace.read',
    recheckedAt: now,
  })
  assert.equal(requireHomeownerActionGrant(readGrant, 'project.create'), null)

  const createGrant = authorizeHomeownerWorkspace({
    principal,
    membership,
    requestedHomeRef: homeRef,
    action: 'project.create',
    recheckedAt: now,
  })
  assert.equal(requireHomeownerActionGrant(createGrant, 'project.create')?.action, 'project.create')
})

test('warranty records keep semantic coverage separate from private document bytes', () => {
  const warranty = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    warrantyRef: `hwty_${body('w')}`,
    homeRef,
    projectRef: `hprj_${body('j')}`,
    controllerPrincipalRef: principalRef,
    coverageSummary: 'Sample manufacturer coverage',
    issuerLabel: 'Sample manufacturer',
    startsOn: '2026-01-01',
    endsOn: '2036-01-01',
    documentArtifactRef: `hart_${body('a')}`,
    createdAt: now,
    updatedAt: now,
  }
  assert.ok(homeownerWarrantySchema.parse(warranty))
  assert.ok(parseHomeownerWarranty(warranty))
  assert.throws(() => parseHomeownerWarranty({
    ...warranty,
    endsOn: '2025-12-31',
  }))
  assert.throws(() => homeownerWarrantySchema.parse({
    ...warranty,
    publicUrl: 'https://example.com/warranty.pdf',
  }))
})

test('maintenance completion state and timestamp cannot disagree', () => {
  const maintenance = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    maintenanceRef: `hmnt_${body('t')}`,
    homeRef,
    controllerPrincipalRef: principalRef,
    title: 'Clean gutters',
    cadence: 'semiannual' as const,
    dueOn: '2026-10-01',
    state: 'upcoming' as const,
    createdAt: now,
    updatedAt: now,
  }
  assert.ok(homeownerMaintenanceSchema.parse(maintenance))
  assert.ok(parseHomeownerMaintenance(maintenance))
  assert.throws(() => parseHomeownerMaintenance({
    ...maintenance,
    state: 'completed',
  }))
  assert.throws(() => parseHomeownerMaintenance({
    ...maintenance,
    completedAt: now,
  }))
  assert.throws(() => parseHomeownerMaintenance({
    ...maintenance,
    state: 'completed',
    completedAt: '2026-08-10T11:59:59.999Z',
  }))
})
