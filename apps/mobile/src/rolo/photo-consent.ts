import type { ArtifactRecord, DeviceFile } from '../api/model.ts'

export type RoloPhotoAttachment =
  | { readonly state: 'pending'; readonly file: DeviceFile }
  | { readonly state: 'saved'; readonly artifact: ArtifactRecord }

/** Binds one approval to the exact local/saved photo and normalized message. */
export function roloPhotoConsentKey(
  attachment: RoloPhotoAttachment | null,
  message: string,
): string | null {
  const clean = message.trim()
  if (!attachment || !clean) return null
  const photoIdentity = attachment.state === 'saved'
    ? attachment.artifact.artifactRef
    : `${attachment.file.uri}\u0000${attachment.file.name}\u0000${attachment.file.byteLength}`
  return JSON.stringify([photoIdentity, clean])
}
