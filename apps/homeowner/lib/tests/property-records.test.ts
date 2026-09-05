import assert from 'node:assert/strict'
import test from 'node:test'
import { lookupPropertyRecords } from '../server/property-records.ts'
import { propertyLookupSchema, type PropertyAddress } from '../../../../src/homeowner/property-research.v1.ts'

// Synthetic address; fixture shape is from the public Census and Tarrant feeds.
const ADDRESS: PropertyAddress = {
  line1: '12345 Example Grove Drive', line2: null, city: 'Fort Worth',
  regionCode: 'TX', postalCode: '76244', countryCode: 'US',
}
const NOW = '2026-09-05T12:00:00.000Z'

function censusMatch() {
  return {
    matchedAddress: '12345 EXAMPLE GROVE DR, FORT WORTH, TX, 76244',
    addressComponents: {
      zip: '76244', streetName: 'EXAMPLE GROVE', preType: '', city: 'FORT WORTH',
      preDirection: '', suffixDirection: '', fromAddress: '12301', state: 'TX',
      suffixType: 'DR', toAddress: '12399', suffixQualifier: '', preQualifier: '',
    },
    geographies: { Counties: [{ GEOID: '48439', NAME: 'Tarrant County' }] },
  }
}
function census() { return { result: { addressMatches: [censusMatch()] } } }
function attributes(): Record<string, unknown> {
  return {
    ACCOUNT: '12345678', SITUS_ADDR: '12345 EXAMPLE GROVE DR        ',
    CITY: 'FORT WORTH                      ', ZIPCODE: '          ', STATE: 'TX',
    STREET_NO: 12345, STREET_NAM: 'EXAMPLE GROVE            ', STREET_TYP: 'DR   ',
    PREDIR: '  ', POSTDIR: '  ', ADDENDUM_T: null, ADDENDUM: null,
    YEAR_BUILT: 2008, LIVING_ARE: 3500, LAND_SQFT: 7500, GARAGE_CAP: 2,
    CENTRAL_HE: 'Y', CENTRAL_AI: 'Y', SubdivisionName: 'EXAMPLE SUBDIVISION',
    APPRAISAL_: Date.UTC(2026, 0, 1), BEDROOMS: 0, BATHROOMS: 0,
    OWNER_NAME: 'MUST NOT BE RETURNED', TOTAL_VALU: 123456,
  }
}
function parcel(row = attributes()) { return { features: [{ attributes: row }] } }
function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
}
function fakeFetch(responses: Array<unknown | Response>) {
  const calls: { url: URL; init: RequestInit | undefined }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init })
    assert.ok(responses.length, 'no unexpected provider requests')
    const response = responses.shift()
    return response instanceof Response ? response : json(response)
  }
  return { fetcher, calls }
}
async function run(responses: Array<unknown | Response>, address = ADDRESS) {
  const { fetcher, calls } = fakeFetch(responses)
  const lookup = await lookupPropertyRecords(address, { fetch: fetcher, now: () => NOW })
  assert.equal(propertyLookupSchema.safeParse(lookup).success, true)
  return { lookup, calls }
}
function assertUnmatched(lookup: Awaited<ReturnType<typeof lookupPropertyRecords>>, status: string) {
  assert.equal(lookup.status, status)
  assert.equal(lookup.source, null)
  assert.equal(lookup.matchedAddress, null)
  assert.ok(Object.values(lookup.facts).every(value => value === null))
}

