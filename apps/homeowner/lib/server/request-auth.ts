/**
 * SERVER-ONLY request authentication boundary shared by every homeowner route.
 *
 * Browser pages and the installed PWA authenticate with the HttpOnly session
 * cookie. Native clients carry the same opaque server-side handle as a bearer
 * only inside the explicit, versioned native contract. The PWA marker remains
 * solely for a bounded one-time migration from an older browser bearer.
 */

import {
  parseSessionCookieHeader,
  sessionHandleIsValid,
} from './cookie.ts'

export const HOMEOWNER_NATIVE_CLIENT_HEADER = 'x-homesrolo-client'
export const HOMEOWNER_NATIVE_CLIENT_V1 = 'native.v1'
export const HOMEOWNER_PWA_CLIENT_V1 = 'pwa.v1'

export type HomeownerRequestAuthentication =
  | { readonly kind: 'anonymous'; readonly sessionHandle: null }
  | { readonly kind: 'web'; readonly sessionHandle: string }
  | { readonly kind: 'native'; readonly sessionHandle: string }
  | { readonly kind: 'invalid'; readonly sessionHandle: null }

export type HomeownerAuthenticationBootstrapChannel = 'web' | 'native' | 'pwa' | 'invalid'

function bearerSessionHandle(header: string | null): string | null {
  if (header === null || header.length > 300) return null
  const match = /^Bearer ([A-Za-z0-9_-]{16,256})$/i.exec(header)
  if (!match || !sessionHandleIsValid(match[1])) return null
  return match[1]
}

export interface HomeownerPwaLegacyUpgradeEnvelope {
  readonly source: 'bearer' | 'cookie' | 'matching_credentials' | 'none' | 'invalid_cookie'
  readonly sessionHandle: string | null
}

export interface HomeownerPwaSignOutEnvelope {
  readonly bearerSessionHandle: string
  readonly legacySessionHandle: string | null
}

/**
 * A deliberately smaller browser-only envelope for migration and transitional
 * sign-out. Ordinary PWA requests are unmarked same-origin cookie requests.
 * The async HTTP handlers separately verify that a proxy-normalized body has
 * zero actual bytes; Request.body identity is not stable across hosts.
 */
function exactPwaBrowserMutation(request: Request, expectedOrigin: string): boolean {
  const url = new URL(request.url)
  const contentLength = request.headers.get('content-length')
  const fetchSite = request.headers.get('sec-fetch-site')
  const fetchMode = request.headers.get('sec-fetch-mode')
  const fetchDestination = request.headers.get('sec-fetch-dest')
  return request.method === 'POST'
    && url.search === ''
    && url.hash === ''
    && request.headers.get('origin') === expectedOrigin
    // Fetch Metadata is useful defense-in-depth when a browser/proxy keeps
    // it, but hosting adapters are allowed to omit these headers. Origin plus
    // the custom PWA header still force a cross-origin browser to preflight.
    && (fetchSite === null || fetchSite === 'same-origin')
    && (fetchMode === null || fetchMode === 'cors')
    && (fetchDestination === null || fetchDestination === 'empty')
    && request.headers.get(HOMEOWNER_NATIVE_CLIENT_HEADER) === HOMEOWNER_PWA_CLIENT_V1
    && request.headers.get('content-type') === null
    && request.headers.get('content-encoding') === null
    && (contentLength === null || contentLength === '0')
}

/**
 * Accept exactly one old PWA bearer OR the existing HttpOnly cookie on the
 * bodyless same-origin upgrade action. A browser bearer can only be converted
 * into a cookie here; it is never valid on ordinary application endpoints.
 */
export function homeownerPwaLegacyUpgradeEnvelope(
  request: Request,
  expectedOrigin: string,
): HomeownerPwaLegacyUpgradeEnvelope | null {
  if (!exactPwaBrowserMutation(request, expectedOrigin)) return null
  const authorization = request.headers.get('authorization')
  const bearer = bearerSessionHandle(authorization)
  const cookie = parseSessionCookieHeader(request.headers.get('cookie'))
  if (authorization !== null && !bearer) return null
  if (bearer && cookie.kind === 'invalid') return null
  if (bearer && cookie.kind === 'valid') {
    return bearer === cookie.sessionHandle
      ? { source: 'matching_credentials', sessionHandle: bearer }
      : null
  }
  if (bearer) return { source: 'bearer', sessionHandle: bearer }
  if (cookie.kind === 'valid') return { source: 'cookie', sessionHandle: cookie.sessionHandle }
  if (cookie.kind === 'invalid') return { source: 'invalid_cookie', sessionHandle: null }
  return { source: 'none', sessionHandle: null }
}

