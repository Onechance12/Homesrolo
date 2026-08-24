import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import test from 'node:test'
import {
  Ed25519HomeRecordHandoffSigner,
  LocalClamAvHomeRecordHandoffScanner,
  PinnedHomeRecordHandoffTrust,
  readHomeRecordHandoffSecurityConfiguration,
} from '../server/home-record-handoff-security.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const jobrolo = generateKeyPairSync('ed25519')
const homesrolo = generateKeyPairSync('ed25519')

function environment() {
  return {
    HOMESROLO_HOME_RECORD_HANDOFF_ENABLED: 'true',
    HOMESROLO_HOME_RECORD_HANDOFF_RECIPIENT_REF: ref('hrcp', 'r'),
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID: 'jobrolo-handoff-2026-01',
    HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64:
      jobrolo.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID: 'homesrolo-handoff-2026-01',
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
  const configuration = readHomeRecordHandoffSecurityConfiguration(environment())
  assert.ok(configuration)
  assert.equal(configuration.recipientRef, ref('hrcp', 'r'))
  assert.equal(configuration.clamavPort, 3310)
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
})
