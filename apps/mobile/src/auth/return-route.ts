import { isHomeRef, isProjectRef } from '../api/protocol.ts'

export const DEFAULT_POST_SIGN_IN_DESTINATION = '/homes' as const

export type PostSignInDestination =
  | typeof DEFAULT_POST_SIGN_IN_DESTINATION
  | '/pro'
  | {
      readonly pathname: '/home/[homeId]/work/[projectRef]'
      readonly params: { readonly homeId: string; readonly projectRef: string }
    }

/** Build the only detail route currently allowed to cross the sign-in boundary. */
export function workDetailReturnPath(homeId: unknown, projectRef: unknown): string | null {
  if (!isHomeRef(homeId) || !isProjectRef(projectRef)) return null
  return `/home/${homeId}/work/${projectRef}`
}

/**
 * Convert an untrusted query parameter into a typed in-app destination. Exact
 * matching prevents open redirects and prevents a malformed record reference
 * from being carried through authentication.
 */
export function postSignInDestination(returnTo: unknown): PostSignInDestination {
  if (typeof returnTo !== 'string' || returnTo.length > 200) {
    return DEFAULT_POST_SIGN_IN_DESTINATION
  }
  if (returnTo === '/pro') return '/pro'
  const match = /^\/home\/([^/]+)\/work\/([^/]+)$/.exec(returnTo)
  if (!match) return DEFAULT_POST_SIGN_IN_DESTINATION
  const [, homeId, projectRef] = match
  if (!isHomeRef(homeId) || !isProjectRef(projectRef)) {
    return DEFAULT_POST_SIGN_IN_DESTINATION
  }
  return {
    pathname: '/home/[homeId]/work/[projectRef]',
    params: { homeId, projectRef },
  }
}
