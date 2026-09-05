import type { PropertyLookup } from '../../../../src/homeowner/property-research.v1.ts'

type Address = PropertyLookup['address']
type JsonRecord = Record<string, unknown>

const NETWORK_CODES = [
  'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
] as const
type NetworkCode = typeof NETWORK_CODES[number]
type FailureReason = 'network_error' | 'http_error' | 'unexpected_redirect'
  | 'unsupported_content_type' | 'missing_body' | 'invalid_content_length'
  | 'response_too_large' | 'invalid_json' | 'invalid_response_shape'
  | 'response_read_error' | 'timeout'
type MimeCategory = 'json' | 'html' | 'other' | 'missing'
type ErrorKind = 'TypeError' | 'AbortError' | 'TimeoutError' | 'Error' | 'other'

/** Closed diagnostic vocabulary: never includes input, URLs, response text or raw errors. */
export interface PropertyRecordsDiagnostic {
  readonly phase: 'census' | 'tarrant'
  readonly reason: FailureReason
  readonly elapsedMs: number
  readonly httpStatus?: number
  readonly mimeCategory?: MimeCategory
  readonly errorKind?: ErrorKind
  readonly networkCode?: NetworkCode
}

type FailureMetadata = Pick<PropertyRecordsDiagnostic, 'httpStatus' | 'mimeCategory' | 'errorKind' | 'networkCode'>
class PropertyRecordsFailure extends Error {
  readonly reason: FailureReason
  readonly metadata: FailureMetadata
  constructor(reason: FailureReason, metadata: FailureMetadata = {}) {
    super('Property records unavailable')
    this.reason = reason
    this.metadata = metadata
  }
}

function safeErrorMetadata(error: unknown): FailureMetadata {
  // Even thrown objects with hostile getters cannot change the public failure result.
  try {
    if (!isRecord(error)) return { errorKind: 'other' }
    const name = error.name
    const errorKind: ErrorKind = name === 'TypeError' || name === 'AbortError'
      || name === 'TimeoutError' || name === 'Error' ? name : 'other'
    const cause = isRecord(error.cause) ? error.cause : null
    const code = cause?.code ?? error.code
    return { errorKind, ...(NETWORK_CODES.some(allowed => allowed === code) ? { networkCode: code as NetworkCode } : {}) }
  } catch { return { errorKind: 'other' } }
}

function responseMetadata(response: Response): FailureMetadata {
  const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const mimeCategory: MimeCategory = !mime ? 'missing' : mime === 'application/json'
    ? 'json' : mime === 'text/html' ? 'html' : 'other'
  return { mimeCategory,
    ...(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? { httpStatus: response.status } : {}),
  }
}

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'
const TARRANT_LAYER = 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0'
const MAX_RESPONSE_BYTES = 96 * 1024
const REQUEST_TIMEOUT_MS = 6_000
// Deliberately excludes owners, mailing addresses, financial data and retired room fields.
const PARCEL_FIELDS = [
  'ACCOUNT', 'SITUS_ADDR', 'CITY', 'ZIPCODE', 'STATE', 'STREET_NO', 'STREET_NAM',
  'STREET_TYP', 'PREDIR', 'POSTDIR', 'ADDENDUM_T', 'ADDENDUM', 'YEAR_BUILT',
  'LIVING_ARE', 'LAND_SQFT', 'GARAGE_CAP', 'CENTRAL_HE', 'CENTRAL_AI',
  'SubdivisionName', 'APPRAISAL_',
].join(',')

const DIRECTIONS: Readonly<Record<string, string>> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW',
  SOUTHEAST: 'SE', SOUTHWEST: 'SW',
}
const SUFFIXES: Readonly<Record<string, string>> = {
  ALLEY: 'ALY', AVENUE: 'AVE', BOULEVARD: 'BLVD', CIRCLE: 'CIR', COURT: 'CT',
  COVE: 'CV', DRIVE: 'DR', EXPRESSWAY: 'EXPY', HIGHWAY: 'HWY', LANE: 'LN',
  LOOP: 'LOOP', PARKWAY: 'PKWY', PLACE: 'PL', ROAD: 'RD', SQUARE: 'SQ',
  STREET: 'ST', TERRACE: 'TER', TRAIL: 'TRL', TURNPIKE: 'TPKE', WAY: 'WAY',
}
const DIRECTION_CODES = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'])

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f\u007f<>]/.test(value)) return null
  return value.trim().replace(/\s+/g, ' ')
}

