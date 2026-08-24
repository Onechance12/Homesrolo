import assert from 'node:assert/strict'
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import test from 'node:test'
import {
  Ed25519HomeRecordHandoffSigner,
  LocalClamAvHomeRecordHandoffScanner,
  PinnedHomeRecordHandoffTrust,
  homeRecordHandoffActivationCredentialsSeparated,
  homeRecordHandoffReleaseEnvironmentAllowed,
  readHomeRecordHandoffSecurityConfiguration,
} from '../server/home-record-handoff-security.ts'
import { HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES } from '../../../../src/homeowner/home-record-handoff.v1.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const jobrolo = generateKeyPairSync('ed25519')
const homesrolo = generateKeyPairSync('ed25519')

test('production activation is code-blocked in this release', () => {
  assert.equal(homeRecordHandoffReleaseEnvironmentAllowed('production'), false)
  assert.equal(homeRecordHandoffReleaseEnvironmentAllowed('development'), true)
  assert.equal(homeRecordHandoffReleaseEnvironmentAllowed('test'), true)
  assert.equal(homeRecordHandoffReleaseEnvironmentAllowed(undefined), false)
})

function environment() {
  return {
    HOMESROLO_HOME_RECORD_HANDOFF_ENABLED: 'true',
    HOMESROLO_HOME_RECORD_HANDOFF_RECIPIENT_REF: ref('hrcp', 'r'),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID:
      'jobrolo-inbound-signing-key-2026-01',
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64:
      jobrolo.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID:
      'homesrolo-outbound-signing-key-2026-01',
    HOMESROLO_HOME_RECORD_HANDOFF_ED25519_PRIVATE_KEY_PKCS8_BASE64:
      homesrolo.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_HOST: '127.0.0.1',
    HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_PORT: '3310',
    HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_VERSION: 'clamav-1.4.3',
  }
}

test('handoff security is independently default-off and requires exact Ed25519 keys', () => {
  assert.equal(readHomeRecordHandoffSecurityConfiguration({}), null)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_ENABLED: 'false',
  }), null)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_HOST: 'scanner.example.test',
  }), null)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64:
      homesrolo.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  }), null)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID:
      environment().HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID,
  }), null)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64:
      homesrolo.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  }), null)
  const homesroloSeed = homesrolo.privateKey.export({ format: 'jwk' }).d
  assert.ok(homesroloSeed)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID: homesroloSeed,
  }), null, 'a public signing key id cannot expose private seed material')
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID:
      environment().HOMESROLO_HOME_RECORD_HANDOFF_RECIPIENT_REF,
  }), null)
  const jobroloPublicMaterial = jobrolo.publicKey.export({ format: 'jwk' }).x
  assert.ok(jobroloPublicMaterial)
  assert.equal(readHomeRecordHandoffSecurityConfiguration({
    ...environment(),
    HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID: jobroloPublicMaterial,
  }), null)
  const configuration = readHomeRecordHandoffSecurityConfiguration(environment())
  assert.ok(configuration)
  assert.equal(configuration.recipientRef, ref('hrcp', 'r'))
  assert.equal(configuration.clamavPort, 3310)
})

