import type {
  CreateHomeCheckupPhotoInput,
  DeletedHomeCheckupPhoto,
  HomeCheckupArea,
  HomeCheckupPhoto,
} from './model.ts'
import { isHomeRef, isPhotoRef } from './protocol.ts'

type JsonRecord = Record<string, unknown>

export const HOME_CHECKUP_AREAS = [
  'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
  'hvac', 'water_heater', 'foundation', 'gutters', 'other',
] as const satisfies readonly HomeCheckupArea[]

const AREA_SET = new Set<HomeCheckupArea>(HOME_CHECKUP_AREAS)
const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]*$/

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_wire_data')
  return value as JsonRecord
}

function validCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function parseHomeCheckupPhoto(value: unknown): HomeCheckupPhoto {
  const source = record(value)
  if (Object.keys(source).sort().join(',')
      !== 'area,caption,createdAt,fullUrl,height,homeRef,observedOn,photoRef,thumbnailUrl,viewLabel,width'
    || !isHomeRef(source.homeRef) || !isPhotoRef(source.photoRef)
    || typeof source.observedOn !== 'string' || !validCalendarDate(source.observedOn)
    || typeof source.area !== 'string' || !AREA_SET.has(source.area as HomeCheckupArea)
    || typeof source.viewLabel !== 'string' || source.viewLabel.length < 1
    || source.viewLabel.length > 80 || !SAFE_TEXT.test(source.viewLabel)
    || typeof source.caption !== 'string' || source.caption.length > 240 || !SAFE_TEXT.test(source.caption)
    || typeof source.width !== 'number' || !Number.isInteger(source.width)
    || source.width < 1 || source.width > 2048
    || typeof source.height !== 'number' || !Number.isInteger(source.height)
    || source.height < 1 || source.height > 2048
    || typeof source.createdAt !== 'string' || source.createdAt.length > 40) {
    throw new Error('invalid_wire_data')
  }
  const base = `/api/v1/homes/${source.homeRef}/photo-checkups/${source.photoRef}`
  if (source.fullUrl !== `${base}/full` || source.thumbnailUrl !== `${base}/thumbnail`) {
    throw new Error('invalid_wire_data')
  }
  return {
    photoRef: source.photoRef,
    homeRef: source.homeRef,
    observedOn: source.observedOn,
    area: source.area as HomeCheckupArea,
    viewLabel: source.viewLabel,
    caption: source.caption,
    fullUrl: source.fullUrl,
    thumbnailUrl: source.thumbnailUrl,
    width: source.width,
    height: source.height,
    createdAt: source.createdAt,
  }
}

export function parseDeletedHomeCheckupPhoto(value: unknown): DeletedHomeCheckupPhoto {
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== 'photoRef,state'
    || !isPhotoRef(source.photoRef) || source.state !== 'deleted') {
    throw new Error('invalid_wire_data')
  }
  return { photoRef: source.photoRef, state: 'deleted' }
}

export function homeCheckupUploadHeaders(input: CreateHomeCheckupPhotoInput): Record<string, string> | null {
  const viewLabel = input.viewLabel.trim()
  const caption = input.caption.trim()
  if (!COMMAND_REF.test(input.commandRef) || !validCalendarDate(input.observedOn)
    || input.observedOn > new Date().toISOString().slice(0, 10) || !AREA_SET.has(input.area)
    || viewLabel.length < 1 || viewLabel.length > 80 || !SAFE_TEXT.test(viewLabel)
    || caption.length > 240 || !SAFE_TEXT.test(caption)) return null
  let encodedViewLabel: string
  let encodedCaption: string
  try {
    encodedViewLabel = encodeURIComponent(viewLabel)
    encodedCaption = encodeURIComponent(caption)
  } catch { return null }
  if (encodedViewLabel.length > 400 || encodedCaption.length > 1000) return null
  return {
    'x-homesrolo-command-ref': input.commandRef,
    'x-homesrolo-observed-on': input.observedOn,
    'x-homesrolo-photo-area': input.area,
    'x-homesrolo-view-label': encodedViewLabel,
    ...(encodedCaption ? { 'x-homesrolo-caption': encodedCaption } : {}),
  }
}
