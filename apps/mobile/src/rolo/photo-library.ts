export interface RoloPhotoCandidate {
  readonly artifactRef: string
  readonly homeRef: string
  readonly projectRef: string | null
  readonly kind: string
}

export interface RoloPhotoLibrary<T extends RoloPhotoCandidate> {
  /** The complete, freshly fetched set that may restore persisted photo state. */
  readonly authorizedPhotos: readonly T[]
  /** The small, ordered set shown in the saved-photo picker. */
  readonly pickerPhotos: readonly T[]
}

const ROLO_PHOTO_PICKER_LIMIT = 12

/**
 * Keeps exact-scope authorization separate from presentation limits. A routed
 * photo is promoted into the picker without making the picker the authority for
 * older persisted attachments or reviews.
 */
export function roloPhotoLibrary<T extends RoloPhotoCandidate>(
  artifacts: readonly T[],
  homeRef: string,
  projectRef: string | null,
  requestedArtifactRef: string | undefined,
): RoloPhotoLibrary<T> {
  const authorizedPhotos = artifacts.filter(item => item.homeRef === homeRef
    && item.kind === 'photo'
    && (!projectRef || item.projectRef === projectRef))
  const requestedPhoto = requestedArtifactRef
    ? authorizedPhotos.find(item => item.artifactRef === requestedArtifactRef)
    : undefined
  const pickerPhotos = requestedPhoto
    ? [
        requestedPhoto,
        ...authorizedPhotos.filter(item => item.artifactRef !== requestedPhoto.artifactRef),
      ].slice(0, ROLO_PHOTO_PICKER_LIMIT)
    : authorizedPhotos.slice(0, ROLO_PHOTO_PICKER_LIMIT)

  return { authorizedPhotos, pickerPhotos }
}
