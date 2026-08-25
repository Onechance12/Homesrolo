import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  homesroloJobroloDisclosure,
  homesroloJobroloSha256,
  homesroloJobroloProjectIntakeReceiptSchema,
  type HomesroloJobroloProjectIntake,
} from '../../contracts/homesrolo-jobrolo-project-intake.v1.ts'
import { HomeownerApiError } from '../homeowner-api.v1.ts'
import {
  HomeownerProjectReviewService,
  type HomeownerProjectReviewPersistencePort,
  type HomeownerProjectReviewReservation,
  type HomeownerProjectReviewTransport,
} from '../homeowner-project-review.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerArtifactMetadata,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const body = (character: string) => character.repeat(43)
const principalRef = `hprn_${body('p')}`
const otherPrincipalRef = `hprn_${body('q')}`
const homeRef = `hhom_${body('h')}`
const otherHomeRef = `hhom_${body('o')}`
const projectRef = `hprj_${body('r')}`
const otherProjectRef = `hprj_${body('s')}`
const artifactRef = `hart_${body('a')}`
const otherProjectArtifactRef = `hart_${body('b')}`
const otherHomeArtifactRef = `hart_${body('c')}`
const commandRef = `hcmd_${body('d')}`
const now = '2026-08-12T20:00:00.000Z'
const context = { sessionHandle: 'opaque-server-session' }

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
  revision: 4,
  createdAt: now,
}

const home = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  homeRef,
  createdByPrincipalRef: principalRef,
  displayLabel: 'My home',
  privateLocationLabel: 'Fort Worth, Texas 76107',
  createdAt: now,
  updatedAt: now,
} as const

const project = {
  recordVersion: HOMEOWNER_RUNTIME_VERSION,
  projectRef,
  homeRef,
  controllerPrincipalRef: principalRef,
  title: 'Roof replacement',
  category: 'roofing',
  status: 'planned',
  summary: 'Roof is near the end of its useful life.',
  revision: 1,
  createdAt: now,
  updatedAt: now,
} as const

function artifact(input: {
  artifactRef: string
  homeRef?: string
  projectRef?: string
}): HomeownerArtifactMetadata {
  return {
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    artifactRef: input.artifactRef,
    homeRef: input.homeRef ?? homeRef,
    projectRef: input.projectRef ?? projectRef,
    controllerPrincipalRef: principalRef,
    kind: 'photo',
    displayName: 'roof-damage.jpg',
    mediaType: 'image/jpeg',
    byteLength: 2048,
    payloadSha256: 'a'.repeat(64),
    storageObjectRef: `hobj_${body('x')}`,
    contentClass: 'homeowner_private',
    createdAt: now,
  }
}

const matchingArtifact = artifact({ artifactRef })
const otherProjectArtifact = artifact({
  artifactRef: otherProjectArtifactRef,
  projectRef: otherProjectRef,
})
const otherHomeArtifact = artifact({
  artifactRef: otherHomeArtifactRef,
  homeRef: otherHomeRef,
})

function validInput(overrides: Record<string, unknown> = {}) {
  const input: Record<string, unknown> = {
    operation: 'submit' as const,
    commandRef,
    name: 'Home Owner',
    preferredContact: 'email',
    selectedArtifactRefs: [artifactRef],
    consentAccepted: true,
    ...overrides,
  }
  const knownArtifacts = [matchingArtifact, otherProjectArtifact, otherHomeArtifact]
  const refs = Array.isArray(input.selectedArtifactRefs) ? input.selectedArtifactRefs : []
  const disclosure = homesroloJobroloDisclosure({
    source: { homeRef, projectRef },
    homeowner: {
      name: String(input.name),
      email: 'owner@example.com',
      ...(typeof input.phone === 'string' ? { phone: input.phone } : {}),
      preferredContact: input.preferredContact as 'email' | 'phone' | 'text',
    },
    property: { label: home.privateLocationLabel },
    project: {
      title: project.title,
      category: 'roofing' as const,
      status: project.status,
      summary: project.summary,
    },
    attachments: refs.flatMap(ref => {
      const item = knownArtifacts.find(candidate => candidate.artifactRef === ref)
      return item ? [{
        artifactRef: item.artifactRef,
        displayName: item.displayName,
        kind: item.kind,
        mediaType: item.mediaType as 'application/pdf' | 'image/jpeg' | 'image/png',
        byteLength: item.byteLength,
        sha256: item.payloadSha256,
        downloadUrl: 'https://placeholder.invalid/not-disclosed',
        downloadExpiresAt: now,
      }] : []
    }),
  })
  return { ...input, reviewedDisclosureDigest: homesroloJobroloSha256(disclosure) }
}

