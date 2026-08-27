import assert from 'node:assert/strict'
import test from 'node:test'
import type { HomeRecordProfile } from '../api/model.ts'
import { HOME_SYSTEM_KINDS } from '../api/home-record.ts'
import { detailsDraft, homeDetailsUpdate } from './details.ts'

const profile: HomeRecordProfile = {
  homeRef: `hhom_${'A'.repeat(43)}`,
  revision: 4,
  address: null,
  homeType: 'unknown',
  yearBuilt: null,
  systems: HOME_SYSTEM_KINDS.map(kind => ({ kind, present: 'unknown', installedOrReplacedYear: null })),
  source: 'homeowner_recollection',
  updatedAt: '2026-08-27T12:00:00.000Z',
}

test('turns a sparse Home Record into a complete editable app draft', () => {
  const draft = detailsDraft(profile)
  assert.equal(draft.line1, '')
  assert.equal(Object.keys(draft.systems).length, HOME_SYSTEM_KINDS.length)
  assert.ok(HOME_SYSTEM_KINDS.every(kind => draft.systems[kind].present === 'unknown'))
})

test('validates the compact form before sending a revisioned update', () => {
  const draft = detailsDraft(profile)
  assert.deepEqual(homeDetailsUpdate(profile, draft, `hcmd_${'B'.repeat(43)}`, 2026), {
    ok: false, message: 'Add the street, city, two-letter state, and ZIP code.',
  })
  const complete = {
    ...draft,
    line1: '123 Main Street', city: 'Tulsa', regionCode: 'ok', postalCode: '74103',
    yearBuilt: '1999', yearBuiltApproximate: true,
  }
  const result = homeDetailsUpdate(profile, complete, `hcmd_${'B'.repeat(43)}`, 2026)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.input.expectedRevision, 4)
  assert.equal(result.input.address.regionCode, 'OK')
  assert.deepEqual(result.input.yearBuilt, { value: 1999, precision: 'approximate' })
})
