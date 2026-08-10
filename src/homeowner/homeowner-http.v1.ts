import {
  HomeownerApiError,
  type HomeownerApiRequestContext,
  type HomeownerApiService,
} from './homeowner-api.v1.ts'

/**
 * Framework-neutral HTTP boundary for the private homeowner application.
 *
 * A Next/Render adapter may populate `sessionHandle` only from a server-owned,
 * HttpOnly session cookie. It must never copy a principal, role, home, or
 * provider identifier from browser input into this field.
 */
export interface HomeownerHttpRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly hasBody: boolean
  readonly sessionHandle: string | null
}

export interface HomeownerHttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
})

const HOME_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})$/

function success(data: unknown): HomeownerHttpResponse {
  return { status: 200, headers: JSON_HEADERS, body: { data } }
}

function problem(status: number, code: string): HomeownerHttpResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body: { error: { code } },
  }
}

function mappedError(error: unknown): HomeownerHttpResponse {
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  return problem(503, 'unavailable')
}

/**
 * Serves exactly the three read routes in homeowner-api.v1. No write route,
 * redirect, upload, or guessed fallback exists in this boundary.
 */
export function createHomeownerHttpHandler(service: HomeownerApiService) {
  return async function handle(request: HomeownerHttpRequest): Promise<HomeownerHttpResponse> {
    if (request.method !== 'GET') return problem(405, 'method_not_allowed')
    if (request.search !== '' || request.hasBody) return problem(400, 'invalid_request')

    const context: HomeownerApiRequestContext = {
      sessionHandle: request.sessionHandle,
    }

    try {
      if (request.pathname === '/api/v1/session') {
        return success(await service.readSession(context))
      }
      if (request.pathname === '/api/v1/homes') {
        return success(await service.listHomes(context))
      }
      const homeMatch = HOME_PATH.exec(request.pathname)
      if (homeMatch?.[1]) {
        return success(await service.readHome(context, homeMatch[1]))
      }
      return problem(404, 'not_found')
    } catch (error) {
      return mappedError(error)
    }
  }
}

export const HOMEOWNER_HTTP_WARNING =
  'This boundary defines three authenticated reads only. It does not create sessions, send email, persist data, accept uploads, or expose write routes.'