type StoredSubmission = {
  state: 'executing' | 'awaiting_chance_review' | 'reconciliation_required'
  submissionRef: string
  commandDigest: string
  disclosureDigest: string
  submittedAt: string
  receipt?: ReturnType<typeof homesroloJobroloProjectIntakeReceiptSchema.parse>
}

function harness(input: {
  identityPrincipal?: HomeownerPrincipal
  membershipForRead?: (readNumber: number) => HomeownerMembership | null
  artifacts?: readonly HomeownerArtifactMetadata[]
  transport?: HomeownerProjectReviewTransport
  attachmentsEnabled?: boolean
  useServiceAttachmentDefault?: boolean
} = {}) {
  const order: string[] = []
  const delivered: HomesroloJobroloProjectIntake[] = []
  let identityReads = 0
  let membershipReads = 0
  let transferCalls = 0
  let deliverCalls = 0
  let unknownCalls = 0
  let stored: StoredSubmission | undefined

  const repository: HomeownerRepositoryPort = {
    async listMemberships(_authorization: AuthorizedHomeownerPrincipal) { return [membership] },
    async readMembership() {
      membershipReads += 1
      return input.membershipForRead?.(membershipReads) ?? membership
    },
    async readHome(_grant: AuthorizedHomeownerWorkspace) { return home },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects() { return [project] },
    async listArtifactMetadata() {
      return input.artifacts ?? [matchingArtifact, otherProjectArtifact, otherHomeArtifact]
    },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
  }

  const persistence: HomeownerProjectReviewPersistencePort = {
    async readCanonicalEmail() { return 'owner@example.com' },
    async reserveSubmission(reservationInput) {
      order.push('reserve')
      if (stored) {
        if (stored.commandDigest !== reservationInput.commandDigest
          || stored.disclosureDigest !== reservationInput.disclosureDigest) {
          throw new HomeownerApiError('unavailable')
        }
        if (stored.state === 'awaiting_chance_review') {
          assert.ok(stored.receipt)
          return {
            state: stored.state,
            submissionRef: stored.submissionRef,
            submittedAt: stored.submittedAt,
            receipt: stored.receipt,
          }
        }
        return {
          state: 'reconciliation_required',
          submissionRef: stored.submissionRef,
          submittedAt: stored.submittedAt,
        }
      }
      stored = {
        state: 'executing',
        submissionRef: reservationInput.submissionRef,
        commandDigest: reservationInput.commandDigest,
        disclosureDigest: reservationInput.disclosureDigest,
        submittedAt: reservationInput.consentAcceptedAt,
      }
      return {
        state: 'reserved',
        submissionRef: stored.submissionRef,
        commandDigest: stored.commandDigest,
        disclosureDigest: stored.disclosureDigest,
      }
    },
    async createArtifactTransfer(transferInput) {
      transferCalls += 1
      order.push('transfer')
      return {
        downloadUrl: `https://private.example.test/artifacts/${transferInput.artifact.artifactRef}`,
        downloadExpiresAt: transferInput.expiresAt,
      }
    },
    async markSubmissionReceived(receivedInput) {
      order.push('mark-received')
      assert.ok(stored)
      assert.equal(stored.state, 'executing')
      assert.equal(receivedInput.submissionRef, stored.submissionRef)
      stored = {
        ...stored,
        state: 'awaiting_chance_review',
        submittedAt: receivedInput.receipt.acceptedAt,
        receipt: receivedInput.receipt,
      }
    },
    async markSubmissionUnknown(unknownInput) {
      unknownCalls += 1
      order.push('mark-unknown')
      assert.ok(stored)
      assert.equal(unknownInput.submissionRef, stored.submissionRef)
      stored = { ...stored, state: 'reconciliation_required' }
    },
  }

  const transport: HomeownerProjectReviewTransport = input.transport ?? {
    async deliver(request) {
      deliverCalls += 1
      order.push('deliver')
      assert.equal(stored?.state, 'executing')
      delivered.push(request)
      return homesroloJobroloProjectIntakeReceiptSchema.parse({
        contractVersion: request.contractVersion,
        submissionRef: request.submissionRef,
        receiptRef: `hjrc_${body('j')}`,
        status: 'awaiting_chance_review',
        acceptedAt: now,
        replayed: false,
        requestNonce: 'n'.repeat(22),
        requestBodySha256: 'b'.repeat(64),
        disclosureDigest: request.consent.disclosureDigest,
      })
    },
  }
  const countedTransport: HomeownerProjectReviewTransport = {
    async deliver(request) {
      if (input.transport) {
        deliverCalls += 1
        order.push('deliver')
        assert.equal(stored?.state, 'executing')
        delivered.push(request)
      }
      return transport.deliver(request)
    },
  }

  return {
    service: new HomeownerProjectReviewService({
      identity: {
        async resolvePrincipal(handle) {
          identityReads += 1
          return handle === context.sessionHandle
            ? (input.identityPrincipal ?? principal)
            : null
        },
      },
      repository,
      persistence,
      transport: countedTransport,
      ...(input.useServiceAttachmentDefault
        ? {}
        : { attachmentsEnabled: input.attachmentsEnabled ?? true }),
      now: () => now,
    }),
    state: {
      order,
      delivered,
      get identityReads() { return identityReads },
      get membershipReads() { return membershipReads },
      get transferCalls() { return transferCalls },
      get deliverCalls() { return deliverCalls },
      get unknownCalls() { return unknownCalls },
      get stored() { return stored },
    },
  }
}

