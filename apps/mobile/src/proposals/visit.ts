export interface SavedEstimateVisit {
  readonly company: string
  readonly date: string
  readonly time: string
  readonly startsAt: Date
  readonly uid: string
}

export function localVisitStart(date: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null
  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (hour > 23 || minute > 59) return null
  const value = new Date(year, month - 1, day, hour, minute, 0, 0)
  return value.getFullYear() === year && value.getMonth() === month - 1
    && value.getDate() === day && value.getHours() === hour
    && value.getMinutes() === minute
    ? value
    : null
}

export function estimateVisitMilestone(company: string, startsAt: Date): string {
  return `Estimate or service visit with ${company.trim()} — ${startsAt.toLocaleString()}`
}

function utcStamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('invalid_calendar_date')
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function calendarText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/** RFC 5545 content lines are folded at 75 UTF-8 octets. */
function foldLine(line: string): string {
  const parts: string[] = []
  let part = ''
  let maximum = 75
  for (const character of line) {
    const next = `${part}${character}`
    if (new TextEncoder().encode(next).byteLength > maximum && part) {
      parts.push(part)
      part = character
      maximum = 74 // continuation whitespace consumes the first octet
    } else {
      part = next
    }
  }
  parts.push(part)
  return parts.join('\r\n ')
}

export function estimateVisitCalendar(input: {
  readonly projectTitle: string
  readonly company: string
  readonly startsAt: Date
  readonly uid: string
  readonly createdAt: Date
}): string {
  const endsAt = new Date(input.startsAt.getTime() + 60 * 60 * 1_000)
  const uid = input.uid.trim()
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(uid)
    || !input.projectTitle.trim() || !input.company.trim()) {
    throw new Error('invalid_calendar_event')
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Homesrolo//Estimate visit//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@homesrolo.com`,
    `DTSTAMP:${utcStamp(input.createdAt)}`,
    `DTSTART:${utcStamp(input.startsAt)}`,
    `DTEND:${utcStamp(endsAt)}`,
    `SUMMARY:${calendarText(`Estimate visit — ${input.projectTitle.trim()}`)}`,
    `DESCRIPTION:${calendarText(`Estimate or service visit with ${input.company.trim()}. Saved from Homesrolo.`)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

export function visitCalendarFilename(projectTitle: string): string {
  const stem = projectTitle
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 70)
  return `${stem || 'home-project'}-visit.ics`
}
