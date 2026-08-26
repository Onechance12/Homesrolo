import { NativeApiError } from './client.ts'

const messages: Readonly<Record<string, string>> = Object.freeze({
  invalid_code: 'That code did not match. Check the six digits and try again.',
  rate_limited: 'Too many attempts. Give it a minute, then try again.',
  signed_out: 'Your session ended. Sign in again to keep going.',
  forbidden: 'Homesrolo could not confirm access to this home.',
  conflict: 'This record changed on another screen. Refresh it and try once more.',
  invalid_request: 'Something in that entry needs another look.',
  network_unavailable: 'Homesrolo could not reach the server. Check your connection and try again.',
  unsupported_file: 'Choose a PDF, JPEG, or PNG file under 10 MB.',
  invalid_file: 'That file could not be read completely. Try selecting it again.',
  empty_file: 'That file is empty or no longer available. Choose it again.',
  upload_failed: 'That file did not reach the private home record. Try the upload again.',
  camera_permission_required: 'Allow camera access to take a home photo.',
  photo_picker_recovery_failed: 'Android could not recover that camera result. Open the camera and try once more.',
  choose_jpeg_or_png: 'Choose a JPEG or PNG photo.',
  choose_pdf_jpeg_or_png: 'Choose a PDF, JPEG, or PNG file.',
})

export function friendlyError(error: unknown): string {
  const code = error instanceof NativeApiError
    ? error.code
    : error instanceof Error
      ? error.message
      : 'unavailable'
  return messages[code] || 'Homesrolo hit a snag. Nothing was lost—try again.'
}
