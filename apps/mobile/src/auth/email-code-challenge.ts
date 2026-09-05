/** Tab-local recovery metadata, never an authentication credential. */
export const EMAIL_CODE_CHALLENGE_KEY = 'homesrolo.email-code-challenge.v1'
export const EMAIL_CODE_CHALLENGE_LIFETIME_MS = 10 * 60 * 1_000
export const EMAIL_CODE_RESEND_DELAY_MS = 60 * 1_000

export interface EmailCodeChallenge {
  readonly email: string
  /** Null when the person already has a code; its send time is unknown. */
  readonly sentAt: number | null
  /** Expiry of this local recovery step, not a claim about provider OTP expiry. */
  readonly expiresAt: number
  readonly step: 'code'
}

interface ChallengeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function normalizeSignInEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && !/[\u0000-\u001f\u007f]/.test(email)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email : null
}

export function createEmailCodeChallenge(
  email: string,
  now: number,
  source: 'requested' | 'existing' = 'requested',
): EmailCodeChallenge | null {
  const normalized = normalizeSignInEmail(email)
  if (!normalized || !Number.isSafeInteger(now) || now < 0
    || !Number.isSafeInteger(now + EMAIL_CODE_CHALLENGE_LIFETIME_MS)) return null
  return {
    email: normalized,
    sentAt: source === 'requested' ? now : null,
    expiresAt: now + EMAIL_CODE_CHALLENGE_LIFETIME_MS,
    step: 'code',
  }
}

export function parseEmailCodeChallenge(raw: string | null, now: number): EmailCodeChallenge | null {
  if (raw === null || raw.length > 1_024 || !Number.isSafeInteger(now) || now < 0) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 4
    || !['email', 'sentAt', 'expiresAt', 'step'].every(key => Object.hasOwn(record, key))
    || record.step !== 'code'
    || normalizeSignInEmail(record.email) !== record.email
    || typeof record.email !== 'string'
    || typeof record.expiresAt !== 'number' || !Number.isSafeInteger(record.expiresAt)
    || record.expiresAt <= now || record.expiresAt > now + EMAIL_CODE_CHALLENGE_LIFETIME_MS
    || (record.sentAt !== null && (
      typeof record.sentAt !== 'number' || !Number.isSafeInteger(record.sentAt)
      || record.sentAt < 0 || record.sentAt > now
      || record.expiresAt !== record.sentAt + EMAIL_CODE_CHALLENGE_LIFETIME_MS
    ))) return null
  return { email: record.email, sentAt: record.sentAt as number | null, expiresAt: record.expiresAt, step: 'code' }
}

export function emailCodeResendSeconds(challenge: EmailCodeChallenge | null, now: number): number {
  if (!challenge || challenge.sentAt === null || challenge.expiresAt <= now) return 0
  return Math.max(0, Math.ceil((challenge.sentAt + EMAIL_CODE_RESEND_DELAY_MS - now) / 1_000))
}

/** Uses only sessionStorage: a new independent tab has no shared challenge. */
export function createEmailCodeChallengeStorage(
  storage: () => ChallengeStorage | null = () => typeof window === 'undefined' ? null : window.sessionStorage,
) {
  const clear = () => {
    try { storage()?.removeItem(EMAIL_CODE_CHALLENGE_KEY) } catch { /* Recovery storage is optional. */ }
  }
  return {
    clear,
    clearMatching(challenge: EmailCodeChallenge, now = Date.now()): void {
      try {
        // A slow successful verification can finish after this local deadline.
        // Compare at the last valid instant so its own expired metadata is removed.
        const current = parseEmailCodeChallenge(storage()?.getItem(EMAIL_CODE_CHALLENGE_KEY) ?? null,
          Math.min(now, challenge.expiresAt - 1))
        if (current?.email === challenge.email && current.sentAt === challenge.sentAt
          && current.expiresAt === challenge.expiresAt) clear()
      } catch { /* A late completion cannot erase a newer challenge. */ }
    },
    read(now: number): EmailCodeChallenge | null {
      try {
        const raw = storage()?.getItem(EMAIL_CODE_CHALLENGE_KEY) ?? null
        const challenge = parseEmailCodeChallenge(raw, now)
        if (raw !== null && !challenge) clear()
        return challenge
      } catch { return null }
    },
    write(challenge: EmailCodeChallenge, now: number): boolean {
      // Project an explicit allow-list even if a caller passes extra runtime fields.
      const raw = JSON.stringify({
        email: challenge.email, sentAt: challenge.sentAt,
        expiresAt: challenge.expiresAt, step: challenge.step,
      })
      if (!parseEmailCodeChallenge(raw, now)) { clear(); return false }
      try {
        const target = storage()
        if (!target) return false
        target.setItem(EMAIL_CODE_CHALLENGE_KEY, raw)
        return true
      } catch { return false }
    },
  }
}
