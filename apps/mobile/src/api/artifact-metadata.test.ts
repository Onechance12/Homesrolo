import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  artifactMetadataUpdateBody,
  parseArtifactRecord,
} from './artifact-metadata.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const legacy = {
  artifactRef: ref('hart', 'a'),
  homeRef: ref('hhom', 'h'),
  projectRef: null,
  kind: 'photo',
  displayName: 'Rear yard.jpg',
  mediaType: 'image/jpeg',
  byteLength: 123,
  createdAt: '2026-08-10T12:00:00.000Z',
}

test('normalizes pre-metadata artifacts and parses confirmed geo pins', () => {
  assert.deepEqual(parseArtifactRecord(legacy), {
    ...legacy,
    observedOn: null,
    phase: null,
    areaLabel: null,
    geoPin: null,
    revision: 1,
    updatedAt: legacy.createdAt,
  })

  const geoPin = {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracyMeters: 8.5,
    capturedAt: '2026-08-09T18:30:00.000Z',
    provenance: 'device_confirmed',
  }
  const parsed = parseArtifactRecord({
    ...legacy,
    projectRef: ref('hprj', 'p'),
    observedOn: '2026-08-09',
    phase: 'before',
    areaLabel: 'Rear yard',
    geoPin,
    revision: 2,
    updatedAt: '2026-08-10T12:01:00.000Z',
  })
  assert.equal(parsed.phase, 'before')
  assert.deepEqual(parsed.geoPin, geoPin)
  assert.equal(parsed.revision, 2)
})

test('builds one strict full-replacement update body and rejects silent location provenance', () => {
  const input = {
    commandRef: ref('hcmd', 'c'),
    expectedRevision: 1,
    projectRef: ref('hprj', 'p'),
    observedOn: '2026-08-09',
    phase: 'after' as const,
    areaLabel: 'Pool equipment pad',
    geoPin: {
      latitude: 32.7555,
      longitude: -97.3308,
      accuracyMeters: 12,
      capturedAt: '2026-08-09T18:30:00.000Z',
      provenance: 'device_confirmed' as const,
    },
  }
  assert.deepEqual(artifactMetadataUpdateBody(input), input)
  assert.throws(() => artifactMetadataUpdateBody({
    ...input,
    geoPin: { ...input.geoPin, provenance: 'exif_inferred' } as never,
  }), /invalid_wire_data/)
  assert.throws(() => artifactMetadataUpdateBody({
    ...input,
    observedOn: '2026-02-30',
  }), /invalid_wire_data/)
  assert.throws(() => parseArtifactRecord({
    ...legacy,
    kind: 'document',
    phase: 'reference',
  }), /invalid_wire_data/)
  assert.throws(() => parseArtifactRecord({
    ...legacy,
    storageObjectRef: ref('hobj', 's'),
  }), /invalid_wire_data/)
  assert.throws(() => parseArtifactRecord({
    ...legacy,
    observedOn: '2026-08-11',
    updatedAt: '2026-08-10T12:01:00.000Z',
  }), /invalid_wire_data/)
  assert.throws(() => parseArtifactRecord({
    ...legacy,
    geoPin: {
      ...input.geoPin,
      capturedAt: '2026-08-11T12:00:00.000Z',
    },
    updatedAt: '2026-08-10T12:01:00.000Z',
  }), /invalid_wire_data/)
})