function normalized(value: unknown): string | null {
  return text(value)?.toUpperCase().replace(/\./g, '') ?? null
}

function street(value: unknown): { number: number; canonical: string } | null {
  const clean = normalized(value)
  if (!clean || !/^[1-9]\d{0,7} [A-Z0-9 '\/-]+$/.test(clean)) return null
  const words = clean.split(' ')
  const number = Number(words.shift())
  if (!words.length || words.some(word => ['APT', 'APARTMENT', 'UNIT', 'SUITE', 'STE'].includes(word))) return null
  if (words[0]) words[0] = DIRECTIONS[words[0]] ?? words[0]
  const last = words.length - 1
  if (words[last]) words[last] = DIRECTIONS[words[last]] ?? words[last]
  const suffixIndex = DIRECTION_CODES.has(words[last] ?? '') ? last - 1 : last
  const suffix = words[suffixIndex]
  if (suffix) words[suffixIndex] = SUFFIXES[suffix] ?? suffix
  return { number, canonical: `${number} ${words.join(' ')}` }
}

function zip(value: unknown): string | null {
  const clean = text(value)
  return clean && /^\d{5}(?:-\d{4})?$/.test(clean) ? clean.slice(0, 5) : null
}

function emptyFacts(): PropertyLookup['facts'] {
  return {
    squareFeet: null, yearBuilt: null, lotSquareFeet: null, bedrooms: null,
    bathrooms: null, rooms: null, garageSpaces: null, centralHeat: null,
    centralAir: null, subdivision: null,
  }
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function yesNo(value: unknown): boolean | null {
  const clean = normalized(value)
  return clean === 'Y' ? true : clean === 'N' ? false : null
}

async function readJson(response: Response, signal: AbortSignal): Promise<JsonRecord> {
  const metadata = responseMetadata(response)
  if (!response.ok) throw new PropertyRecordsFailure('http_error', metadata)
  if (response.redirected) throw new PropertyRecordsFailure('unexpected_redirect', metadata)
  if (!response.body) throw new PropertyRecordsFailure('missing_body', metadata)
  if (metadata.mimeCategory !== 'json') throw new PropertyRecordsFailure('unsupported_content_type', metadata)
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    void response.body.cancel().catch(() => {})
    throw new PropertyRecordsFailure(/^\d+$/.test(declared) ? 'response_too_large' : 'invalid_content_length', metadata)
  }
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw new PropertyRecordsFailure('timeout', metadata)
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        cancel()
        throw new PropertyRecordsFailure('response_too_large', metadata)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    let result: unknown
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new PropertyRecordsFailure('invalid_json', metadata) }
    if (!isRecord(result)) throw new PropertyRecordsFailure('invalid_response_shape', metadata)
    return result
  } catch (error) {
    if (error instanceof PropertyRecordsFailure) throw error
    throw new PropertyRecordsFailure(signal.aborted ? 'timeout' : 'response_read_error',
      { ...metadata, ...safeErrorMetadata(error) })
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

async function requestJson(url: URL, fetcher: typeof fetch): Promise<JsonRecord> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new PropertyRecordsFailure('timeout'))
    }, REQUEST_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      (async () => {
        let response: Response
        try {
          response = await fetcher(url, {
            method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error',
            cache: 'no-store', signal: controller.signal,
          })
        } catch (error) {
          throw new PropertyRecordsFailure(controller.signal.aborted ? 'timeout' : 'network_error', safeErrorMetadata(error))
        }
        return readJson(response, controller.signal)
      })(),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

function censusAddressMatches(match: JsonRecord, address: Address, canonicalStreet: string): boolean {
  const matched = text(match.matchedAddress)?.split(',').map(part => part.trim())
  const parts = match.addressComponents
  return Boolean(matched && matched.length === 4 && isRecord(parts) &&
    street(matched[0])?.canonical === canonicalStreet &&
    normalized(matched[1]) === normalized(address.city) &&
    normalized(matched[2]) === normalized(address.regionCode) && zip(matched[3]) === zip(address.postalCode) &&
    normalized(parts.city) === normalized(address.city) && normalized(parts.state) === normalized(address.regionCode) &&
    zip(parts.zip) === zip(address.postalCode))
}

