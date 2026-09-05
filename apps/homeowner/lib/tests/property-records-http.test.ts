import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  emptyPropertyFacts, TARRANT_PROPERTY_SOURCE_URL, propertyLookupSchema, propertyFactsSchema,
  type PropertyLookup, type PropertyAddress, type HomePropertySnapshot,
} from '../../../../src/homeowner/property-research.v1.ts'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { PropertyRecordsReceipt } from '../server/property-records-receipt.ts'
import { handlePropertyLookupWithDependencies, handleHomePropertyWithDependencies,
  type PropertyRecordsHttpDependencies } from '../server/property-records-http.ts'

const ORIGIN = 'https://app.homesrolo.com'
const PRINCIPAL = `hprn_${'p'.repeat(43)}`
const HOME = `hhom_${'h'.repeat(43)}`
const COMMAND = `hcmd_${'c'.repeat(43)}`
const NOW = '2026-09-05T22:00:00.000Z'
const ADDRESS: PropertyAddress = { line1: '123 Example Dr', line2: null, city: 'Fort Worth',
  regionCode: 'TX', postalCode: '76102', countryCode: 'US' }
const LOOKUP: PropertyLookup = { version: 'property-lookup.v1', status: 'matched', address: ADDRESS,
  matchedAddress: '123 EXAMPLE DR, FORT WORTH, TX, 76102',
  county: { name: 'Tarrant County', fips: '48439' }, retrievedAt: NOW,
  source: { id: 'tarrant_county', title: 'Tarrant County parcel records',
    url: TARRANT_PROPERTY_SOURCE_URL, parcelId: '12345', recordDate: '2026-01-01' },
  facts: { ...emptyPropertyFacts(), squareFeet: 2100, yearBuilt: 2001 }, notes: [] }
