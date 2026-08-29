import type { ArtifactGeoPin, ArtifactPhotoPhase, ResolvedArtifactRecord } from '../api/model.ts'
import { localCalendarDate, validHomeCheckupDate } from './checkups.ts'

export const PHOTO_PHASE_OPTIONS: readonly ArtifactPhotoPhase[] = Object.freeze([
  'reference',
  'before',
  'during',
  'after',
])

export const PHOTO_PHASE_LABEL: Readonly<Record<ArtifactPhotoPhase, string>> = Object.freeze({
  reference: 'Reference',
  before: 'Before',
  during: 'During',
  after: 'After',
})

export interface PhotoMetadataDraft {
  readonly observedOn: string
  readonly phase: ArtifactPhotoPhase
  readonly areaLabel: string
  readonly pinCurrentLocation: boolean
}

export interface NormalizedPhotoMetadata {
  readonly observedOn: string
  readonly phase: ArtifactPhotoPhase
  readonly areaLabel: string | null
  readonly pinCurrentLocation: boolean
}

export interface NormalizedExistingPhotoMetadata extends Omit<NormalizedPhotoMetadata, 'observedOn'> {
  readonly observedOn: string | null
}

export function newPhotoMetadataDraft(now = new Date()): PhotoMetadataDraft {
  return {
    observedOn: localCalendarDate(now),
    phase: 'reference',
    areaLabel: '',
    pinCurrentLocation: false,
  }
}

export function normalizePhotoMetadataDraft(
  draft: PhotoMetadataDraft,
  today = localCalendarDate(),
): NormalizedPhotoMetadata {
  if (!validHomeCheckupDate(draft.observedOn, today)) {
    throw new Error('Use a real observed date on or before today.')
  }
  if (!PHOTO_PHASE_OPTIONS.includes(draft.phase)) {
    throw new Error('Choose a valid photo stage.')
  }
  const areaLabel = draft.areaLabel.trim().replace(/\s+/g, ' ')
  if (areaLabel.length > 120 || /[\u0000-\u001f\u007f]/.test(areaLabel)) {
    throw new Error('Keep the room or area to 120 ordinary characters or fewer.')
  }
  return {
    observedOn: draft.observedOn,
    phase: draft.phase,
    areaLabel: areaLabel || null,
    pinCurrentLocation: draft.pinCurrentLocation,
  }
}

/**
 * Existing/legacy photos may predate an observed date. Editing an area, phase,
 * or project must not force a homeowner to invent one.
 */
export function normalizeExistingPhotoMetadataDraft(
  draft: PhotoMetadataDraft,
  today = localCalendarDate(),
): NormalizedExistingPhotoMetadata {
  const observedOn = draft.observedOn.trim()
  if (observedOn && !validHomeCheckupDate(observedOn, today)) {
    throw new Error('Use a real observed date on or before today, or leave it blank if unknown.')
  }
  const normalized = normalizePhotoMetadataFields(draft)
  return { ...normalized, observedOn: observedOn || null }
}

function normalizePhotoMetadataFields(
  draft: PhotoMetadataDraft,
): Omit<NormalizedPhotoMetadata, 'observedOn'> {
  if (!PHOTO_PHASE_OPTIONS.includes(draft.phase)) {
    throw new Error('Choose a valid photo stage.')
  }
  const areaLabel = draft.areaLabel.trim().replace(/\s+/g, ' ')
  if (areaLabel.length > 120 || /[\u0000-\u001f\u007f]/.test(areaLabel)) {
    throw new Error('Keep the room or area to 120 ordinary characters or fewer.')
  }
  return {
    phase: draft.phase,
    areaLabel: areaLabel || null,
    pinCurrentLocation: draft.pinCurrentLocation,
  }
}

export function artifactMetadataReplacement(
  artifact: ResolvedArtifactRecord,
  overrides: {
    readonly projectRef?: string | null
    readonly observedOn?: string | null
    readonly phase?: ArtifactPhotoPhase | null
    readonly areaLabel?: string | null
    readonly geoPin?: ArtifactGeoPin | null
  } = {},
) {
  return {
    projectRef: overrides.projectRef === undefined ? artifact.projectRef : overrides.projectRef,
    observedOn: overrides.observedOn === undefined ? artifact.observedOn : overrides.observedOn,
    phase: overrides.phase === undefined ? artifact.phase : overrides.phase,
    areaLabel: overrides.areaLabel === undefined ? artifact.areaLabel : overrides.areaLabel,
    geoPin: overrides.geoPin === undefined ? artifact.geoPin : overrides.geoPin,
  }
}
