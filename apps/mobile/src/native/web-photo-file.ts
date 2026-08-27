import type { DeviceFile } from '../api/model.ts'

type WebPhotoMediaType = 'image/jpeg' | 'image/png'

/**
 * Keep the browser chooser aligned with the server contract. In particular,
 * `image/*` lets iPhone Safari return HEIC instead of its JPEG-compatible
 * representation.
 */
export const WEB_PHOTO_PICKER_MEDIA_TYPES = ['image/jpeg', 'image/png'] as const
export const WEB_PHOTO_CAMERA_CAPTURE = 'environment' as const

export interface WebPhotoObjectUrlRuntime {
  createObjectURL(file: Blob): string
  revokeObjectURL(uri: string): void
}

interface WebPhotoCameraInput {
  readonly files: FileList | null
  setAttribute(name: string, value: string): void
  addEventListener(type: 'change' | 'cancel', listener: () => void): void
  removeEventListener(type: 'change' | 'cancel', listener: () => void): void
  click(): void
  remove(): void
}

export interface WebPhotoCameraRuntime {
  createInput(): WebPhotoCameraInput
  readonly objectUrls: WebPhotoObjectUrlRuntime
}

export interface WebPhotoPickerAsset {
  readonly uri: string
  readonly name: string
  readonly mimeType?: string
  readonly size?: number
  readonly file?: Blob
}

export function webPhotoCameraInputAttributes(): Readonly<Record<string, string>> {
  return Object.freeze({
    type: 'file',
    accept: WEB_PHOTO_PICKER_MEDIA_TYPES.join(','),
    capture: WEB_PHOTO_CAMERA_CAPTURE,
  })
}

function browserCameraRuntime(): WebPhotoCameraRuntime {
  if (typeof document === 'undefined' || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    throw new Error('photo_picker_unavailable')
  }
  return {
    createInput: () => {
      const input = document.createElement('input')
      input.style.display = 'none'
      document.body.appendChild(input)
      return input
    },
    objectUrls: URL,
  }
}

/** Open the browser camera without ever advertising formats the server cannot store. */
export function pickWebCameraPhotoAsset(
  runtime: WebPhotoCameraRuntime = browserCameraRuntime(),
): Promise<WebPhotoPickerAsset | null> {
  let input: WebPhotoCameraInput | null = null
  try {
    input = runtime.createInput()
    for (const [name, value] of Object.entries(webPhotoCameraInputAttributes())) {
      input.setAttribute(name, value)
    }
  } catch {
    input?.remove()
    throw new Error('photo_picker_unavailable')
  }
  const cameraInput = input

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      cameraInput.removeEventListener('change', onChange)
      cameraInput.removeEventListener('cancel', onCancel)
      cameraInput.remove()
    }
    const finish = (asset: WebPhotoPickerAsset | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(asset)
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('photo_picker_failed'))
    }
    const onCancel = () => finish(null)
    const onChange = () => {
      const file = cameraInput.files?.item(0)
      if (!file) {
        finish(null)
        return
      }
      try {
        finish({
          uri: runtime.objectUrls.createObjectURL(file),
          name: file.name,
          mimeType: file.type,
          size: file.size,
          file,
        })
      } catch {
        fail()
      }
    }
    try {
      cameraInput.addEventListener('change', onChange)
      cameraInput.addEventListener('cancel', onCancel)
      cameraInput.click()
    } catch { fail() }
  })
}

function supportedMediaType(value: string | undefined): WebPhotoMediaType | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg'
  if (normalized === 'image/png') return 'image/png'
  return null
}

function extensionMediaType(name: string): WebPhotoMediaType | null {
  const extension = name.trim().toLowerCase().split('.').pop()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  return null
}

function normalizedPhotoName(name: string, mediaType: WebPhotoMediaType): string {
  const fallback = mediaType === 'image/png' ? 'home-photo.png' : 'home-photo.jpg'
  const clean = name.trim()
  if (!clean) return fallback
  const expected = mediaType === 'image/png' ? new Set(['png']) : new Set(['jpg', 'jpeg'])
  const extension = clean.toLowerCase().split('.').pop()
  if (extension && expected.has(extension)) return clean
  const leaf = clean.replace(/\.[^.]*$/, '').trim() || 'home-photo'
  return `${leaf}.${mediaType === 'image/png' ? 'png' : 'jpg'}`
}

/** Convert the exact browser-owned File into the upload model without copying its bytes. */
export function webPhotoDeviceFile(asset: WebPhotoPickerAsset): DeviceFile {
  const source = asset.file
  if (!source || !Number.isSafeInteger(source.size) || source.size < 1
    || (asset.size !== undefined && asset.size !== source.size)
    || !asset.uri.startsWith('blob:')) throw new Error('invalid_file')

  const fileMediaType = supportedMediaType(source.type)
  const declaredMediaType = supportedMediaType(asset.mimeType)
  // A present but unsupported MIME is authoritative. Filename fallback is for
  // browsers that omit MIME entirely, not a way to disguise HEIC or WebP.
  if ((source.type.trim() && !fileMediaType)
    || (asset.mimeType?.trim() && !declaredMediaType)
    || (fileMediaType && declaredMediaType && fileMediaType !== declaredMediaType)) {
    throw new Error('choose_jpeg_or_png')
  }
  const mediaType = fileMediaType ?? declaredMediaType ?? extensionMediaType(asset.name)
  if (!mediaType) throw new Error('choose_jpeg_or_png')

  return {
    uri: asset.uri,
    name: normalizedPhotoName(asset.name, mediaType),
    mediaType,
    byteLength: source.size,
    browserFile: source,
    lifecycle: 'external-source',
  }
}

/** The picker owns this Blob URL until the returned DeviceFile takes ownership. */
export function ownedWebPhotoDeviceFile(
  asset: WebPhotoPickerAsset,
  objectUrls: Pick<WebPhotoObjectUrlRuntime, 'revokeObjectURL'> = URL,
): DeviceFile {
  try {
    return webPhotoDeviceFile(asset)
  } catch (error) {
    if (asset.uri.startsWith('blob:')) {
      try { objectUrls.revokeObjectURL(asset.uri) } catch { /* Best-effort picker cleanup. */ }
    }
    throw error
  }
}

export async function pickWebCameraPhoto(
  runtime: WebPhotoCameraRuntime = browserCameraRuntime(),
): Promise<DeviceFile | null> {
  const asset = await pickWebCameraPhotoAsset(runtime)
  return asset ? ownedWebPhotoDeviceFile(asset, runtime.objectUrls) : null
}
