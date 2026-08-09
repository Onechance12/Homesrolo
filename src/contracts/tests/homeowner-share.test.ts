import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  HOMEOWNER_SHARE_LAUNCH_APPROVED_PROJECTION_KINDS,
  HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES,
  HOMEOWNER_SHARE_MAX_ARTIFACTS,
  HOMEOWNER_SHARE_MAX_MANIFEST_BYTES,
  HOMEOWNER_SHARE_MAX_TOTAL_ARTIFACT_BYTES,
  HOMEOWNER_SHARE_PURPOSE,
  homeownerShareAuthorizationReplayKey,
  homeownerShareAuthorizationSigningPayload,
  homeownerShareCanonicalJson,
  homeownerShareConsentReplayKey,
  homeownerShareConsentSigningPayload,
  homeownerShareExternalFailure,
  homeownerShareManifestDigest,
  homeownerSharePhase0DeliveryDecision,
  homeownerShareReplayDisposition,
  homeownerShareRevocationReplayKey,
  homeownerShareRevocationSigningPayload,
  inspectHomeownerShareRevocationStructuralCompatibility,
  inspectHomeownerShareStructuralCompatibility,
  parseHomeownerShareAuthorizationReceipt,
  parseHomeownerShareConsentReceipt,
  parseHomeownerShareManifest,
  parseHomeownerShareRevocationReceipt,
  type HomeownerShareAuthorizationReceipt,
  type HomeownerShareConsentReceipt,
  type HomeownerShareManifest,
  type HomeownerShareRevocationReceipt,
} from '../homeowner-share.v1.ts'

const opaque = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const signature = (character: string) => Buffer.alloc(64, character.charCodeAt(0))
  .toString('base64url')
const ISSUED_AT = '2026-08-08T12:00:00.000Z'
const AUTHORIZED_AT = '2026-08-08T12:01:00.000Z'
const ACCEPTED_AT = '2026-08-08T12:02:00.000Z'
const EXPIRES_AT = '2026-08-15T12:00:00.000Z'
const NOW = new Date('2026-08-08T13:00:00.000Z')

function artifact(index = 0) {
  const character = String.fromCharCode(97 + index)
  return {
    artifactRef: opaque('hproj', character),
    source: 'homeowner_release' as const,
    projectionKind: 'work_status_summary' as const,
    projectionVersion: 1,
    mediaType: 'application/json' as const,
    byteLength: 1024,
    sha256: character.repeat(64),
  }
}

function manifest(): HomeownerShareManifest {
  return {
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    shareId: opaque('hshr', 's'),
    recipientRef: opaque('hrcp', 'r'),
    generation: 1,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    nonce: opaque('hnce', 'n'),
    artifacts: [artifact()],
  }
}

function authorization(
  value = manifest(),
): HomeownerShareAuthorizationReceipt {
  return {
    receiptVersion: 'homeowner-share.authorization.v1',
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    authorizationId: opaque('hauth', 'a'),
    shareId: value.shareId,
    recipientRef: value.recipientRef,
    manifestDigest: homeownerShareManifestDigest(value),
    manifestContractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    authorizedByRole: 'owner',
    authorizedActorRef: opaque('hactor', 'o'),
    authorizationPolicyVersion: 'jobrolo-homeowner-disclosure.v1',
    authorizedAt: AUTHORIZED_AT,
    expiresAt: value.expiresAt,
    signing: {
      algorithm: 'Ed25519',
      keyId: 'jobrolo-2026-01',
      signature: signature('A'),
    },
  }
}

function consent(value = manifest()): HomeownerShareConsentReceipt {
  return {
    receiptVersion: 'homeowner-share.consent.v1',
    issuer: 'homesrolo',
    audience: 'jobrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    consentId: opaque('hcons', 'c'),
    shareId: value.shareId,
    recipientRef: value.recipientRef,
    manifestDigest: homeownerShareManifestDigest(value),
    manifestContractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    consentPolicyVersion: 'homesrolo-share-consent.v1',
    acceptedAt: ACCEPTED_AT,
    expiresAt: value.expiresAt,
    signing: {
      algorithm: 'Ed25519',
      keyId: 'homesrolo-2026-01',
      signature: signature('B'),
    },
  }
}