test('official address match extracts only supported facts and preserves the exact requested address', async () => {
  const { lookup, calls } = await run([census(), parcel()])
  assert.equal(lookup.status, 'matched')
  assert.deepEqual(lookup.address, ADDRESS)
  assert.equal(lookup.retrievedAt, NOW)
  assert.deepEqual(lookup.county, { name: 'Tarrant County', fips: '48439' })
  assert.equal(lookup.source?.parcelId, '12345678')
  assert.equal(lookup.source?.recordDate, '2026-01-01')
  assert.deepEqual(lookup.facts, {
    squareFeet: 3500, yearBuilt: 2008, lotSquareFeet: 7500, bedrooms: null,
    bathrooms: null, rooms: null, garageSpaces: 2, centralHeat: true,
    centralAir: true, subdivision: 'EXAMPLE SUBDIVISION',
  })
  assert.ok(lookup.notes.some(note => note.includes('not the date the data was last updated')))
  assert.equal(calls[0]?.url.origin, 'https://geocoding.geo.census.gov')
  assert.equal(calls[0]?.url.searchParams.get('layers'), 'Counties')
  assert.equal(calls[1]?.url.origin, 'https://mapit.tarrantcounty.com')
  assert.equal(calls[1]?.url.searchParams.get('returnGeometry'), 'false')
  assert.equal(calls[1]?.url.searchParams.get('resultRecordCount'), '10')
  assert.equal(calls[1]?.url.searchParams.get('where'), "STREET_NO = 12345 AND UPPER(STREET_NAM) = 'EXAMPLE GROVE'")
  const requestedFields = calls[1]?.url.searchParams.get('outFields') ?? ''
  assert.doesNotMatch(requestedFields, /OWNER|EXEMPTION|VALUE|VALU|BEDROOM|BATHROOM|\*/)
  assert.doesNotMatch(JSON.stringify(lookup), /MUST NOT BE RETURNED|TOTAL_VALU|OWNER_NAME/)
  for (const call of calls) {
    assert.equal(call.init?.redirect, 'error')
    assert.equal(call.init?.cache, 'no-store')
    assert.equal(call.init?.method, 'GET')
    assert.ok(call.init?.signal instanceof AbortSignal)
  }
})

test('unsupported county is determined from Census, not inferred from city or ZIP', async () => {
  const response = census()
  response.result.addressMatches[0]!.geographies.Counties = [{ GEOID: '48121', NAME: 'Denton County' }]
  const { lookup, calls } = await run([response])
  assertUnmatched(lookup, 'unsupported')
  assert.equal(lookup.county?.name, 'Denton County')
  assert.equal(calls.length, 1)
})

test('unit addresses and inline unverified unit syntax fail closed without external requests', async () => {
  for (const address of [
    { ...ADDRESS, line2: 'Unit 2' }, { ...ADDRESS, line1: `${ADDRESS.line1} #2` },
    { ...ADDRESS, line1: `${ADDRESS.line1} Apt 2` }, { ...ADDRESS, line1: `${ADDRESS.line1} Suite 2` },
  ]) {
    const { lookup, calls } = await run([], address)
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 0)
  }
})

test('malformed street, ZIP and state fail closed without external requests', async () => {
  for (const address of [
    { ...ADDRESS, line1: 'Example Grove Drive' }, { ...ADDRESS, postalCode: '' },
    { ...ADDRESS, postalCode: '7624' }, { ...ADDRESS, regionCode: 'Texas' },
    { ...ADDRESS, line1: 'https://evil.example/property' },
  ]) {
    const { fetcher, calls } = fakeFetch([])
    const lookup = await lookupPropertyRecords(address, { fetch: fetcher, now: () => NOW })
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 0)
  }
})

test('zero Census matches does not query parcels', async () => {
  const { lookup, calls } = await run([{ result: { addressMatches: [] } }])
  assertUnmatched(lookup, 'no_match')
  assert.equal(calls.length, 1)
})

test('multiple Census matches remain ambiguous, including identical duplicates', async () => {
  const { lookup, calls } = await run([{ result: { addressMatches: [censusMatch(), censusMatch()] } }])
  assertUnmatched(lookup, 'ambiguous')
  assert.equal(calls.length, 1)
})

test('Census must match exact street number, name, suffix, direction, city, state and ZIP', async () => {
  for (const matchedAddress of [
    '12346 EXAMPLE GROVE DR, FORT WORTH, TX, 76244',
    '12345 OTHER GROVE DR, FORT WORTH, TX, 76244',
    '12345 EXAMPLE GROVE LN, FORT WORTH, TX, 76244',
    '12345 N EXAMPLE GROVE DR, FORT WORTH, TX, 76244',
    '12345 EXAMPLE GROVE DR, KELLER, TX, 76244',
    '12345 EXAMPLE GROVE DR, FORT WORTH, OK, 76244',
    '12345 EXAMPLE GROVE DR, FORT WORTH, TX, 76111',
    '12345 EXAMPLE GROVE DR UNIT 2, FORT WORTH, TX, 76244',
  ]) {
    const match = censusMatch()
    match.matchedAddress = matchedAddress
    const { lookup, calls } = await run([{ result: { addressMatches: [match] } }])
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 1)
  }
})