test('attachment handoff is default-off and rejects selected files before any provider work', async () => {
  const previewHarness = harness({ useServiceAttachmentDefault: true })
  await assert.rejects(
    previewHarness.service.preview(context, homeRef, projectRef, {
      operation: 'preview',
      name: 'Home Owner',
      preferredContact: 'email',
      selectedArtifactRefs: [artifactRef],
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  assert.equal(previewHarness.state.identityReads, 0)
  assert.equal(previewHarness.state.membershipReads, 0)
  assert.equal(previewHarness.state.transferCalls, 0)
  assert.equal(previewHarness.state.deliverCalls, 0)
  assert.equal(previewHarness.state.stored, undefined)

  const submitHarness = harness({ attachmentsEnabled: false })
  await assert.rejects(
    submitHarness.service.submit(context, homeRef, projectRef, validInput()),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
  assert.equal(submitHarness.state.identityReads, 0)
  assert.equal(submitHarness.state.membershipReads, 0)
  assert.equal(submitHarness.state.transferCalls, 0)
  assert.equal(submitHarness.state.deliverCalls, 0)
  assert.equal(submitHarness.state.stored, undefined)

  const requestOnlyHarness = harness({ attachmentsEnabled: false })
  const result = await requestOnlyHarness.service.submit(context, homeRef, projectRef, validInput({
    selectedArtifactRefs: [],
  }))
  assert.equal(result.status, 'awaiting_chance_review')
  assert.deepEqual(requestOnlyHarness.state.delivered[0]?.attachments, [])
  assert.equal(requestOnlyHarness.state.transferCalls, 0)
})

test('project review is controller-only and fails closed across principals', async () => {
  const memberHarness = harness({
    membershipForRead: () => ({ ...membership, role: 'member' }),
  })
  await assert.rejects(
    memberHarness.service.submit(context, homeRef, projectRef, validInput()),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'forbidden',
  )
  assert.equal(memberHarness.state.deliverCalls, 0)
  assert.equal(memberHarness.state.stored, undefined)

  const crossUserHarness = harness({
    identityPrincipal: { ...principal, principalRef: otherPrincipalRef },
    membershipForRead: () => membership,
  })
  await assert.rejects(
    crossUserHarness.service.submit(context, homeRef, projectRef, validInput()),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
  )
  assert.equal(crossUserHarness.state.deliverCalls, 0)
  assert.equal(crossUserHarness.state.stored, undefined)
})

test('server derives canonical email, exact home, and exact roofing project before delivery', async () => {
  const testHarness = harness()
  const result = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  assert.equal(result.status, 'awaiting_chance_review')
  assert.equal(testHarness.state.delivered.length, 1)
  const request = testHarness.state.delivered[0]
  assert.ok(request)
  assert.deepEqual(request.source, { homeRef, projectRef })
  assert.deepEqual(request.homeowner, {
    name: 'Home Owner',
    email: 'owner@example.com',
    preferredContact: 'email',
  })
  assert.deepEqual(request.property, { label: home.privateLocationLabel })
  assert.deepEqual(request.project, {
    title: project.title,
    category: 'roofing',
    status: project.status,
    summary: project.summary,
  })
  assert.deepEqual(request.attachments.map(item => item.artifactRef), [artifactRef])
  assert.ok(testHarness.state.order.indexOf('reserve') < testHarness.state.order.indexOf('deliver'))
  assert.equal(testHarness.state.stored?.state, 'awaiting_chance_review')

  await assert.rejects(
    harness().service.submit(context, homeRef, projectRef, validInput({
      email: 'attacker@example.com',
      property: { label: 'browser chosen' },
    })),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'invalid_request',
  )
})

test('homeowner reviews the exact server disclosure and submit is bound to its unchanged digest', async () => {
  const testHarness = harness()
  const preview = await testHarness.service.preview(context, homeRef, projectRef, {
    operation: 'preview',
    name: 'Home Owner',
    preferredContact: 'email',
    selectedArtifactRefs: [artifactRef],
  })
  assert.equal(preview.homeowner.email, 'owner@example.com')
  assert.equal(preview.property.label, home.privateLocationLabel)
  assert.equal(preview.project.title, project.title)
  assert.deepEqual(preview.attachments.map(item => item.displayName), ['roof-damage.jpg'])
  assert.match(preview.consentText, /private Jobrolo review inbox/)
  assert.equal(testHarness.state.stored, undefined)
  assert.equal(testHarness.state.deliverCalls, 0)

  const submitted = await testHarness.service.submit(context, homeRef, projectRef, {
    ...validInput(),
    reviewedDisclosureDigest: preview.disclosureDigest,
  })
  assert.equal(submitted.status, 'awaiting_chance_review')
  assert.equal(testHarness.state.deliverCalls, 1)

  const changedHarness = harness()
  await assert.rejects(
    changedHarness.service.submit(context, homeRef, projectRef, {
      ...validInput(),
      reviewedDisclosureDigest: '0'.repeat(64),
    }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'conflict',
  )
  assert.equal(changedHarness.state.stored, undefined)
  assert.equal(changedHarness.state.deliverCalls, 0)
})

test('only explicitly selected files from the exact home and project are handed off', async () => {
  const emptyHarness = harness()
  await emptyHarness.service.submit(context, homeRef, projectRef, validInput({
    selectedArtifactRefs: [],
  }))
  assert.deepEqual(emptyHarness.state.delivered[0]?.attachments, [])
  assert.equal(emptyHarness.state.transferCalls, 0)

  for (const disallowedArtifactRef of [otherProjectArtifactRef, otherHomeArtifactRef]) {
    const deniedHarness = harness()
    await assert.rejects(
      deniedHarness.service.submit(context, homeRef, projectRef, validInput({
        selectedArtifactRefs: [disallowedArtifactRef],
      })),
      (error: unknown) => error instanceof HomeownerApiError && error.code === 'not_found',
    )
    assert.equal(deniedHarness.state.deliverCalls, 0)
    assert.equal(deniedHarness.state.stored, undefined)
  }
})

test('unknown delivery is reconciled, persisted, and never retried automatically', async () => {
  let providerAttempts = 0
  const testHarness = harness({
    transport: {
      async deliver() {
        providerAttempts += 1
        throw new Error('connection ended after request write')
      },
    },
  })
  const first = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  assert.equal(first.status, 'reconciliation_required')
  assert.equal(testHarness.state.unknownCalls, 1)
  assert.equal(testHarness.state.stored?.state, 'reconciliation_required')
  assert.ok(testHarness.state.order.indexOf('reserve') < testHarness.state.order.indexOf('deliver'))
  assert.ok(testHarness.state.order.indexOf('deliver') < testHarness.state.order.indexOf('mark-unknown'))

  const replay = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  assert.equal(replay.status, 'reconciliation_required')
  assert.equal(replay.submissionRef, first.submissionRef)
  assert.equal(providerAttempts, 1)
  assert.equal(testHarness.state.deliverCalls, 1)
})

test('exact terminal replay is stable while a changed command is rejected before delivery', async () => {
  const testHarness = harness()
  const first = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  const replay = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  assert.equal(replay.status, 'awaiting_chance_review')
  assert.equal(replay.submissionRef, first.submissionRef)
  assert.equal(testHarness.state.deliverCalls, 1)

  await assert.rejects(
    testHarness.service.submit(context, homeRef, projectRef, validInput({ name: 'Changed Name' })),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )
  assert.equal(testHarness.state.deliverCalls, 1)
})

test('final fresh authority loss blocks delivery even after a transfer was prepared', async () => {
  const revoked: HomeownerMembership = {
    ...membership,
    state: 'revoked',
    revokedAt: now,
  }
  const testHarness = harness({
    membershipForRead: readNumber => readNumber < 3 ? membership : revoked,
  })
  const result = await testHarness.service.submit(context, homeRef, projectRef, validInput())
  assert.equal(testHarness.state.membershipReads, 3)
  assert.equal(testHarness.state.transferCalls, 1)
  assert.equal(testHarness.state.deliverCalls, 0)
  assert.equal(testHarness.state.unknownCalls, 1)
  assert.equal(result.status, 'reconciliation_required')
})
