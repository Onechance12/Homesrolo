/**
 * THE ONLY FILE THAT MAY TOUCH THE NETWORK.
 *
 * The eslint fetch ban is lifted only for the one call below (inline
 * disable), and a presentation test asserts fetch appears nowhere else in
 * app code. Everything above this seam works with the JsonTransport shape, so
 * every adapter and every test runs against a fake transport with no network.
 *
 * Requests are same-origin with cookie credentials. The browser sends paths,
 * JSON bodies from typed inputs, and nothing else: no principal or account id,
 * no provider id, no authority claim, and no hand-carried credentials.
 */

import { beginBrowserSessionChange } from '../../../../shared/browser-session-signal.ts'

export interface TransportRequest {
  readonly method: 'GET' | 'POST' | 'DELETE'
  /** App-relative path starting /api/v1 — never an absolute URL. */
  readonly path: string
  readonly body?: unknown
}

export type TransportReply =
  | { readonly kind: 'reply'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'network_failure' }

export type JsonTransport = (request: TransportRequest) => Promise<TransportReply>

export interface ArtifactUploadTransportRequest {
  readonly signedUrl: string
  readonly path: string
  readonly token: string
  readonly payload: ArrayBuffer
}

export type ArtifactUploadTransport = (
  request: ArtifactUploadTransportRequest,
) => Promise<TransportReply>

export interface PhotoCheckupUploadTransportRequest {
  readonly path: string
  readonly commandRef: string
  readonly observedOn: string
  readonly area: string
  /** Required repeatable spot label, URI-encoded by the strict adapter. */
  readonly encodedViewLabel: string
  /** Already trimmed and URI-encoded by the strict remote adapter. */
  readonly encodedCaption?: string
  readonly file: File
}

export type PhotoCheckupUploadTransport = (
  request: PhotoCheckupUploadTransportRequest,
) => Promise<TransportReply>

export const fetchJsonTransport: JsonTransport = async request => {
  const changesCookie = request.method === 'POST' && (
    request.path === '/api/v1/auth/email-code/verify'
    || request.path === '/api/v1/auth/exchange'
    || request.path === '/api/v1/auth/signout'
  )
  const finishChange = changesCookie && typeof window !== 'undefined'
    ? beginBrowserSessionChange((key, value) => window.localStorage.setItem(key, value))
    : () => undefined
  try {
    /* eslint-disable no-restricted-globals -- the one sanctioned call site */
    const response = await fetch(request.path, {
      method: request.method,
      credentials: 'same-origin',
      headers: request.body === undefined
        ? { accept: 'application/json' }
        : { accept: 'application/json', 'content-type': 'application/json' },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    })
    /* eslint-enable no-restricted-globals */
    let body: unknown = undefined
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    return { kind: 'reply', status: response.status, body }
  } catch {
    return { kind: 'network_failure' }
  } finally {
    finishChange()
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Platform-neutral signed PUT seam used by browsers and future native apps. */
export function createSignedStorageUploadTransport(fetchImpl: FetchLike): ArtifactUploadTransport {
  return async request => {
    try {
      const response = await fetchImpl(request.signedUrl, {
        method: 'PUT',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'max-age=0',
          'x-upsert': 'false',
        },
        body: request.payload,
      })
      return { kind: 'reply', status: response.status, body: undefined }
    } catch {
      return { kind: 'network_failure' }
    }
  }
}

export const fetchArtifactUploadTransport = createSignedStorageUploadTransport(
  /* eslint-disable-next-line no-restricted-globals -- sanctioned transport seam */
  (input, init) => fetch(input, init),
)

/**
 * Image-only beta transport. The bytes are the request body: no multipart
 * wrapper, original filename, principal identity, or storage detail crosses
 * the browser boundary.
 */
export const fetchPhotoCheckupUploadTransport: PhotoCheckupUploadTransport = async request => {
  try {
    /* eslint-disable no-restricted-globals -- sanctioned transport seam */
    const response = await fetch(request.path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': request.file.type,
        'x-homesrolo-command-ref': request.commandRef,
        'x-homesrolo-observed-on': request.observedOn,
        'x-homesrolo-photo-area': request.area,
        'x-homesrolo-view-label': request.encodedViewLabel,
        ...(request.encodedCaption
          ? { 'x-homesrolo-caption': request.encodedCaption }
          : {}),
      },
      body: request.file,
    })
    /* eslint-enable no-restricted-globals */
    let body: unknown = undefined
    try { body = await response.json() } catch { body = undefined }
    return { kind: 'reply', status: response.status, body }
  } catch {
    return { kind: 'network_failure' }
  }
}

/**
 * Completes the provider's standard one-time-link redirect. Only the short-lived
 * access credential from the URL fragment crosses this exact same-origin path;
 * refresh credentials are never read or transmitted. The server validates it
 * with the configured provider and returns only an HttpOnly Homesrolo cookie.
 */
export async function exchangeHomeownerProviderCredential(accessToken: string): Promise<boolean> {
  if (accessToken.length < 32 || accessToken.length > 4096 || /\s/.test(accessToken)) return false
  const reply = await fetchJsonTransport({
    method: 'POST',
    path: '/api/v1/auth/exchange',
    body: { access_token: accessToken },
  })
  if (reply.kind !== 'reply' || reply.status !== 200) return false
  if (!reply.body || typeof reply.body !== 'object' || Array.isArray(reply.body)
    || Object.keys(reply.body).length !== 1 || !Object.hasOwn(reply.body, 'data')) return false
  const data = (reply.body as { data?: unknown }).data
  return !!data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).length === 1 && (data as { signedIn?: unknown }).signedIn === true
}
