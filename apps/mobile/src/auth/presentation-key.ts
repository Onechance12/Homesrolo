/** Private views follow identity lifetimes; the public form survives signed-out rechecks. */
export function sessionPresentationKey(
  cookieSession: boolean,
  principalRef: string | null,
  identityVersion: number,
): string {
  if (!cookieSession) return 'native-session'
  return principalRef === null ? 'signed-out' : `${principalRef}:${identityVersion}`
}
