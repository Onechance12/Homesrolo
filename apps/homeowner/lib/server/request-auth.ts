/**
 * SERVER-ONLY request authentication boundary shared by every homeowner route.
 *
 * Browsers authenticate with the one HttpOnly session cookie. Native clients
 * authenticate with the same opaque server-side handle carried as a bearer,
 * but only inside the explicit, versioned native contract below. The handle is
 * never decoded here and the two transports can never be combined.
 */

import {
  parseSessionCookieHeader,
  sessionHandleIsValid,
} from './cookie.ts'

export const HOMEOWNER_NATIVE_CLIENT_HEADER = 'x-homesrolo-client'
export const HOMEOWNER_NATIVE_CLIENT_V1 = 'native.v1'

export type HomeownerRequestAuthentication =
  | { readonly kind: 'anonymous'; readonly sessionHandle: null }
  | { readonly kind: 'web'; readonly sessionHandle: string }
  | { readonly kind: 'native'; readonly sessionHandle: string }
  | { readonly kind: 'invalid'; readonly sessionHandle: null }

export type HomeownerAuthenticationBootstrapChannel = 'web' | 'native' | 'invalid'

function bearerSessionHandle(header: string | null): string | null {
  if (header === null || header.length > 300) return null
  const match = /^Bearer ([A-Za-z0-9_-]{16,256})$/i.exec(header)
  if (!match || !sessionHandleIsValid(match[1])) return null
  return match[1]
}

/**
 * Resolve exactly one credential transport. Unknown Authorization headers stay
 * inert for backwards compatibility, unless a session cookie is also present;
 * an exact native marker makes Authorization strict and mandatory.
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
    if (nativeClient !== HOMEOWNER_NATIVE_CLIENT_V1
      || request.headers.get('origin') !== null
      || cookieHeader !== null
      || cookie.kind !== 'absent') {
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

/** Browser writes retain exact-Origin CSRF checks; native writes have already
 * proved the no-Origin, no-cookie, versioned bearer contract above. */
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
 * minted a session. A native response may expose its newly minted opaque
 * bearer only for the exact native.v1 envelope: no Origin, Cookie, or existing
 * Authorization credential. Ordinary browser calls can therefore receive only
 * an HttpOnly cookie, never the bearer value in JSON.
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
  return nativeClient === HOMEOWNER_NATIVE_CLIENT_V1
    && request.headers.get('origin') === null
    && request.headers.get('cookie') === null
    && request.headers.get('authorization') === null
    ? 'native'
    : 'invalid'
}
