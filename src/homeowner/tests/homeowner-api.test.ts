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
  HOMEOWNER_SYSTEM_KINDS,
  HOMEOWNER_RUNTIME_VERSION,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerCommandPort,
  type HomeownerArtifactMetadata,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerPrivateObjectPort,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'
import {
  HOMEOWNER_CHECKUP_PHOTO_VERSION,
  createHomeownerCheckupPhotoInputSchema,
  homeownerCheckupPhotoCommandIntent,
  type HomeownerCheckupPhotoPort,
} from '../homeowner-checkup-photos.v1.ts'
import type { HomeownerHomeRecordProfilePort } from '../home-record-profile.v1.ts'
import type { HomeownerArtifactMetadataPort } from '../homeowner-artifact-metadata.v1.ts'

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

const intakeSystems = HOMEOWNER_SYSTEM_KINDS.map((kind, index) => ({
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  systemRef: `hsys_${body(String.fromCharCode(97 + index))}`,
  homeRef,
  controllerPrincipalRef: principalRef,
  kind,
  present: kind === 'roof' ? 'yes' as const : 'unknown' as const,
  installedOrReplacedYear: kind === 'roof'
    ? { value: 2019, precision: 'approximate' as const }
    : null,
  source: 'homeowner_recollection' as const,
  revision: 1,
  createdAt: now,
  updatedAt: now,
}))

const propertyFacts = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  propertyFactsRef: `hfac_${body('f')}`,
  homeRef,
  controllerPrincipalRef: principalRef,
  homeType: 'house' as const,
  yearBuilt: { value: 1988, precision: 'approximate' as const },
  source: 'homeowner_recollection' as const,
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

const homeRecordProfile = {
  recordVersion: 'home-record-profile.v1' as const,
  homeRef,
  revision: 2,
  address: {
    line1: '123 Main Street',
    line2: null,
    city: 'Fort Worth',
    regionCode: 'TX',
    postalCode: '76102',
    countryCode: 'US' as const,
  },
  homeType: 'house' as const,
  yearBuilt: { value: 1988, precision: 'approximate' as const },
  systems: intakeSystems.map(system => ({
    kind: system.kind,
    present: system.present,
    installedOrReplacedYear: system.installedOrReplacedYear,
  })),
  source: 'homeowner_recollection' as const,
  updatedAt: now,
}

const artifact = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  artifactRef: `hart_${body('a')}`,
  homeRef,
  controllerPrincipalRef: principalRef,
  kind: 'document' as const,
  displayName: 'Roof contract.pdf',
  mediaType: 'application/pdf',
  byteLength: 9,
  payloadSha256: 'c'.repeat(64),
  storageObjectRef: `hobj_${body('s')}`,
  contentClass: 'homeowner_private' as const,
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

const checkupPhoto = {
  recordVersion: HOMEOWNER_CHECKUP_PHOTO_VERSION,
  photoRef: `hpho_${body('v')}`,
  homeRef,
  controllerPrincipalRef: principalRef,
  observedOn: '2026-08-09',
  area: 'front_exterior' as const,
  viewLabel: 'Front door from the walkway',
  caption: 'South-facing siding and windows',
  mediaType: 'image/jpeg' as const,
  fullStorageObjectRef: `hobj_${body('u')}`,
  fullByteLength: 1200,
  fullPayloadSha256: 'a'.repeat(64),
  thumbnailStorageObjectRef: `hobj_${body('t')}`,
  thumbnailByteLength: 240,
  thumbnailPayloadSha256: 'b'.repeat(64),
  width: 1600,
  height: 900,
  createdAt: now,
}

function checkupPhotoPort(
  overrides: Partial<HomeownerCheckupPhotoPort> = {},
): HomeownerCheckupPhotoPort {
  return {
    async listCheckupPhotos() { return [checkupPhoto] },
    async reserveCheckupPhotoUpload() { return { state: 'available', photo: checkupPhoto } },
    async completeCheckupPhotoUpload() { return checkupPhoto },
    async rejectCheckupPhotoUpload() {},
    async readCheckupPhotoVariant() {
      return { photo: checkupPhoto, bytes: new Uint8Array(checkupPhoto.fullByteLength) }
    },
    async deleteCheckupPhoto() {
      return { photoRef: checkupPhoto.photoRef, state: 'deleted' }
    },
    ...overrides,
  }
}

