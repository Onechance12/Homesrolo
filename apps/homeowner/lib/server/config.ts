import { z } from 'zod'

const httpsUrl = z.string().url().transform(value => new URL(value)).refine(
  value => value.protocol === 'https:' || value.hostname === 'localhost' || value.hostname === '127.0.0.1',
  'must use HTTPS outside local development',
)

const providerKey = z.string().min(20).max(4096).regex(/^\S+$/)

const configurationSchema = z.object({
  supabaseUrl: httpsUrl,
  publishableKey: providerKey,
  secretKey: providerKey,
  appOrigin: httpsUrl,
}).strict()

export interface HomeownerRuntimeConfiguration {
  readonly supabaseUrl: string
  readonly publishableKey: string
  readonly secretKey: string
  readonly appOrigin: string
}

/**
 * Reads only the four server-owned integration values. A partial or malformed
 * configuration enables nothing: the caller receives null and the runtime
 * stays on its fail-closed adapters.
 */
export function readHomeownerRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): HomeownerRuntimeConfiguration | null {
  const parsed = configurationSchema.safeParse({
    supabaseUrl: environment.HOMESROLO_SUPABASE_URL,
    publishableKey: environment.HOMESROLO_SUPABASE_PUBLISHABLE_KEY,
    secretKey: environment.HOMESROLO_SUPABASE_SECRET_KEY,
    appOrigin: environment.HOMESROLO_APP_ORIGIN,
  })
  if (!parsed.success) return null
  return Object.freeze({
    supabaseUrl: parsed.data.supabaseUrl.origin,
    publishableKey: parsed.data.publishableKey,
    secretKey: parsed.data.secretKey,
    appOrigin: parsed.data.appOrigin.origin,
  })
}
