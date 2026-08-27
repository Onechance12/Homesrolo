import type { ArtifactKind, ArtifactMediaType, DeviceFile } from './model.ts'

export function mediaTypeForArtifactBytes(bytes: Uint8Array): ArtifactMediaType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50
    && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d
    && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

/** Reads the browser-owned picker object without putting its bytes in a URI or serialized value. */
export async function browserDeviceFileBytes(deviceFile: DeviceFile): Promise<ArrayBuffer> {
  const source = deviceFile.browserFile
  if (!source || !Number.isSafeInteger(source.size) || source.size < 1
    || source.size !== deviceFile.byteLength) throw new Error('invalid_file')
  let payload: ArrayBuffer
  try { payload = await source.arrayBuffer() } catch { throw new Error('invalid_file') }
  if (payload.byteLength !== deviceFile.byteLength) throw new Error('invalid_file')
  return payload
}

export function validatedArtifactPayloadMediaType(
  deviceFile: DeviceFile,
  kind: ArtifactKind,
  payload: ArrayBuffer,
): ArtifactMediaType {
  if (payload.byteLength !== deviceFile.byteLength) throw new Error('invalid_file')
  const mediaType = mediaTypeForArtifactBytes(new Uint8Array(payload))
  if (!mediaType || mediaType !== deviceFile.mediaType
    || (kind === 'photo' && mediaType === 'application/pdf')) {
    throw new Error('unsupported_file')
  }
  return mediaType
}
