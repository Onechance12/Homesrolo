import assert from 'node:assert/strict'
import test from 'node:test'
import type { DeviceFile } from '../api/model.ts'
import { revokeBrowserDeviceFileUrl } from './device-file-url.ts'

function deviceFile(uri: string, browserFile?: Blob): DeviceFile {
  return {
    uri,
    name: 'photo.jpg',
    mediaType: 'image/jpeg',
    byteLength: browserFile?.size ?? 12,
    ...(browserFile ? { browserFile } : {}),
    lifecycle: 'external-source',
  }
}

test('revokes only a browser picker Blob URL', () => {
  const revoked: string[] = []
  const objectUrls = { revokeObjectURL: (uri: string) => { revoked.push(uri) } }
  const blobUri = 'blob:https://app.homesrolo.com/temporary-photo'

  assert.equal(revokeBrowserDeviceFileUrl(
    deviceFile(blobUri, new Blob(['photo'])), objectUrls,
  ), true)
  assert.deepEqual(revoked, [blobUri])

  assert.equal(revokeBrowserDeviceFileUrl(deviceFile('file:///private/photo.jpg'), objectUrls), false)
  assert.equal(revokeBrowserDeviceFileUrl(
    deviceFile('file:///private/photo.jpg', new Blob(['photo'])), objectUrls,
  ), false)
  assert.equal(revokeBrowserDeviceFileUrl(deviceFile(blobUri), objectUrls), false)
  assert.equal(revokeBrowserDeviceFileUrl(
    deviceFile('https://example.test/photo.jpg', new Blob(['photo'])), objectUrls,
  ), false)
  assert.deepEqual(revoked, [blobUri])
})

test('a browser revocation failure does not authorize any file deletion', () => {
  const selected = deviceFile(
    'blob:https://app.homesrolo.com/temporary-photo',
    new Blob(['photo']),
  )
  assert.equal(revokeBrowserDeviceFileUrl(selected, {
    revokeObjectURL: () => { throw new Error('unavailable') },
  }), false)
  assert.equal(selected.lifecycle, 'external-source')
})
