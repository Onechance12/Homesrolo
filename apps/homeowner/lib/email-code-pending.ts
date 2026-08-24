export const EMAIL_CODE_PENDING_KEY = 'homesrolo:pending-email-code:v1'
export const EMAIL_CODE_PENDING_TTL_MS = 15 * 60_000
export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60
export const EMAIL_CODE_MAX_COOLDOWN_SECONDS = 15 * 60

export type PendingEmailCode = {
  readonly version: 1
  readonly stage: 'code'
  readonly email: string
  readonly resendAvailableAt: number
  readonly verifyAvailableAt: number
  readonly savedAt: number
}

function isPlausibleEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+$/.test(value)
}

export function emailCodeCooldownDeadline(
  retryAfterSeconds: unknown = EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  now = Date.now(),
): number {
  const seconds = typeof retryAfterSeconds === 'number'
    && Number.isSafeInteger(retryAfterSeconds)
    && retryAfterSeconds > 0
    ? Math.min(retryAfterSeconds, EMAIL_CODE_MAX_COOLDOWN_SECONDS)
    : EMAIL_CODE_RESEND_COOLDOWN_SECONDS
  return now + seconds * 1_000
}

export function encodePendingEmailCode(
  email: string,
  resendAvailableAt: number,
  verifyAvailableAt = 0,
  now = Date.now(),
): string {
  const pending: PendingEmailCode = {
    version: 1,
    stage: 'code',
    email,
    resendAvailableAt,
    verifyAvailableAt,
    savedAt: now,
  }
  return JSON.stringify(pending)
}

export function decodePendingEmailCode(raw: string | null, now = Date.now()): PendingEmailCode | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingEmailCode>
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 6
      || !Object.hasOwn(value, 'version')
      || !Object.hasOwn(value, 'stage')
      || !Object.hasOwn(value, 'email')
      || !Object.hasOwn(value, 'resendAvailableAt')
      || !Object.hasOwn(value, 'verifyAvailableAt')
      || !Object.hasOwn(value, 'savedAt')
      || value.version !== 1
      || value.stage !== 'code'
      || !isPlausibleEmail(value.email)
      || typeof value.savedAt !== 'number'
      || !Number.isFinite(value.savedAt)
      || value.savedAt < 0
      || value.savedAt > now + 5_000
      || now - value.savedAt >= EMAIL_CODE_PENDING_TTL_MS
      || typeof value.resendAvailableAt !== 'number'
      || !Number.isFinite(value.resendAvailableAt)
      || value.resendAvailableAt < 0
      || typeof value.verifyAvailableAt !== 'number'
      || !Number.isFinite(value.verifyAvailableAt)
      || value.verifyAvailableAt < 0) {
      return null
    }
    const absoluteExpiry = value.savedAt + EMAIL_CODE_PENDING_TTL_MS
    return {
      version: 1,
      stage: 'code',
      email: value.email,
      resendAvailableAt: value.resendAvailableAt > now
        ? Math.min(value.resendAvailableAt, absoluteExpiry)
        : 0,
      verifyAvailableAt: value.verifyAvailableAt > now
        ? Math.min(value.verifyAvailableAt, absoluteExpiry)
        : 0,
      savedAt: value.savedAt,
    }
  } catch {
    return null
  }
}
