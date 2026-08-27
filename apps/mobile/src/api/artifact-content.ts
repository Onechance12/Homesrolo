import type { ArtifactContent, ArtifactMediaType } from './model.ts'

export const MAX_ARTIFACT_CONTENT_BYTES = 10 * 1024 * 1024

const ALLOWED_MEDIA_TYPES = new Set<ArtifactMediaType>([
  'application/pdf', 'image/jpeg', 'image/png',
])

function decodedFilename(value: string | null): string | null {
  if (!value) return null
  const encoded = value.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded.trim()) } catch { return null }
  }
  const quoted = value.match(/(?:^|;)\s*filename="([^"]+)"/i)?.[1]
  return quoted?.trim() || null
}

export function safeArtifactDisplayName(value: string | null, mediaType: ArtifactMediaType): string {
  const fallback = mediaType === 'application/pdf'
    ? 'Homesrolo document.pdf'
    : mediaType === 'image/png'
      ? 'Homesrolo image.png'
      : 'Homesrolo image.jpg'
  if (!value) return fallback
  const clean = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return clean || fallback
}

export async function artifactContentFromResponse(
  response: Response,
  artifactRef: string,
  fallbackDisplayName?: string,
): Promise<ArtifactContent> {
  const mediaType = response.headers.get('content-type')
    ?.split(';', 1)[0]?.trim().toLowerCase() as ArtifactMediaType | undefined
  if (!mediaType || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw new Error('invalid_artifact_content_type')
  }
  const declaredHeader = response.headers.get('content-length')
  const declared = declaredHeader === null ? null : Number(declaredHeader)
  if (declared !== null && (!Number.isSafeInteger(declared)
    || declared < 1 || declared > MAX_ARTIFACT_CONTENT_BYTES)) {
    throw new Error('invalid_artifact_content_length')
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength < 1 || buffer.byteLength > MAX_ARTIFACT_CONTENT_BYTES
    || (declared !== null && buffer.byteLength !== declared)) {
    throw new Error('invalid_artifact_content_length')
  }
  const headerName = decodedFilename(response.headers.get('content-disposition'))
  return {
    artifactRef,
    displayName: safeArtifactDisplayName(headerName ?? fallbackDisplayName ?? null, mediaType),
    mediaType,
    byteLength: buffer.byteLength,
    bytes: new Uint8Array(buffer),
  }
}
