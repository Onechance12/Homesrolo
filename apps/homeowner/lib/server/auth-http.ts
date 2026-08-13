import { clearSessionCookie, sessionCookie, sessionHandleFromCookieHeader } from './cookie.ts'
import { configuredHomeownerAuthService, homeownerRuntimeConfiguration } from './runtime.ts'
import { homesPathForRoofingIntent, validatedRoofingIntent } from './auth.ts'

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
}

function sameOrigin(request: Request, expected: string): boolean {
  const origin = request.headers.get('origin')
  return origin === expected
}

export function validMagicLinkCallbackQuery(searchParams: URLSearchParams): boolean {
  const keys = [...searchParams.keys()]
  const hasIntent = keys.includes('intent')
  return keys.length === (hasIntent ? 3 : 2)
    && new Set(keys).size === keys.length
    && keys.every(key => key === 'token_hash' || key === 'type' || key === 'intent')
    && keys.includes('token_hash')
    && keys.includes('type')
    && searchParams.get('type') === 'email'
    && (!hasIntent || validatedRoofingIntent(searchParams.get('intent')) !== null)
}

async function boundedJson(request: Request, maximumBytes = 1024): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) return null
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') return null
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > maximumBytes) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export async function requestHomeownerMagicLink(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  if (!configuration || !auth) return json(503, { error: { code: 'unavailable' } })
  if (!sameOrigin(request, configuration.appOrigin)) {
    return json(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const keys = Object.keys(body)
  if (!Object.hasOwn(body, 'email')
    || keys.some(key => key !== 'email' && key !== 'intent')
    || keys.length < 1 || keys.length > 2
    || (Object.hasOwn(body, 'intent')
      && validatedRoofingIntent((body as { intent?: unknown }).intent) === null)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  try {
    const result = await auth.requestMagicLink(
      (body as { email?: unknown }).email,
      Object.hasOwn(body, 'intent') ? (body as { intent?: unknown }).intent : null,
    )
    if (result === 'rate_limited') return json(429, { error: { code: 'rate_limited' } })
    if (result === 'unavailable') return json(503, { error: { code: 'unavailable' } })
    return json(202, { data: { accepted: true } })
  } catch {
    return json(400, { error: { code: 'invalid_request' } })
  }
}

export async function exchangeHomeownerProviderSession(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  if (!configuration || !auth) return json(503, { error: { code: 'unavailable' } })
  if (!sameOrigin(request, configuration.appOrigin)) {
    return json(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request, 8192)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'access_token')) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const handle = await auth.completeProviderAccessToken(
    (body as { access_token?: unknown }).access_token,
  )
  if (!handle) return json(401, { error: { code: 'invalid_link' } })
  return json(200, { data: { signedIn: true } }, { 'set-cookie': sessionCookie(handle) })
}

export async function completeHomeownerMagicLink(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  if (!configuration || !auth) return Response.redirect(new URL('/signin?error=unavailable', request.url), 303)
  const url = new URL(request.url)
  const rawIntent = url.searchParams.get('intent')
  if (!validMagicLinkCallbackQuery(url.searchParams)) {
    return Response.redirect(new URL('/signin?error=link', configuration.appOrigin), 303)
  }
  const handle = await auth.completeMagicLink(url.searchParams.get('token_hash'))
  if (!handle) return Response.redirect(new URL('/signin?error=link', configuration.appOrigin), 303)
  return new Response(null, {
    status: 303,
    headers: {
      location: `${configuration.appOrigin}${homesPathForRoofingIntent(rawIntent)}`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'set-cookie': sessionCookie(handle),
    },
  })
}

export async function signOutHomeowner(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  if (!configuration || !auth) return json(503, { error: { code: 'unavailable' } })
  if (!sameOrigin(request, configuration.appOrigin)) {
    return json(403, { error: { code: 'forbidden' } })
  }
  const handle = sessionHandleFromCookieHeader(request.headers.get('cookie'))
  await auth.revokeSession(handle)
  return json(200, { data: { signedOut: true } }, { 'set-cookie': clearSessionCookie() })
}
