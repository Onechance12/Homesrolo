/**
 * The ONE identifier the browser is allowed to mint: the opaque idempotency
 * ref for a create command. It carries no meaning and no authority — the
 * server derives requestedAt, the principal, and every membership fact from
 * the session, never from this value. Its only job is to make a retry of the
 * SAME submission indistinguishable from the original, so a homeowner who
 * taps "try again" after a network failure cannot open two files.
 *
 * Shape matches homeowner-runtime.v1's opaqueRef('hcmd') exactly:
 * `hcmd_` + 43 base64url characters (32 random bytes).
 */

export const COMMAND_REF_PATTERN = /^hcmd_[A-Za-z0-9_-]{43}$/

export function mintCommandRef(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const body = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `hcmd_${body}`
}

/**
 * One commandRef per submission attempt group: the first attempt mints, every
 * retry of the same unchanged draft reuses the minted value verbatim. The
 * caller resets its held ref to null when the draft changes — an edited draft
 * is a NEW command, not a retry of the old one.
 */
export function commandRefForAttempt(current: string | null): string {
  return current !== null && COMMAND_REF_PATTERN.test(current) ? current : mintCommandRef()
}
