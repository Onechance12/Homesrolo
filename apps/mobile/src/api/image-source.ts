import { isSessionToken } from './protocol.ts'

const MAX_PROTECTED_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

export interface ProtectedImageSource {
  readonly uri: string
  readonly headers: Readonly<Record<string, string>>
}

export interface ProtectedImageLease {
  readonly uri: string
  release(): void
}

interface ObjectUrlRuntime {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

function header(source: ProtectedImageSource, name: string): string | null {
  const match = Object.entries(source.headers)
    .find(([key]) => key.toLowerCase() === name.toLowerCase())
  return match?.[1] ?? null
}

export function requiresProtectedWebFetch(source: ProtectedImageSource): boolean {
  return header(source, 'authorization') !== null
}

function protectedRequestHeaders(source: ProtectedImageSource): Record<string, string> {
  const authorization = header(source, 'authorization')
  const client = header(source, 'x-homesrolo-client')
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,256})$/)
  if (!match?.[1] || !isSessionToken(match[1])) throw new Error('invalid_image_credential')
  return {
    authorization: `Bearer ${match[1]}`,
    accept: 'image/jpeg, image/png',
    ...(client === null ? {} : { 'x-homesrolo-client': client }),
  }
}

function assertProtectedImageUrl(uri: string): void {
  const url = new URL(uri)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if ((!local && url.protocol !== 'https:')
    || (local && url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username || url.password || url.hash) {
    throw new Error('invalid_image_url')
  }
}

/**
 * Web images cannot attach an Authorization header to <img>. Fetch the exact
 * protected resource into an ephemeral object URL instead. The credential is
 * never placed in a URL, redirects and browser HTTP caching are disabled, and
 * the object URL is revoked by the caller.
 */
export async function loadProtectedWebImage(
  source: ProtectedImageSource,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  objectUrls: ObjectUrlRuntime = URL,
): Promise<ProtectedImageLease> {
  assertProtectedImageUrl(source.uri)
  const response = await fetcher(source.uri, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: protectedRequestHeaders(source),
    signal,
  })
  if (!response.ok) throw new Error('protected_image_unavailable')
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('invalid_image_content_type')
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROTECTED_IMAGE_BYTES) {
    throw new Error('protected_image_too_large')
  }
  const blob = await response.blob()
  if (blob.size < 1 || blob.size > MAX_PROTECTED_IMAGE_BYTES) {
    throw new Error('protected_image_too_large')
  }
  const uri = objectUrls.createObjectURL(blob)
  return { uri, release: () => objectUrls.revokeObjectURL(uri) }
}