test('inconsistent Census address components are rejected', async () => {
  for (const field of ['zip', 'city', 'state'] as const) {
    const match = censusMatch()
    match.addressComponents[field] = 'wrong'
    const { lookup } = await run([{ result: { addressMatches: [match] } }])
    assertUnmatched(lookup, 'no_match')
  }
})

test('missing county or mismatched county name is unavailable; multiple counties are ambiguous', async () => {
  for (const counties of [[], [{ GEOID: '48439', NAME: 'Other County' }]]) {
    const match = censusMatch()
    match.geographies.Counties = counties
    assertUnmatched((await run([{ result: { addressMatches: [match] } }])).lookup, 'unavailable')
  }
  const match = censusMatch()
  match.geographies.Counties.push({ GEOID: '48121', NAME: 'Denton County' })
  assertUnmatched((await run([{ result: { addressMatches: [match] } }])).lookup, 'ambiguous')
})

test('zero parcels returns no_match; duplicates and truncated parcel responses are ambiguous', async () => {
  assertUnmatched((await run([census(), { features: [] }])).lookup, 'no_match')
  for (const response of [
    { features: [parcel().features[0], parcel().features[0]] },
    { ...parcel(), exceededTransferLimit: true },
  ]) assertUnmatched((await run([census(), response])).lookup, 'ambiguous')
})

test('county situs and every structured address component must agree', async () => {
  for (const change of [
    { SITUS_ADDR: '12346 EXAMPLE GROVE DR' }, { STREET_NO: 12346 },
    { STREET_NAM: 'OTHER GROVE' }, { STREET_TYP: 'LN' }, { PREDIR: 'N' }, { POSTDIR: 'S' },
    { CITY: 'KELLER' }, { STATE: 'OK' }, { ZIPCODE: '76111' },
    { ADDENDUM_T: 'APT', ADDENDUM: '2' }, { ADDENDUM_T: null, ADDENDUM: '2' },
  ]) assertUnmatched((await run([census(), parcel({ ...attributes(), ...change })])).lookup, 'no_match')
})

test('blank county ZIP is allowed only after Census corroboration; county ZIP when present must agree', async () => {
  assert.equal((await run([census(), parcel({ ...attributes(), ZIPCODE: '76244-1234' })])).lookup.status, 'matched')
  assertUnmatched((await run([census(), parcel({ ...attributes(), ZIPCODE: 'not a ZIP' })])).lookup, 'no_match')
})

test('direction and suffix long forms may normalize, but a changed direction does not', async () => {
  const address = { ...ADDRESS, line1: '12345 North Example Grove Drive West' }
  const match = censusMatch()
  match.matchedAddress = '12345 N EXAMPLE GROVE DR W, FORT WORTH, TX, 76244'
  match.addressComponents.preDirection = 'N'
  match.addressComponents.suffixDirection = 'W'
  const row = { ...attributes(), SITUS_ADDR: '12345 N EXAMPLE GROVE DR W', PREDIR: 'N', POSTDIR: 'W' }
  assert.equal((await run([{ result: { addressMatches: [match] } }, parcel(row)], address)).lookup.status, 'matched')
  assertUnmatched((await run([{ result: { addressMatches: [match] } }, parcel({ ...row, POSTDIR: 'E' })], address)).lookup, 'no_match')
})

test('apostrophes are SQL escaped and cannot introduce arbitrary fields or endpoints', async () => {
  const address = { ...ADDRESS, line1: "12345 O'Neil Drive" }
  const match = censusMatch()
  match.matchedAddress = "12345 O'NEIL DR, FORT WORTH, TX, 76244"
  match.addressComponents.streetName = "O'NEIL"
  const row = { ...attributes(), SITUS_ADDR: "12345 O'NEIL DR", STREET_NAM: "O'NEIL" }
  const { lookup, calls } = await run([{ result: { addressMatches: [match] } }, parcel(row)], address)
  assert.equal(lookup.status, 'matched')
  assert.equal(calls[1]?.url.searchParams.get('where'), "STREET_NO = 12345 AND UPPER(STREET_NAM) = 'O''NEIL'")
})

test('retired bedroom, bathroom and room fields are never promoted, even if positive', async () => {
  const { lookup } = await run([census(), parcel({ ...attributes(), BEDROOMS: 4, BATHROOMS: 3, ROOMS: 9 })])
  assert.equal(lookup.facts.bedrooms, null)
  assert.equal(lookup.facts.bathrooms, null)
  assert.equal(lookup.facts.rooms, null)
})