function revocation(value = manifest()): HomeownerShareRevocationReceipt {
  const authorizationReceipt = authorization(value)
  return {
    receiptVersion: 'homeowner-share.revocation.v1',
    issuer: 'jobrolo',
    audience: 'homesrolo',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    revocationId: opaque('hrev', 'v'),
    shareId: value.shareId,
    recipientRef: value.recipientRef,
    manifestDigest: homeownerShareManifestDigest(value),
    revokedReceiptVersion: authorizationReceipt.receiptVersion,
    revokedReceiptRef: authorizationReceipt.authorizationId,
    reasonCode: 'authorization_withdrawn',
    revokedAt: '2026-08-08T12:30:00.000Z',
    signing: {
      algorithm: 'Ed25519',
      keyId: 'jobrolo-2026-01',
      signature: signature('C'),
    },
  }
}

const validManifest = manifest()
const validAuthorization = authorization(validManifest)
const validConsent = consent(validManifest)
const validRevocation = revocation(validManifest)

assert.deepEqual(parseHomeownerShareManifest(validManifest), validManifest)
assert.deepEqual(parseHomeownerShareAuthorizationReceipt(validAuthorization), validAuthorization)
assert.deepEqual(parseHomeownerShareConsentReceipt(validConsent), validConsent)
assert.deepEqual(parseHomeownerShareRevocationReceipt(validRevocation), validRevocation)
assert.equal(Buffer.byteLength(homeownerShareCanonicalJson(validManifest), 'utf8')
  < HOMEOWNER_SHARE_MAX_MANIFEST_BYTES, true)

const compatible = inspectHomeownerShareStructuralCompatibility({
  manifest: validManifest,
  authorization: validAuthorization,
  consent: validConsent,
  now: NOW,
})
assert.deepEqual(compatible, {
  structurallyCompatible: true,
  manifestDigest: homeownerShareManifestDigest(validManifest),
})
assert.deepEqual(homeownerSharePhase0DeliveryDecision({
  manifest: validManifest,
  authorization: validAuthorization,
  consent: validConsent,
  now: NOW,
}), {
  authorized: false,
  reason: 'phase0_no_projection_policy_approved',
}, 'Phase 0 must remain impossible to activate through parsed contract data')
assert.deepEqual(HOMEOWNER_SHARE_LAUNCH_APPROVED_PROJECTION_KINDS, [])
assert.equal(Object.isFrozen(HOMEOWNER_SHARE_LAUNCH_APPROVED_PROJECTION_KINDS), true)
assert.deepEqual(inspectHomeownerShareRevocationStructuralCompatibility({
  manifest: validManifest,
  target: validAuthorization,
  revocation: validRevocation,
  now: NOW,
}), {
  structurallyCompatible: true,
  manifestDigest: homeownerShareManifestDigest(validManifest),
})

{
  const reordered = {
    artifacts: validManifest.artifacts,
    nonce: validManifest.nonce,
    expiresAt: validManifest.expiresAt,
    issuedAt: validManifest.issuedAt,
    generation: validManifest.generation,
    recipientRef: validManifest.recipientRef,
    shareId: validManifest.shareId,
    purpose: validManifest.purpose,
    audience: validManifest.audience,
    issuer: validManifest.issuer,
    contractVersion: validManifest.contractVersion,
  }
  assert.equal(homeownerShareCanonicalJson(validManifest), homeownerShareCanonicalJson(reordered))
  assert.equal(homeownerShareManifestDigest(validManifest), homeownerShareManifestDigest(reordered))
}

{
  const signingPayload = homeownerShareAuthorizationSigningPayload(validAuthorization)
  assert.equal(signingPayload.includes(validAuthorization.signing.signature), false)
  const changed = structuredClone(validAuthorization)
  changed.signing.keyId = 'jobrolo-2026-02'
  assert.notEqual(signingPayload, homeownerShareAuthorizationSigningPayload(changed))
}
{
  const signingPayload = homeownerShareConsentSigningPayload(validConsent)
  assert.equal(signingPayload.includes(validConsent.signing.signature), false)
  const changed = structuredClone(validConsent)
  changed.signing.keyId = 'homesrolo-2026-02'
  assert.notEqual(signingPayload, homeownerShareConsentSigningPayload(changed))
}
{
  const signingPayload = homeownerShareRevocationSigningPayload(validRevocation)
  assert.equal(signingPayload.includes(validRevocation.signing.signature), false)
  const changed = structuredClone(validRevocation)
  changed.signing.keyId = 'jobrolo-2026-02'
  assert.notEqual(signingPayload, homeownerShareRevocationSigningPayload(changed))
}

