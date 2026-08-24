import { z } from 'zod'

const HOMEOWNER_PRODUCTION_APP_ORIGINS = new Set([
  'https://app.homesrolo.com',
  'https://homesrolo-homeowner-v2.onrender.com',
])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const httpsUrl = z.string().url().transform(value => new URL(value)).refine(
  value => value.protocol === 'https:'
    || value.hostname === 'localhost'
    || value.hostname === '127.0.0.1',
  'must use HTTPS outside local development',
)

const providerKey = z.string().min(20).max(4096).regex(/^\S+$/)

const configurationSchema = z.object({
  supabaseUrl: httpsUrl,
  publishableKey: providerKey,
  secretKey: providerKey,
  appOrigin: httpsUrl,
  projectQuotesEnabled: z.enum(['true', 'false']).optional().default('false'),
  privateUploadsEnabled: z.enum(['true', 'false']).optional().default('false'),
  photoCheckupsEnabled: z.enum(['true', 'false']).optional().default('false'),
  jobroloAttachmentsEnabled: z.enum(['true', 'false']).optional().default('false'),
}).strict()

export interface HomeownerRuntimeConfiguration {
  readonly supabaseUrl: string
  readonly publishableKey: string
  readonly secretKey: string
  readonly appOrigin: string
  readonly projectQuotesEnabled: boolean
  readonly privateUploadsEnabled: boolean
  readonly photoCheckupsEnabled: boolean
  readonly jobroloAttachmentsEnabled: boolean
}

function homeownerAppOriginAllowed(origin: URL, nodeEnvironment: string | undefined) {
  if (origin.username || origin.password || origin.search || origin.hash
    || (origin.pathname !== '/' && origin.pathname !== '')) return false
  if (HOMEOWNER_PRODUCTION_APP_ORIGINS.has(origin.origin)) return true
  if (nodeEnvironment === 'production') return false
  const loopback = LOOPBACK_HOSTS.has(origin.hostname)
  if (nodeEnvironment === 'development') return loopback
  if (nodeEnvironment === 'test') {
    return loopback || (origin.protocol === 'https:' && origin.hostname.endsWith('.test'))
  }
  return false
}

/**
 * Reads only the server-owned integration values. A partial or malformed
 * configuration enables nothing: the caller receives null and the runtime
 * stays on its fail-closed adapters.
 */
export function readHomeownerRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): HomeownerRuntimeConfiguration | null {
  if (environment.NODE_ENV === 'production'
    && !HOMEOWNER_PRODUCTION_APP_ORIGINS.has(environment.HOMESROLO_APP_ORIGIN ?? '')) return null
  const parsed = configurationSchema.safeParse({
    supabaseUrl: environment.HOMESROLO_SUPABASE_URL,
    publishableKey: environment.HOMESROLO_SUPABASE_PUBLISHABLE_KEY,
    secretKey: environment.HOMESROLO_SUPABASE_SECRET_KEY,
    appOrigin: environment.HOMESROLO_APP_ORIGIN,
    projectQuotesEnabled: environment.HOMESROLO_PROJECT_QUOTES_ENABLED,
    privateUploadsEnabled: environment.HOMESROLO_PRIVATE_UPLOADS_ENABLED,
    photoCheckupsEnabled: environment.HOMESROLO_PHOTO_CHECKUPS_ENABLED,
    jobroloAttachmentsEnabled: environment.HOMESROLO_JOBROLO_ATTACHMENTS_ENABLED,
  })
  if (!parsed.success) return null
  if (!homeownerAppOriginAllowed(parsed.data.appOrigin, environment.NODE_ENV)) return null
  return Object.freeze({
    supabaseUrl: parsed.data.supabaseUrl.origin,
    publishableKey: parsed.data.publishableKey,
    secretKey: parsed.data.secretKey,
    appOrigin: parsed.data.appOrigin.origin,
    projectQuotesEnabled: parsed.data.projectQuotesEnabled === 'true',
    privateUploadsEnabled: parsed.data.privateUploadsEnabled === 'true',
    photoCheckupsEnabled: parsed.data.photoCheckupsEnabled === 'true',
    jobroloAttachmentsEnabled: parsed.data.jobroloAttachmentsEnabled === 'true',
  })
}
