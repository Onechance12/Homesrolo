import assert from 'node:assert/strict'
import test from 'node:test'
import type { HomeCheckupPhoto } from '../api/model.ts'
import {
  groupedHomeCheckups,
  localCalendarDate,
  normalizeHomeCheckupViewLabel,
  validHomeCheckupDate,
} from './checkups.ts'

function photo(number: number, date: string, area: HomeCheckupPhoto['area'], viewLabel: string): HomeCheckupPhoto {
  const homeRef = `hhom_${'A'.repeat(43)}`
  const photoRef = `hpho_${String(number).padEnd(43, 'B').slice(0, 43)}`
  const base = `/api/v1/homes/${homeRef}/photo-checkups/${photoRef}`
  return {
    photoRef, homeRef, observedOn: date, area, viewLabel, caption: '',
    fullUrl: `${base}/full`, thumbnailUrl: `${base}/thumbnail`,
    width: 100, height: 100, createdAt: `${date}T12:00:00.000Z`,
  }
}

test('groups repeatable Home Watch views and orders each comparison newest first', () => {
  const groups = groupedHomeCheckups([
    photo(1, '2026-02-01', 'roofline', 'Garage'),
    photo(2, '2026-08-01', 'roofline', '  garage  '),
    photo(3, '2026-07-01', 'hvac', 'Upstairs return'),
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0]?.photos.map(item => item.observedOn), ['2026-08-01', '2026-02-01'])
  assert.equal(groups[0]?.viewLabel, 'Garage')
  assert.equal(groups[1]?.area, 'hvac')
})

test('uses the phone calendar date rather than UTC rollover', () => {
  assert.equal(localCalendarDate(new Date(2026, 7, 9, 23, 55)), '2026-08-09')
})

test('normalizes repeatable view names and rejects impossible or future dates', () => {
  assert.equal(normalizeHomeCheckupViewLabel('  Garage   roofline  '), 'Garage roofline')
  assert.equal(validHomeCheckupDate('2026-08-27', '2026-08-27'), true)
  assert.equal(validHomeCheckupDate('2026-02-30', '2026-08-27'), false)
  assert.equal(validHomeCheckupDate('2026-08-28', '2026-08-27'), false)
})