assert.equal(homeownerShareAuthorizationReplayKey(validAuthorization),
  homeownerShareAuthorizationReplayKey(structuredClone(validAuthorization)))
assert.equal(homeownerShareConsentReplayKey(validConsent),
  homeownerShareConsentReplayKey(structuredClone(validConsent)))
assert.equal(homeownerShareRevocationReplayKey(validRevocation),
  homeownerShareRevocationReplayKey(structuredClone(validRevocation)))
assert.equal(homeownerShareReplayDisposition(validConsent, structuredClone(validConsent)), 'exact_replay')
assert.throws(() => homeownerShareReplayDisposition({ a: 1, b: undefined }, { a: 1 }),
  /undefined/)
assert.throws(() => homeownerShareReplayDisposition({ value: -0 }, { value: 0 }),
  /negative zero/)
{
  const changed = structuredClone(validConsent)
  changed.shareId = opaque('hshr', 'x')
  assert.equal(homeownerShareConsentReplayKey(validConsent),
    homeownerShareConsentReplayKey(changed))
  assert.equal(homeownerShareReplayDisposition(validConsent, changed), 'conflict')
}
{
  const changed = structuredClone(validAuthorization)
  changed.recipientRef = opaque('hrcp', 'x')
  assert.equal(homeownerShareAuthorizationReplayKey(validAuthorization),
    homeownerShareAuthorizationReplayKey(changed))
  assert.equal(homeownerShareReplayDisposition(validAuthorization, changed), 'conflict')
}
{
  const changed = structuredClone(validRevocation)
  changed.revokedReceiptRef = opaque('hauth', 'z')
  assert.equal(homeownerShareRevocationReplayKey(validRevocation),
    homeownerShareRevocationReplayKey(changed))
  assert.equal(homeownerShareReplayDisposition(validRevocation, changed), 'conflict')
}
for (const mutate of [
  (value: HomeownerShareAuthorizationReceipt) => { value.shareId = opaque('hshr', 'x') },
  (value: HomeownerShareAuthorizationReceipt) => { value.recipientRef = opaque('hrcp', 'x') },
  (value: HomeownerShareAuthorizationReceipt) => { value.manifestDigest = 'f'.repeat(64) },
]) {
  const changed = structuredClone(validAuthorization)
  mutate(changed)
  assert.equal(homeownerShareAuthorizationReplayKey(changed),
    homeownerShareAuthorizationReplayKey(validAuthorization))
  assert.equal(homeownerShareReplayDisposition(validAuthorization, changed), 'conflict')
}
for (const mutate of [
  (value: HomeownerShareConsentReceipt) => { value.shareId = opaque('hshr', 'x') },
  (value: HomeownerShareConsentReceipt) => { value.recipientRef = opaque('hrcp', 'x') },
  (value: HomeownerShareConsentReceipt) => { value.manifestDigest = 'f'.repeat(64) },
]) {
  const changed = structuredClone(validConsent)
  mutate(changed)
  assert.equal(homeownerShareConsentReplayKey(changed),
    homeownerShareConsentReplayKey(validConsent))
  assert.equal(homeownerShareReplayDisposition(validConsent, changed), 'conflict')
}
for (const mutate of [
  (value: HomeownerShareRevocationReceipt) => { value.shareId = opaque('hshr', 'x') },
  (value: HomeownerShareRevocationReceipt) => { value.recipientRef = opaque('hrcp', 'x') },
  (value: HomeownerShareRevocationReceipt) => { value.manifestDigest = 'f'.repeat(64) },
  (value: HomeownerShareRevocationReceipt) => {
    value.revokedReceiptRef = opaque('hauth', 'z')
  },
]) {
  const changed = structuredClone(validRevocation)
  mutate(changed)
  assert.equal(homeownerShareRevocationReplayKey(changed),
    homeownerShareRevocationReplayKey(validRevocation))
  assert.equal(homeownerShareReplayDisposition(validRevocation, changed), 'conflict')
}
assert.throws(() => homeownerShareCanonicalJson(new Date(ISSUED_AT)), /plain objects/)

