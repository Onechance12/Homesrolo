import type {
  ArtifactGeoPin,
  ArtifactKind,
  ArtifactMediaType,
  ArtifactPhotoPhase,
  ArtifactRecord,
  ResolvedArtifactRecord,
  UpdateArtifactMetadataInput,
} from './model.ts'
import { isArtifactRef, isHomeRef, isProjectRef } from './protocol.ts'

const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ARTIFACT_KINDS = new Set<ArtifactKind>(['photo', 'document', 'warranty'])
const ARTIFACT_MEDIA = new Set<ArtifactMediaType>([
  'application/pdf', 'image/jpeg', 'image/png',
])
const PHOTO_PHASES = new Set<ArtifactPhotoPhase>([
  'before', 'during', 'after', 'reference',
])
const ARTIFACT_KEYS = new Set([
  'artifactRef', 'homeRef', 'projectRef', 'kind', 'displayName', 'mediaType',
  'byteLength', 'observedOn', 'phase', 'areaLabel', 'geoPin', 'revision',
  'createdAt', 'updatedAt',
])

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_wire_data')
  }
  return value as JsonRecord
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || value !== value.trim()) throw new Error('invalid_wire_data')
  return value
}

function positiveRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('invalid_wire_data')
  }
  return value
}

function canonicalUtcInstant(value: unknown): string {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) {
    throw new Error('invalid_wire_data')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error('invalid_wire_data')
  }
  return value
}

function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('invalid_wire_data')
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('invalid_wire_data')
  }
  return value
}

function nullableAreaLabel(value: unknown): string | null {
  if (value === null) return null
  const label = boundedText(value, 120)
  if (/[\u0000-\u001f\u007f]/.test(label)) throw new Error('invalid_wire_data')
  return label
}

function geoPin(value: unknown): ArtifactGeoPin {
  const source = record(value)
  if (Object.keys(source).sort().join(',')
    !== 'accuracyMeters,capturedAt,latitude,longitude,provenance'
    || typeof source.latitude !== 'number' || !Number.isFinite(source.latitude)
    || source.latitude < -90 || source.latitude > 90
    || typeof source.longitude !== 'number' || !Number.isFinite(source.longitude)
    || source.longitude < -180 || source.longitude > 180
    || typeof source.accuracyMeters !== 'number' || !Number.isFinite(source.accuracyMeters)
    || source.accuracyMeters < 0 || source.accuracyMeters > 100_000
    || source.provenance !== 'device_confirmed') {
    throw new Error('invalid_wire_data')
  }
  return {
    latitude: source.latitude,
    longitude: source.longitude,
    accuracyMeters: source.accuracyMeters,
    capturedAt: canonicalUtcInstant(source.capturedAt),
    provenance: 'device_confirmed',
  }
}

/** Rolling-compatible parser: pre-metadata artifacts receive safe null/default values. */
export function parseArtifactRecord(value: unknown): ResolvedArtifactRecord {
  const source = record(value)
  if (Object.keys(source).some(key => !ARTIFACT_KEYS.has(key))
    || !isArtifactRef(source.artifactRef) || !isHomeRef(source.homeRef)
    || (source.projectRef !== null && !isProjectRef(source.projectRef))
    || typeof source.kind !== 'string' || !ARTIFACT_KINDS.has(source.kind as ArtifactKind)
    || typeof source.mediaType !== 'string'
    || !ARTIFACT_MEDIA.has(source.mediaType as ArtifactMediaType)
    || typeof source.byteLength !== 'number' || !Number.isInteger(source.byteLength)
    || source.byteLength < 1 || source.byteLength > 25 * 1024 * 1024) {
    throw new Error('invalid_wire_data')
  }

  const createdAt = canonicalUtcInstant(source.createdAt)
  const observedOn = source.observedOn === undefined || source.observedOn === null
    ? null
    : calendarDate(source.observedOn)
  const phase = source.phase === undefined || source.phase === null
    ? null
    : typeof source.phase === 'string' && PHOTO_PHASES.has(source.phase as ArtifactPhotoPhase)
      ? source.phase as ArtifactPhotoPhase
      : (() => { throw new Error('invalid_wire_data') })()
  const areaLabel = source.areaLabel === undefined || source.areaLabel === null
    ? null
    : nullableAreaLabel(source.areaLabel)
  const parsedGeoPin = source.geoPin === undefined || source.geoPin === null
    ? null
    : geoPin(source.geoPin)
  const revision = source.revision === undefined ? 1 : positiveRevision(source.revision)
  const updatedAt = source.updatedAt === undefined
    ? createdAt
    : canonicalUtcInstant(source.updatedAt)

  if ((source.kind !== 'photo'
      && (observedOn !== null || phase !== null || areaLabel !== null || parsedGeoPin !== null))
    || updatedAt < createdAt
    || observedOn !== null && observedOn > updatedAt.slice(0, 10)
    || parsedGeoPin !== null && parsedGeoPin.capturedAt > updatedAt) {
    throw new Error('invalid_wire_data')
  }
  return {
    artifactRef: source.artifactRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    kind: source.kind as ArtifactKind,
    displayName: boundedText(source.displayName, 160),
    mediaType: source.mediaType as ArtifactMediaType,
    byteLength: source.byteLength,
    observedOn,
    phase,
    areaLabel,
    geoPin: parsedGeoPin,
    revision,
    createdAt,
    updatedAt,
  }
}

export function artifactMetadataUpdateBody(input: UpdateArtifactMetadataInput) {
  if (!COMMAND_REF.test(input.commandRef)
    || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
    || (input.projectRef !== null && !isProjectRef(input.projectRef))) {
    throw new Error('invalid_artifact_metadata')
  }
  const observedOn = input.observedOn === null ? null : calendarDate(input.observedOn)
  const phase = input.phase === null
    ? null
    : PHOTO_PHASES.has(input.phase) ? input.phase : (() => {
        throw new Error('invalid_artifact_metadata')
      })()
  const areaLabel = nullableAreaLabel(input.areaLabel)
  const pin = input.geoPin === null ? null : geoPin(input.geoPin)
  return {
    commandRef: input.commandRef,
    expectedRevision: input.expectedRevision,
    projectRef: input.projectRef,
    observedOn,
    phase,
    areaLabel,
    geoPin: pin,
  }
}
