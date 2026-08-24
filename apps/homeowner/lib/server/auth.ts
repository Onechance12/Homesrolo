import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { HomeownerRuntimeConfiguration } from './config.ts'
import { hashSessionHandle, mintOpaqueRef } from './supabase-provider.ts'
import { SESSION_LIFETIME_SECONDS } from './cookie.ts'
import {
  handoffShareRef,
  homeownerEntryContext,
  withHomeownerEntryContext,
} from '../entry-context.ts'
import { roofingIntent } from '../roofing-intent.ts'
import type { RoofingNeed } from '../port/types.ts'

const emailSchema = z.string().trim().email().max(254)
const emailCodeSchema = z.string().trim().regex(/^\d{6}$/)
const tokenHashSchema = z.string().regex(/^[A-Za-z0-9_-]{20,256}$/)
const accessTokenSchema = z.string().min(32).max(4096).regex(/^\S+$/)

export type EmailSignInRequestResult = 'accepted' | 'rate_limited' | 'unavailable'
export type MagicLinkRequestResult = EmailSignInRequestResult
export type EmailCodeCompletionResult =
  | { readonly kind: 'complete'; readonly sessionHandle: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable' }

export class HomeownerAuthService {
  readonly #auth: SupabaseClient
  readonly #service: SupabaseClient
  readonly #configuration: HomeownerRuntimeConfiguration
  readonly #now: () => Date

  constructor(input: {
    readonly auth: SupabaseClient
    readonly service: SupabaseClient
    readonly configuration: HomeownerRuntimeConfiguration
    readonly now?: () => Date
  }) {
    this.#auth = input.auth
    this.#service = input.service
    this.#configuration = input.configuration
    this.#now = input.now ?? (() => new Date())
  }

  async requestMagicLink(
    rawEmail: unknown,
    rawIntent: unknown = null,
    rawHandoff: unknown = null,
  ): Promise<MagicLinkRequestResult> {
    const parsed = emailSchema.safeParse(rawEmail)
    if (!parsed.success) throw new Error('invalid_email')
    const intent = rawIntent === null ? null : roofingIntent(rawIntent)
    if (rawIntent !== null && intent === null) throw new Error('invalid_intent')
    const handoff = rawHandoff === null ? null : handoffShareRef(rawHandoff)
    if (rawHandoff !== null && handoff === null) throw new Error('invalid_handoff')
    const { error } = await this.#auth.auth.signInWithOtp({
      email: parsed.data.toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${this.#configuration.appOrigin}${withHomeownerEntryContext('/auth/complete', { intent, handoff })}`,
      },
    })
    if (!error) return 'accepted'
    if (error.status === 429) return 'rate_limited'
    return 'unavailable'
  }

  async requestEmailCode(rawEmail: unknown): Promise<EmailSignInRequestResult> {
    const parsed = emailSchema.safeParse(rawEmail)
    if (!parsed.success) throw new Error('invalid_email')
    const { error } = await this.#auth.auth.signInWithOtp({
      email: parsed.data.toLowerCase(),
      options: {
        shouldCreateUser: true,
      },
    })
    if (!error) return 'accepted'
    if (error.status === 429) return 'rate_limited'
    return 'unavailable'
  }

  async completeEmailCode(
    rawEmail: unknown,
    rawCode: unknown,
  ): Promise<EmailCodeCompletionResult> {
    const email = emailSchema.safeParse(rawEmail)
    const code = emailCodeSchema.safeParse(rawCode)
    if (!email.success || !code.success) return { kind: 'invalid' }
    const { data, error } = await this.#auth.auth.verifyOtp({
      email: email.data.toLowerCase(),
      token: code.data,
      type: 'email',
    })
    if (error) {
      if (error.status === 429) return { kind: 'rate_limited' }
      if ([400, 401, 403, 422].includes(error.status)) return { kind: 'invalid' }
      // Supabase represents a retryable fetch/network failure with status 0.
      // Unknown provider failures must not be misreported as a bad user code.
      return { kind: 'unavailable' }
    }
    if (!data.user) return { kind: 'invalid' }
    const sessionHandle = await this.#mintHomeownerSession(data.user)
    return sessionHandle
      ? { kind: 'complete', sessionHandle }
      : { kind: 'unavailable' }
  }

  async completeMagicLink(rawTokenHash: unknown): Promise<string | null> {
    const parsed = tokenHashSchema.safeParse(rawTokenHash)
    if (!parsed.success) return null
    const { data, error } = await this.#auth.auth.verifyOtp({
      token_hash: parsed.data,
      type: 'email',
    })
    if (error || !data.user) return null
    return this.#mintHomeownerSession(data.user)
  }

  async completeProviderAccessToken(rawAccessToken: unknown): Promise<string | null> {
    const parsed = accessTokenSchema.safeParse(rawAccessToken)
    if (!parsed.success) return null
    const { data, error } = await this.#auth.auth.getUser(parsed.data)
    if (error || !data.user) return null
    return this.#mintHomeownerSession(data.user)
  }

  async #mintHomeownerSession(user: { readonly id: string; readonly email?: string | null }): Promise<string | null> {
    if (!user.email) return null

    const now = this.#now()
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000)
    const sessionHandle = randomBytes(32).toString('base64url')
    const { data: principal, error: persistenceError } = await this.#service.rpc(
      'homesrolo_complete_magic_link',
      {
        p_provider_user_id: user.id,
        p_email_canonical: user.email.trim().toLowerCase(),
        p_new_principal_ref: mintOpaqueRef('hprn'),
        p_session_hash: hashSessionHandle(sessionHandle),
        p_now: now.toISOString(),
        p_expires_at: expiresAt.toISOString(),
      },
    )
    if (persistenceError || !principal || typeof principal !== 'object') return null
    const row = principal as Record<string, unknown>
    if (row.status !== 'active' || typeof row.principal_ref !== 'string') return null
    return sessionHandle
  }

  async revokeSession(sessionHandle: string | null): Promise<void> {
    if (!sessionHandle) return
    await this.#service.rpc('homesrolo_revoke_homeowner_session', {
      p_session_hash: hashSessionHandle(sessionHandle),
      p_now: this.#now().toISOString(),
    })
  }
}

export function homesPathForRoofingIntent(rawIntent: unknown): string {
  return homesPathForEntryContext(rawIntent, null)
}

export function homesPathForEntryContext(rawIntent: unknown, rawHandoff: unknown): string {
  return withHomeownerEntryContext('/homes', homeownerEntryContext({
    intent: rawIntent,
    handoff: rawHandoff,
  }))
}

export function signInPathForEntryContext(rawIntent: unknown, rawHandoff: unknown): string {
  return withHomeownerEntryContext('/signin', homeownerEntryContext({
    intent: rawIntent,
    handoff: rawHandoff,
  }))
}

export function validatedRoofingIntent(rawIntent: unknown): RoofingNeed | null {
  return roofingIntent(rawIntent)
}

export function validatedHandoffShareRef(rawHandoff: unknown): string | null {
  return handoffShareRef(rawHandoff)
}

export function magicLinkEmailIsValid(value: unknown): boolean {
  return emailSchema.safeParse(value).success
}

export function emailCodeIsValid(value: unknown): boolean {
  return emailCodeSchema.safeParse(value).success
}
