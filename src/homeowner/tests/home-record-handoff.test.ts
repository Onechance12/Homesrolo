import assert from 'node:assert/strict'
import {
  createHash,
  generateKeyPairSync,
  sign as signMessage,
} from 'node:crypto'
import test from 'node:test'
import {
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  HOMEOWNER_SHARE_PURPOSE,
  HOME_RECORD_HANDOFF_DEFAULT_ENABLED,
  HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES,
  HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINAL_BYTES,
  HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS,
  HomeRecordHandoffService,
  homeRecordHandoffExportPlanAllowed,
  homeownerShareAuthorizationSigningPayload,
  homeownerShareManifestDigest,
  inspectHomeRecordHandoffOffer,
  parseHomeRecordHandoffRecord,
  verifyHomeRecordHandoffAuthorizationSignature,
  type HomeRecordHandoffItemRecord,
  type HomeRecordHandoffOffer,
  type HomeRecordHandoffPersistencePort,
  type HomeRecordHandoffRecipientBinding,
  type HomeRecordHandoffRecord,
  type HomeRecordHandoffScanResult,
  type HomeRecordHandoffServiceOptions,
  type HomeownerShareAuthorizationReceipt,
  type HomeownerShareManifest,
} from '../home-record-handoff.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerRepositoryPort,
} from '../homeowner-runtime.v1.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const NOW = '2026-08-24T15:00:00.000Z'
const EXPIRES = '2026-08-31T15:00:00.000Z'
const homeRef = ref('hhom', 'h')
const otherHomeRef = ref('hhom', 'x')
const principalRef = ref('hprn', 'p')
const recipientRef = ref('hrcp', 'r')
const shareId = ref('hshr', 's')
const context = { sessionHandle: 'opaque-session' }
const pdf = Uint8Array.from(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'))
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

const jobroloKeys = generateKeyPairSync('ed25519')
const homesroloKeys = generateKeyPairSync('ed25519')

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function nonCanonicalBase64urlAlias(canonical: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const expected = Buffer.from(canonical, 'base64url')
  for (const character of alphabet) {
    const candidate = `${canonical.slice(0, -1)}${character}`
    if (candidate !== canonical && Buffer.from(candidate, 'base64url').equals(expected)) {
      return candidate
    }
  }
  throw new Error('no non-canonical base64url alias')
}

test('the in-memory export plan is bounded before object reads', () => {
  assert.equal(homeRecordHandoffExportPlanAllowed([]), true)
  assert.equal(homeRecordHandoffExportPlanAllowed([
    HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINAL_BYTES,
  ]), true)
  assert.equal(homeRecordHandoffExportPlanAllowed([
    HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINAL_BYTES,
    1,
  ]), false)
  assert.equal(homeRecordHandoffExportPlanAllowed(
    Array.from({ length: HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS + 1 }, () => 1),
  ), false)
  assert.equal(homeRecordHandoffExportPlanAllowed([0, 1]), false)
})

function manifest(): HomeownerShareManifest {
  return {
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    shareId,
    recipientRef,
    generation: 1,
    issuedAt: '2026-08-24T14:58:00.000Z',
    expiresAt: EXPIRES,
    nonce: ref('hnce', 'n'),
    artifacts: [
      {
        artifactRef: ref('hproj', 'd'),
        source: 'homeowner_release',
        projectionKind: 'work_completion_record',
        projectionVersion: 1,
        mediaType: 'application/pdf',
        byteLength: pdf.byteLength,
        sha256: digest(pdf),
      },
    ],
  }
}

function authorization(value = manifest()): HomeownerShareAuthorizationReceipt {
  const unsigned: HomeownerShareAuthorizationReceipt = {
    receiptVersion: 'homeowner-share.authorization.v1',
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    authorizationId: ref('hauth', 'a'),
    shareId: value.shareId,
    recipientRef: value.recipientRef,
    manifestDigest: homeownerShareManifestDigest(value),
    manifestContractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    authorizedByRole: 'owner',
    authorizedActorRef: ref('hactor', 'o'),
    authorizationPolicyVersion: 'jobrolo-homeowner-disclosure.v1',
    authorizedAt: '2026-08-24T14:59:00.000Z',
    expiresAt: value.expiresAt,
    signing: {
      algorithm: 'Ed25519',
      keyId: 'jobrolo-test-2026-01',
      signature: Buffer.alloc(64).toString('base64url'),
    },
  }
  return {
    ...unsigned,
    signing: {
      ...unsigned.signing,
      signature: signMessage(
        null,
        Buffer.from(homeownerShareAuthorizationSigningPayload(unsigned), 'utf8'),
        jobroloKeys.privateKey,
      ).toString('base64url'),
    },
  }
}

const principal: HomeownerPrincipal = {
  principalRef,
  status: 'active',
  emailVerified: true,
  sessionVersion: 1,
}

const membership: HomeownerMembership = {
  membershipRef: ref('hmbr', 'm'),
  principalRef,
  homeRef,
  role: 'workspace_controller',
  basis: 'self_created_workspace',
  state: 'active',
  relationshipLabel: 'claimed_unverified',
  revision: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
}

function repository(readMembership: () => HomeownerMembership | null): HomeownerRepositoryPort {
  return {
    async listMemberships() { return [membership] },
    async readMembership() { return readMembership() },
    async readHome() { return null },
    async readPropertyFacts() { return null },
    async listSystems() { return [] },
    async listProjects() { return [] },
    async listArtifactMetadata() { return [] },
    async listWarranties() { return [] },
    async listMaintenance() { return [] },
  }
}

function persistenceHarness(
  extraRecords: () => readonly HomeRecordHandoffRecord[] = () => [],
) {
  let record: HomeRecordHandoffRecord | null = null
  const update = (next: HomeRecordHandoffRecord) => {
    record = parseHomeRecordHandoffRecord(next)
    return record
  }
  const requireRecord = () => {
    if (!record) throw new Error('missing record')
    return record
  }
  const port: HomeRecordHandoffPersistencePort = {
    async receiveOffer(input) {
      if (record) {
        if (record.offerDigest !== input.offer.offerDigest) {
          return update({ ...record, state: 'quarantined' })
        }
        return record
      }
      return update({
        recordVersion: 'home-record-handoff.v1',
        handoffRef: input.handoffRef,
        homeRef: input.binding.homeRef,
        controllerPrincipalRef: input.binding.controllerPrincipalRef,
        recipientBindingRevision: input.binding.revision,
        manifest: input.offer.manifest,
        authorization: input.offer.authorization,
        manifestDigest: input.offer.manifestDigest,
        authorizationReplayKey: input.offer.authorizationReplayKey,
        offerDigest: input.offer.offerDigest,
        state: 'received',
        receivedAt: input.receivedAt,
        expiresAt: input.offer.manifest.expiresAt,
        items: [...input.items],
      })
    },
    async readHandoff(_grant, requestedShareId) {
      return record?.manifest.shareId === requestedShareId ? record : null
    },
    async listHandoffs() { return [...(record ? [record] : []), ...extraRecords()] },
    async reserveAcceptance(input) {
      const current = requireRecord()
      if (current.state === 'accepted') return current
      if (current.commandRef && (current.commandRef !== input.commandRef
        || current.commandDigest !== input.commandDigest)) throw new Error('command conflict')
      const selected = new Set(input.selectedArtifactRefs)
      return update({
        ...current,
        state: 'accepting',
        commandRef: input.commandRef,
        commandDigest: input.commandDigest,
        selectionDigest: input.selectionDigest,
        acceptanceStatementDigest: input.acceptanceStatementDigest,
        consent: input.consent,
        items: current.items.map((item, index) => selected.has(item.sourceArtifactRef)
          ? {
              ...item,
              decision: 'accepted',
              homeownerArtifactRef: ref('hart', String.fromCharCode(97 + index)),
              storageObjectRef: ref('hobj', String.fromCharCode(97 + index)),
            }
          : { ...item, decision: 'rejected', copyState: 'not_started' }),
      })
    },
    async markItemStagedClean(input) {
      const current = requireRecord()
      return update({
        ...current,
        items: current.items.map(item => item.sourceArtifactRef === input.sourceArtifactRef
          ? {
              ...item,
              copyState: 'staged_clean',
              homeownerArtifactRef: input.homeownerArtifactRef,
              storageObjectRef: input.storageObjectRef,
              scanProvider: input.scanProvider,
              scanVersion: input.scanVersion,
              scannedAt: input.scannedAt,
              copiedAt: input.copiedAt,
            }
          : item),
      })
    },
    async quarantineItem(input) {
      const current = requireRecord()
      update({
        ...current,
        state: 'quarantined',
        items: current.items.map(item => item.sourceArtifactRef === input.sourceArtifactRef
          ? { ...item, copyState: 'quarantined', quarantineReason: input.reason }
          : item),
      })
    },
    async finalizeAcceptance(input) {
      const current = requireRecord()
      if (current.items.some(item => item.decision === 'accepted'
        && item.copyState !== 'staged_clean' && item.copyState !== 'available')) {
        throw new Error('not all clean')
      }
      return update({
        ...current,
        state: 'accepted',
        decidedAt: input.completedAt,
        items: current.items.map(item => item.decision === 'accepted'
          ? { ...item, copyState: 'available' }
          : item),
      })
    },
    async markAcceptanceUnknown(input) {
      const current = requireRecord()
      if (current.commandRef === input.commandRef
        && current.commandDigest === input.commandDigest
        && current.state === 'accepting') update({ ...current, state: 'reconciliation_required' })
    },
    async rejectHandoff(input) {
      const current = requireRecord()
      if (current.state === 'rejected') return current
      return update({
        ...current,
        state: 'rejected',
        commandRef: input.commandRef,
        commandDigest: input.commandDigest,
        decidedAt: input.rejectedAt,
        items: current.items.map(item => ({ ...item, decision: 'rejected' })),
      })
    },
    async expireHandoff(input) {
      return update({ ...requireRecord(), state: 'expired', decidedAt: input.expiredAt })
    },
    async listAcceptedForExport() {
      return record?.state === 'accepted' ? [record] : []
    },
  }
  return { port, get record() { return record } }
}

function harness(input: {
  enabled?: boolean
  membershipForRead?: () => HomeownerMembership | null
  bindingForRead?: () => HomeRecordHandoffRecipientBinding | null
  claimAdmission?: boolean
  scan?: () => HomeRecordHandoffScanResult
  fetchedBytes?: Uint8Array
  fetchThrows?: boolean
  sourceCurrent?: boolean | (() => boolean)
  sourceCurrentThrows?: boolean | (() => boolean)
  now?: () => string
  listExtraRecords?: () => readonly HomeRecordHandoffRecord[]
} = {}) {
  const persistence = persistenceHarness(input.listExtraRecords)
  const objects = new Map<string, Uint8Array>()
  let claimCalls = 0
  let claimAdmissionCalls = 0
  let lastClaimDigest: string | null = null
  let fetchCalls = 0
  let currentOfferCalls = 0
  const offer = { manifest: manifest(), authorization: authorization() }
  const options: HomeRecordHandoffServiceOptions = {
    enabled: input.enabled ?? true,
    identity: { async resolvePrincipal() { return principal } },
    repository: repository(input.membershipForRead ?? (() => membership)),
    recipients: {
      async resolveRecipientBinding(requestedRecipientRef) {
        if (requestedRecipientRef !== recipientRef) return null
        return input.bindingForRead ? input.bindingForRead() : {
          recipientRef,
          homeRef,
          controllerPrincipalRef: principalRef,
          revision: 2,
          state: 'active' as const,
        }
      },
      async reserveClaimAttempt(attempt) {
        claimAdmissionCalls += 1
        lastClaimDigest = attempt.claimDigest
        return input.claimAdmission ?? true
      },
    },
    trust: {
      async resolveJobroloAuthorizationKey(keyId) {
        return keyId === offer.authorization.signing.keyId ? jobroloKeys.publicKey : null
      },
    },
    source: {
      async claim() {
        claimCalls += 1
        return { state: 'active' as const, ...structuredClone(offer) }
      },
      async checkCurrent() {
        currentOfferCalls += 1
        const throws = typeof input.sourceCurrentThrows === 'function'
          ? input.sourceCurrentThrows()
          : input.sourceCurrentThrows === true
        if (throws) throw new Error('source unavailable')
        const current = typeof input.sourceCurrent === 'function'
          ? input.sourceCurrent()
          : input.sourceCurrent !== false
        return !current
          ? { state: 'not_available' as const }
          : { state: 'active' as const, ...structuredClone(offer) }
      },
      async fetchArtifact(request) {
        fetchCalls += 1
        if (input.fetchThrows) throw new Error('network uncertain')
        const item = offer.manifest.artifacts.find(candidate =>
          candidate.artifactRef === request.artifactRef)
        if (!item) throw new Error('missing')
        const bytes = input.fetchedBytes ?? pdf
        return {
          bytes,
          mediaType: item.mediaType,
          byteLength: bytes.byteLength,
          payloadSha256: digest(bytes),
        }
      },
    },
    signer: {
      keyId: 'homesrolo-test-2026-01',
      async sign(payload) {
        return signMessage(null, Buffer.from(payload, 'utf8'), homesroloKeys.privateKey)
          .toString('base64url')
      },
    },
    scanner: {
      async scan() {
        return input.scan?.() ?? {
          verdict: 'clean' as const,
          provider: 'local-test-scanner',
          version: '1',
          scannedAt: NOW,
        }
      },
    },
    persistence: persistence.port,
    objects: {
      async stageExactObject(stage) { objects.set(stage.storageObjectRef, stage.bytes) },
      async readAcceptedExactObject(read) {
        const bytes = objects.get(read.storageObjectRef)
        if (!bytes) throw new Error('missing object')
        return bytes
      },
    },
    now: input.now ?? (() => NOW),
  }
  return {
    service: new HomeRecordHandoffService(options),
    persistence,
    objects,
    get claimCalls() { return claimCalls },
    get claimAdmissionCalls() { return claimAdmissionCalls },
    get lastClaimDigest() { return lastClaimDigest },
    get fetchCalls() { return fetchCalls },
    get currentOfferCalls() { return currentOfferCalls },
  }
}

async function claimed(testHarness = harness()) {
  await testHarness.service.claim({ shareId, recipientRef })
  return testHarness
}

test('the activation seam is default-off before any source or recipient work', async () => {
  assert.equal(HOME_RECORD_HANDOFF_DEFAULT_ENABLED, false)
  const testHarness = harness({ enabled: false })
  await assert.rejects(
    testHarness.service.claim({ shareId, recipientRef }),
    /unavailable/,
  )
  assert.equal(testHarness.claimCalls, 0)
})

test('exact-share activation is controller-bound, admitted, and locally idempotent', async () => {
  const testHarness = harness()
  const first = await testHarness.service.claimForController(
    context,
    homeRef,
    shareId,
    recipientRef,
  )
  assert.equal(first.shareId, shareId)
  assert.equal(first.state, 'received')
  assert.equal(testHarness.claimAdmissionCalls, 1)
  assert.equal(testHarness.claimCalls, 1)
  assert.match(testHarness.lastClaimDigest ?? '', /^[a-f0-9]{64}$/)
  assert.notEqual(testHarness.lastClaimDigest, shareId)
  assert.equal((testHarness.lastClaimDigest ?? '').includes(shareId), false)

  const retry = await testHarness.service.claimForController(
    context,
    homeRef,
    shareId,
    recipientRef,
  )
  assert.deepEqual(retry, first)
  assert.equal(testHarness.claimAdmissionCalls, 1)
  assert.equal(testHarness.claimCalls, 1)
})

test('retry, list, and preview never expose a revoked received offer as reviewable', async () => {
  const operations = [
    (testHarness: ReturnType<typeof harness>) => testHarness.service.claimForController(
      context,
      homeRef,
      shareId,
      recipientRef,
    ),
    (testHarness: ReturnType<typeof harness>) =>
      testHarness.service.preview(context, homeRef, shareId),
  ]
  for (const operation of operations) {
    const testHarness = harness({ sourceCurrent: false })
    await testHarness.service.claim({ shareId, recipientRef })
    await assert.rejects(operation(testHarness), /conflict/)
    assert.equal(testHarness.currentOfferCalls, 1)
  }
  const listHarness = harness({ sourceCurrent: false })
  await listHarness.service.claim({ shareId, recipientRef })
  assert.deepEqual(await listHarness.service.list(context, homeRef), [])
  assert.equal(listHarness.currentOfferCalls, 1)
})

test('retry, list, and preview share the same received-offer expiry path', async () => {
  const operations = [
    async (testHarness: ReturnType<typeof harness>) =>
      (await testHarness.service.claimForController(
        context,
        homeRef,
        shareId,
        recipientRef,
      )).state,
    async (testHarness: ReturnType<typeof harness>) =>
      (await testHarness.service.list(context, homeRef))[0]?.state,
    async (testHarness: ReturnType<typeof harness>) =>
      (await testHarness.service.preview(context, homeRef, shareId)).state,
  ]
  for (const operation of operations) {
    let clock = NOW
    const testHarness = harness({ now: () => clock })
    await testHarness.service.claim({ shareId, recipientRef })
    clock = EXPIRES
    assert.equal(await operation(testHarness), 'expired')
    assert.equal(testHarness.currentOfferCalls, 0)
  }
})

test('a revoked or unreachable pending offer cannot hide an accepted receipt or export', async () => {
  const extraRecords: HomeRecordHandoffRecord[] = []
  let sourceCurrent = true
  let sourceCurrentThrows = false
  const testHarness = await claimed(harness({
    sourceCurrent: () => sourceCurrent,
    sourceCurrentThrows: () => sourceCurrentThrows,
    listExtraRecords: () => extraRecords,
  }))
  const preview = await testHarness.service.preview(context, homeRef, shareId)
  await testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'l'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  const accepted = testHarness.persistence.record
  assert.ok(accepted)
  extraRecords.push(parseHomeRecordHandoffRecord({
    recordVersion: accepted.recordVersion,
    handoffRef: ref('hhof', 'v'),
    homeRef: accepted.homeRef,
    controllerPrincipalRef: accepted.controllerPrincipalRef,
    recipientBindingRevision: accepted.recipientBindingRevision,
    manifest: accepted.manifest,
    authorization: accepted.authorization,
    manifestDigest: accepted.manifestDigest,
    authorizationReplayKey: accepted.authorizationReplayKey,
    offerDigest: accepted.offerDigest,
    state: 'received',
    receivedAt: accepted.receivedAt,
    expiresAt: accepted.expiresAt,
    items: accepted.items.map(item => ({
      sourceArtifactRef: item.sourceArtifactRef,
      projectionKind: item.projectionKind,
      projectionVersion: item.projectionVersion,
      mediaType: item.mediaType,
      byteLength: item.byteLength,
      payloadSha256: item.payloadSha256,
      displayName: item.displayName,
      decision: 'pending',
      copyState: 'not_started',
    })),
  }))
  sourceCurrent = false
  const listed = await testHarness.service.list(context, homeRef)
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.state, 'accepted')
  assert.equal((await testHarness.service.exportHomeRecord(context, homeRef)).mediaType,
    'application/zip')
  sourceCurrent = true
  sourceCurrentThrows = true
  const listedDuringOutage = await testHarness.service.list(context, homeRef)
  assert.equal(listedDuringOutage.length, 1)
  assert.equal(listedDuringOutage[0]?.state, 'accepted')
  assert.equal((await testHarness.service.exportHomeRecord(context, homeRef)).mediaType,
    'application/zip')
})