function countyAddressMatches(row: JsonRecord, address: Address, canonicalStreet: string): boolean {
  if (text(row.ADDENDUM_T) || text(row.ADDENDUM)) return false
  if (row.ADDENDUM_T !== null && text(row.ADDENDUM_T) === null) return false
  if (row.ADDENDUM !== null && text(row.ADDENDUM) === null) return false
  const number = integer(row.STREET_NO, 1, 99_999_999)
  const components = [row.PREDIR, row.STREET_NAM, row.STREET_TYP, row.POSTDIR].map(text)
  if (number === null || components.some(component => component === null) || !components[1]) return false
  const componentStreet = street([number, ...components.filter(Boolean)].join(' '))
  const countyZip = text(row.ZIPCODE)
  return street(row.SITUS_ADDR)?.canonical === canonicalStreet && componentStreet?.canonical === canonicalStreet &&
    normalized(row.CITY) === normalized(address.city) && normalized(row.STATE) === normalized(address.regionCode) &&
    countyZip !== null && (countyZip === '' || zip(countyZip) === zip(address.postalCode))
}

/** Public property facts only. This does not verify occupancy/ownership or authorize home access. */
export async function lookupPropertyRecords(
  address: Address,
  options: { fetch?: typeof fetch; now?: () => string; onDiagnostic?: (diagnostic: PropertyRecordsDiagnostic) => void | Promise<void> } = {},
): Promise<PropertyLookup> {
  const requestedAddress = { ...address }
  const retrievedAt = (options.now ?? (() => new Date().toISOString()))()
  let county: PropertyLookup['county'] = null
  const result = (status: PropertyLookup['status'], notes: readonly string[]): PropertyLookup => ({
    version: 'property-lookup.v1', status, address: requestedAddress, matchedAddress: null,
    county, retrievedAt, source: null, facts: emptyFacts(), notes: [...notes],
  })
  if (address.countryCode !== 'US') return result('unsupported', ['Public-record lookup currently supports selected U.S. counties.'])
  if (address.line2 !== null && address.line2.trim() !== '') {
    return result('no_match', ['Unit-level property records could not be verified. You can enter the home details yourself.'])
  }
  const requestedStreet = street(address.line1)
  if (!requestedStreet || !zip(address.postalCode) || !/^[A-Z]{2}$/.test(normalized(address.regionCode) ?? '') || !normalized(address.city)) {
    return result('no_match', ['We could not verify an exact address match. You can enter the home details yourself.'])
  }
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  let phase: PropertyRecordsDiagnostic['phase'] = 'census'
  let phaseStartedAt = Date.now()
  try {
    const censusUrl = new URL(CENSUS_URL)
    censusUrl.search = new URLSearchParams({
      address: `${address.line1}, ${address.city}, ${address.regionCode} ${address.postalCode}`,
      benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'Counties', format: 'json',
    }).toString()
    const census = await requestJson(censusUrl, fetcher)
    if (census.errors || !isRecord(census.result) || !Array.isArray(census.result.addressMatches)) throw new Error('Property records unavailable')
    const matches = census.result.addressMatches
    if (!matches.length) return result('no_match', ['No exact public-record address match was found.'])
    if (matches.length > 1) return result('ambiguous', ['More than one address matched. We have not selected a property.'])
    const match: unknown = matches[0]
    if (!isRecord(match) || !censusAddressMatches(match, address, requestedStreet.canonical)) {
      return result('no_match', ['The public-record address did not match the address you entered.'])
    }
    if (!isRecord(match.geographies) || !Array.isArray(match.geographies.Counties)) throw new Error('Property records unavailable')
    const counties = match.geographies.Counties
    if (counties.length > 1) return result('ambiguous', ['The address could not be matched to one county.'])
    const countyRecord: unknown = counties[0]
    if (!isRecord(countyRecord) || !/^\d{5}$/.test(text(countyRecord.GEOID) ?? '') ||
        !text(countyRecord.NAME) || text(countyRecord.NAME)!.length > 120) throw new Error('Property records unavailable')
    county = { name: text(countyRecord.NAME)!, fips: text(countyRecord.GEOID)! }
    if (county.fips !== '48439') return result('unsupported', ['Automatic property records are not connected for this county yet.'])
    if (county.name !== 'Tarrant County' || normalized(address.regionCode) !== 'TX') throw new Error('Property records unavailable')
    const parts = match.addressComponents as JsonRecord
    const streetName = normalized(parts.streetName)
    if (!streetName || !/^[A-Z0-9 '\/-]+$/.test(streetName)) throw new Error('Property records unavailable')
    const parcelUrl = new URL(`${TARRANT_LAYER}/query`)
    parcelUrl.search = new URLSearchParams({
      where: `STREET_NO = ${requestedStreet.number} AND UPPER(STREET_NAM) = '${streetName.replace(/'/g, "''")}'`,
      outFields: PARCEL_FIELDS, returnGeometry: 'false', resultRecordCount: '10', f: 'json',
    }).toString()
    phase = 'tarrant'
    phaseStartedAt = Date.now()
    const parcel = await requestJson(parcelUrl, fetcher)
    if (parcel.error || !Array.isArray(parcel.features)) throw new Error('Property records unavailable')
    if (parcel.exceededTransferLimit === true || parcel.features.length > 1) {
      return result('ambiguous', ['More than one parcel matched. We have not selected a property.'])
    }
    if (!parcel.features.length) return result('no_match', ['No exact county property record was found.'])
    const feature: unknown = parcel.features[0]
    if (!isRecord(feature) || !isRecord(feature.attributes)) throw new Error('Property records unavailable')
    const row = feature.attributes
    if (!countyAddressMatches(row, address, requestedStreet.canonical)) {
      return result('no_match', ['The county property record did not match the address you entered.'])
    }
    const parcelId = text(row.ACCOUNT)
    if (!parcelId || !/^\d{8}$/.test(parcelId)) throw new Error('Property records unavailable')
    const currentYear = new Date(retrievedAt).getUTCFullYear()
    const recordEpoch = integer(row.APPRAISAL_, Date.UTC(1900, 0, 1), Date.UTC(currentYear + 2, 0, 1) - 1)
    const subdivision = text(row.SubdivisionName)
    return {
      ...result('matched', [
        'County records may be incomplete or out of date. Review these details before saving.',
        'Bedroom, bathroom and total-room counts are not available from this county feed.',
        'The record date is the appraisal date, not the date the data was last updated.',
      ]),
      matchedAddress: text(match.matchedAddress),
      source: {
        id: 'tarrant_county', title: 'Tarrant County · Tarrant Appraisal District',
        url: TARRANT_LAYER, parcelId, recordDate: recordEpoch === null ? null : new Date(recordEpoch).toISOString().slice(0, 10),
      },
      facts: {
        ...emptyFacts(), squareFeet: integer(row.LIVING_ARE, 100, 100_000),
        yearBuilt: integer(row.YEAR_BUILT, 1600, currentYear + 1), lotSquareFeet: integer(row.LAND_SQFT, 1, 1_000_000_000),
        garageSpaces: integer(row.GARAGE_CAP, 0, 100), centralHeat: yesNo(row.CENTRAL_HE),
        centralAir: yesNo(row.CENTRAL_AI), subdivision: subdivision && subdivision.length <= 100 ? subdivision : null,
      },
    }
  } catch (error) {
    // Diagnostics are opt-in and never reach the client, even if their sink throws.
    // The fields here come only from closed enums, bounded numbers and fixed metadata.
    try {
      const failure = error instanceof PropertyRecordsFailure ? error : null
      void Promise.resolve(options.onDiagnostic?.({ phase, reason: failure?.reason ?? 'invalid_response_shape',
        elapsedMs: Math.max(0, Math.min(60_000, Math.round(Date.now() - phaseStartedAt))),
        ...(failure?.metadata ?? safeErrorMetadata(error)),
      })).catch(() => {})
    } catch { /* An unavailable diagnostic sink must never change the safe result. */ }
    return result('unavailable', ['Public property records are temporarily unavailable. You can continue without them.'])
  }
}
