import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOMEOWNER_ARTIFACT_MAX_BYTES,
  safeArtifactDisplayName,
  validateHomeownerArtifactPayload,
} from '../homeowner-artifacts.v1.ts'
import {
  homeownerArtifactMetadataCommandIntent,
  updateHomeownerArtifactMetadataInputSchema,
} from '../homeowner-artifact-metadata.v1.ts'

const bytes = (text: string) => new TextEncoder().encode(text)

test('private artifact validation detects PDF, JPEG, and PNG from bytes', () => {
  const pdf = validateHomeownerArtifactPayload({
    kind: 'document',
    displayName: '  roof / contract.pdf  ',
    bytes: bytes('%PDF-1.7\nrecord'),
  })
  assert.equal(pdf.mediaType, 'application/pdf')
  assert.equal(pdf.displayName, 'roof contract.pdf')
  assert.match(pdf.payloadSha256, /^[a-f0-9]{64}$/)

  const jpeg = validateHomeownerArtifactPayload({
    kind: 'photo',
    displayName: 'damage.jpg',
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
  })
  assert.equal(jpeg.mediaType, 'image/jpeg')

  const png = validateHomeownerArtifactPayload({
    kind: 'warranty',
    displayName: 'warranty.png',
    bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  })
  assert.equal(png.mediaType, 'image/png')
})

test('private artifact validation rejects spoofed, empty, and oversized content', () => {
  assert.throws(() => validateHomeownerArtifactPayload({
    kind: 'photo',
    displayName: 'photo.jpg',
    bytes: bytes('%PDF-1.7\nnot a photo'),
  }), /artifact_media_type_invalid/)
  assert.throws(() => validateHomeownerArtifactPayload({
    kind: 'document',
    displayName: 'notes.txt',
    bytes: bytes('plain text'),
  }), /artifact_media_type_invalid/)
  assert.throws(() => validateHomeownerArtifactPayload({
    kind: 'document',
    displayName: 'empty.pdf',
    bytes: new Uint8Array(),
  }), /artifact_byte_length_invalid/)
  assert.throws(() => validateHomeownerArtifactPayload({
    kind: 'document',
    displayName: 'large.pdf',
    bytes: new Uint8Array(HOMEOWNER_ARTIFACT_MAX_BYTES + 1),
  }), /artifact_byte_length_invalid/)
})

test('display labels cannot smuggle paths or response-header controls', () => {
  assert.equal(safeArtifactDisplayName('../folder\\roof\r\n.pdf'), '.. folder roof .pdf')
  assert.equal(safeArtifactDisplayName('..'), null)
  assert.equal(safeArtifactDisplayName('\u0000/'), null)
})

test('artifact photo metadata accepts only explicit bounded dates, phases, areas, and geo provenance', () => {
  const command = {
    commandRef: `hcmd_${'c'.repeat(43)}`,
    artifactRef: `hart_${'a'.repeat(43)}`,
    expectedRevision: 1,
    projectRef: `hprj_${'p'.repeat(43)}`,
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
    requestedAt: '2026-08-10T12:00:00.000Z',
  }
  assert.deepEqual(updateHomeownerArtifactMetadataInputSchema.parse(command), command)
  assert.deepEqual(
    homeownerArtifactMetadataCommandIntent(command),
    homeownerArtifactMetadataCommandIntent({
      ...command,
      requestedAt: '2026-08-10T12:01:00.000Z',
    }),
    'execution time never changes the retry digest',
  )

  for (const invalid of [
    { ...command, observedOn: '2026-02-30' },
    { ...command, observedOn: '2026-08-11' },
    { ...command, phase: 'complete' },
    { ...command, areaLabel: 'Rear\u0001yard' },
    { ...command, geoPin: { ...command.geoPin, latitude: 91 } },
    { ...command, geoPin: { ...command.geoPin, provenance: 'exif_inferred' } },
    { ...command, geoPin: { ...command.geoPin, capturedAt: '2026-08-11T12:00:00.000Z' } },
  ]) {
    assert.equal(updateHomeownerArtifactMetadataInputSchema.safeParse(invalid).success, false)
  }
})
