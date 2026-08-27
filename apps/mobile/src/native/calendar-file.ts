import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'

function downloadCalendarWeb(contents: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Hands one local calendar file to the device. It never requests calendar-account access. */
export async function openCalendarFile(contents: string, filename: string): Promise<void> {
  if (!contents.startsWith('BEGIN:VCALENDAR\r\n') || !contents.endsWith('END:VCALENDAR\r\n')
    || !/^[a-z0-9][a-z0-9-]{0,79}\.ics$/.test(filename)) {
    throw new Error('invalid_calendar_file')
  }
  if (Platform.OS === 'web') {
    downloadCalendarWeb(contents, filename)
    return
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('calendar_share_unavailable')
  const file = new File(Paths.cache, 'homesrolo-calendar', filename)
  try {
    file.create({ intermediates: true, overwrite: true })
    file.write(contents)
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Add visit to your calendar',
      mimeType: 'text/calendar',
      UTI: 'public.calendar-event',
    })
  } finally {
    try { if (file.exists) file.delete() } catch { /* Cache cleanup is best effort. */ }
  }
}
