import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHomePropertySnapshot, parsePropertyFacts, parsePropertyLookupResult, PROPERTY_SOURCE_URL, saveHomePropertyBody } from './property.ts'
import type { HomeRecordAddress, PropertyLookupResult } from './model.ts'
import { emptyPropertyFacts } from '../home/property-review.ts'

const HOME = `hhom_${'h'.repeat(43)}`
const ADDRESS: HomeRecordAddress = { line1: '123 Synthetic Street', line2: null, city: 'Fort Worth', regionCode: 'TX', postalCode: '76102', countryCode: 'US' }
const RESULT: PropertyLookupResult = {
  lookup: {
    version: 'property-lookup.v1', status: 'matched', address: ADDRESS,
    matchedAddress: '123 SYNTHETIC ST, FORT WORTH TX 76102', county: { name: 'Tarrant County', fips: '48439' },
    retrievedAt: '2026-09-05T12:00:00.000Z',
    source: { id: 'tarrant_county', title: 'Tarrant County public parcel data', url: PROPERTY_SOURCE_URL, parcelId: '12345', recordDate: null },
    facts: { ...emptyPropertyFacts(), squareFeet: 1800, yearBuilt: 1990, bathrooms: 2.5, bedrooms: 3, centralHeat: true, centralAir: false },
    notes: ['Total rooms were not provided.'],
  },
  receipt: `opaque_test_payload.${'r'.repeat(43)}`,
}

test('property lookup strictly preserves exact source, address, explicit unknowns and booleans', () => {
  assert.deepEqual(parsePropertyLookupResult(RESULT, ADDRESS), RESULT)
  assert.equal(parsePropertyLookupResult(RESULT, ADDRESS).lookup.facts.rooms, null)
  assert.equal(parsePropertyLookupResult(RESULT, ADDRESS).lookup.facts.centralAir, false)
  assert.equal(parsePropertyLookupResult(RESULT, ADDRESS).lookup.facts.bathrooms, 2.5)
})

test('property lookup rejects cross-address, uncorroborated, enlarged and unsafe source records', () => {
  const cases = [
    { ...RESULT, receipt: null },
    { ...RESULT, receipt: 'not-an-attestation' },
    { ...RESULT, receipt: `${'x'.repeat(16_001)}.${'r'.repeat(43)}` },
    { ...RESULT, secret: 'unexpected' },
    { ...RESULT, lookup: { ...RESULT.lookup, ownerName: 'Excluded' } },
    { ...RESULT, lookup: { ...RESULT.lookup, address: { ...ADDRESS, line1: '456 Other Street' } } },
    { ...RESULT, lookup: { ...RESULT.lookup, county: { name: 'Other county', fips: '99999' } } },
    { ...RESULT, lookup: { ...RESULT.lookup, source: null } },
    { ...RESULT, lookup: { ...RESULT.lookup, source: { ...RESULT.lookup.source, url: 'https://example.test' } } },
    { ...RESULT, lookup: { ...RESULT.lookup, source: { ...RESULT.lookup.source, url: 'javascript:alert(1)' } } },
    { ...RESULT, lookup: { ...RESULT.lookup, source: { ...RESULT.lookup.source, parcelId: 'not-a-parcel' } } },
    { ...RESULT, lookup: { ...RESULT.lookup, retrievedAt: '2026-02-30T12:00:00.000Z' } },
    { ...RESULT, lookup: { ...RESULT.lookup, retrievedAt: '2026-09-05' } },
    { ...RESULT, lookup: { ...RESULT.lookup, notes: Array.from({ length: 9 }, () => 'Too many notes') } },
  ]
  for (const candidate of cases) assert.throws(() => parsePropertyLookupResult(candidate, ADDRESS))
  assert.throws(() => parsePropertyLookupResult(RESULT, { ...ADDRESS, line2: 'Unit B' }))
})

test('every nonmatched outcome is usable without a provider receipt or invented facts', () => {
  for (const status of ['no_match', 'ambiguous', 'unsupported', 'unavailable'] as const) {
    const lookup = { ...RESULT.lookup, status, matchedAddress: null, source: null, facts: emptyPropertyFacts() }
    const result = { lookup, receipt: null }
    assert.deepEqual(parsePropertyLookupResult(result, ADDRESS), result)
    assert.throws(() => parsePropertyLookupResult({ lookup, receipt: RESULT.receipt }, ADDRESS))
    assert.throws(() => parsePropertyLookupResult({ lookup: { ...lookup, facts: { ...lookup.facts, rooms: 3 } }, receipt: null }, ADDRESS))
  }
})

test('property facts reject guesses, unsupported precision and out-of-range values', () => {
  for (const patch of [
    { squareFeet: 0 }, { squareFeet: 1.5 }, { squareFeet: 1_000_001 },
    { yearBuilt: 999 }, { yearBuilt: 2101 }, { lotSquareFeet: 0 }, { lotSquareFeet: Infinity },
    { bedrooms: 2.5 }, { bathrooms: 2.3 }, { bathrooms: 101 }, { rooms: 1001 },
    { garageSpaces: -1 }, { centralHeat: 'yes' }, { subdivision: 'x'.repeat(161) }, { owner: 'Excluded' },
  ]) assert.throws(() => parsePropertyFacts({ ...emptyPropertyFacts(), ...patch }))
  assert.equal(parsePropertyFacts({ ...emptyPropertyFacts(), bathrooms: 2.75, lotSquareFeet: 12.5 }).bathrooms, 2.75)
})

test('snapshot save accepts reviewed corrections while binding source address and exact home', () => {
  const facts = { ...RESULT.lookup.facts, squareFeet: 1850, rooms: null }
  const body = { commandRef: `hcmd_${'c'.repeat(43)}`, address: ADDRESS, facts, receipt: RESULT.receipt }
  assert.deepEqual(saveHomePropertyBody(body), body)
  assert.equal(saveHomePropertyBody({ ...body, commandRef: 'invalid' }), null)
  const snapshot = { version: 'home-property-snapshot.v1', homeRef: HOME, address: ADDRESS, facts, lookup: RESULT.lookup, reviewedAt: '2026-09-05T12:01:00.000Z' }
  assert.deepEqual(parseHomePropertySnapshot(snapshot, HOME), snapshot)
  assert.equal(parseHomePropertySnapshot(snapshot, HOME)?.lookup?.facts.squareFeet, 1800, 'the original source is not overwritten by corrections')
  assert.throws(() => parseHomePropertySnapshot(snapshot, `hhom_${'x'.repeat(43)}`))
  assert.throws(() => parseHomePropertySnapshot({ ...snapshot, address: { ...ADDRESS, postalCode: '76103' } }, HOME))
  assert.equal(parseHomePropertySnapshot(null, HOME), null)
  assert.deepEqual(parseHomePropertySnapshot({ ...snapshot, lookup: null }, HOME)?.facts, facts, 'manual facts need no source receipt')
})