test('exact-share activation rejects wrong home, controller, and binding revision pre-network', async () => {
  const cases: readonly {
    readonly requestedHomeRef: string
    readonly bindingForRead?: () => HomeRecordHandoffRecipientBinding | null
  }[] = [
    { requestedHomeRef: otherHomeRef },
    {
      requestedHomeRef: homeRef,
      bindingForRead: () => ({
        recipientRef,
        homeRef,
        controllerPrincipalRef: ref('hprn', 'q'),
        revision: 2,
        state: 'active',
      }),
    },
    {
      requestedHomeRef: homeRef,
      bindingForRead: () => ({
        recipientRef,
        homeRef: otherHomeRef,
        controllerPrincipalRef: principalRef,
        revision: 2,
        state: 'active',
      }),
    },
    {
      requestedHomeRef: homeRef,
      bindingForRead: () => ({
        recipientRef,
        homeRef,
        controllerPrincipalRef: principalRef,
        revision: 0,
        state: 'active',
      }),
    },
  ]
  for (const testCase of cases) {
    const testHarness = harness({ bindingForRead: testCase.bindingForRead })
    await assert.rejects(
      testHarness.service.claimForController(
        context,
        testCase.requestedHomeRef,
        shareId,
        recipientRef,
      ),
      /not_found/,
    )
    assert.equal(testHarness.claimAdmissionCalls, 0)
    assert.equal(testHarness.claimCalls, 0)
  }
})