/**
 * PWA sign-out is the other narrow migration exception: it may present the
 * active bearer and one valid retired cookie so both server sessions can be
 * revoked before the cookie is expired. Every other endpoint still rejects
 * mixed credential transports.
 */
export function homeownerPwaSignOutEnvelope(
  request: Request,
  expectedOrigin: string,
): HomeownerPwaSignOutEnvelope | null {
  if (!exactPwaBrowserMutation(request, expectedOrigin)) return null
  const bearer = bearerSessionHandle(request.headers.get('authorization'))
  if (!bearer) return null
  const cookie = parseSessionCookieHeader(request.headers.get('cookie'))
  return {
    bearerSessionHandle: bearer,
    // An invalid retired cookie cannot be revoked because it cannot be
    // identified safely, but the exact response still expires it.
    legacySessionHandle: cookie.kind === 'valid' ? cookie.sessionHandle : null,
  }
}

/**
 * Resolve exactly one credential transport. Unknown Authorization headers stay
 * inert for backwards compatibility, unless a session cookie is also present;
 * an exact native marker makes Authorization strict and mandatory. A PWA
 * marker is rejected here because its bearer is migration-only.
 */
export function homeownerRequestAuthentication(
  request: Request,
): HomeownerRequestAuthentication {
  const cookieHeader = request.headers.get('cookie')
  const cookie = parseSessionCookieHeader(cookieHeader)
  const authorization = request.headers.get('authorization')
  const nativeClient = request.headers.get(HOMEOWNER_NATIVE_CLIENT_HEADER)

  // Never guess between two presented credential transports, including a
  // malformed/duplicated homeowner cookie or malformed Authorization value.
  if (authorization !== null && cookie.kind !== 'absent') {
    return { kind: 'invalid', sessionHandle: null }
  }

  if (nativeClient !== null) {
    if (cookieHeader !== null || cookie.kind !== 'absent') {
      return { kind: 'invalid', sessionHandle: null }
    }
    if (nativeClient === HOMEOWNER_PWA_CLIENT_V1) {
      return { kind: 'invalid', sessionHandle: null }
    }
    if (nativeClient !== HOMEOWNER_NATIVE_CLIENT_V1
      || request.headers.get('origin') !== null) {
      return { kind: 'invalid', sessionHandle: null }
    }
    const sessionHandle = bearerSessionHandle(authorization)
    return sessionHandle
      ? { kind: 'native', sessionHandle }
      : { kind: 'invalid', sessionHandle: null }
  }

  if (cookie.kind === 'valid') return { kind: 'web', sessionHandle: cookie.sessionHandle }
  return { kind: 'anonymous', sessionHandle: null }
}

/** Browser and PWA writes retain exact-Origin CSRF checks; native writes have
 * already proved the no-Origin, no-cookie, versioned bearer contract above. */
export function homeownerMutationRequestAllowed(
  request: Request,
  expectedOrigin: string,
  authentication = homeownerRequestAuthentication(request),
): boolean {
  if (authentication.kind === 'invalid') return false
  if (authentication.kind === 'native') return request.headers.get('origin') === null
  return request.headers.get('origin') === expectedOrigin
}

export function homeownerRequestContext(
  authentication: Exclude<HomeownerRequestAuthentication, { readonly kind: 'invalid' }>,
) {
  return { sessionHandle: authentication.sessionHandle }
}

/**
 * Classify an unauthenticated code request/verification before an OTP has
 * minted a session. Only a native response may expose the newly minted opaque
 * bearer. Browser and PWA bootstrap remain same-origin and receive only the
 * HttpOnly cookie.
 */
export function homeownerAuthenticationBootstrapChannel(
  request: Request,
  expectedOrigin: string,
): HomeownerAuthenticationBootstrapChannel {
  const nativeClient = request.headers.get(HOMEOWNER_NATIVE_CLIENT_HEADER)
  const cookie = parseSessionCookieHeader(request.headers.get('cookie'))
  if (request.headers.get('authorization') !== null && cookie.kind !== 'absent') {
    return 'invalid'
  }
  if (nativeClient === null) {
    return request.headers.get('origin') === expectedOrigin ? 'web' : 'invalid'
  }
  if (nativeClient === HOMEOWNER_PWA_CLIENT_V1) {
    return request.headers.get('origin') === expectedOrigin
      && request.headers.get('cookie') === null
      && request.headers.get('authorization') === null
      && (request.headers.get('sec-fetch-site') === null
        || request.headers.get('sec-fetch-site') === 'same-origin')
      ? 'pwa'
      : 'invalid'
  }
  return nativeClient === HOMEOWNER_NATIVE_CLIENT_V1
    && request.headers.get('origin') === null
    && request.headers.get('cookie') === null
    && request.headers.get('authorization') === null
    ? 'native'
    : 'invalid'
}
