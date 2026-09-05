import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { lookupPropertyRecords, type PropertyRecordsDiagnostic } from '../server/property-records.ts'
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
function streetAttributes(): Record<string, unknown> {
  return {
    LEFT_FROM: 12301, LEFT_TO: 12399, RIGHT_FROM: 12300, RIGHT_TO: 12398,
    Parity_L: 'O', Parity_R: 'E', PRE_DIR: null, ST_NAME: 'EXAMPLE GROVE', ST_TYPE: 'DR', POST_DIR: null,
    ZIP_L: '76244', ZIP_R: '76244', CITY_L: 'FORT WORTH', CITY_R: 'FORT WORTH',
    STATE_L: 'TX', STATE_R: 'TX', CNTYNAME_L: 'TARRANT', CNTYNAME_R: 'TARRANT',
    CNTYFIPS_L: '48439', CNTYFIPS_R: '48439',
  }
}
function streetParcel(row = streetAttributes()) { return { features: [{ attributes: row }] } }
function transportFailure() { return new TypeError('synthetic network failure', { cause: { code: 'ECONNRESET' } }) }
function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
}
function fakeFetch(responses: Array<unknown | Response>) {
  const calls: { url: URL; init: RequestInit | undefined }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init })
    assert.ok(responses.length, 'no unexpected provider requests')
    const response = responses.shift()
    if (response instanceof Error) throw response
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
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const pending = lookupPropertyRecords({ ...ADDRESS, regionCode: 'OK' }, {
    fetch: async (_input, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    }, now: () => NOW, onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  context.mock.timers.tick(6_000)
  const lookup = await pending
  assertUnmatched(lookup, 'unavailable')
  assert.equal((signal as AbortSignal | undefined)?.aborted, true)
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0]?.phase, 'census')
  assert.equal(diagnostics[0]?.reason, 'timeout')
})

test('timeout also bounds a stalled response body and cancels the reader', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let cancelled = false
  const response = new Response(new ReadableStream({ cancel() { cancelled = true } }), {
    headers: { 'Content-Type': 'application/json' },
  })
  const pending = lookupPropertyRecords({ ...ADDRESS, regionCode: 'OK' }, { fetch: async () => response, now: () => NOW })
  await Promise.resolve()
  await Promise.resolve()
  context.mock.timers.tick(6_000)
  assertUnmatched(await pending, 'unavailable')
  assert.equal(cancelled, true)
})

test('successful and ordinary no-match lookups emit no diagnostics', async () => {
  for (const responses of [[census(), parcel()], [{ result: { addressMatches: [] } }]]) {
    const { fetcher } = fakeFetch(responses)
    const diagnostics: PropertyRecordsDiagnostic[] = []
    const lookup = await lookupPropertyRecords(ADDRESS, { fetch: fetcher, now: () => NOW,
      onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
    })
    assert.notEqual(lookup.status, 'unavailable')
    assert.deepEqual(diagnostics, [])
  }
})

test('HTTP, MIME, size and JSON failures have closed safe diagnostic categories', async () => {
  const cases: [Response | unknown, PropertyRecordsDiagnostic['reason'], PropertyRecordsDiagnostic['mimeCategory']][] = [
    [json({ message: 'private-upstream-body' }, { status: 403 }), 'http_error', 'json'],
    [new Response('private-upstream-body', { headers: { 'Content-Type': 'text/html' } }), 'unsupported_content_type', 'html'],
    [new Response('private-upstream-body', { headers: { 'Content-Type': 'application/private-address-value' } }), 'unsupported_content_type', 'other'],
    [json(census(), { headers: { 'Content-Length': 'private-length' } }), 'invalid_content_length', 'json'],
    [json(census(), { headers: { 'Content-Length': '100000' } }), 'response_too_large', 'json'],
    [new Response('{private-invalid-json', { headers: { 'Content-Type': 'application/json' } }), 'invalid_json', 'json'],
    [json({ privateField: 'private-shape-detail' }), 'invalid_response_shape', undefined],
  ]
  for (const [response, reason, mimeCategory] of cases) {
    const { fetcher } = fakeFetch([response])
    const diagnostics: PropertyRecordsDiagnostic[] = []
    const lookup = await lookupPropertyRecords(ADDRESS, { fetch: fetcher, now: () => NOW,
      onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
    })
    assertUnmatched(lookup, 'unavailable')
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.phase, 'census')
    assert.equal(diagnostics[0]?.reason, reason)
    assert.equal(diagnostics[0]?.mimeCategory, mimeCategory)
    assert.ok(Number.isInteger(diagnostics[0]?.elapsedMs))
    assert.doesNotMatch(JSON.stringify(diagnostics), /private-|Example|76244|https:|12345|receipt|principal|Token/i)
    assert.doesNotMatch(JSON.stringify(lookup.notes), /http_error|unsupported_content_type|invalid_json|403/)
  }
})