const intakeInput = {
  commandRef: `hcmd_${body('i')}`,
  homeType: 'house' as const,
  yearBuilt: { value: 1988, precision: 'approximate' as const },
  systems: intakeSystems.map(system => ({
    kind: system.kind,
    present: system.present,
    installedOrReplacedYear: system.installedOrReplacedYear,
  })),
}

function repository(overrides: Partial<HomeownerRepositoryPort> = {}): HomeownerRepositoryPort {
  return {
    async listMemberships(_authorization: AuthorizedHomeownerPrincipal) { return [membership] },
    async readMembership(readPrincipalRef: string, readHomeRef: string) {
      return readPrincipalRef === principalRef && readHomeRef === homeRef ? membership : null
    },
    async readHome(grant: AuthorizedHomeownerWorkspace) {
      return grant.homeRef === homeRef ? home : null
    },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects() { return [] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
    ...overrides,
  }
}

const capabilities = {
  emailCodeSignIn: false,
  magicLinkSignIn: false,
  persistence: false,
  projectQuotes: false,
  homeResearch: false,
  homeAssistant: false,
  homeAssistantVision: false,
  uploads: false,
  photoCheckups: false,
  projectReview: false,
  projectReviewAttachments: false,
  homeRecordHandoffs: false,
  invitations: false,
  sharing: false,
}

function service(input: {
  resolvedPrincipal?: HomeownerPrincipal | null
  repository?: HomeownerRepositoryPort
  commands?: HomeownerCommandPort
  persistence?: boolean
  projectQuotes?: boolean
  uploads?: boolean
  projectReview?: boolean
  projectReviewAttachments?: boolean
  privateObjects?: HomeownerPrivateObjectPort
  artifactMetadata?: HomeownerArtifactMetadataPort
  photoCheckups?: boolean
  checkupPhotos?: HomeownerCheckupPhotoPort
  homeRecordProfile?: HomeownerHomeRecordProfilePort
  now?: () => string
} = {}) {
  return new HomeownerApiService({
    identity: {
      async resolvePrincipal(sessionHandle: string) {
        assert.equal(sessionHandle, 'server-session-handle')
        return input.resolvedPrincipal === undefined ? principal : input.resolvedPrincipal
      },
    },
    repository: input.repository ?? repository(),
    commands: input.commands ?? {
      async createPrivateHomeWorkspace() { return { home, membership } },
      async createProject() { throw new Error('not used') },
      async recordInitialIntake() { throw new Error('not used') },
    },
    ...(input.privateObjects ? { privateObjects: input.privateObjects } : {}),
    ...(input.artifactMetadata ? { artifactMetadata: input.artifactMetadata } : {}),
    ...(input.checkupPhotos ? { checkupPhotos: input.checkupPhotos } : {}),
    ...(input.homeRecordProfile ? { homeRecordProfile: input.homeRecordProfile } : {}),
    now: input.now ?? (() => now),
    capabilities: {
      ...capabilities,
      persistence: input.persistence ?? false,
      projectQuotes: input.projectQuotes ?? false,
      homeResearch: false,
      homeAssistant: false,
      homeAssistantVision: false,
      uploads: input.uploads ?? false,
      photoCheckups: input.photoCheckups ?? false,
      projectReview: input.projectReview ?? false,
      projectReviewAttachments: input.projectReviewAttachments ?? false,
    },
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

test('session reports project review independently from generic sharing', async () => {
  const signedIn = await service({
    projectReview: true,
    projectReviewAttachments: true,
  }).readSession(context)
  assert.equal(signedIn.capabilities.projectReview, true)
  assert.equal(signedIn.capabilities.projectReviewAttachments, true)
  assert.equal(signedIn.capabilities.sharing, false)
})

test('seasonal photo capability is separate and projects no storage or integrity fields', async () => {
  const api = service({ photoCheckups: true, checkupPhotos: checkupPhotoPort() })
  const session = await api.readSession(context)
  assert.equal(session.capabilities.photoCheckups, true)
  assert.equal(session.capabilities.uploads, false)
  const result = await api.listCheckupPhotos(context, homeRef)
  assert.deepEqual(result, [{
    photoRef: checkupPhoto.photoRef,
    homeRef,
    observedOn: checkupPhoto.observedOn,
    area: checkupPhoto.area,
    viewLabel: checkupPhoto.viewLabel,
    caption: checkupPhoto.caption,
    fullUrl: `/api/v1/homes/${homeRef}/photo-checkups/${checkupPhoto.photoRef}/full`,
    thumbnailUrl: `/api/v1/homes/${homeRef}/photo-checkups/${checkupPhoto.photoRef}/thumbnail`,
    width: 1600,
    height: 900,
    createdAt: now,
  }])
  assert.equal('fullStorageObjectRef' in result[0]!, false)
  assert.equal('fullPayloadSha256' in result[0]!, false)
})

test('photo upload preauthorization requires the exact-home controller before bytes', async () => {
  const api = service({
    photoCheckups: true,
    checkupPhotos: checkupPhotoPort(),
    repository: repository({
      async readMembership() { return { ...membership, role: 'member' } },
    }),
  })
  await assert.rejects(
    api.preauthorizeCheckupPhotoUpload(context, homeRef),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )
})

test('photo intent digest material excludes execution time and future observations fail', async () => {
  const command = {
    commandRef: `hcmd_${body('z')}`,
    observedOn: '2026-08-09',
    area: 'front_exterior' as const,
    viewLabel: 'Front door from the walkway',
    caption: '',
    inputMediaType: 'image/jpeg' as const,
    inputByteLength: 3,
    inputPayloadSha256: 'd'.repeat(64),
    requestedAt: now,
  }
  assert.deepEqual(
    homeownerCheckupPhotoCommandIntent(command),
    homeownerCheckupPhotoCommandIntent({
      ...command,
      requestedAt: '2026-08-10T12:01:00.000Z',
    }),
  )
  assert.equal(createHomeownerCheckupPhotoInputSchema.safeParse({
    ...command,
    viewLabel: 'Hall\u0001ceiling',
  }).success, false)
  assert.equal(createHomeownerCheckupPhotoInputSchema.safeParse({
    ...command,
    caption: 'Leak\u007fmark',
  }).success, false)
  await assert.rejects(
    service({ photoCheckups: true, checkupPhotos: checkupPhotoPort() })
      .reserveCheckupPhotoUpload(context, homeRef, {
        ...command,
        observedOn: '2026-08-11',
        requestedAt: undefined,
      }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
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
  assert.equal(view.documentCount, 2)
  assert.equal(view.warrantyCount, 1)
  assert.equal(view.maintenanceCount, 1)
  assert.equal('createdByPrincipalRef' in view, false)
  assert.equal('membershipRef' in view, false)
  assert.equal('storageObjectRef' in view, false)
})

test('generic exact-home read preserves the address-free v1 projection', async () => {
  let profileReads = 0
  const profilePort: HomeownerHomeRecordProfilePort = {
    async readHomeRecordProfile() { profileReads += 1; return homeRecordProfile },
    async updateHomeRecordProfile() { throw new Error('not used') },
  }
  const view = await service({ homeRecordProfile: profilePort }).readHome(context, homeRef)
  assert.equal('homeRecord' in view, false)
  assert.equal(profileReads, 0, 'the compatibility read does not retrieve exact address data')
  assert.equal(JSON.stringify(view).includes(principalRef), false)
  assert.equal(JSON.stringify(view).includes('123 Main Street'), false)
  assert.equal(JSON.stringify(await service().listHomes(context)).includes('123 Main Street'), false,
    'the exact address never enters the home-list projection')
})

test('dedicated Home Record read is shared read-only while the private profile stays bounded', async () => {
  let observedAction: string | null = null
  const profilePort: HomeownerHomeRecordProfilePort = {
    async readHomeRecordProfile(grant) {
      observedAction = grant.action
      return homeRecordProfile
    },
    async updateHomeRecordProfile() { throw new Error('not used') },
  }
  const profile = await service({ persistence: true, homeRecordProfile: profilePort })
    .readHomeRecord(context, homeRef)
  assert.equal(profile.address?.line1, '123 Main Street')
  assert.equal(profile.homeType, 'house')
  assert.equal(profile.systems.length, HOMEOWNER_SYSTEM_KINDS.length)
  assert.equal(observedAction, 'home_record.read')

  for (const role of ['member', 'viewer'] as const) {
    const sharedRepository = repository({
      async readMembership() { return { ...membership, role } },
    })
    const shared = await service({
      repository: sharedRepository,
      persistence: true,
      homeRecordProfile: profilePort,
    }).readHomeRecord(context, homeRef)
    assert.equal(shared.address?.line1, '123 Main Street')
  }
})

test('home record updates are controller-only, revision-backed, and server-timed', async () => {
  let observed: unknown
  const profilePort: HomeownerHomeRecordProfilePort = {
    async readHomeRecordProfile() { return homeRecordProfile },
    async updateHomeRecordProfile(input) {
      observed = input
      return { ...homeRecordProfile, revision: 3 }
    },
  }
  const input = {
    commandRef: `hcmd_${body('d')}`,
    expectedRevision: 2,
    address: homeRecordProfile.address,
    homeType: homeRecordProfile.homeType,
    yearBuilt: homeRecordProfile.yearBuilt,
    systems: homeRecordProfile.systems,
  }
  const updated = await service({
    persistence: true,
    homeRecordProfile: profilePort,
  }).updateHomeRecord(context, homeRef, input)
  assert.equal(updated.revision, 3)
  assert.deepEqual(observed, {
    grant: {
      authorized: true,
      principalRef,
      homeRef,
      membershipRef: membership.membershipRef,
      membershipRevision: 1,
      action: 'home_record.update',
      recheckedAt: now,
    },
    command: { ...input, requestedAt: now },
  })

  const viewerRepository = repository({
    async readMembership() { return { ...membership, role: 'viewer' } },
  })
  await assert.rejects(
    service({
      repository: viewerRepository,
      persistence: true,
      homeRecordProfile: profilePort,
    }).updateHomeRecord(context, homeRef, input),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )
})

test('home record update rejects an incoherent adapter result', async () => {
  const input = {
    commandRef: `hcmd_${body('d')}`,
    expectedRevision: 2,
    address: homeRecordProfile.address,
    homeType: homeRecordProfile.homeType,
    yearBuilt: homeRecordProfile.yearBuilt,
    systems: homeRecordProfile.systems,
  }
  const profilePort: HomeownerHomeRecordProfilePort = {
    async readHomeRecordProfile() { return homeRecordProfile },
    async updateHomeRecordProfile() {
      return {
        ...homeRecordProfile,
        revision: 3,
        address: { ...homeRecordProfile.address!, city: 'Wrong city' },
      }
    },
  }
  await assert.rejects(
    service({ persistence: true, homeRecordProfile: profilePort })
      .updateHomeRecord(context, homeRef, input),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
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

test('artifact metadata reads are exact-home and never expose storage or integrity fields', async () => {
  const geoPin = {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracyMeters: 8,
    capturedAt: '2026-08-09T17:30:00.000Z',
    provenance: 'device_confirmed' as const,
  }
  const photo = {
    ...artifact,
    kind: 'photo' as const,
    displayName: 'Rear patio.jpg',
    mediaType: 'image/jpeg',
    geoPin,
  }
  const result = await service({
    uploads: true,
    repository: repository({ async listArtifactMetadata() { return [photo] } }),
  }).listArtifacts(context, homeRef)
  assert.deepEqual(result, [{
    artifactRef: photo.artifactRef,
    homeRef,
    projectRef: null,
    kind: 'photo',
    displayName: photo.displayName,
    mediaType: 'image/jpeg',
    byteLength: photo.byteLength,
    observedOn: null,
    phase: null,
    areaLabel: null,
    geoPin,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }])
  assert.equal(JSON.stringify(result).includes('storageObjectRef'), false)
  assert.equal(JSON.stringify(result).includes('payloadSha256'), false)
  assert.equal(JSON.stringify(result).includes(principalRef), false)

  const viewerResult = await service({
    uploads: true,
    repository: repository({
      async readMembership() { return { ...membership, role: 'viewer' } },
      async listArtifactMetadata() { return [photo] },
    }),
  }).listArtifacts(context, homeRef)
  assert.equal(viewerResult[0]?.geoPin, null,
    'exact device coordinates remain controller-only even when artifact metadata is shared')
})

test('artifact metadata update is household-editable, revision-backed, and viewer denied', async () => {
  const uploadedByMember = {
    ...artifact,
    artifactRef: `hart_${body('g')}`,
    controllerPrincipalRef: otherPrincipalRef,
    kind: 'photo' as const,
    displayName: 'Rear yard before work.jpg',
    mediaType: 'image/jpeg',
  }
  const project = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    projectRef: `hprj_${body('j')}`,
    homeRef,
    controllerPrincipalRef: principalRef,
    title: 'Improve rear drainage',
    workKind: 'project' as const,
    category: 'landscaping' as const,
    status: 'planned' as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
  const observed: Parameters<HomeownerArtifactMetadataPort['updateArtifactMetadata']>[0][] = []
  const receipts = new Map<string, HomeownerArtifactMetadata>()
  let stored: HomeownerArtifactMetadata = uploadedByMember
  let clock = now
  const metadataPort: HomeownerArtifactMetadataPort = {
    async updateArtifactMetadata(input) {
      observed.push(input)
      const replay = receipts.get(input.command.commandRef)
      if (replay) return replay
      if ((stored.revision ?? 1) !== input.command.expectedRevision) {
        throw new HomeownerApiError('conflict')
      }
      stored = {
        ...stored,
        projectRef: input.command.projectRef ?? undefined,
        observedOn: input.command.observedOn ?? undefined,
        phase: input.command.phase ?? undefined,
        areaLabel: input.command.areaLabel ?? undefined,
        geoPin: input.command.geoPin ?? undefined,
        revision: input.command.expectedRevision + 1,
        updatedAt: input.command.requestedAt,
      }
      receipts.set(input.command.commandRef, stored)
      return stored
    },
  }
  const input = {
    commandRef: `hcmd_${body('e')}`,
    expectedRevision: 1,
    projectRef: project.projectRef,
    observedOn: '2026-08-09',
    phase: 'before' as const,
    areaLabel: 'Rear yard',
    geoPin: {
      latitude: 32.7555,
      longitude: -97.3308,
      accuracyMeters: 8.5,
      capturedAt: '2026-08-09T18:30:00.000Z',
      provenance: 'device_confirmed' as const,
    },
  }
  const api = service({
    uploads: true,
    now: () => clock,
    artifactMetadata: metadataPort,
    repository: repository({
      async listArtifactMetadata() { return [stored] },
      async listProjects() { return [project] },
    }),
  })
  const updated = await api.updateArtifactMetadata(
    context, homeRef, uploadedByMember.artifactRef, input,
  )
  assert.equal(updated.revision, 2)
  assert.equal(updated.projectRef, project.projectRef)
  assert.equal(updated.phase, 'before')
  assert.deepEqual(updated.geoPin, input.geoPin)
  assert.equal('payloadSha256' in updated, false)
  assert.equal('controllerPrincipalRef' in updated, false)
  const captured = observed[0]
  assert.ok(captured)
  assert.equal(captured.grant.action, 'artifact.update_metadata')
  assert.deepEqual(captured.command, {
    ...input,
    artifactRef: uploadedByMember.artifactRef,
    requestedAt: now,
  })
  clock = '2026-08-10T12:05:00.000Z'
  assert.deepEqual(await api.updateArtifactMetadata(
    context, homeRef, uploadedByMember.artifactRef, input,
  ), updated, 'the same command replays after the stored revision advances')
  assert.equal(observed.length, 2)
  assert.equal(observed[1]?.command.requestedAt, clock,
    'a later server execution time does not change the stored retry result')

  const memberInput = {
    ...input,
    commandRef: `hcmd_${body('m')}`,
    expectedRevision: 2,
  }
  const memberUpdated = await service({
    uploads: true,
    artifactMetadata: metadataPort,
    repository: repository({
      async readMembership() { return { ...membership, role: 'member' } },
      async listArtifactMetadata() { return [stored] },
      async listProjects() { return [project] },
    }),
  }).updateArtifactMetadata(context, homeRef, uploadedByMember.artifactRef, memberInput)
  assert.equal(memberUpdated.revision, 3)

  await assert.rejects(service({
    uploads: true,
    artifactMetadata: metadataPort,
    repository: repository({
      async readMembership() { return { ...membership, role: 'viewer' } },
      async listArtifactMetadata() { return [stored] },
      async listProjects() { return [project] },
    }),
  }).updateArtifactMetadata(context, homeRef, uploadedByMember.artifactRef, {
    ...memberInput,
    commandRef: `hcmd_${body('v')}`,
    expectedRevision: 3,
  }), (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden')
})

test('artifact metadata rejects stale revisions, future observations, and photo fields on files', async () => {
  let writes = 0
  const metadataPort: HomeownerArtifactMetadataPort = {
    async updateArtifactMetadata(input) {
      writes += 1
      if (input.command.expectedRevision !== (artifact.revision ?? 1)) {
        throw new HomeownerApiError('conflict')
      }
      return artifact
    },
  }
  const base = {
    commandRef: `hcmd_${body('e')}`,
    expectedRevision: 1,
    projectRef: null,
    observedOn: null,
    phase: null,
    areaLabel: null,
    geoPin: null,
  }
  const api = service({
    uploads: true,
    artifactMetadata: metadataPort,
    repository: repository({ async listArtifactMetadata() { return [artifact] } }),
  })
  await assert.rejects(
    api.updateArtifactMetadata(context, homeRef, artifact.artifactRef, {
      ...base,
      expectedRevision: 2,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict',
  )
  await assert.rejects(
    api.updateArtifactMetadata(context, homeRef, artifact.artifactRef, {
      ...base,
      observedOn: '2026-08-11',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  await assert.rejects(
    api.updateArtifactMetadata(context, homeRef, artifact.artifactRef, {
      ...base,
      phase: 'reference',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  assert.equal(writes, 1, 'the atomic port owns stale-revision and retry ordering')

  await assert.rejects(
    service({
      uploads: true,
      repository: repository({ async listArtifactMetadata() { return [artifact] } }),
      artifactMetadata: {
        async updateArtifactMetadata() {
          return {
            ...artifact,
            revision: 2,
            createdAt: '2026-08-09T12:00:00.000Z',
          }
        },
      },
    }).updateArtifactMetadata(context, homeRef, artifact.artifactRef, base),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
    'an adapter may not rewrite immutable artifact creation metadata',
  )

  let crossHomeWrites = 0
  const foreignProject = {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    projectRef: `hprj_${body('x')}`,
    homeRef: otherHomeRef,
    controllerPrincipalRef: principalRef,
    title: 'Other property work',
    workKind: 'project' as const,
    category: 'exterior' as const,
    status: 'planned' as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
  const crossHomeApi = service({
    uploads: true,
    repository: repository({
      async listArtifactMetadata() { return [artifact] },
      async listProjects() { return [foreignProject] },
    }),
    artifactMetadata: {
      async updateArtifactMetadata() {
        crossHomeWrites += 1
        return artifact
      },
    },
  })
  await assert.rejects(
    crossHomeApi.updateArtifactMetadata(context, homeRef, artifact.artifactRef, {
      ...base,
      commandRef: `hcmd_${body('x')}`,
      projectRef: foreignProject.projectRef,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  assert.equal(crossHomeWrites, 0,
    'a project from another home is rejected before the metadata mutation port')
})

test('artifact upload derives media, digest, principal, and time on the server', async () => {
  const observed: Parameters<HomeownerPrivateObjectPort['storeArtifact']>[0][] = []
  const privateObjects: HomeownerPrivateObjectPort = {
    async storeArtifact(input) {
      observed.push(input)
      return {
        recordVersion: HOMEOWNER_RUNTIME_VERSION,
        artifactRef: artifact.artifactRef,
        homeRef: input.grant.homeRef,
        controllerPrincipalRef: input.grant.principalRef,
        kind: input.command.kind,
        displayName: input.command.displayName,
        mediaType: input.command.mediaType,
        byteLength: input.command.byteLength,
        payloadSha256: input.command.payloadSha256,
        storageObjectRef: artifact.storageObjectRef,
        contentClass: 'homeowner_private',
        createdAt: input.command.requestedAt,
      }
    },
    async readExactObject() { throw new Error('not used') },
  }
  const bytes = new TextEncoder().encode('%PDF-1.7')
  const result = await service({ uploads: true, privateObjects }).uploadArtifact(
    context,
    homeRef,
    {
      commandRef: `hcmd_${body('u')}`,
      kind: 'document',
      displayName: '../Roof contract.pdf',
    },
    bytes,
  )
  assert.equal(result.displayName, '.. Roof contract.pdf')
  assert.equal(result.mediaType, 'application/pdf')
  assert.equal('storageObjectRef' in result, false)
  const stored = observed[0]
  assert.ok(stored)
  assert.equal(stored.grant.action, 'artifact.upload')
  assert.equal(stored.command.requestedAt, now)
  assert.match(stored.command.payloadSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(stored.bytes, bytes)
})

test('legacy artifact upload rejects viewer authority, bad bytes, and a project from another home', async () => {
  const privateObjects: HomeownerPrivateObjectPort = {
    async storeArtifact() { throw new Error('must not store') },
    async readExactObject() { throw new Error('not used') },
  }
  const input = {
    commandRef: `hcmd_${body('u')}`,
    kind: 'document',
    displayName: 'Contract.pdf',
  }
  await assert.rejects(
    service({ uploads: true, privateObjects }).uploadArtifact(
      context, homeRef, input, new TextEncoder().encode('plain text'),
    ),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  await assert.rejects(
    service({
      uploads: true,
      privateObjects,
      repository: repository({ async readMembership() { return { ...membership, role: 'viewer' } } }),
    }).uploadArtifact(context, homeRef, input, new TextEncoder().encode('%PDF-1.7')),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )
  await assert.rejects(
    service({
      uploads: true,
      privateObjects,
      repository: repository({
        async listProjects() {
          return [{ projectRef: `hprj_${body('j')}`, homeRef: otherHomeRef }] as never
        },
      }),
    }).uploadArtifact(context, homeRef, {
      ...input,
      projectRef: `hprj_${body('j')}`,
    }, new TextEncoder().encode('%PDF-1.7')),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
})

test('direct artifact reservation allows an exact-home member and completion stays opaque', async () => {
  const observed: Parameters<NonNullable<HomeownerPrivateObjectPort['reserveArtifactUpload']>>[0][] = []
  const commandRef = `hcmd_${body('d')}`
  const objectRef = `hobj_${body('d')}`
  const privateObjects: HomeownerPrivateObjectPort = {
    async storeArtifact() { throw new Error('not used') },
    async readExactObject() { throw new Error('not used') },
    async reserveArtifactUpload(input) {
      observed.push(input)
      return {
        state: 'upload_required',
        reservation: {
          artifactRef: artifact.artifactRef,
          homeRef: input.grant.homeRef,
          uploaderPrincipalRef: input.grant.principalRef,
          commandRef: input.command.commandRef,
          commandDigest: 'd'.repeat(64),
          storageObjectRef: objectRef,
          storageKey: `${input.grant.homeRef}/${objectRef}`,
        },
        upload: {
          signedUrl: `https://project.supabase.co/signed?token=${'t'.repeat(40)}`,
          path: `${input.grant.homeRef}/${objectRef}`,
          token: 't'.repeat(40),
          expiresAt: '2026-08-10T14:00:00.000Z',
        },
      }
    },
    async completeArtifactUpload() { return artifact },
  }
  const memberRepository = repository({
    async readMembership() { return { ...membership, role: 'member' } },
  })
  const result = await service({
    uploads: true, privateObjects, repository: memberRepository,
  }).reserveArtifactUpload(context, homeRef, {
    commandRef,
    kind: 'document',
    displayName: '../Contract.pdf',
    mediaType: 'application/pdf',
    byteLength: 9,
    payloadSha256: 'a'.repeat(64),
  })
  assert.equal(result.state, 'upload_required')
  assert.equal(result.artifactRef, artifact.artifactRef)
  assert.equal('uploaderPrincipalRef' in result, false)
  assert.equal(observed[0]?.grant.action, 'artifact.upload')
  assert.equal(observed[0]?.command.displayName, '.. Contract.pdf')

  const complete = await service({
    uploads: true, privateObjects, repository: memberRepository,
  }).completeArtifactUpload(context, homeRef, artifact.artifactRef, commandRef)
  assert.equal(complete.artifactRef, artifact.artifactRef)
  assert.equal('storageObjectRef' in complete, false)

  await assert.rejects(
    service({
      uploads: true,
      privateObjects,
      repository: repository({
        async readMembership() { return { ...membership, role: 'viewer' } },
      }),
    }).reserveArtifactUpload(context, homeRef, {
      commandRef,
      kind: 'document',
      displayName: 'Contract.pdf',
      mediaType: 'application/pdf',
      byteLength: 9,
      payloadSha256: 'a'.repeat(64),
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )
})

test('artifact content rechecks membership after the storage read', async () => {
  let membershipReads = 0
  let objectReads = 0
  const repo = repository({
    async readMembership() {
      membershipReads += 1
      return membershipReads === 1
        ? membership
        : { ...membership, state: 'revoked', revokedAt: now }
    },
    async listArtifactMetadata() { return [artifact] },
  })
  const privateObjects: HomeownerPrivateObjectPort = {
    async storeArtifact() { throw new Error('not used') },
    async readExactObject(input) {
      objectReads += 1
      assert.equal(input.storageObjectRef, artifact.storageObjectRef)
      return new Uint8Array(artifact.byteLength)
    },
  }
  await assert.rejects(
    service({ uploads: true, privateObjects, repository: repo }).readArtifactContent(
      context, homeRef, artifact.artifactRef,
    ),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  assert.equal(objectReads, 1)
  assert.equal(membershipReads, 2)
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
    { homeRecord: homeRecordProfile },
  ]) {
    assert.throws(() => homeownerApiHomeViewSchema.parse({ ...base, ...extra }))
  }

  for (const noncanonical of [
    '2026-08-10T12:00:00Z',
    '2026-08-10T12:00:00.000000Z',
    '2026-08-10T12:00:00.000+00:00',
    '2026-02-30T12:00:00.000Z',
  ]) {
    assert.throws(
      () => homeownerApiHomeViewSchema.parse({ ...base, updatedAt: noncanonical }),
      `${noncanonical} must not cross the server/client boundary`,
    )
  }
})

test('home creation derives authority and time on the server', async () => {
  let observed: unknown
  const created = await service({
    persistence: true,
    commands: {
      async createPrivateHomeWorkspace(input) {
        observed = input
        return { home, membership }
      },
      async createProject() { throw new Error('not used') },
      async recordInitialIntake() { throw new Error('not used') },
    },
  }).createHome(context, {
    commandRef: `hcmd_${body('c')}`,
    displayLabel: 'Our home',
    privateLocationLabel: 'Private location',
  })

  assert.deepEqual(created, {
    homeRef,
    displayLabel: 'Our home',
    privateLocationLabel: 'A private homeowner location label',
    relationshipLabel: 'claimed_unverified',
  })
  assert.deepEqual(observed, {
    authorization: { authorized: true, principalRef },
    command: {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
      requestedAt: now,
    },
  })
})

test('home creation rejects browser authority, disabled persistence, and incoherent adapter output', async () => {
  await assert.rejects(
    service({ persistence: true }).createHome(context, {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
      principalRef,
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  await assert.rejects(
    service().createHome(context, {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
  await assert.rejects(
    service({
      persistence: true,
      commands: {
        async createPrivateHomeWorkspace() {
          return { home, membership: { ...membership, principalRef: otherPrincipalRef } }
        },
        async createProject() { throw new Error('not used') },
        async recordInitialIntake() { throw new Error('not used') },
      },
    }).createHome(context, {
      commandRef: `hcmd_${body('c')}`,
      displayLabel: 'Our home',
      privateLocationLabel: 'Private location',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})

test('initial intake fresh-authorizes one exact home and derives source and time server-side', async () => {
  let observed: unknown
  const result = await service({
    persistence: true,
    commands: {
      async createPrivateHomeWorkspace() { return { home, membership } },
      async createProject() { throw new Error('not used') },
      async recordInitialIntake(input) {
        observed = input
        return { propertyFacts, systems: intakeSystems }
      },
    },
  }).recordInitialIntake(context, homeRef, intakeInput)

  assert.equal(result.homeRef, homeRef)
  assert.equal(result.source, 'homeowner_recollection')
  assert.equal(result.systems.length, HOMEOWNER_SYSTEM_KINDS.length)
  assert.equal(JSON.stringify(result).includes(principalRef), false)
  assert.equal(JSON.stringify(result).includes('membershipRef'), false)
  assert.deepEqual(observed, {
    grant: {
      authorized: true,
      principalRef,
      homeRef,
      membershipRef: membership.membershipRef,
      membershipRevision: 1,
      action: 'intake.record',
      recheckedAt: now,
    },
    command: { ...intakeInput, requestedAt: now },
  })
})

test('initial intake rejects browser authority, non-controller access, and disabled persistence', async () => {
  await assert.rejects(
    service({ persistence: true }).recordInitialIntake(context, homeRef, {
      ...intakeInput,
      source: 'verified_contractor_record',
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )

  const viewerRepo = repository({
    async readMembership() { return { ...membership, role: 'viewer' } },
  })
  await assert.rejects(
    service({ repository: viewerRepo, persistence: true }).recordInitialIntake(
      context,
      homeRef,
      intakeInput,
    ),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )

  await assert.rejects(
    service().recordInitialIntake(context, homeRef, intakeInput),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})

test('initial intake rejects missing/duplicate systems and incoherent command output', async () => {
  await assert.rejects(
    service({ persistence: true }).recordInitialIntake(context, homeRef, {
      ...intakeInput,
      systems: intakeInput.systems.slice(0, -1),
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  await assert.rejects(
    service({ persistence: true }).recordInitialIntake(context, homeRef, {
      ...intakeInput,
      systems: intakeInput.systems.map(system => ({ ...system, kind: 'roof' })),
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )

  await assert.rejects(
    service({
      persistence: true,
      commands: {
        async createPrivateHomeWorkspace() { return { home, membership } },
        async createProject() { throw new Error('not used') },
        async recordInitialIntake() {
          return {
            propertyFacts: { ...propertyFacts, controllerPrincipalRef: otherPrincipalRef },
            systems: intakeSystems,
          }
        },
      },
    }).recordInitialIntake(context, homeRef, intakeInput),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
})