test('activation rejects credential reuse across identifiers, keys, encodings, and prior intake', () => {
  const security = readHomeRecordHandoffSecurityConfiguration(environment())
  assert.ok(security)
  const transport = {
    origin: 'https://jobrolo.com',
    clientId: 'homesrolo-handoff-client-2026-01',
    sharedSecret: 'dedicated-handoff-secret-at-least-thirty-two-bytes',
  }
  assert.equal(homeRecordHandoffActivationCredentialsSeparated(transport, security), true)
  const rawHmac = 'R'.repeat(32)
  assert.equal(homeRecordHandoffActivationCredentialsSeparated({
    ...transport,
    sharedSecret: rawHmac,
  }, {
    ...security,
    jobroloKeyId: Buffer.from(rawHmac, 'utf8').toString('base64url'),
  }), false, 'encoded and raw credential identifiers are the same material')

  for (const reused of [
    transport.clientId,
    security.recipientRef,
    security.jobroloKeyId,
    security.homesroloKeyId,
  ]) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated({
      ...transport,
      sharedSecret: reused,
    }, security), false, `shared secret reused ${reused}`)
  }
  for (const reused of [
    security.recipientRef,
    security.jobroloKeyId,
    security.homesroloKeyId,
  ]) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated({
      ...transport,
      clientId: reused,
    }, security), false, `client id reused ${reused}`)
  }

  const homesroloPublic = createPublicKey(security.homesroloPrivateKey)
  const derMaterial = [
    Buffer.from(security.jobroloPublicKey.export({ format: 'der', type: 'spki' })),
    Buffer.from(security.homesroloPrivateKey.export({ format: 'der', type: 'pkcs8' })),
    Buffer.from(homesroloPublic.export({ format: 'der', type: 'spki' })),
  ]
  const jwkMaterial = [
    security.jobroloPublicKey.export({ format: 'jwk' }).x,
    security.homesroloPrivateKey.export({ format: 'jwk' }).d,
    security.homesroloPrivateKey.export({ format: 'jwk' }).x,
    homesroloPublic.export({ format: 'jwk' }).x,
  ].filter((value): value is string => typeof value === 'string')
  const encodedMaterial = derMaterial.flatMap(material => [
    material.toString('latin1'),
    material.toString('base64'),
    material.toString('base64url'),
    material.toString('hex'),
    material.toString('hex').toUpperCase(),
    material.toString('hex').split('').map((character, index) =>
      index % 2 === 0 ? character.toUpperCase() : character).join(''),
  ])
  for (const reused of [...encodedMaterial, ...jwkMaterial]) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated({
      ...transport,
      sharedSecret: reused,
    }, security), false, 'shared secret aliases key material')
  }
  for (const reused of jwkMaterial) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated({
      ...transport,
      clientId: reused,
    }, security), false, 'authorization client id aliases raw key material')
  }

  const intake = {
    endpoint: 'https://jobrolo.com/api/integrations/homesrolo/v1/project-intakes',
    clientId: 'prior-intake-client-identity-0001',
    sharedSecret: 'prior-intake-shared-secret-00000001',
  }
  for (const [clientId, sharedSecret] of [
    [intake.clientId, transport.sharedSecret],
    [intake.sharedSecret, transport.sharedSecret],
    [transport.clientId, intake.clientId],
    [transport.clientId, intake.sharedSecret],
  ] as const) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated({
      ...transport,
      clientId,
      sharedSecret,
    }, security, intake), false)
  }
  for (const reused of [
    transport.clientId,
    transport.sharedSecret,
    security.recipientRef,
    security.jobroloKeyId,
    security.homesroloKeyId,
  ]) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated(
      transport,
      security,
      { ...intake, clientId: reused },
    ), false, 'prior intake client id must be pairwise distinct')
    assert.equal(homeRecordHandoffActivationCredentialsSeparated(
      transport,
      security,
      { ...intake, sharedSecret: reused },
    ), false, 'prior intake secret must be pairwise distinct')
  }
  const homesroloSeed = security.homesroloPrivateKey.export({ format: 'jwk' }).d
  assert.ok(homesroloSeed)
  for (const unsafeIntake of [
    { ...intake, clientId: homesroloSeed },
    { ...intake, sharedSecret: homesroloSeed },
    { ...intake, sharedSecret: derMaterial[1]!.toString('hex').toUpperCase() },
    { ...intake, sharedSecret: intake.clientId },
  ]) {
    assert.equal(homeRecordHandoffActivationCredentialsSeparated(
      transport,
      security,
      unsafeIntake,
    ), false, 'prior intake credentials cannot alias identifiers or key material')
  }
  assert.equal(homeRecordHandoffActivationCredentialsSeparated({
    ...transport,
    sharedSecret: rawHmac,
  }, security, {
    clientId: Buffer.from(rawHmac, 'utf8').toString('base64url'),
    sharedSecret: 'I'.repeat(32),
  }), false, 'cross-lane identifiers cannot encode another credential')
  assert.equal(homeRecordHandoffActivationCredentialsSeparated(
    transport,
    security,
    { ...intake, clientId: 'separate-intake-client', sharedSecret: 'z'.repeat(40) },
  ), true)
})

test('pinned trust resolves only the configured Jobrolo key and signer emits Ed25519', async () => {
  const trust = new PinnedHomeRecordHandoffTrust('jobrolo-key', jobrolo.publicKey)
  assert.equal(await trust.resolveJobroloAuthorizationKey('other-key'), null)
  assert.equal(await trust.resolveJobroloAuthorizationKey('jobrolo-key'), jobrolo.publicKey)

  const signer = new Ed25519HomeRecordHandoffSigner('homesrolo-key', homesrolo.privateKey)
  const payload = 'exact consent payload'
  const signature = await signer.sign(payload)
  assert.equal(verify(
    null,
    Buffer.from(payload, 'utf8'),
    homesrolo.publicKey,
    Buffer.from(signature, 'base64url'),
  ), true)
})

test('local ClamAV scanner verifies the input digest and treats unknown replies as failure', async () => {
  const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF\n'))
  const expectedSha256 = createHash('sha256').update(bytes).digest('hex')
  const clean = new LocalClamAvHomeRecordHandoffScanner({
    host: '127.0.0.1',
    port: 3310,
    version: 'test-clamav',
    transport: async () => 'stream: OK',
    now: () => '2026-08-24T15:00:00.000Z',
  })
  assert.deepEqual(await clean.scan({
    bytes,
    mediaType: 'application/pdf',
    expectedSha256,
  }), {
    verdict: 'clean',
    provider: 'local-clamav',
    version: 'test-clamav',
    scannedAt: '2026-08-24T15:00:00.000Z',
  })

  const rejected = new LocalClamAvHomeRecordHandoffScanner({
    host: 'localhost',
    port: 3310,
    version: 'test-clamav',
    transport: async () => 'stream: Eicar-Test-Signature FOUND',
  })
  assert.equal((await rejected.scan({
    bytes,
    mediaType: 'application/pdf',
    expectedSha256,
  })).verdict, 'rejected')
  await assert.rejects(clean.scan({
    bytes,
    mediaType: 'application/pdf',
    expectedSha256: '0'.repeat(64),
  }), /handoff_scan_input_invalid/)
  const oversized = new Uint8Array(HOME_RECORD_HANDOFF_MAX_ARTIFACT_BYTES + 1)
  await assert.rejects(clean.scan({
    bytes: oversized,
    mediaType: 'application/pdf',
    expectedSha256: createHash('sha256').update(oversized).digest('hex'),
  }), /handoff_scan_input_invalid/)
  await assert.rejects(clean.scan({
    bytes,
    mediaType: 'image/jpeg' as 'application/pdf',
    expectedSha256,
  }), /handoff_scan_input_invalid/)
})
