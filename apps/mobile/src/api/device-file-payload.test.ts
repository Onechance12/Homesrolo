import assert from 'node:assert/strict'
import test from 'node:test'
import type { DeviceFile } from './model.ts'
import {
  browserDeviceFileBytes,
  validatedArtifactPayloadMediaType,
} from './device-file-payload.ts'

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00])

function browserFile(
  bytes: Uint8Array = jpegBytes,
  overrides: Partial<DeviceFile> = {},
): DeviceFile {
  const copied = new Uint8Array(bytes.length)
  copied.set(bytes)
  return {
    uri: 'blob:https://app.homesrolo.com/private-picker-ref',
    name: 'home-photo.jpg',
    mediaType: 'image/jpeg',
    byteLength: copied.byteLength,
    browserFile: new Blob([copied.buffer], { type: 'image/jpeg' }),
    lifecycle: 'external-source',
    ...overrides,
  }
}

test('reads exact browser picker bytes and validates their file signature', async () => {
  const selected = browserFile()
  const payload = await browserDeviceFileBytes(selected)
  assert.deepEqual(new Uint8Array(payload), jpegBytes)
  assert.equal(validatedArtifactPayloadMediaType(selected, 'photo', payload), 'image/jpeg')
})

test('browser picker bytes are mandatory and must match declared size', async () => {
  const selected = browserFile()
  const { browserFile: _browserFile, ...withoutBrowserFile } = selected
  await assert.rejects(browserDeviceFileBytes(withoutBrowserFile), /invalid_file/)
  await assert.rejects(browserDeviceFileBytes(browserFile(jpegBytes, {
    byteLength: jpegBytes.byteLength + 1,
  })), /invalid_file/)
})

test('rejects unsupported, spoofed, and photo-PDF browser payloads', async () => {
  const unsupported = browserFile(Uint8Array.from([1, 2, 3, 4]))
  await assert.rejects(async () => validatedArtifactPayloadMediaType(
    unsupported, 'document', await browserDeviceFileBytes(unsupported),
  ), /unsupported_file/)

  const spoofed = browserFile(jpegBytes, { mediaType: 'image/png' })
  await assert.rejects(async () => validatedArtifactPayloadMediaType(
    spoofed, 'photo', await browserDeviceFileBytes(spoofed),
  ), /unsupported_file/)

  const pdfBytes = new TextEncoder().encode('%PDF-1.7\nprivate')
  const pdf = browserFile(pdfBytes, {
    name: 'invoice.pdf',
    mediaType: 'application/pdf',
    browserFile: new Blob([pdfBytes], { type: 'application/pdf' }),
  })
  await assert.rejects(async () => validatedArtifactPayloadMediaType(
    pdf, 'photo', await browserDeviceFileBytes(pdf),
  ), /unsupported_file/)
  assert.equal(validatedArtifactPayloadMediaType(
    pdf, 'document', await browserDeviceFileBytes(pdf),
  ), 'application/pdf')
})
