import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateVisitCalendar,
  estimateVisitMilestone,
  localVisitStart,
  visitCalendarFilename,
} from './visit.ts'

test('parses only real local visit dates and 24-hour times', () => {
  const valid = localVisitStart('2026-08-27', '14:30')
  assert.ok(valid)
  assert.equal(valid.getFullYear(), 2026)
  assert.equal(valid.getMonth(), 7)
  assert.equal(valid.getDate(), 27)
  assert.equal(valid.getHours(), 14)
  assert.equal(valid.getMinutes(), 30)
  assert.equal(localVisitStart('2026-02-29', '14:30'), null)
  assert.equal(localVisitStart('2026-08-27', '24:00'), null)
  assert.equal(localVisitStart('08/27/2026', '2:30 PM'), null)
})

test('creates a bounded milestone in the homeowner local time', () => {
  const start = localVisitStart('2026-08-27', '14:30')
  assert.ok(start)
  const milestone = estimateVisitMilestone('  ABC Pools  ', start)
  assert.match(milestone, /^Estimate or service visit with ABC Pools — /)
  assert.doesNotMatch(milestone, /Homesrolo recommends|approved/)
})

test('builds a standards-shaped, escaped, CRLF-terminated calendar file', () => {
  const calendar = estimateVisitCalendar({
    projectTitle: 'Pool, patio & long project title '.repeat(4),
    company: 'ABC; Pools\nTeam',
    startsAt: new Date('2026-08-27T19:30:00.000Z'),
    createdAt: new Date('2026-08-27T18:00:00.000Z'),
    uid: 'hcmd_abcdefghijklmnopqrstuvwxyz0123456789_-ABC',
  })
  assert.match(calendar, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/)
  assert.match(calendar, /\r\nBEGIN:VEVENT\r\n/)
  assert.match(calendar, /DTSTART:20260827T193000Z/)
  assert.match(calendar, /DTEND:20260827T203000Z/)
  assert.match(calendar, /ABC\\; Pools\\nTeam/)
  assert.match(calendar, /\r\n /, 'long content lines are folded')
  assert.match(calendar, /END:VCALENDAR\r\n$/)
  for (const physicalLine of calendar.split('\r\n')) {
    assert.ok(new TextEncoder().encode(physicalLine).byteLength <= 75)
  }
})

test('uses a safe and useful calendar filename', () => {
  assert.equal(visitCalendarFilename('Pool & Patio — Phase 1'), 'pool-patio-phase-1-visit.ics')
  assert.equal(visitCalendarFilename('***'), 'home-project-visit.ics')
})
