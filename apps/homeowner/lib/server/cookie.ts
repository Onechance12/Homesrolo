/**
 * SERVER-ONLY. The one place the session cookie is read.
 *
 * Exactly one named session cookie is consulted, and its value is treated as
 * an opaque bounded handle: never decoded, never logged, never projected into
 * a response, and never interpreted as identity — the server-side identity
 * port is the only thing that may resolve it. A malformed or oversized value
 * is treated as ABSENT (fail closed to signed-out) rather than passed through
 * or reported, so a hostile cookie is indistinguishable from no cookie.
 *
 * The cookie itself is minted by the integration lane's session
 * infrastructure, not by anything in this repository yet. That minting lane
 * must set HttpOnly, Secure, and an appropriate SameSite policy; an incoming
 * Cookie header cannot prove those attributes. The name and bounds below are
 * this adapter's documented assumption for that lane.
 */

export const SESSION_COOKIE_NAME = 'hrolo_session'

/** Opaque handle bounds: base64url-ish charset, sane length window. */
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/

/**
 * Extract the named cookie's value from a Cookie header, or null. Handles the
 * standard `a=1; b=2` form; a duplicated session cookie is treated as absent,
 * because two values for one session is a request not worth guessing about.
 */
export function sessionHandleFromCookieHeader(header: string | null): string | null {
  if (header === null || header.length === 0) return null
  // An absurdly long Cookie header is rejected wholesale before parsing.
  if (header.length > 8192) return null

  const matches: string[] = []
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name !== SESSION_COOKIE_NAME) continue
    matches.push(part.slice(eq + 1).trim())
  }
  if (matches.length !== 1) return null

  const value = matches[0]
  if (value === undefined || !HANDLE_PATTERN.test(value)) return null
  return value
}