test('persisted claim admission denial maps to rate limited before producer I/O', async () => {
  const testHarness = harness({ claimAdmission: false })
  await assert.rejects(
    testHarness.service.claimForController(context, homeRef, shareId, recipientRef),
    /rate_limited/,
  )
  assert.equal(testHarness.claimAdmissionCalls, 1)
  assert.equal(testHarness.claimCalls, 0)
})

test('offer verification binds exact digest, completion-PDF policy, expiry, and Ed25519 signature', () => {
  const value = manifest()
  const receipt = authorization(value)
  const inspected = inspectHomeRecordHandoffOffer(
    { manifest: value, authorization: receipt },
    new Date(NOW),
  )
  assert.equal(inspected.manifestDigest, homeownerShareManifestDigest(value))
  assert.equal(verifyHomeRecordHandoffAuthorizationSignature(receipt, jobroloKeys.publicKey), true)
  assert.equal(verifyHomeRecordHandoffAuthorizationSignature(
    { ...receipt, signing: { ...receipt.signing, signature: Buffer.alloc(64).toString('base64url') } },
    jobroloKeys.publicKey,
  ), false)
  const aliasedSignature = nonCanonicalBase64urlAlias(receipt.signing.signature)
  assert.deepEqual(
    Buffer.from(aliasedSignature, 'base64url'),
    Buffer.from(receipt.signing.signature, 'base64url'),
  )
  assert.equal(verifyHomeRecordHandoffAuthorizationSignature({
    ...receipt,
    signing: { ...receipt.signing, signature: aliasedSignature },
  }, jobroloKeys.publicKey), false)
  const only = value.artifacts[0]!
  const rejected: readonly HomeownerShareManifest[] = [
    { ...value, artifacts: [{ ...only, projectionKind: 'work_document_copy' }] },
    {
      ...value,
      artifacts: [{
        ...only,
        projectionKind: 'work_photo_set',
        mediaType: 'image/jpeg',
        byteLength: jpeg.byteLength,
        sha256: digest(jpeg),
      }],
    },
    { ...value, artifacts: [{ ...only, projectionKind: 'work_warranty_record' }] },
    { ...value, artifacts: [{ ...only, projectionKind: 'work_invoice_receipt' }] },
    { ...value, artifacts: [{ ...only, projectionVersion: 2 }] },
    {
      ...value,
      artifacts: [{
        ...only,
        byteLength: HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES + 1,
      }],
    },
    {
      ...value,
      artifacts: [only, { ...only, artifactRef: ref('hproj', 'x') }],
    },
    {
      ...value,
      artifacts: [{
        ...only,
        mediaType: 'application/json',
        byteLength: 2,
        sha256: digest(Uint8Array.from([123, 125])),
      }],
    },
  ]
  for (const rejectedManifest of rejected) {
    assert.throws(() => inspectHomeRecordHandoffOffer({
      manifest: rejectedManifest,
      authorization: authorization(rejectedManifest),
    }, new Date(NOW)), /projection_not_allowed/)
  }
  assert.throws(() => inspectHomeRecordHandoffOffer(
    { manifest: value, authorization: receipt },
    new Date(EXPIRES),
  ), /expired/)
})

