import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArtifactRecord, DeviceFile } from '../api/model.ts'
import { roloPhotoConsentKey, type RoloPhotoAttachment } from './photo-consent.ts'

const artifactRef = `hart_${'A'.repeat(43)}`
const savedArtifact: ArtifactRecord = {
  artifactRef,
  homeRef: `hhom_${'H'.repeat(43)}`,
  projectRef: null,
  kind: 'photo',
  displayName: 'water-heater.jpg',
  mediaType: 'image/jpeg',
  byteLength: 128,
  createdAt: '2026-08-26T12:00:00.000Z',
}
const pendingFile: DeviceFile = {
  uri: 'file:///private/photo.jpg',
  name: 'photo.jpg',
  mediaType: 'image/jpeg',
  byteLength: 128,
  lifecycle: 'external-source',
}

test('binds photo approval to the exact attachment and normalized message', () => {
  const saved: RoloPhotoAttachment = { state: 'saved', artifact: savedArtifact }
  const approved = roloPhotoConsentKey(saved, '  What is visible here?  ')

  assert.equal(approved, roloPhotoConsentKey(saved, 'What is visible here?'))
  assert.notEqual(approved, roloPhotoConsentKey(saved, 'Does insurance cover this?'))
  assert.notEqual(approved, roloPhotoConsentKey({
    state: 'saved',
    artifact: { ...savedArtifact, artifactRef: `hart_${'B'.repeat(43)}` },
  }, 'What is visible here?'))
  assert.equal(roloPhotoConsentKey(saved, '   '), null)
  assert.equal(roloPhotoConsentKey(null, 'What is visible here?'), null)
})

test('requires fresh approval after a pending photo becomes a saved artifact', () => {
  const pending: RoloPhotoAttachment = { state: 'pending', file: pendingFile }
  const saved: RoloPhotoAttachment = { state: 'saved', artifact: savedArtifact }
  assert.notEqual(
    roloPhotoConsentKey(pending, 'Please review this.'),
    roloPhotoConsentKey(saved, 'Please review this.'),
  )
})