test('a Tarrant-only failure is distinct from Census without recording address or parcel', async () => {
  const { fetcher } = fakeFetch([census(), json({ error: 'private-county-body' }, { status: 503 })])
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const lookup = await lookupPropertyRecords(ADDRESS, { fetch: fetcher, now: () => NOW,
    onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  assertUnmatched(lookup, 'unavailable')
  assert.equal(lookup.county?.fips, '48439')
  assert.equal(diagnostics[0]?.phase, 'tarrant')
  assert.equal(diagnostics[0]?.reason, 'http_error')
  assert.equal(diagnostics[0]?.httpStatus, 503)
  assert.deepEqual(Object.keys(diagnostics[0]!).sort(), ['elapsedMs', 'httpStatus', 'mimeCategory', 'phase', 'reason'].sort())
})

test('network failures record only allowlisted cause codes and static error kinds', async () => {
  for (const [thrown, expectedKind, expectedCode] of [
    [new TypeError('private URL and address', { cause: { code: 'ENOTFOUND', hostname: 'private-host' } }), 'TypeError', 'ENOTFOUND'],
    [new TypeError('private certificate detail', { cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' } }), 'TypeError', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'],
    [new TypeError('private network detail', { cause: { code: 'ENETUNREACH' } }), 'TypeError', 'ENETUNREACH'],
    [new TypeError('private URL and address'), 'TypeError', undefined],
    [{ name: 'private-error-name', message: 'private-address', cause: { code: 'private-network-code' } }, 'other', undefined],
    [Object.defineProperty({}, 'name', { get() { throw new Error('private getter') } }), 'other', undefined],
  ] as const) {
    const diagnostics: PropertyRecordsDiagnostic[] = []
    const lookup = await lookupPropertyRecords({ ...ADDRESS, regionCode: 'OK' }, {
      fetch: async () => { throw thrown }, now: () => NOW,
      onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
    })
    assertUnmatched(lookup, 'unavailable')
    assert.equal(diagnostics[0]?.reason, 'network_error')
    assert.equal(diagnostics[0]?.errorKind, expectedKind)
    assert.equal(diagnostics[0]?.networkCode, expectedCode)
    assert.doesNotMatch(JSON.stringify(diagnostics), /private|Example|76244|https:|12345/i)
  }
})

test('response reader failures are separated from fetch failures without raw error text', async () => {
  const broken = new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('private-stream-error')) },
  }), { headers: { 'Content-Type': 'application/json' } })
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const lookup = await lookupPropertyRecords(ADDRESS, { fetch: async () => broken, now: () => NOW,
    onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  assertUnmatched(lookup, 'unavailable')
  assert.equal(diagnostics[0]?.reason, 'response_read_error')
  assert.equal(diagnostics[0]?.errorKind, 'TypeError')
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-stream-error/)
})

test('a throwing diagnostic callback cannot alter the generic unavailable result', async () => {
  for (const onDiagnostic of [
    () => { throw new Error('private-logging-error') },
    async () => { throw new Error('private-async-logging-error') },
  ]) {
    const lookup = await lookupPropertyRecords(ADDRESS, {
      fetch: async () => { throw new TypeError('private-provider-error') }, now: () => NOW, onDiagnostic,
    })
    assertUnmatched(lookup, 'unavailable')
    assert.deepEqual(lookup.notes, ['Public property records are temporarily unavailable. You can continue without them.'])
  }
})