test('explicit acceptance copies the one clean completion PDF and exports it with provenance', async () => {
  const testHarness = await claimed()
  const preview = await testHarness.service.preview(context, homeRef, shareId)
  assert.equal(preview.items.length, 1)
  assert.equal(JSON.stringify(preview).includes('sha256'), false)
  const accepted = await testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'c'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  assert.equal(accepted.state, 'accepted')
  assert.equal(testHarness.fetchCalls, 1)
  assert.equal(testHarness.objects.size, 1)
  assert.equal(accepted.items[0]!.copyState, 'available')

  await assert.rejects(testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'x'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  }), /conflict/, 'an accepted replay cannot substitute a new command')
  await assert.rejects(testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'c'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [ref('hproj', 'z')],
    consentAccepted: true,
  }), /conflict/, 'an accepted replay cannot substitute an artifact')

  const replay = await testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'c'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  assert.equal(replay.state, 'accepted')
  assert.equal(testHarness.fetchCalls, 1)

  const exported = await testHarness.service.exportHomeRecord(context, homeRef)
  assert.equal(exported.mediaType, 'application/zip')
  assert.equal(exported.bytes[0], 0x50)
  assert.equal(exported.bytes[1], 0x4b)
  const zipText = Buffer.from(exported.bytes).toString('utf8')
  assert.match(zipText, /home-record-manifest\.json/)
  assert.match(zipText, /home-record-summary\.txt/)
  assert.match(zipText, /originals\/001-work-completion-record\.pdf/)
  assert.match(zipText, /homeowner-share\.authorization\.v1/)
  assert.match(zipText, /homeowner-share\.consent\.v1/)
  assert.match(zipText, /"sourceManifest"/)
  assert.match(zipText, /"contractVersion":"homeowner-share\.v1"/)
})

