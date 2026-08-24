import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

const MINIMUM_SECRET_LENGTH = 32
const MAXIMUM_ADDRESS_HEADER_LENGTH = 64

const MINUTE = 60_000
const DEFAULT_MAXIMUM_BUCKETS = 8_192

interface RateLimitRule {
  readonly scope: string
  readonly subject: 'global' | 'ip' | 'email' | 'pair'
  readonly limit: number
  readonly windowMs: number
}

const REQUEST_RULES: readonly RateLimitRule[] = Object.freeze([
  // Keep a runaway instance below the free sender's daily allowance. The
  // provider's own durable quota remains the cross-instance backstop.
  { scope: 'request-global-day', subject: 'global', limit: 90, windowMs: 24 * 60 * MINUTE },
  { scope: 'request-ip', subject: 'ip', limit: 30, windowMs: 15 * MINUTE },
  { scope: 'request-email', subject: 'email', limit: 5, windowMs: 15 * MINUTE },
  { scope: 'request-email-cooldown', subject: 'email', limit: 1, windowMs: MINUTE },
  { scope: 'request-pair', subject: 'pair', limit: 3, windowMs: 15 * MINUTE },
  { scope: 'request-cooldown', subject: 'pair', limit: 1, windowMs: MINUTE },
])

const VERIFY_RULES: readonly RateLimitRule[] = Object.freeze([
  { scope: 'verify-global', subject: 'global', limit: 1_000, windowMs: 15 * MINUTE },
  { scope: 'verify-ip', subject: 'ip', limit: 60, windowMs: 15 * MINUTE },
  { scope: 'verify-email', subject: 'email', limit: 12, windowMs: 15 * MINUTE },
  { scope: 'verify-pair', subject: 'pair', limit: 8, windowMs: 15 * MINUTE },
])

interface Bucket {
  count: number
  resetAt: number
}

export type EmailCodeRateLimitAllowance =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number }

function digest(secret: string, scope: string, value: string): string {
  return createHmac('sha256', secret)
    .update(scope, 'utf8')
    .update('\0', 'utf8')
    .update(value, 'utf8')
    .digest('base64url')
}

/**
 * Produces the only email identity retained by the limiter. Canonicalization
 * mirrors the auth provider boundary; the raw address is never a Map key.
 */
export function hmacEmailRateLimitSubject(secret: string, rawEmail: string): string {
  if (secret.length < MINIMUM_SECRET_LENGTH) throw new Error('invalid_rate_limit_secret')
  return digest(secret, 'email', rawEmail.trim().toLowerCase())
}

function normalizedAddress(value: string | null): string | null {
  if (!value || value.length > MAXIMUM_ADDRESS_HEADER_LENGTH) return null
  const candidate = value.trim().toLowerCase()
  return isIP(candidate) !== 0 ? candidate : null
}

/**
 * Render routes public ingress through Cloudflare, whose single-value
 * CF-Connecting-IP header is the stable original-client boundary. We do not
 * fall back to client-controlled forwarding headers: a missing or malformed
 * Cloudflare value enters one shared, conservative bucket instead of bypassing
 * throttling.
 */
export function emailCodeClientAddress(request: Request): string {
  return normalizedAddress(request.headers.get('cf-connecting-ip'))
    ?? 'unresolved'
}

/**
 * A bounded process-local first line of defense. Supabase/provider quotas are
 * still the durable cross-process boundary. At capacity this limiter denies
 * new subjects instead of evicting live buckets and failing open.
 */
export class EmailCodeRateLimiter {
  readonly #secret: string
  readonly #now: () => number
  readonly #maximumBuckets: number
  readonly #buckets = new Map<string, Bucket>()

  constructor(input: {
    readonly secret: string
    readonly now?: () => number
    readonly maximumBuckets?: number
  }) {
    if (input.secret.length < MINIMUM_SECRET_LENGTH) throw new Error('invalid_rate_limit_secret')
    if (input.maximumBuckets !== undefined
      && (!Number.isSafeInteger(input.maximumBuckets) || input.maximumBuckets < 10)) {
      throw new Error('invalid_rate_limit_capacity')
    }
    this.#secret = input.secret
    this.#now = input.now ?? Date.now
    this.#maximumBuckets = input.maximumBuckets ?? DEFAULT_MAXIMUM_BUCKETS
  }

  consumeRequest(request: Request, rawEmail: string): EmailCodeRateLimitAllowance {
    return this.#consume(REQUEST_RULES, request, rawEmail)
  }

  consumeVerification(request: Request, rawEmail: string): EmailCodeRateLimitAllowance {
    return this.#consume(VERIFY_RULES, request, rawEmail)
  }

  #consume(
    rules: readonly RateLimitRule[],
    request: Request,
    rawEmail: string,
  ): EmailCodeRateLimitAllowance {
    const now = this.#now()
    const emailSubject = hmacEmailRateLimitSubject(this.#secret, rawEmail)
    const ipSubject = digest(this.#secret, 'ip', emailCodeClientAddress(request))
    const pairSubject = digest(this.#secret, 'pair', `${ipSubject}\0${emailSubject}`)
    const subjects = { global: 'all', ip: ipSubject, email: emailSubject, pair: pairSubject } as const
    const candidates = rules.map(rule => ({
      rule,
      key: `${rule.scope}:${digest(this.#secret, rule.scope, subjects[rule.subject])}`,
    }))

    let retryAfterSeconds = 0
    for (const { rule, key } of candidates) {
      const bucket = this.#buckets.get(key)
      if (bucket && bucket.resetAt > now && bucket.count >= rule.limit) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
        )
      }
    }
    if (retryAfterSeconds > 0) return { allowed: false, retryAfterSeconds }

    const absentKeys = candidates.reduce((count, { key }) =>
      count + Number(!this.#buckets.has(key)), 0)
    if (this.#buckets.size + absentKeys > this.#maximumBuckets) {
      for (const [key, bucket] of this.#buckets) {
        if (bucket.resetAt <= now) this.#buckets.delete(key)
      }
      const missingAfterPrune = candidates.reduce((count, { key }) =>
        count + Number(!this.#buckets.has(key)), 0)
      if (this.#buckets.size + missingAfterPrune > this.#maximumBuckets) {
        return { allowed: false, retryAfterSeconds: 60 }
      }
    }

    for (const { rule, key } of candidates) {
      const bucket = this.#buckets.get(key)
      if (!bucket || bucket.resetAt <= now) {
        this.#buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
      } else {
        bucket.count += 1
      }
    }
    return { allowed: true }
  }
}