function pairDecision(input: {
  manifest?: HomeownerShareManifest
  authorization?: HomeownerShareAuthorizationReceipt
  consent?: HomeownerShareConsentReceipt
  now?: Date
}) {
  return inspectHomeownerShareStructuralCompatibility({
    manifest: input.manifest ?? validManifest,
    authorization: input.authorization ?? validAuthorization,
    consent: input.consent ?? validConsent,
    now: input.now ?? NOW,
  })
}

{
  const changed = structuredClone(validAuthorization)
  changed.shareId = opaque('hshr', 'x')
  assert.deepEqual(pairDecision({ authorization: changed }), {
    structurallyCompatible: false, reason: 'contract_mismatch',
  })
}
{
  const changed = structuredClone(validConsent)
  changed.recipientRef = opaque('hrcp', 'x')
  assert.deepEqual(pairDecision({ consent: changed }), {
    structurallyCompatible: false, reason: 'contract_mismatch',
  })
}
{
  const changed = structuredClone(validConsent)
  changed.manifestDigest = 'f'.repeat(64)
  assert.deepEqual(pairDecision({ consent: changed }), {
    structurallyCompatible: false, reason: 'manifest_mismatch',
  })
}
{
  const changed = structuredClone(validAuthorization)
  changed.authorizedAt = '2026-08-08T11:59:59.999Z'
  assert.deepEqual(pairDecision({ authorization: changed }), {
    structurallyCompatible: false, reason: 'contract_mismatch',
  })
}
{
  const changed = structuredClone(validConsent)
  changed.acceptedAt = '2026-08-08T12:00:30.000Z'
  assert.deepEqual(pairDecision({ consent: changed }), {
    structurallyCompatible: false, reason: 'contract_mismatch',
  })
}
assert.deepEqual(pairDecision({ now: new Date(EXPIRES_AT) }), {
  structurallyCompatible: false, reason: 'not_available',
}, 'expiry equality must be expired')
assert.deepEqual(pairDecision({ now: new Date('2026-08-08T11:59:59.999Z') }), {
  structurallyCompatible: false, reason: 'not_yet_valid',
})
assert.equal(homeownerShareExternalFailure('not_available'), 'not_available')
assert.equal(homeownerShareExternalFailure('manifest_mismatch'), 'contract_mismatch')

for (const forbiddenKind of [
  'policy',
  'carrier_correspondence',
  'claim_strategy',
  'internal_note',
  'margin',
  'memory',
  'thresher_result',
]) {
  const value = structuredClone(validManifest) as unknown as Record<string, unknown>
  ;((value.artifacts as Array<Record<string, unknown>>)[0]!).projectionKind = forbiddenKind
  assert.throws(() => parseHomeownerShareManifest(value),
    `${forbiddenKind} must not become a homeowner projection`)
}

for (const [field, value] of [
  ['filename', 'Chance-123-Main-policy.pdf'],
  ['label', '123 Main Street'],
  ['url', 'https://storage.example/private'],
  ['customerName', 'Chance Pearson'],
  ['email', 'chance@example.com'],
  ['phone', '+18065550100'],
  ['address', '123 Main Street'],
  ['claimNumber', 'CLM-123'],
  ['metadata', { note: 'internal' }],
] as const) {
  const poisoned = structuredClone(validManifest) as unknown as Record<string, unknown>
  ;((poisoned.artifacts as Array<Record<string, unknown>>)[0]!)[field] = value
  assert.throws(() => parseHomeownerShareManifest(poisoned),
    `${field} must not cross the homeowner manifest`)
}

