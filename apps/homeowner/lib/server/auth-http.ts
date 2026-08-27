import {
  clearSessionCookie,
  sessionCookie,
  SESSION_LIFETIME_SECONDS,
} from './cookie.ts'
import {
  configuredEmailCodeRateLimiter,
  configuredHomeownerAuthService,
  homeownerApiService,
  homeownerRuntimeConfiguration,
} from './runtime.ts'
import type { EmailCodeRateLimiter } from './email-code-rate-limit.ts'
import {
  emailCodeIsValid,
  homesPathForEntryContext,
  magicLinkEmailIsValid,
  signInPathForEntryContext,
  validatedHandoffShareRef,
  validatedRoofingIntent,
  type HomeownerAuthService,
} from './auth.ts'
import {
  homeownerAuthenticationBootstrapChannel,
  homeownerMutationRequestAllowed,
  homeownerPwaLegacyUpgradeEnvelope,
  homeownerPwaSignOutEnvelope,
  homeownerRequestAuthentication,
  HOMEOWNER_NATIVE_CLIENT_HEADER,
  HOMEOWNER_PWA_CLIENT_V1,
  type HomeownerRequestAuthentication,
} from './request-auth.ts'

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
  const hasHandoff = keys.includes('handoff')
  return keys.length === 2 + Number(hasIntent) + Number(hasHandoff)
    && new Set(keys).size === keys.length
    && keys.every(key => key === 'token_hash' || key === 'type' || key === 'intent' || key === 'handoff')
    && keys.includes('token_hash')
    && keys.includes('type')
    && searchParams.get('type') === 'email'
    && (!hasIntent || validatedRoofingIntent(searchParams.get('intent')) !== null)
    && (!hasHandoff || validatedHandoffShareRef(searchParams.get('handoff')) !== null)
}

