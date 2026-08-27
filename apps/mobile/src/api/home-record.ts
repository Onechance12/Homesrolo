import type {
  ApproximateYear,
  HomeRecordAddress,
  HomeRecordProfile,
  HomeSystemKind,
  HomeSystemRecord,
  HomeType,
  UpdateHomeRecordInput,
} from './model.ts'
import { isHomeRef } from './protocol.ts'

type JsonRecord = Record<string, unknown>

export const HOME_SYSTEM_KINDS = [
  'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
] as const satisfies readonly HomeSystemKind[]

export const HOME_TYPES = [
  'unknown', 'house', 'townhouse', 'condo', 'other',
] as const satisfies readonly HomeType[]

const SYSTEM_KIND_SET = new Set<HomeSystemKind>(HOME_SYSTEM_KINDS)
const HOME_TYPE_SET = new Set<HomeType>(HOME_TYPES)
const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_wire_data')
  return value as JsonRecord
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || !SAFE_TEXT.test(value)) throw new Error('invalid_wire_data')
  return value
}

function year(value: unknown): ApproximateYear | null {
  if (value === null) return null
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== 'precision,value'
    || typeof source.value !== 'number' || !Number.isInteger(source.value)
    || source.value < 1800 || source.value > 9999
    || (source.precision !== 'exact' && source.precision !== 'approximate')) {
    throw new Error('invalid_wire_data')
  }
  return { value: source.value, precision: source.precision }
}

function address(value: unknown): HomeRecordAddress | null {
  if (value === null) return null
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== 'city,countryCode,line1,line2,postalCode,regionCode'
    || source.countryCode !== 'US'
    || typeof source.regionCode !== 'string' || !/^[A-Z]{2}$/.test(source.regionCode)
    || typeof source.postalCode !== 'string' || !/^\d{5}(?:-\d{4})?$/.test(source.postalCode)
    || (source.line2 !== null && (typeof source.line2 !== 'string'
      || source.line2.length < 1 || source.line2.length > 120 || !SAFE_TEXT.test(source.line2)))) {
    throw new Error('invalid_wire_data')
  }
  return {
    line1: text(source.line1, 120),
    line2: source.line2,
    city: text(source.city, 80),
    regionCode: source.regionCode,
    postalCode: source.postalCode,
    countryCode: 'US',
  }
}

function system(value: unknown): HomeSystemRecord {
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== 'installedOrReplacedYear,kind,present'
    || typeof source.kind !== 'string' || !SYSTEM_KIND_SET.has(source.kind as HomeSystemKind)
    || (source.present !== 'yes' && source.present !== 'no' && source.present !== 'unknown')) {
    throw new Error('invalid_wire_data')
  }
  const installedOrReplacedYear = year(source.installedOrReplacedYear)
  if (source.present !== 'yes' && installedOrReplacedYear !== null) throw new Error('invalid_wire_data')
  return {
    kind: source.kind as HomeSystemKind,
    present: source.present,
    installedOrReplacedYear,
  }
}

export function parseHomeRecordProfile(value: unknown): HomeRecordProfile {
  const source = record(value)
  if (Object.keys(source).sort().join(',')
      !== 'address,homeRef,homeType,revision,source,systems,updatedAt,yearBuilt'
    || !isHomeRef(source.homeRef)
    || typeof source.revision !== 'number' || !Number.isInteger(source.revision) || source.revision < 1
    || typeof source.homeType !== 'string' || !HOME_TYPE_SET.has(source.homeType as HomeType)
    || source.source !== 'homeowner_recollection'
    || typeof source.updatedAt !== 'string' || source.updatedAt.length > 40
    || !Array.isArray(source.systems) || source.systems.length !== HOME_SYSTEM_KINDS.length) {
    throw new Error('invalid_wire_data')
  }
  const systems = source.systems.map(system)
  if (new Set(systems.map(item => item.kind)).size !== HOME_SYSTEM_KINDS.length
    || HOME_SYSTEM_KINDS.some(kind => !systems.some(item => item.kind === kind))) {
    throw new Error('invalid_wire_data')
  }
  return {
    homeRef: source.homeRef,
    revision: source.revision,
    address: address(source.address),
    homeType: source.homeType as HomeType,
    yearBuilt: year(source.yearBuilt),
    systems,
    source: 'homeowner_recollection',
    updatedAt: source.updatedAt,
  }
}

function safeInputText(value: string, maximum: number): string | null {
  const clean = value.trim()
  return clean.length >= 1 && clean.length <= maximum && SAFE_TEXT.test(clean) ? clean : null
}

/** Normalizes one homeowner-reviewed US address without inferring any missing part. */
export function reviewedHomeRecordAddress(input: HomeRecordAddress): HomeRecordAddress | null {
  const line1 = safeInputText(input.line1, 120)
  const line2 = input.line2 === null ? null : safeInputText(input.line2, 120)
  const city = safeInputText(input.city, 80)
  const regionCode = input.regionCode.trim().toUpperCase()
  const postalCode = input.postalCode.trim()
  if (!line1 || (input.line2 !== null && !line2) || !city
    || !/^[A-Z]{2}$/.test(regionCode) || !/^\d{5}(?:-\d{4})?$/.test(postalCode)
    || input.countryCode !== 'US') return null
  return { line1, line2, city, regionCode, postalCode, countryCode: 'US' }
}

function validInputYear(value: ApproximateYear | null): boolean {
  return value === null || (Number.isInteger(value.value) && value.value >= 1800
    && value.value <= 9999 && (value.precision === 'exact' || value.precision === 'approximate'))
}

/** Returns the exact server-owned update shape, or null before any request is made. */
export function homeRecordUpdateBody(input: UpdateHomeRecordInput): UpdateHomeRecordInput | null {
  const reviewedAddress = reviewedHomeRecordAddress(input.address)
  const kinds = input.systems.map(item => item.kind)
  if (!COMMAND_REF.test(input.commandRef) || !Number.isInteger(input.expectedRevision)
    || input.expectedRevision < 1 || !reviewedAddress || !HOME_TYPE_SET.has(input.homeType)
    || !validInputYear(input.yearBuilt) || input.systems.length !== HOME_SYSTEM_KINDS.length
    || new Set(kinds).size !== HOME_SYSTEM_KINDS.length
    || HOME_SYSTEM_KINDS.some(kind => !kinds.includes(kind))
    || input.systems.some(item => !SYSTEM_KIND_SET.has(item.kind)
      || !['yes', 'no', 'unknown'].includes(item.present)
      || !validInputYear(item.installedOrReplacedYear)
      || (item.present !== 'yes' && item.installedOrReplacedYear !== null))) return null
  return {
    commandRef: input.commandRef,
    expectedRevision: input.expectedRevision,
    address: reviewedAddress,
    homeType: input.homeType,
    yearBuilt: input.yearBuilt,
    systems: input.systems.map(item => ({
      kind: item.kind,
      present: item.present,
      installedOrReplacedYear: item.installedOrReplacedYear,
    })),
  }
}
