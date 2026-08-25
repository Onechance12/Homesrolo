import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOMEOWNER_SYSTEM_KINDS,
} from '../homeowner-runtime.v1.ts'
import {
  homeRecordProfileCommandIntent,
  homeownerHomeRecordProfileSchema,
  updateHomeRecordProfileInputSchema,
} from '../home-record-profile.v1.ts'

const body = (character: string) => character.repeat(43)
const now = '2026-08-25T15:00:00.000Z'
const homeRef = `hhom_${body('h')}`

const command = {
  commandRef: `hcmd_${body('c')}`,
  expectedRevision: 4,
  address: {
    line1: '123 Main Street',
    line2: null,
    city: 'Fort Worth',
    regionCode: 'TX',
    postalCode: '76102',
    countryCode: 'US' as const,
  },
  homeType: 'house' as const,
  yearBuilt: { value: 1988, precision: 'approximate' as const },
  systems: HOMEOWNER_SYSTEM_KINDS.map(kind => ({
    kind,
    present: 'unknown' as const,
    installedOrReplacedYear: null,
  })),
  requestedAt: now,
}

test('private Home Record profile is address-first, six-system, and strict', () => {
  assert.ok(updateHomeRecordProfileInputSchema.parse(command))
  assert.ok(homeownerHomeRecordProfileSchema.parse({
    recordVersion: 'home-record-profile.v1',
    homeRef,
    revision: 5,
    address: command.address,
    homeType: command.homeType,
    yearBuilt: command.yearBuilt,
    systems: command.systems,
    source: 'homeowner_recollection',
    updatedAt: now,
  }))
  assert.equal(updateHomeRecordProfileInputSchema.safeParse({
    ...command,
    address: { ...command.address, postalCode: 'not-a-zip' },
  }).success, false)
  assert.equal(updateHomeRecordProfileInputSchema.safeParse({
    ...command,
    systems: command.systems.map(system => ({ ...system, kind: 'roof' })),
  }).success, false)
  assert.equal(updateHomeRecordProfileInputSchema.safeParse({
    ...command,
    measurements: { squareFeet: 1800 },
  }).success, false)
})

test('Home Record update intent is revision-backed and excludes server execution time', () => {
  assert.deepEqual(
    homeRecordProfileCommandIntent(homeRef, command),
    homeRecordProfileCommandIntent(homeRef, {
      ...command,
      requestedAt: '2026-08-25T15:01:00.000Z',
    }),
  )
  assert.notDeepEqual(
    homeRecordProfileCommandIntent(homeRef, command),
    homeRecordProfileCommandIntent(homeRef, { ...command, expectedRevision: 5 }),
  )
  assert.notDeepEqual(
    homeRecordProfileCommandIntent(homeRef, command),
    homeRecordProfileCommandIntent(`hhom_${body('x')}`, command),
  )
})
