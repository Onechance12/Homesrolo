import { clearSessionCookie, sessionCookie, sessionHandleFromCookieHeader } from './cookie.ts'
import { configuredHomeownerAuthService, homeownerRuntimeConfiguration } from './runtime.ts'

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

async function smallJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > 1024)) return null
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') return null
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > 1024) return null
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
  const body = await smallJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'email')) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  try {
    const result = await auth.requestMagicLink((body as { email?: unknown }).email)
    if (result === 'rate_limited') return json(429, { error: { code: 'rate_limited' } })
    if (result === 'unavailable') return json(503, { error: { code: 'unavailable' } })
    return json(202, { data: { accepted: true } })
  } catch {
    return json(400, { error: { code: 'invalid_request' } })
  }
}

export async function completeHomeownerMagicLink(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  if (!configuration || !auth) return Response.redirect(new URL('/signin?error=unavailable', request.url), 303)
  const url = new URL(request.url)
  const keys = [...url.searchParams.keys()]
  if (keys.length !== 2 || !keys.includes('token_hash') || !keys.includes('type')
    || url.searchParams.get('type') !== 'email') {
    return Response.redirect(new URL('/signin?error=link', configuration.appOrigin), 303)
  }
  const handle = await auth.completeMagicLink(url.searchParams.get('token_hash'))
  if (!handle) return Response.redirect(new URL('/signin?error=link', configuration.appOrigin), 303)
  return new Response(null, {
    status: 303,
    headers: {
      location: `${configuration.appOrigin}/homes`,
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