test('configured adapter logs only enumerated diagnostic fields, not full objects or inputs', () => {
  const source = readFileSync(new URL('../server/property-records-http.ts', import.meta.url), 'utf8')
  const callback = source.slice(source.indexOf('onDiagnostic: diagnostic =>'), source.indexOf('async requirePrincipal(sessionHandle)'))
  assert.match(callback, /console\.warn\(JSON\.stringify\(\{ event: 'homesrolo_property_lookup_unavailable'/)
  assert.doesNotMatch(callback, /\.\.\.diagnostic|JSON\.stringify\(diagnostic\)|diagnostic\.(?:message|stack|cause|url|address|body)/)
  for (const field of ['phase', 'reason', 'elapsedMs', 'httpStatus', 'mimeCategory', 'errorKind', 'networkCode']) {
    assert.match(callback, new RegExp(`${field}: diagnostic\\.${field}`))
  }
})

test('Census transport failure can use one exact TC911 side plus one separate exact TAD parcel', async () => {
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const { fetcher, calls } = fakeFetch([transportFailure(), streetParcel(), parcel()])
  const lookup = await lookupPropertyRecords(ADDRESS, { fetch: fetcher, now: () => NOW,
    onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  assert.equal(propertyLookupSchema.safeParse(lookup).success, true)
  assert.equal(lookup.status, 'matched')
  assert.deepEqual(lookup.address, ADDRESS)
  assert.deepEqual(lookup.county, { name: 'Tarrant County', fips: '48439' })
  assert.equal(lookup.source?.parcelId, '12345678')
  assert.equal(lookup.facts.squareFeet, 3500)
  assert.equal(lookup.facts.bedrooms, null)
  assert.equal(lookup.facts.bathrooms, null)
  assert.ok(lookup.notes.some(note => note.includes('not an individual address-point or roof verification')))
  assert.deepEqual(diagnostics, [], 'a recovered successful lookup stays silent')
  assert.equal(calls.length, 3)
  assert.equal(calls[1]?.url.pathname, '/arcgis/rest/services/Dynamic/TC911_Streets/MapServer/0/query')
  assert.equal(calls[1]?.url.hostname, 'mapit.tarrantcounty.com')
  assert.match(calls[1]?.url.searchParams.get('where') ?? '', /^UPPER\(ST_NAME\) = 'EXAMPLE GROVE' AND /)
  assert.match(calls[1]?.url.searchParams.get('where') ?? '', /LEFT_FROM <= 12345/)
  assert.doesNotMatch(calls[1]?.url.searchParams.get('outFields') ?? '', /OWNER|RATE|TELCO|ESN|\*/)
  assert.equal(calls[1]?.url.searchParams.get('returnGeometry'), 'false')
  assert.equal(calls[1]?.url.searchParams.get('resultRecordCount'), '10')
  assert.equal(calls[2]?.url.searchParams.get('where'), "STREET_NO = 12345 AND UPPER(STREET_NAM) = 'EXAMPLE GROVE'")
  assert.ok(calls.every(call => call.init?.redirect === 'error' && call.init.signal instanceof AbortSignal))
})

test('only transport failures and HTTP 429 or 5xx allow fallback', async () => {
  for (const status of [429, 500, 503]) {
    const { lookup, calls } = await run([json({}, { status }), streetParcel(), parcel()])
    assert.equal(lookup.status, 'matched')
    assert.equal(calls.length, 3)
  }
  for (const response of [
    ...[400, 401, 403, 404].map(status => json({}, { status })),
    json({}, { status: 302, headers: { Location: 'https://other.example' } }),
    new Response('<html>challenge</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    json(census(), { headers: { 'Content-Length': '100000' } }),
    new TypeError('unknown failure or blocked redirect'),
    new TypeError('TLS verification failure', { cause: { code: 'CERT_HAS_EXPIRED' } }),
    new TypeError('programming error', { cause: { code: 'ERR_INVALID_URL' } }),
    {}, { errors: ['semantic failure'] }, { result: { addressMatches: null } },
  ]) {
    const { lookup, calls } = await run([response])
    assertUnmatched(lookup, 'unavailable')
    assert.equal(calls.length, 1)
  }
})

test('parsed Census no-match, ambiguity, mismatch and unsupported/malformed county never fall back', async () => {
  const mismatch = censusMatch()
  mismatch.matchedAddress = '12346 EXAMPLE GROVE DR, FORT WORTH, TX, 76244'
  const otherCounty = censusMatch()
  otherCounty.geographies.Counties = [{ GEOID: '48121', NAME: 'Denton County' }]
  const malformedCounty = censusMatch()
  malformedCounty.geographies.Counties = [{ GEOID: '48439', NAME: 'Denton County' }]
  const missingCounty = censusMatch()
  missingCounty.geographies.Counties = []
  for (const matches of [[], [censusMatch(), censusMatch()], [mismatch], [otherCounty], [malformedCounty], [missingCounty]]) {
    const { lookup, calls } = await run([{ result: { addressMatches: matches } }])
    assert.notEqual(lookup.status, 'matched')
    assert.equal(calls.length, 1)
  }
})

test('fallback requires exactly one untruncated street record and one qualifying side', async () => {
  for (const [response, status] of [
    [{ features: [] }, 'no_match'],
    [{ features: [streetParcel().features[0], streetParcel().features[0]] }, 'ambiguous'],
    [{ ...streetParcel(), exceededTransferLimit: true }, 'ambiguous'],
    [streetParcel({ ...streetAttributes(), RIGHT_FROM: 12301, RIGHT_TO: 12399, Parity_R: 'O' }), 'ambiguous'],
    [streetParcel({ ...streetAttributes(), RIGHT_FROM: 12301, RIGHT_TO: 12399, Parity_R: 'O', ZIP_R: '76111', CNTYFIPS_R: '48121' }), 'ambiguous'],
    [{ ...streetParcel(), exceededTransferLimit: 'true' }, 'unavailable'],
    [{ ...streetParcel(), exceededTransferLimit: 1 }, 'unavailable'],
    [{ features: null }, 'unavailable'], [{ features: [{}] }, 'unavailable'],
  ] as const) {
    const { lookup, calls } = await run([transportFailure(), response])
    assertUnmatched(lookup, status)
    assert.equal(calls.length, 2)
  }
})

test('street range requires nonzero integer endpoints, explicit matching parity and inclusive bounds', async () => {
  for (const change of [
    { LEFT_FROM: 0 }, { LEFT_FROM: null }, { LEFT_TO: -1 }, { LEFT_TO: 12399.5 },
    { LEFT_FROM: '12301' }, { LEFT_FROM: 12300 }, { LEFT_TO: 12398 },
    { LEFT_FROM: 12347 }, { LEFT_TO: 12343 }, { Parity_L: '' }, { Parity_L: 'B' }, { Parity_L: 'E' },
  ]) {
    const { lookup, calls } = await run([transportFailure(), streetParcel({ ...streetAttributes(), ...change })])
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 2)
  }
  const { lookup } = await run([transportFailure(),
    streetParcel({ ...streetAttributes(), LEFT_FROM: 12399, LEFT_TO: 12301 }), parcel()])
  assert.equal(lookup.status, 'matched', 'descending ranges with exact parity remain valid')
})

test('street corroboration never mixes sides or accepts blank/conflicting ZIP or jurisdiction', async () => {
  for (const change of [
    { ZIP_L: '' }, { ZIP_L: null }, { ZIP_L: '76111' }, { ZIP_L: '76244-' },
    { CITY_L: '' }, { CITY_L: 'KELLER' }, { STATE_L: '' }, { STATE_L: 'OK' },
    { CNTYNAME_L: '' }, { CNTYNAME_L: 'DENTON' }, { CNTYFIPS_L: '' }, { CNTYFIPS_L: '48121' },
    { CNTYFIPS_L: 48439 }, { ZIP_L: '', ZIP_R: '76244', CNTYFIPS_L: '48439', CNTYFIPS_R: '' },
  ]) {
    const { lookup, calls } = await run([transportFailure(), streetParcel({ ...streetAttributes(), ...change })])
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 2)
  }
})

test('TC911 full street and TAD component address must both remain exact', async () => {
  for (const change of [{ PRE_DIR: 'N' }, { POST_DIR: 'W' }, { ST_TYPE: 'LN' }, { ST_NAME: 'OTHER GROVE' },
    { PRE_DIR: undefined }, { POST_DIR: undefined }, { PRE_DIR: 0 }, { ST_NAME: null }]) {
    const { lookup, calls } = await run([transportFailure(), streetParcel({ ...streetAttributes(), ...change })])
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 2)
  }
  for (const response of [
    parcel({ ...attributes(), ZIPCODE: '76111' }), parcel({ ...attributes(), PREDIR: 'N' }),
    parcel({ ...attributes(), ADDENDUM_T: 'UNIT', ADDENDUM: '2' }),
    parcel({ ...attributes(), SITUS_ADDR: '12346 EXAMPLE GROVE DR' }),
  ]) {
    const { lookup, calls } = await run([transportFailure(), streetParcel(), response])
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 3)
  }
})

test('explicit null TC911 directions mean absence, never a match for a directed request', async () => {
  for (const line1 of ['12345 North Example Grove Drive', '12345 Example Grove Drive West']) {
    const { lookup, calls } = await run([transportFailure(), streetParcel()], { ...ADDRESS, line1 })
    assertUnmatched(lookup, 'no_match')
    assert.equal(calls.length, 2)
  }
})

test('fallback keeps unit gate before any external request and never queries Tarrant for other states', async () => {
  const unit = await run([], { ...ADDRESS, line2: 'Unit 4' })
  assertUnmatched(unit.lookup, 'no_match')
  assert.equal(unit.calls.length, 0)
  const otherState = await run([transportFailure()], { ...ADDRESS, regionCode: 'OK' })
  assertUnmatched(otherState.lookup, 'unavailable')
  assert.equal(otherState.calls.length, 1)
})

test('fallback diagnostics use a closed street phase and preserve response limits', async () => {
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const { fetcher, calls } = fakeFetch([transportFailure(),
    json(streetParcel(), { headers: { 'Content-Length': '100000' } })])
  const lookup = await lookupPropertyRecords(ADDRESS, { fetch: fetcher, now: () => NOW,
    onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  assertUnmatched(lookup, 'unavailable')
  assert.equal(calls.length, 2)
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0]?.phase, 'tarrant_street')
  assert.equal(diagnostics[0]?.reason, 'response_too_large')
  assert.doesNotMatch(JSON.stringify(diagnostics), /Example|76244|https:|12345|synthetic/i)
})

test('a six-second Census deadline recovers through exactly two bounded county requests', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { fetcher: countyFetch, calls } = fakeFetch([streetParcel(), parcel()])
  let totalCalls = 0
  let censusSignal: AbortSignal | null | undefined
  const diagnostics: PropertyRecordsDiagnostic[] = []
  const pending = lookupPropertyRecords(ADDRESS, { now: () => NOW,
    fetch: async (input, init) => {
      totalCalls++
      if (totalCalls === 1) {
        censusSignal = init?.signal
        return new Promise<Response>(() => {})
      }
      return countyFetch(input, init)
    }, onDiagnostic: diagnostic => { diagnostics.push(diagnostic) },
  })
  context.mock.timers.tick(6_000)
  const lookup = await pending
  assert.equal(lookup.status, 'matched')
  assert.equal((censusSignal as AbortSignal | undefined)?.aborted, true)
  assert.equal(totalCalls, 3)
  assert.equal(calls.length, 2)
  assert.deepEqual(diagnostics, [])
})

test('fallback still rejects duplicate, truncated or malformed-limit TAD parcel responses', async () => {
  for (const [response, status] of [
    [{ features: [parcel().features[0], parcel().features[0]] }, 'ambiguous'],
    [{ ...parcel(), exceededTransferLimit: true }, 'ambiguous'],
    [{ ...parcel(), exceededTransferLimit: 'true' }, 'unavailable'],
  ] as const) {
    const { lookup, calls } = await run([transportFailure(), streetParcel(), response])
    assertUnmatched(lookup, status)
    assert.equal(calls.length, 3)
  }
})