test('invalid numeric and text facts become null, not guesses or coerced strings', async () => {
  for (const value of [-1, 0, 1.5, 1e20, '3500', null]) {
    const { lookup } = await run([census(), parcel({ ...attributes(), LIVING_ARE: value, YEAR_BUILT: value })])
    assert.equal(lookup.facts.squareFeet, null)
    assert.equal(lookup.facts.yearBuilt, null)
  }
  const { lookup } = await run([census(), parcel({ ...attributes(),
    YEAR_BUILT: 2099, LAND_SQFT: -1, GARAGE_CAP: 101, CENTRAL_HE: '', CENTRAL_AI: 'unknown',
    SubdivisionName: '<script>not text</script>', APPRAISAL_: '2026-01-01',
  })])
  for (const field of ['yearBuilt', 'lotSquareFeet', 'garageSpaces', 'centralHeat', 'centralAir', 'subdivision'] as const) {
    assert.equal(lookup.facts[field], null)
  }
  assert.equal(lookup.source?.recordDate, null)
})

test('explicit no central HVAC and zero garage capacity remain supported facts', async () => {
  const { lookup } = await run([census(), parcel({ ...attributes(), GARAGE_CAP: 0, CENTRAL_HE: 'N', CENTRAL_AI: 'N' })])
  assert.equal(lookup.facts.garageSpaces, 0)
  assert.equal(lookup.facts.centralHeat, false)
  assert.equal(lookup.facts.centralAir, false)
})

test('upstream JSON, HTTP, redirect and schema errors are generic and contain no upstream detail', async () => {
  for (const response of [
    json({ error: 'address and secret upstream diagnostics' }, { status: 500 }),
    json({}, { status: 302, headers: { Location: 'https://evil.example' } }),
    new Response('<html>address diagnostics</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    json({ errors: ['private diagnostics'] }), json({}), json([]),
  ]) {
    const { lookup } = await run([response])
    assertUnmatched(lookup, 'unavailable')
    assert.doesNotMatch(JSON.stringify(lookup.notes), /secret|diagnostics|evil/)
  }
  for (const response of [{ error: { message: 'private diagnostics' } }, {}, { features: [{}] }, parcel({ ...attributes(), ACCOUNT: 'invalid' })]) {
    assertUnmatched((await run([census(), response])).lookup, 'unavailable')
  }
})

test('network failures return a generic unavailable result', async () => {
  const lookup = await lookupPropertyRecords(ADDRESS, {
    fetch: async () => { throw new Error('upstream private address diagnostics') }, now: () => NOW,
  })
  assertUnmatched(lookup, 'unavailable')
  assert.doesNotMatch(JSON.stringify(lookup.notes), /diagnostics/)
})

test('declared or streamed oversize responses stop without returning partial property facts', async () => {
  const tooLarge = JSON.stringify({ padding: 'x'.repeat(100_000) })
  for (const response of [
    json(census(), { headers: { 'Content-Length': '100000' } }),
    json(census(), { headers: { 'Content-Length': 'not-a-number' } }),
    new Response(tooLarge, { headers: { 'Content-Type': 'application/json' } }),
  ]) assertUnmatched((await run([response])).lookup, 'unavailable')
  assertUnmatched((await run([census(), new Response(tooLarge, { headers: { 'Content-Type': 'application/json' } })])).lookup, 'unavailable')
})

test('timeout is bounded even when a fetch implementation ignores cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let signal: AbortSignal | null | undefined
  const pending = lookupPropertyRecords(ADDRESS, {
    fetch: async (_input, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    }, now: () => NOW,
  })
  context.mock.timers.tick(6_000)
  const lookup = await pending
  assertUnmatched(lookup, 'unavailable')
  assert.equal((signal as AbortSignal | undefined)?.aborted, true)
})

test('timeout also bounds a stalled response body and cancels the reader', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let cancelled = false
  const response = new Response(new ReadableStream({ cancel() { cancelled = true } }), {
    headers: { 'Content-Type': 'application/json' },
  })
  const pending = lookupPropertyRecords(ADDRESS, { fetch: async () => response, now: () => NOW })
  await Promise.resolve()
  await Promise.resolve()
  context.mock.timers.tick(6_000)
  assertUnmatched(await pending, 'unavailable')
  assert.equal(cancelled, true)
})