{
  const poisoned = structuredClone(validManifest) as unknown as Record<string, unknown>
  poisoned.projectId = 'project_internal'
  assert.throws(() => parseHomeownerShareManifest(poisoned))
}
{
  const poisoned = structuredClone(validManifest)
  poisoned.recipientRef = 'chance@example.com'
  assert.throws(() => parseHomeownerShareManifest(poisoned))
}
{
  const poisoned = structuredClone(validManifest) as unknown as Record<string, unknown>
  ;(poisoned as { signing?: unknown }).signing = { keyId: 'unexpected' }
  assert.throws(() => parseHomeownerShareManifest(poisoned))
}
{
  const duplicate = structuredClone(validManifest)
  duplicate.artifacts = [artifact(), artifact()]
  assert.throws(() => parseHomeownerShareManifest(duplicate), /unique/)
}
{
  const tooMany = structuredClone(validManifest)
  tooMany.artifacts = Array.from({ length: HOMEOWNER_SHARE_MAX_ARTIFACTS + 1 }, (_, index) =>
    artifact(index % 26))
  assert.throws(() => parseHomeownerShareManifest(tooMany))
}
{
  const tooLarge = structuredClone(validManifest)
  tooLarge.artifacts[0]!.byteLength = HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES + 1
  assert.throws(() => parseHomeownerShareManifest(tooLarge))
}
{
  const aggregate = structuredClone(validManifest)
  aggregate.artifacts = Array.from({ length: 5 }, (_, index) => ({
    ...artifact(index),
    byteLength: HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES,
  }))
  assert.equal(aggregate.artifacts.reduce((sum, item) => sum + item.byteLength, 0)
    > HOMEOWNER_SHARE_MAX_TOTAL_ARTIFACT_BYTES, true)
  assert.throws(() => parseHomeownerShareManifest(aggregate), /aggregate/)
}
{
  const tooShort = structuredClone(validManifest)
  tooShort.expiresAt = '2026-08-09T11:59:59.999Z'
  assert.throws(() => parseHomeownerShareManifest(tooShort), /lifetime/)
}
{
  const tooLong = structuredClone(validManifest)
  tooLong.expiresAt = '2026-09-07T12:00:00.001Z'
  assert.throws(() => parseHomeownerShareManifest(tooLong), /lifetime/)
}
{
  const badAuthorization = structuredClone(validAuthorization)
  badAuthorization.authorizedByRole = 'manager' as 'owner'
  assert.throws(() => parseHomeownerShareAuthorizationReceipt(badAuthorization))
}
{
  const badRevocation = structuredClone(validRevocation)
  badRevocation.issuer = 'homesrolo'
  assert.throws(() => parseHomeownerShareRevocationReceipt(badRevocation), /do not match/)
}
{
  const badRevocation = structuredClone(validRevocation)
  badRevocation.revokedReceiptRef = opaque('hauth', 'z')
  assert.deepEqual(inspectHomeownerShareRevocationStructuralCompatibility({
    manifest: validManifest,
    target: validAuthorization,
    revocation: badRevocation,
    now: NOW,
  }), { structurallyCompatible: false, reason: 'contract_mismatch' })
}
{
  const badRevocation = structuredClone(validRevocation)
  badRevocation.revokedAt = '2026-08-08T12:00:59.999Z'
  assert.deepEqual(inspectHomeownerShareRevocationStructuralCompatibility({
    manifest: validManifest,
    target: validAuthorization,
    revocation: badRevocation,
    now: NOW,
  }), { structurallyCompatible: false, reason: 'contract_mismatch' })
}
{
  const aliasedSignature = structuredClone(validAuthorization)
  aliasedSignature.signing.signature = `${aliasedSignature.signing.signature.slice(0, -1)}B`
  assert.throws(() => parseHomeownerShareAuthorizationReceipt(aliasedSignature), /canonical/)
}
{
  const unicodeKey = structuredClone(validAuthorization)
  unicodeKey.signing.keyId = 'jobrolo-chancé'
  assert.throws(() => parseHomeownerShareAuthorizationReceipt(unicodeKey))
}

const contractDirectory = path.resolve(process.cwd(), 'src/contracts')
const contractSource = readFileSync(
  path.join(contractDirectory, 'homeowner-share.v1.ts'),
  'utf8',
)
assert.equal(createHash('sha256').update(contractSource, 'utf8').digest('hex'),
  '38013ef4e1255026b7964732e79bfcee0df2e3d4430d897de3425f7c931daa9c')
for (const forbiddenImport of [
  '@/lib/db',
  '@prisma/client',
  '/collaboration',
  '/agent',
  '/jobs',
  '/tools',
]) {
  assert.equal(contractSource.includes(forbiddenImport), false,
    `Phase 0 contract must not import live surface ${forbiddenImport}`)
}
assert.doesNotMatch(contractSource, /\b(?:hcn|jobnimbus|thresher)\b/i)

function filesUnder(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesUnder(absolute))
    else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name)) files.push(absolute)
  }
  return files
}