test('export rechecks the exact controller grant after the archive is built', async () => {
  let exporting = false
  let exportGrantReads = 0
  const testHarness = await claimed(harness({
    membershipForRead: () => {
      if (!exporting) return membership
      exportGrantReads += 1
      return exportGrantReads === 4
        ? { ...membership, revision: membership.revision + 1 }
        : membership
    },
  }))
  const preview = await testHarness.service.preview(context, homeRef, shareId)
  await testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'f'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  exporting = true
  await assert.rejects(
    testHarness.service.exportHomeRecord(context, homeRef),
    /not_found/,
  )
  assert.equal(exportGrantReads, 4,
    'initial, before-read, after-read, and final archive grants are all checked')
})

test('cross-home and non-controller review fail before source bytes or storage', async () => {
  const testHarness = await claimed(harness({
    membershipForRead: () => ({ ...membership, role: 'member' }),
  }))
  await assert.rejects(
    testHarness.service.preview(context, homeRef, shareId),
    /forbidden/,
  )
  await assert.rejects(
    testHarness.service.preview(context, otherHomeRef, shareId),
    /not_found/,
  )
  assert.equal(testHarness.fetchCalls, 0)
  assert.equal(testHarness.objects.size, 0)
})

test('digest mismatch and non-clean scan quarantine the whole package without visibility', async () => {
  const badBytesHarness = await claimed(harness({ fetchedBytes: jpeg }))
  const badPreview = await badBytesHarness.service.preview(context, homeRef, shareId)
  const badResult = await badBytesHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'd'),
    reviewedPreviewDigest: badPreview.previewDigest,
    selectedArtifactRefs: [badPreview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  assert.equal(badResult.state, 'quarantined')
  assert.equal(badBytesHarness.objects.size, 0)

  const scannerHarness = await claimed(harness({
    scan: () => ({
      verdict: 'rejected',
      provider: 'local-test-scanner',
      version: '1',
      scannedAt: NOW,
      reason: 'content_rejected',
    }),
  }))
  const scannerPreview = await scannerHarness.service.preview(context, homeRef, shareId)
  const scannerResult = await scannerHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'e'),
    reviewedPreviewDigest: scannerPreview.previewDigest,
    selectedArtifactRefs: [scannerPreview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  assert.equal(scannerResult.state, 'quarantined')
  assert.equal(scannerHarness.objects.size, 0)
})

test('uncertain artifact transfer is non-visible reconciliation and never auto-retried', async () => {
  const testHarness = await claimed(harness({ fetchThrows: true }))
  const preview = await testHarness.service.preview(context, homeRef, shareId)
  const result = await testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'u'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  })
  assert.equal(result.state, 'reconciliation_required')
  assert.equal(testHarness.fetchCalls, 1)
  assert.equal(testHarness.objects.size, 0)
  await assert.rejects(testHarness.service.accept(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'u'),
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [preview.items[0]!.artifactRef],
    consentAccepted: true,
  }), /conflict/)
  assert.equal(testHarness.fetchCalls, 1)
})

test('a homeowner may reject a reviewed package without fetching any artifact', async () => {
  const testHarness = await claimed()
  const preview = await testHarness.service.preview(context, homeRef, shareId)
  const rejected = await testHarness.service.reject(context, homeRef, shareId, {
    commandRef: ref('hcmd', 'r'),
    reviewedPreviewDigest: preview.previewDigest,
  })
  assert.equal(rejected.state, 'rejected')
  assert.equal(rejected.items.every(item => item.decision === 'rejected'), true)
  assert.equal(testHarness.fetchCalls, 0)
})
