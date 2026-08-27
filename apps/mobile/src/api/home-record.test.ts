import assert from 'node:assert/strict'
import test from 'node:test'
import { HOME_SYSTEM_KINDS, homeRecordUpdateBody, parseHomeRecordProfile } from './home-record.ts'
import type { HomeRecordProfile } from './model.ts'

const homeRef = `hhom_${'A'.repeat(43)}`
const commandRef = `hcmd_${'B'.repeat(43)}`

function profile(): HomeRecordProfile {
  return {
    homeRef,
    revision: 2,
    address: {
      line1: '123 Main Street', line2: null, city: 'Fort Worth', regionCode: 'TX',
      postalCode: '76102', countryCode: 'US',
    },
    homeType: 'house',
    yearBuilt: { value: 1998, precision: 'approximate' },
    systems: HOME_SYSTEM_KINDS.map(kind => ({
      kind, present: 'yes', installedOrReplacedYear: null,
    })),
    source: 'homeowner_recollection',
    updatedAt: '2026-08-27T12:00:00.000Z',
  }
}

test('strictly parses the existing controller-only Home Record projection', () => {
  assert.deepEqual(parseHomeRecordProfile(profile()), profile())
  assert.throws(() => parseHomeRecordProfile({ ...profile(), extra: true }))
  assert.throws(() => parseHomeRecordProfile({
    ...profile(), systems: profile().systems.slice(1),
  }))
  assert.throws(() => parseHomeRecordProfile({
    ...profile(), address: { ...profile().address, regionCode: 'Texas' },
  }))
})

test('builds only the exact revisioned Home Record update shape', () => {
  const current = profile()
  const body = homeRecordUpdateBody({
    commandRef,
    expectedRevision: current.revision,
    address: { ...current.address!, line1: '  123 Main Street  ' },
    homeType: current.homeType,
    yearBuilt: current.yearBuilt,
    systems: current.systems,
  })
  assert.ok(body)
  assert.equal(body.address.line1, '123 Main Street')
  assert.deepEqual(Object.keys(body).sort(), [
    'address', 'commandRef', 'expectedRevision', 'homeType', 'systems', 'yearBuilt',
  ])
  assert.equal(homeRecordUpdateBody({ ...body, expectedRevision: 0 }), null)
  assert.equal(homeRecordUpdateBody({
    ...body,
    systems: body.systems.map((system, index) => index === 0
      ? { ...system, present: 'no', installedOrReplacedYear: { value: 2020, precision: 'exact' } }
      : system),
  }), null)
})