for (const sourceFile of filesUnder(path.resolve(process.cwd(), 'src'))) {
  if (sourceFile.startsWith(`${contractDirectory}${path.sep}`)) continue
  const source = readFileSync(sourceFile, 'utf8')
  assert.doesNotMatch(source,
    /(?:from\s*['"][^'"]*homeowner-share|require\([^)]*homeowner-share|import\([^)]*homeowner-share)/,
    `Phase 0 must not be imported by live source: ${path.relative(process.cwd(), sourceFile)}`)
}
// Normative cross-repository wire vector. Homesrolo must reproduce these exact
// UTF-8 bytes and digests before either side may implement transport.
const WIRE_GOLDEN = {
  manifestJson: '{"artifacts":[{"artifactRef":"hproj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","byteLength":1024,"mediaType":"application/json","projectionKind":"work_status_summary","projectionVersion":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":"homeowner_release"}],"audience":"homesrolo","contractVersion":"homeowner-share.v1","expiresAt":"2026-08-15T12:00:00.000Z","generation":1,"issuedAt":"2026-08-08T12:00:00.000Z","issuer":"jobrolo","nonce":"hnce_nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn","purpose":"homeowner_work_records","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}',
  manifestDigest: '1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1',
  authorizationSigningPayload: '{"audience":"homesrolo","authorizationId":"hauth_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","authorizationPolicyVersion":"jobrolo-homeowner-disclosure.v1","authorizedActorRef":"hactor_ooooooooooooooooooooooooooooooooooooooooooo","authorizedAt":"2026-08-08T12:01:00.000Z","authorizedByRole":"owner","expiresAt":"2026-08-15T12:00:00.000Z","issuer":"jobrolo","manifestContractVersion":"homeowner-share.v1","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","purpose":"homeowner_work_records","receiptVersion":"homeowner-share.authorization.v1","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss","signing":{"algorithm":"Ed25519","keyId":"jobrolo-2026-01"}}',
  consentSigningPayload: '{"acceptedAt":"2026-08-08T12:02:00.000Z","audience":"jobrolo","consentId":"hcons_ccccccccccccccccccccccccccccccccccccccccccc","consentPolicyVersion":"homesrolo-share-consent.v1","expiresAt":"2026-08-15T12:00:00.000Z","issuer":"homesrolo","manifestContractVersion":"homeowner-share.v1","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","purpose":"homeowner_work_records","receiptVersion":"homeowner-share.consent.v1","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss","signing":{"algorithm":"Ed25519","keyId":"homesrolo-2026-01"}}',
  revocationSigningPayload: '{"audience":"homesrolo","issuer":"jobrolo","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","purpose":"homeowner_work_records","reasonCode":"authorization_withdrawn","receiptVersion":"homeowner-share.revocation.v1","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","revocationId":"hrev_vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv","revokedAt":"2026-08-08T12:30:00.000Z","revokedReceiptRef":"hauth_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","revokedReceiptVersion":"homeowner-share.authorization.v1","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss","signing":{"algorithm":"Ed25519","keyId":"jobrolo-2026-01"}}',
  authorizationReplayKey: '532afbc246fd5be873839be88a3ad811c083529204e1fafc3e51bae49328575f',
  consentReplayKey: '801f74c84aca67311a2d53a3f3aa458f38ed9ad54fdd2f66208f6bc23cf1ca48',
  revocationReplayKey: 'dcd1f96647db72262610750e78256bcae0c8ba1a19567e6238a5f635b6b66e0a',
} as const
assert.equal(homeownerShareCanonicalJson(validManifest), WIRE_GOLDEN.manifestJson)
assert.equal(homeownerShareManifestDigest(validManifest), WIRE_GOLDEN.manifestDigest)
assert.equal(homeownerShareAuthorizationSigningPayload(validAuthorization),
  WIRE_GOLDEN.authorizationSigningPayload)
assert.equal(homeownerShareConsentSigningPayload(validConsent), WIRE_GOLDEN.consentSigningPayload)
assert.equal(homeownerShareRevocationSigningPayload(validRevocation),
  WIRE_GOLDEN.revocationSigningPayload)
assert.equal(homeownerShareAuthorizationReplayKey(validAuthorization),
  WIRE_GOLDEN.authorizationReplayKey)
assert.equal(homeownerShareConsentReplayKey(validConsent), WIRE_GOLDEN.consentReplayKey)
assert.equal(homeownerShareRevocationReplayKey(validRevocation), WIRE_GOLDEN.revocationReplayKey)
console.log('homeowner share Phase 0 contracts passed')