function request(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return new Request(`${ORIGIN}/api/v1/property-research`, { method,
    headers: { origin: ORIGIN, cookie: `hrolo_session=${'s'.repeat(43)}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
}
function harness() {
  let lookupCalls = 0
  let saveCalls = 0
  let limitCalls = 0
  let saved: HomePropertySnapshot | null = null
  const digests: string[] = []
  const deps: PropertyRecordsHttpDependencies = {
    appOrigin: ORIGIN, now: () => NOW,
    requirePrincipal: async () => PRINCIPAL,
    lookup: async () => { lookupCalls++; return LOOKUP },
    receipts: new PropertyRecordsReceipt('synthetic-test-secret-'.repeat(3)),
    store: {
      consumeLookup: async () => { limitCalls++; return true },
      read: async () => saved,
      save: async input => { saveCalls++; digests.push(input.commandDigest)
        saved ??= { version: 'home-property-snapshot.v1', homeRef: input.homeRef,
          address: input.address, facts: input.facts, lookup: input.lookup, reviewedAt: input.reviewedAt }
        return saved
      },
    },
  }
  return { deps, digests, calls: () => ({ lookupCalls, saveCalls, limitCalls }) }
}
const lookupBody = { address: ADDRESS, consentToLookup: true }

test('lookup is consented, authenticated, no-store and never saves a home or facts', async () => {
  const { deps, calls } = harness()
  const response = await handlePropertyLookupWithDependencies(request(lookupBody), deps)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const { data } = await response.json()
  assert.deepEqual(data.lookup, LOOKUP)
  assert.ok(deps.receipts!.verify(data.receipt, PRINCIPAL, ADDRESS))
  assert.deepEqual(calls(), { lookupCalls: 1, saveCalls: 0, limitCalls: 1 })
})

test('invalid consent, caller-selected provider, extra owner data and malformed address make zero provider calls', async () => {
  for (const body of [
    { ...lookupBody, consentToLookup: false }, { address: ADDRESS },
    { ...lookupBody, provider: 'https://example.com' }, { ...lookupBody, ownerName: 'No' },
    { ...lookupBody, address: { ...ADDRESS, postalCode: 'bad' } },
  ]) {
    const { deps, calls } = harness()
    assert.equal((await handlePropertyLookupWithDependencies(request(body), deps)).status, 400)
    assert.deepEqual(calls(), { lookupCalls: 0, saveCalls: 0, limitCalls: 0 })
  }
})

test('anonymous, cross-origin, mixed credentials and invalid sessions fail before lookup', async () => {
  for (const [headers, status] of [
    [{ cookie: '' }, 401], [{ origin: 'https://evil.example' }, 403],
    [{ authorization: `Bearer ${'b'.repeat(43)}` }, 400],
    [{ 'x-homesrolo-client': 'pwa.v1' }, 400],
  ] as const) {
    const { deps, calls } = harness()
    assert.equal((await handlePropertyLookupWithDependencies(request(lookupBody, headers), deps)).status, status)
    assert.equal(calls().lookupCalls, 0)
  }
  const { deps, calls } = harness()
  const denied = { ...deps, requirePrincipal: async () => { throw new HomeownerApiError('signed_out') } }
  assert.equal((await handlePropertyLookupWithDependencies(request(lookupBody), denied)).status, 401)
  assert.equal(calls().lookupCalls, 0)
})

test('fixed native bearer channel works without browser origin or cookies', async () => {
  const { deps } = harness()
  const native = new Request(`${ORIGIN}/api/v1/property-research`, { method: 'POST',
    headers: { authorization: `Bearer ${'n'.repeat(43)}`, 'x-homesrolo-client': 'native.v1',
      'content-type': 'application/json' }, body: JSON.stringify(lookupBody) })
  assert.equal((await handlePropertyLookupWithDependencies(native, deps)).status, 200)
})

test('shared limiter denial or failure and disabled configuration fail closed', async () => {
  for (const fail of [false, true]) {
    const { deps, calls } = harness()
    const blocked = { ...deps, store: { ...deps.store!, consumeLookup: async () => {
      if (fail) throw new Error('database error with private content')
      return false
    } } }
    const result = await handlePropertyLookupWithDependencies(request(lookupBody), blocked)
    assert.equal(result.status, fail ? 503 : 429)
    assert.equal((await result.text()).includes('private content'), false)
    assert.equal(calls().lookupCalls, 0)
  }
  const { deps, calls } = harness()
  assert.equal((await handlePropertyLookupWithDependencies(request(lookupBody), { ...deps, store: null })).status, 503)
  assert.equal(calls().lookupCalls, 0)
})

test('nonmatches are successful draft results with no receipt and no fabricated facts', async () => {
  for (const status of ['no_match', 'ambiguous', 'unsupported', 'unavailable'] as const) {
    const { deps } = harness()
    const result = await handlePropertyLookupWithDependencies(request(lookupBody), { ...deps,
      lookup: async () => ({ ...LOOKUP, status, source: null, matchedAddress: null, facts: emptyPropertyFacts() }),
    })
    assert.equal(result.status, 200)
    assert.equal((await result.json()).data.receipt, null)
  }
})

test('stale session and mismatched provider address cannot return a usable draft', async () => {
  const { deps } = harness()
  let checks = 0
  const switched = { ...deps, requirePrincipal: async () => (++checks === 1 ? PRINCIPAL : `hprn_${'x'.repeat(43)}`) }
  assert.equal((await handlePropertyLookupWithDependencies(request(lookupBody), switched)).status, 401)
  assert.equal((await handlePropertyLookupWithDependencies(request(lookupBody), { ...deps,
    lookup: async () => ({ ...LOOKUP, address: { ...ADDRESS, line1: '124 Example Dr' } }),
  })).status, 503)
})

test('oversized, malformed, encoded and wrong-content-type bodies are rejected', async () => {
  const { deps, calls } = harness()
  for (const [body, headers] of [
    ['a'.repeat(25 * 1024), {}], ['{', {}], ['{}', { 'content-encoding': 'gzip' }],
    ['{}', { 'content-type': 'text/plain' }], ['{}', { 'content-length': '999999' }],
  ] as const) {
    const r = new Request(`${ORIGIN}/api/v1/property-research`, { method: 'POST',
      headers: { origin: ORIGIN, cookie: `hrolo_session=${'s'.repeat(43)}`,
        'content-type': 'application/json', ...headers }, body })
    assert.equal((await handlePropertyLookupWithDependencies(r, deps)).status, 400)
  }
  assert.equal(calls().lookupCalls, 0)
})

test('stalled body reads are canceled before any provider or home write', { timeout: 7_000 }, async () => {
  const { deps, calls } = harness()
  let canceled = false
  const stream = new ReadableStream({ cancel() { canceled = true } })
  const stalled = new Request(`${ORIGIN}/api/v1/property-research`, {
    method: 'POST', headers: { origin: ORIGIN, cookie: `hrolo_session=${'s'.repeat(43)}`,
      'content-type': 'application/json' }, body: stream, duplex: 'half',
  } as RequestInit)
  assert.equal((await handlePropertyLookupWithDependencies(stalled, deps)).status, 400)
  assert.equal(canceled, true)
  assert.deepEqual(calls(), { lookupCalls: 0, saveCalls: 0, limitCalls: 0 })
})

test('reviewed corrections save separately from authentic county values and replay digest is stable', async () => {
  const { deps, calls, digests } = harness()
  const receipt = deps.receipts!.sign(PRINCIPAL, LOOKUP)
  const facts = { ...LOOKUP.facts, squareFeet: 2200, bedrooms: 3 }
  const body = { commandRef: COMMAND, address: ADDRESS, facts, receipt }
  const result = await handleHomePropertyWithDependencies(request(body), HOME, deps)
  assert.equal(result.status, 200)
  const { data } = await result.json()
  assert.equal(data.facts.squareFeet, 2200)
  assert.equal(data.lookup.facts.squareFeet, 2100)
  assert.equal(data.lookup.facts.bedrooms, null)
  const later = { ...deps, now: () => '2026-09-06T22:00:00.000Z' }
  const retried = await handleHomePropertyWithDependencies(request(body), HOME, later)
  assert.deepEqual((await retried.json()).data, data)
  assert.equal(digests[0], digests[1])
  assert.equal(calls().lookupCalls, 0)
  assert.equal((await handleHomePropertyWithDependencies(request(null, {}, 'GET'), HOME, deps)).status, 200)
})

test('manual-only entry does not claim public provenance or call the provider', async () => {
  const { deps, calls } = harness()
  const result = await handleHomePropertyWithDependencies(request({ commandRef: COMMAND, address: ADDRESS,
    facts: { ...emptyPropertyFacts(), bedrooms: 2 }, receipt: null }), HOME, deps)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).data.lookup, null)
  assert.equal(calls().lookupCalls, 0)
})

test('forged, foreign-principal or wrong-address receipt can never save source claims', async () => {
  const { deps, calls } = harness()
  const receipt = deps.receipts!.sign(PRINCIPAL, LOOKUP)
  for (const attempted of [receipt.replace(/^./, receipt[0] === 'a' ? 'b' : 'a'),
    deps.receipts!.sign(`hprn_${'x'.repeat(43)}`, LOOKUP),
    deps.receipts!.sign(PRINCIPAL, { ...LOOKUP, address: { ...ADDRESS, line1: '124 Example Dr' } }),
  ]) {
    assert.equal((await handleHomePropertyWithDependencies(request({ commandRef: COMMAND,
      address: ADDRESS, facts: LOOKUP.facts, receipt: attempted }), HOME, deps)).status, 400)
  }
  assert.equal(calls().saveCalls, 0)
})

test('cross-home membership, revoked access and conflicts preserve safe error codes', async () => {
  for (const [code, status] of [['forbidden', 403], ['not_found', 404], ['conflict', 409]] as const) {
    const { deps } = harness()
    const denied = { ...deps, store: { ...deps.store!, save: async () => { throw new HomeownerApiError(code) } } }
    assert.equal((await handleHomePropertyWithDependencies(request({ commandRef: COMMAND,
      address: ADDRESS, facts: LOOKUP.facts, receipt: null }), HOME, denied)).status, status)
  }
})

test('shared schemas forbid personal data, non-finite facts, invalid bounds and untrusted source URLs', () => {
  for (const facts of [{ ...LOOKUP.facts, owner: 'No' }, { ...LOOKUP.facts, squareFeet: 0 },
    { ...LOOKUP.facts, lotSquareFeet: Infinity }, { ...LOOKUP.facts, bedrooms: -1 },
    { ...LOOKUP.facts, bathrooms: 1.1 }, { ...LOOKUP.facts, garageSpaces: 1.5 }]) {
    assert.equal(propertyFactsSchema.safeParse(facts).success, false)
  }
  assert.equal(propertyLookupSchema.safeParse({ ...LOOKUP,
    source: { ...LOOKUP.source!, url: 'https://example.com' } }).success, false)
  assert.equal(propertyLookupSchema.safeParse({ ...LOOKUP, status: 'no_match' }).success, false)
})
