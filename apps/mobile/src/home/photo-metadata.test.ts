import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResolvedArtifactRecord } from '../api/model.ts'
import {
  artifactMetadataReplacement,
  newPhotoMetadataDraft,
  normalizeExistingPhotoMetadataDraft,
  normalizePhotoMetadataDraft,
} from './photo-metadata.ts'

test('new photo details start on the phone calendar date without requesting a location', () => {
  assert.deepEqual(newPhotoMetadataDraft(new Date(2026, 7, 28, 23, 50)), {
    observedOn: '2026-08-28',
    phase: 'reference',
    areaLabel: '',
    pinCurrentLocation: false,
  })
})

test('legacy photo edits preserve an unknown observed date without inventing one', () => {
  assert.deepEqual(normalizeExistingPhotoMetadataDraft({
    observedOn: '   ',
    phase: 'reference',
    areaLabel: '  Hall   closet ',
    pinCurrentLocation: false,
  }, '2026-08-28'), {
    observedOn: null,
    phase: 'reference',
    areaLabel: 'Hall closet',
    pinCurrentLocation: false,
  })
  assert.throws(() => normalizeExistingPhotoMetadataDraft({
    observedOn: '2026-08-29',
    phase: 'reference',
    areaLabel: '',
    pinCurrentLocation: false,
  }, '2026-08-28'))
})

test('photo details normalize useful homeowner labels and reject future dates', () => {
  assert.deepEqual(normalizePhotoMetadataDraft({
    observedOn: '2026-08-28',
    phase: 'before',
    areaLabel: '  Living   room  ',
    pinCurrentLocation: true,
  }, '2026-08-28'), {
    observedOn: '2026-08-28',
    phase: 'before',
    areaLabel: 'Living room',
    pinCurrentLocation: true,
  })
  assert.throws(() => normalizePhotoMetadataDraft({
    observedOn: '2026-08-29',
    phase: 'reference',
    areaLabel: '',
    pinCurrentLocation: false,
  }, '2026-08-28'))
})

test('revisioned metadata updates preserve every field not intentionally replaced', () => {
  const artifact: ResolvedArtifactRecord = {
    artifactRef: 'hart_' + 'a'.repeat(43),
    homeRef: 'hhom_' + 'b'.repeat(43),
    projectRef: null,
    kind: 'photo',
    displayName: 'wall.jpg',
    mediaType: 'image/jpeg',
    byteLength: 123,
    observedOn: '2026-08-28',
    phase: 'before',
    areaLabel: 'Living room',
    geoPin: null,
    revision: 2,
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:01:00.000Z',
  }
  assert.deepEqual(artifactMetadataReplacement(artifact, {
    projectRef: 'hprj_' + 'c'.repeat(43),
  }), {
    projectRef: 'hprj_' + 'c'.repeat(43),
    observedOn: '2026-08-28',
    phase: 'before',
    areaLabel: 'Living room',
    geoPin: null,
  })
})
