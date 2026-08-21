import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { classifyRequest } from '../../../../src/constitution/detector.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import {
  HomeResearchError,
  HomeResearchRateLimiter,
  homeResearchRequestSchema,
  type HomeResearchClient,
} from './home-research.ts'

const MAX_JSON_BYTES = 8 * 1024
const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
})

const sharedRateLimiter = new HomeResearchRateLimiter()

function response(status: number, body: unknown, additionalHeaders?: Readonly<Record<string, string>>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...additionalHeaders },
  })
}

async function boundedJson(request: Request): Promise<unknown | null> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const length = request.headers.get('content-length')
  if (mediaType !== 'application/json'
    || (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))
    || !request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_JSON_BYTES) {
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
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

function mapped(error: unknown): Response {
  if (error instanceof z.ZodError) return response(400, { error: { code: 'invalid_request' } })
  if (error instanceof HomeResearchError) return response(503, { error: { code: 'unavailable' } })
  if (!(error instanceof HomeownerApiError)) return response(503, { error: { code: 'unavailable' } })
  if (error.code === 'signed_out') return response(401, { error: { code: 'signed_out' } })
  if (error.code === 'forbidden') return response(403, { error: { code: 'forbidden' } })
  if (error.code === 'not_found') return response(404, { error: { code: 'not_found' } })
  if (error.code === 'invalid_request') return response(400, { error: { code: 'invalid_request' } })
  return response(503, { error: { code: 'unavailable' } })
}

function rateLimitKey(sessionHandle: string, homeRef: string): string {
  return createHash('sha256')
    .update(sessionHandle, 'utf8')
    .update('\0')
    .update(homeRef, 'utf8')
    .digest('base64url')
}

export interface HomeResearchHttpDependencies {
  readonly appOrigin: string | null
  readonly client: HomeResearchClient | null
  readonly authorizeHome: (sessionHandle: string, homeRef: string) => Promise<void>
  readonly rateLimiter: HomeResearchRateLimiter
}

export async function handleHomeResearchRequestWithDependencies(
  request: Request,
  homeRef: string,
  dependencies: HomeResearchHttpDependencies,
): Promise<Response> {
  if (!dependencies.appOrigin || !dependencies.client) {
    return response(503, { error: { code: 'unavailable' } })
  }
  if (request.method !== 'POST') {
    return response(405, { error: { code: 'method_not_allowed' } }, { allow: 'POST' })
  }
  if (request.headers.get('origin') !== dependencies.appOrigin) {
    return response(403, { error: { code: 'forbidden' } })
  }

  const rawBody = await boundedJson(request)
  if (rawBody === null) return response(400, { error: { code: 'invalid_request' } })
  const parsedBody = homeResearchRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) return response(400, { error: { code: 'invalid_request' } })
  const homeownerText = [
    ...parsedBody.data.history.filter(turn => turn.role === 'user').map(turn => turn.text),
    parsedBody.data.message,
  ].join('\n')
  if (classifyRequest(homeownerText).refusals.length > 0) {
    return response(400, { error: { code: 'invalid_request' } })
  }

  const sessionHandle = sessionHandleFromCookieHeader(request.headers.get('cookie'))
  if (!sessionHandle) return response(401, { error: { code: 'signed_out' } })

  try {
    // Reuse the existing exact-home authorization boundary. This performs a
    // fresh server-owned membership check before an address reaches OpenAI.
    await dependencies.authorizeHome(sessionHandle, homeRef)
    const allowance = dependencies.rateLimiter.consume(rateLimitKey(sessionHandle, homeRef))
    if (!allowance.allowed) {
      return response(
        429,
        { error: { code: 'rate_limited' } },
        { 'retry-after': String(allowance.retryAfterSeconds) },
      )
    }
    const result = await dependencies.client.research(parsedBody.data)
    return response(200, { data: result })
  } catch (error) {
    return mapped(error)
  }
}

export async function handleHomeResearchRequest(request: Request, homeRef: string): Promise<Response> {
  // Keep the HTTP policy independently testable without constructing provider
  // clients. The production runtime is loaded only by the actual route call.
  const runtime = await import('./runtime.ts')
  const runtimeConfiguration = runtime.homeownerRuntimeConfiguration()
  return handleHomeResearchRequestWithDependencies(request, homeRef, {
    appOrigin: runtimeConfiguration?.appOrigin ?? null,
    client: runtime.configuredHomeResearchClient(),
    async authorizeHome(sessionHandle, requestedHomeRef) {
      await runtime.homeownerApiService().readHome({ sessionHandle }, requestedHomeRef)
    },
    rateLimiter: sharedRateLimiter,
  })
}
