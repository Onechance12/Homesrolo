import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { HomeownerRuntimeConfiguration } from './config.ts'
import { hashSessionHandle, mintOpaqueRef } from './supabase-provider.ts'
import { SESSION_LIFETIME_SECONDS } from './cookie.ts'

const emailSchema = z.string().trim().email().max(254)
const tokenHashSchema = z.string().regex(/^[A-Za-z0-9_-]{20,256}$/)

export type MagicLinkRequestResult = 'accepted' | 'rate_limited' | 'unavailable'

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

  async requestMagicLink(rawEmail: unknown): Promise<MagicLinkRequestResult> {
    const parsed = emailSchema.safeParse(rawEmail)
    if (!parsed.success) throw new Error('invalid_email')
    const { error } = await this.#auth.auth.signInWithOtp({
      email: parsed.data.toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${this.#configuration.appOrigin}/api/v1/auth/callback`,
      },
    })
    if (!error) return 'accepted'
    if (error.status === 429) return 'rate_limited'
    return 'unavailable'
  }

  async completeMagicLink(rawTokenHash: unknown): Promise<string | null> {
    const parsed = tokenHashSchema.safeParse(rawTokenHash)
    if (!parsed.success) return null
    const { data, error } = await this.#auth.auth.verifyOtp({
      token_hash: parsed.data,
      type: 'email',
    })
    const user = data.user
    if (error || !user || !user.email) return null

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

export function magicLinkEmailIsValid(value: unknown): boolean {
  return emailSchema.safeParse(value).success
}

