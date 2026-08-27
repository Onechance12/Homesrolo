import type { DeviceFile } from '../api/model.ts'

interface ObjectUrlRuntime {
  revokeObjectURL(uri: string): void
}

/**
 * Releases only the temporary URL created for a browser picker File. A native
 * file URI, a remote URL, or an unowned Blob URL is never touched here.
 */
export function revokeBrowserDeviceFileUrl(
  file: DeviceFile,
  objectUrls: ObjectUrlRuntime = URL,
): boolean {
  if (!file.browserFile) return false
  let protocol: string
  try { protocol = new URL(file.uri).protocol } catch { return false }
  if (protocol !== 'blob:') return false
  try {
    objectUrls.revokeObjectURL(file.uri)
    return true
  } catch {
    return false
  }
}
