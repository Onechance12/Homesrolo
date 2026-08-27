import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ownedWebPhotoDeviceFile,
  pickWebCameraPhoto,
  pickWebCameraPhotoAsset,
  WEB_PHOTO_CAMERA_CAPTURE,
  WEB_PHOTO_PICKER_MEDIA_TYPES,
  webPhotoCameraInputAttributes,
  webPhotoDeviceFile,
  type WebPhotoCameraRuntime,
} from './web-photo-file.ts'

function asset(overrides: Partial<Parameters<typeof webPhotoDeviceFile>[0]> = {}) {
  const file = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])], {
    type: 'image/jpeg',
  })
  return {
    uri: 'blob:https://app.homesrolo.com/photo',
    name: 'IMG_1234.jpg',
    mimeType: 'image/jpeg',
    size: file.size,
    file,
    ...overrides,
  }
}

test('web photo chooser advertises only the server-supported image types', () => {
  assert.deepEqual(WEB_PHOTO_PICKER_MEDIA_TYPES, ['image/jpeg', 'image/png'])
  assert.doesNotMatch(WEB_PHOTO_PICKER_MEDIA_TYPES.join(','), /\*|heic|webp|gif/i)
  const camera = webPhotoCameraInputAttributes()
  assert.equal(camera.accept, WEB_PHOTO_PICKER_MEDIA_TYPES.join(','))
  assert.doesNotMatch(camera.accept ?? '', /\*/)
  assert.equal(camera.capture, WEB_PHOTO_CAMERA_CAPTURE)
  assert.equal(camera.capture, 'environment')
})

test('keeps exact browser bytes and normalizes a transcoded iPhone filename', () => {
  const selected = webPhotoDeviceFile(asset({ name: 'IMG_1234.HEIC' }))
  assert.equal(selected.name, 'IMG_1234.jpg')
  assert.equal(selected.mediaType, 'image/jpeg')
  assert.equal(selected.byteLength, selected.browserFile?.size)
  assert.equal(selected.lifecycle, 'external-source')
})

test('accepts PNG and falls back to an exact extension only when MIME is absent', () => {
  const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])])
  const { mimeType: _mimeType, ...withoutMimeType } = asset({
    name: 'kitchen.PNG',
    size: png.size,
    file: png,
  })
  const selected = webPhotoDeviceFile(withoutMimeType)
  assert.equal(selected.name, 'kitchen.PNG')
  assert.equal(selected.mediaType, 'image/png')
})

test('rejects HEIC, WebP, missing browser bytes, and inconsistent sizes', () => {
  for (const type of ['image/heic', 'image/webp']) {
    const unsupported = new Blob(['unsupported'], { type })
    assert.throws(() => webPhotoDeviceFile(asset({
      name: type === 'image/heic' ? 'IMG_1234.HEIC' : 'photo.webp',
      mimeType: type,
      size: unsupported.size,
      file: unsupported,
    })), /choose_jpeg_or_png/)
  }
  const { file: _file, ...withoutFile } = asset()
  assert.throws(() => webPhotoDeviceFile(withoutFile), /invalid_file/)
  assert.throws(() => webPhotoDeviceFile(asset({ size: 999 })), /invalid_file/)
  assert.throws(() => webPhotoDeviceFile(asset({ uri: 'file:///tmp/photo.jpg' })), /invalid_file/)
})

function cameraRuntime(file: File | null, event: 'change' | 'cancel' = 'change') {
  const attributes = new Map<string, string>()
  const listeners = new Map<'change' | 'cancel', () => void>()
  const revoked: string[] = []
  let removed = false
  const runtime: WebPhotoCameraRuntime = {
    createInput: () => ({
      files: file ? {
        0: file,
        length: 1,
        item: (index: number) => index === 0 ? file : null,
      } as unknown as FileList : null,
      setAttribute: (name, value) => { attributes.set(name, value) },
      addEventListener: (name, listener) => { listeners.set(name, listener) },
      removeEventListener: name => { listeners.delete(name) },
      click: () => { listeners.get(event)?.() },
      remove: () => { removed = true },
    }),
    objectUrls: {
      createObjectURL: () => 'blob:https://app.homesrolo.com/camera-photo',
      revokeObjectURL: uri => { revoked.push(uri) },
    },
  }
  return {
    runtime,
    attributes,
    revoked,
    removed: () => removed,
  }
}

test('web camera requests the rear camera and returns the exact browser File', async () => {
  const file = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])], 'camera.jpg', {
    type: 'image/jpeg',
  })
  const fixture = cameraRuntime(file)
  const selected = await pickWebCameraPhoto(fixture.runtime)
  assert.equal(fixture.attributes.get('accept'), 'image/jpeg,image/png')
  assert.equal(fixture.attributes.get('capture'), 'environment')
  assert.equal(selected?.browserFile, file)
  assert.equal(selected?.uri, 'blob:https://app.homesrolo.com/camera-photo')
  assert.equal(fixture.removed(), true)
})

test('web camera cancel removes its temporary input without creating a URL', async () => {
  const fixture = cameraRuntime(null, 'cancel')
  assert.equal(await pickWebCameraPhotoAsset(fixture.runtime), null)
  assert.equal(fixture.removed(), true)
  assert.deepEqual(fixture.revoked, [])
})

test('adapter failure revokes the picker-owned Blob URL', () => {
  const unsupported = new Blob(['unsupported'], { type: 'image/heic' })
  const revoked: string[] = []
  assert.throws(() => ownedWebPhotoDeviceFile(asset({
    uri: 'blob:https://app.homesrolo.com/unsupported-photo',
    name: 'IMG_1234.HEIC',
    mimeType: 'image/heic',
    size: unsupported.size,
    file: unsupported,
  }), {
    revokeObjectURL: uri => { revoked.push(uri) },
  }), /choose_jpeg_or_png/)
  assert.deepEqual(revoked, ['blob:https://app.homesrolo.com/unsupported-photo'])
})
