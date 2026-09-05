import type { HomeRecordAddress, HomePropertySnapshot, PropertyFacts, PropertyLookup, PropertyLookupResult } from './model.ts'
import { reviewedHomeRecordAddress } from './home-record.ts'
import { isHomeRef } from './protocol.ts'
import { sameHomeRecordAddress } from '../home/onboarding.ts'

const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/
const RECEIPT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/
export const PROPERTY_SOURCE_URL = 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0'
const FACT_KEYS = ['squareFeet', 'yearBuilt', 'lotSquareFeet', 'bedrooms', 'bathrooms', 'rooms', 'garageSpaces', 'centralHeat', 'centralAir', 'subdivision'] as const

function fail(): never { throw new Error('invalid_wire_data') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return fail()
  return value as Record<string, unknown>
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || !SAFE_TEXT.test(value)) return fail()
  return value
}
function timestamp(value: unknown): string {
  const result = text(value, 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result)
    || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) return fail()
  return result
}
function number(value: unknown, minimum: number, maximum: number, increment = 1): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum
    || (increment !== 0 && !Number.isInteger(value / increment))) return fail()
  return value
}
function boolean(value: unknown): boolean | null {
  return value === null || typeof value === 'boolean' ? value : fail()
}
function address(value: unknown): HomeRecordAddress {
  const input = object(value, ['line1', 'line2', 'city', 'regionCode', 'postalCode', 'countryCode'])
  if (typeof input.line1 !== 'string' || (input.line2 !== null && typeof input.line2 !== 'string')
    || typeof input.city !== 'string' || typeof input.regionCode !== 'string'
    || typeof input.postalCode !== 'string' || input.countryCode !== 'US') return fail()
  return reviewedHomeRecordAddress(input as unknown as HomeRecordAddress) ?? fail()
}
function sourceUrl(value: unknown): typeof PROPERTY_SOURCE_URL {
  return value === PROPERTY_SOURCE_URL ? value : fail()
}

export function parsePropertyFacts(value: unknown): PropertyFacts {
  const facts = object(value, FACT_KEYS)
  return {
    squareFeet: number(facts.squareFeet, 1, 1_000_000),
    yearBuilt: number(facts.yearBuilt, 1000, 2100),
    lotSquareFeet: number(facts.lotSquareFeet, Number.MIN_VALUE, 1e10, 0),
    bedrooms: number(facts.bedrooms, 0, 100),
    bathrooms: number(facts.bathrooms, 0, 100, 0.25),
    rooms: number(facts.rooms, 0, 1000),
    garageSpaces: number(facts.garageSpaces, 0, 100),
    centralHeat: boolean(facts.centralHeat),
    centralAir: boolean(facts.centralAir),
    subdivision: facts.subdivision === null ? null : text(facts.subdivision, 160).trim(),
  }
}

export function parsePropertyLookup(value: unknown): PropertyLookup {
  const lookup = object(value, ['version', 'status', 'address', 'matchedAddress', 'county', 'retrievedAt', 'source', 'facts', 'notes'])
  if (lookup.version !== 'property-lookup.v1' || typeof lookup.status !== 'string'
    || !['matched', 'no_match', 'ambiguous', 'unsupported', 'unavailable'].includes(lookup.status)) return fail()
  const county = lookup.county === null ? null : object(lookup.county, ['name', 'fips'])
  if (county && (typeof county.fips !== 'string' || !/^\d{5}$/.test(county.fips))) return fail()
  const source = lookup.source === null ? null : object(lookup.source, ['id', 'title', 'url', 'parcelId', 'recordDate'])
  if (source && source.id !== 'tarrant_county') return fail()
  const facts = parsePropertyFacts(lookup.facts)
  if (lookup.status === 'matched' && (!source || county?.fips !== '48439' || lookup.matchedAddress === null)) return fail()
  if (lookup.status !== 'matched' && (source || lookup.matchedAddress !== null || Object.values(facts).some(value => value !== null))) return fail()
  if (source && (typeof source.parcelId !== 'string' || !/^\d{1,20}$/.test(source.parcelId)
    || (source.recordDate !== null && (typeof source.recordDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.recordDate))))) return fail()
  if (!Array.isArray(lookup.notes) || lookup.notes.length > 8) return fail()
  return {
    version: 'property-lookup.v1', status: lookup.status as PropertyLookup['status'], address: address(lookup.address),
    matchedAddress: lookup.matchedAddress === null ? null : text(lookup.matchedAddress, 360),
    county: county ? { name: text(county.name, 120), fips: county.fips as string } : null,
    retrievedAt: timestamp(lookup.retrievedAt),
    source: source ? {
      id: 'tarrant_county', title: text(source.title, 160), url: sourceUrl(source.url),
      parcelId: text(source.parcelId, 160), recordDate: source.recordDate === null ? null : text(source.recordDate, 40),
    } : null,
    facts, notes: lookup.notes.map(note => text(note, 500)),
  }
}

export function validPropertyReceipt(receipt: unknown): receipt is string | null {
  return receipt === null || (typeof receipt === 'string' && receipt.length <= 16_000 && RECEIPT.test(receipt))
}

export function parsePropertyLookupResult(value: unknown, expectedAddress: HomeRecordAddress): PropertyLookupResult {
  const envelope = object(value, ['lookup', 'receipt'])
  const lookup = parsePropertyLookup(envelope.lookup)
  if (!sameHomeRecordAddress(lookup.address, expectedAddress) || !validPropertyReceipt(envelope.receipt)
    || (lookup.status === 'matched') !== (envelope.receipt !== null)) return fail()
  return { lookup, receipt: envelope.receipt }
}

export function parseHomePropertySnapshot(value: unknown, expectedHomeRef: string): HomePropertySnapshot | null {
  if (value === null) return null
  const snapshot = object(value, ['version', 'homeRef', 'address', 'facts', 'lookup', 'reviewedAt'])
  if (snapshot.version !== 'home-property-snapshot.v1' || !isHomeRef(snapshot.homeRef)
    || snapshot.homeRef !== expectedHomeRef) return fail()
  const reviewedAddress = address(snapshot.address)
  const lookup = snapshot.lookup === null ? null : parsePropertyLookup(snapshot.lookup)
  if (lookup && (lookup.status !== 'matched' || !sameHomeRecordAddress(lookup.address, reviewedAddress))) return fail()
  return { version: 'home-property-snapshot.v1', homeRef: snapshot.homeRef, address: reviewedAddress,
    facts: parsePropertyFacts(snapshot.facts), lookup, reviewedAt: timestamp(snapshot.reviewedAt) }
}

export interface SaveHomePropertyInput {
  readonly commandRef: string
  readonly address: HomeRecordAddress
  readonly facts: PropertyFacts
  readonly receipt: string | null
}

export function saveHomePropertyBody(input: SaveHomePropertyInput): SaveHomePropertyInput | null {
  if (!/^hcmd_[A-Za-z0-9_-]{43}$/.test(input.commandRef) || !validPropertyReceipt(input.receipt)) return null
  try { return { commandRef: input.commandRef, address: address(input.address), facts: parsePropertyFacts(input.facts), receipt: input.receipt } } catch { return null }
}