async function boundedJson(request: Request, maximumBytes = 1024): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) return null
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') return null
  if (!request.body) return null
  try {
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let byteLength = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > maximumBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    if (byteLength === 0) return null
    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

export interface EmailCodeHttpDependencies {
  readonly appOrigin: string | null
  readonly enabled: boolean
  readonly auth: Pick<HomeownerAuthService, 'requestEmailCode' | 'completeEmailCode'> | null
  readonly rateLimiter: EmailCodeRateLimiter | null
}

function runtimeEmailCodeDependencies(): EmailCodeHttpDependencies {
  const configuration = homeownerRuntimeConfiguration()
  return {
    appOrigin: configuration?.appOrigin ?? null,
    enabled: configuration?.emailCodeSignInEnabled === true,
    auth: configuredHomeownerAuthService(),
    rateLimiter: configuredEmailCodeRateLimiter(),
  }
}

export async function requestHomeownerMagicLink(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  // Once code sign-in is active, only already-issued legacy links remain
  // consumable. This sender must not bypass the email-code abuse boundary.
  if (!configuration || !auth || configuration.emailCodeSignInEnabled === true) {
    return json(503, { error: { code: 'unavailable' } })
  }
  if (!sameOrigin(request, configuration.appOrigin)) {
    return json(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const keys = Object.keys(body)
  if (!Object.hasOwn(body, 'email')
    || keys.some(key => key !== 'email' && key !== 'intent' && key !== 'handoff')
    || keys.length < 1 || keys.length > 3
    || (Object.hasOwn(body, 'intent')
      && validatedRoofingIntent((body as { intent?: unknown }).intent) === null)
    || (Object.hasOwn(body, 'handoff')
      && validatedHandoffShareRef((body as { handoff?: unknown }).handoff) === null)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  try {
    const result = await auth.requestMagicLink(
      (body as { email?: unknown }).email,
      Object.hasOwn(body, 'intent') ? (body as { intent?: unknown }).intent : null,
      Object.hasOwn(body, 'handoff') ? (body as { handoff?: unknown }).handoff : null,
    )
    if (result === 'rate_limited') return json(429, { error: { code: 'rate_limited' } })
    if (result === 'unavailable') return json(503, { error: { code: 'unavailable' } })
    return json(202, { data: { accepted: true } })
  } catch {
    return json(400, { error: { code: 'invalid_request' } })
  }
}

export async function requestHomeownerEmailCodeWithDependencies(
  request: Request,
  dependencies: EmailCodeHttpDependencies,
): Promise<Response> {
  if (!dependencies.appOrigin || !dependencies.auth || !dependencies.rateLimiter
    || dependencies.enabled !== true) {
    return json(503, { error: { code: 'unavailable' } })
  }
  const channel = homeownerAuthenticationBootstrapChannel(request, dependencies.appOrigin)
  if (channel === 'invalid') {
    return json(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'email')
    || !magicLinkEmailIsValid((body as { email?: unknown }).email)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const email = (body as { email: string }).email
  const allowance = dependencies.rateLimiter.consumeRequest(request, email)
  // A syntactically valid request always receives the same envelope. Silent
  // throttling and provider failures cannot reveal whether an account exists.
  if (!allowance.allowed) return json(202, { data: { accepted: true } })
  try {
    await dependencies.auth.requestEmailCode(email)
  } catch {
    // Keep the response account-agnostic. Operational provider errors belong
    // in provider-owned aggregate telemetry, never the browser envelope.
  }
  return json(202, { data: { accepted: true } })
}

export async function requestHomeownerEmailCode(request: Request): Promise<Response> {
  return requestHomeownerEmailCodeWithDependencies(request, runtimeEmailCodeDependencies())
}

export async function verifyHomeownerEmailCodeWithDependencies(
  request: Request,
  dependencies: EmailCodeHttpDependencies,
): Promise<Response> {
  if (!dependencies.appOrigin || !dependencies.auth || !dependencies.rateLimiter
    || dependencies.enabled !== true) {
    return json(503, { error: { code: 'unavailable' } })
  }
  const channel = homeownerAuthenticationBootstrapChannel(request, dependencies.appOrigin)
  if (channel === 'invalid') {
    return json(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const keys = Object.keys(body)
  if (!Object.hasOwn(body, 'email') || !Object.hasOwn(body, 'code')
    || keys.length < 2 || keys.length > 4
    || keys.some(key => key !== 'email' && key !== 'code' && key !== 'intent' && key !== 'handoff')
    || !magicLinkEmailIsValid((body as { email?: unknown }).email)
    || !emailCodeIsValid((body as { code?: unknown }).code)
    || (Object.hasOwn(body, 'intent')
      && validatedRoofingIntent((body as { intent?: unknown }).intent) === null)
    || (Object.hasOwn(body, 'handoff')
      && validatedHandoffShareRef((body as { handoff?: unknown }).handoff) === null)) {
    return json(400, { error: { code: 'invalid_request' } })
  }
  const email = (body as { email: string }).email
  const allowance = dependencies.rateLimiter.consumeVerification(request, email)
  if (!allowance.allowed) {
    return json(
      429,
      { error: { code: 'rate_limited', retryAfterSeconds: allowance.retryAfterSeconds } },
      { 'retry-after': String(allowance.retryAfterSeconds) },
    )
  }
  let result: Awaited<ReturnType<typeof dependencies.auth.completeEmailCode>>
  try {
    result = await dependencies.auth.completeEmailCode(
      email,
      (body as { code?: unknown }).code,
    )
  } catch {
    return json(503, { error: { code: 'unavailable' } })
  }
  if (result.kind === 'rate_limited') {
    return json(
      429,
      { error: { code: 'rate_limited', retryAfterSeconds: 60 } },
      { 'retry-after': '60' },
    )
  }
  if (result.kind === 'unavailable') {
    return json(503, { error: { code: 'unavailable' } })
  }
  if (result.kind === 'invalid') {
    return json(422, { error: { code: 'invalid_code' } })
  }
  if (channel === 'native') {
    return json(200, {
      data: {
        signedIn: true,
        session: {
          token: result.sessionHandle,
          tokenType: 'Bearer',
          expiresInSeconds: SESSION_LIFETIME_SECONDS,
        },
      },
    })
  }
  return json(200, { data: { signedIn: true } }, {
    'set-cookie': sessionCookie(result.sessionHandle),
  })
}

export async function verifyHomeownerEmailCode(request: Request): Promise<Response> {
  return verifyHomeownerEmailCodeWithDependencies(request, runtimeEmailCodeDependencies())
}

export interface HomeownerPwaUpgradeHttpDependencies {
  readonly appOrigin: string | null
  readonly readSession: ((sessionHandle: string) => Promise<'signed_in' | 'signed_out'>) | null
}

function runtimePwaUpgradeDependencies(): HomeownerPwaUpgradeHttpDependencies {
  const configuration = homeownerRuntimeConfiguration()
  return {
    appOrigin: configuration?.appOrigin ?? null,
    readSession: configuration
      ? async sessionHandle => (await homeownerApiService().readSession({ sessionHandle })).kind
      : null,
  }
}

/**
 * Move one still-valid bearer from the previous PWA release into the existing
 * HttpOnly browser cookie contract. The route also validates an already-set
 * cookie, but never returns the opaque handle in JSON or a URL.
 */
export async function upgradeHomeownerPwaSessionWithDependencies(
  request: Request,
  dependencies: HomeownerPwaUpgradeHttpDependencies,
): Promise<Response> {
  if (!dependencies.appOrigin || !dependencies.readSession) {
    return json(503, { error: { code: 'unavailable' } })
  }
  const envelope = homeownerPwaLegacyUpgradeEnvelope(request, dependencies.appOrigin)
  if (!envelope) return json(403, { error: { code: 'forbidden' } })
  if (!envelope.sessionHandle) {
    return json(200, { data: { signedIn: false } }, {
      'set-cookie': clearSessionCookie(),
    })
  }
  let state: 'signed_in' | 'signed_out'
  try {
    state = await dependencies.readSession(envelope.sessionHandle)
  } catch {
    // An already-HttpOnly cookie remains intact on a transient identity-store
    // failure. The client erases a legacy localStorage bearer before calling,
    // intentionally preferring confidentiality over retry persistence.
    return json(503, { error: { code: 'unavailable' } })
  }
  if (state !== 'signed_in') {
    return json(200, { data: { signedIn: false } }, {
      'set-cookie': clearSessionCookie(),
    })
  }
  return json(200, { data: { signedIn: true } }, {
    'set-cookie': sessionCookie(envelope.sessionHandle),
  })
}

export async function upgradeHomeownerPwaSession(request: Request): Promise<Response> {
  return upgradeHomeownerPwaSessionWithDependencies(request, runtimePwaUpgradeDependencies())
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
  const rawHandoff = url.searchParams.get('handoff')
  if (!validMagicLinkCallbackQuery(url.searchParams)) {
    return Response.redirect(new URL('/signin?error=link', configuration.appOrigin), 303)
  }
  const handle = await auth.completeMagicLink(url.searchParams.get('token_hash'))
  if (!handle) {
    const entryPath = signInPathForEntryContext(rawIntent, rawHandoff)
    const separator = entryPath.includes('?') ? '&' : '?'
    return Response.redirect(new URL(`${entryPath}${separator}error=link`, configuration.appOrigin), 303)
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: `${configuration.appOrigin}${homesPathForEntryContext(rawIntent, rawHandoff)}`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'set-cookie': sessionCookie(handle),
    },
  })
}

export function successfulHomeownerSignOutResponse(
  authentication: Exclude<HomeownerRequestAuthentication, { readonly kind: 'invalid' }>,
): Response {
  return authentication.kind === 'native'
    ? json(200, { data: { signedOut: true } })
    : json(200, { data: { signedOut: true } }, { 'set-cookie': clearSessionCookie() })
}

export interface HomeownerSignOutHttpDependencies {
  readonly appOrigin: string | null
  readonly revokeSession: ((sessionHandle: string | null) => Promise<void>) | null
}

export async function signOutHomeownerWithDependencies(
  request: Request,
  dependencies: HomeownerSignOutHttpDependencies,
): Promise<Response> {
  if (!dependencies.appOrigin || !dependencies.revokeSession) {
    return json(503, { error: { code: 'unavailable' } })
  }

  // Only this exact same-origin action may combine the active PWA bearer with
  // a residual legacy cookie. Revoke both, de-duplicated, then expire the
  // browser cookie in the response.
  if (request.headers.get(HOMEOWNER_NATIVE_CLIENT_HEADER) === HOMEOWNER_PWA_CLIENT_V1) {
    const envelope = homeownerPwaSignOutEnvelope(request, dependencies.appOrigin)
    if (!envelope) return json(400, { error: { code: 'invalid_request' } })
    const handles = new Set([
      envelope.bearerSessionHandle,
      ...(envelope.legacySessionHandle ? [envelope.legacySessionHandle] : []),
    ])
    const revokeSession = dependencies.revokeSession
    try {
      await Promise.all([...handles].map(handle => revokeSession(handle)))
    } catch {
      // The installed app will discard its local bearer even on an outage. Do
      // not let a retired cookie silently sign it back in on the next launch.
      return json(503, { error: { code: 'unavailable' } }, {
        'set-cookie': clearSessionCookie(),
      })
    }
    return json(200, { data: { signedOut: true } }, {
      'set-cookie': clearSessionCookie(),
    })
  }

  const authentication = homeownerRequestAuthentication(request)
  if (authentication.kind === 'invalid') {
    return json(400, { error: { code: 'invalid_request' } })
  }
  if (!homeownerMutationRequestAllowed(request, dependencies.appOrigin, authentication)) {
    return json(403, { error: { code: 'forbidden' } })
  }
  try {
    await dependencies.revokeSession(authentication.sessionHandle)
  } catch {
    return json(503, { error: { code: 'unavailable' } })
  }
  return successfulHomeownerSignOutResponse(authentication)
}

export async function signOutHomeowner(request: Request): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  const auth = configuredHomeownerAuthService()
  return signOutHomeownerWithDependencies(request, {
    appOrigin: configuration?.appOrigin ?? null,
    revokeSession: auth ? sessionHandle => auth.revokeSession(sessionHandle) : null,
  })
}
