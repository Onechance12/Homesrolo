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
  readonly jsonBody: unknown
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
const HOME_INTAKE_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/intake$/
const HOME_PROJECTS_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects$/
const HOME_PROJECT_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})$/
const HOME_PROJECT_QUOTES_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})\/quotes$/
const HOME_PROJECT_QUOTE_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})\/quotes\/(hquo_[A-Za-z0-9_-]{43})$/
const HOME_ARTIFACTS_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/artifacts$/
const HOME_ROOFING_PROJECTS_PATH = /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/roofing-projects$/

function success(data: unknown, status = 200): HomeownerHttpResponse {
  return { status, headers: JSON_HEADERS, body: { data } }
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
  if (error.code === 'conflict') return problem(409, 'conflict')
  return problem(503, 'unavailable')
}

/**
 * Serves the three read routes plus the one exact create-home command. No
 * redirect, upload, generic mutation, or guessed fallback exists here.
 */
export function createHomeownerHttpHandler(service: HomeownerApiService) {
  return async function handle(request: HomeownerHttpRequest): Promise<HomeownerHttpResponse> {
    const context: HomeownerApiRequestContext = {
      sessionHandle: request.sessionHandle,
    }

    try {
      if (request.method === 'GET') {
        if (request.search !== '' || request.hasBody || request.jsonBody !== undefined) {
          return problem(400, 'invalid_request')
        }
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
        const projectsMatch = HOME_PROJECTS_PATH.exec(request.pathname)
        if (projectsMatch?.[1]) {
          return success(await service.listProjects(context, projectsMatch[1]))
        }
        const projectMatch = HOME_PROJECT_PATH.exec(request.pathname)
        if (projectMatch?.[1] && projectMatch[2]) {
          return success(await service.readProject(context, projectMatch[1], projectMatch[2]))
        }
        const projectQuotesMatch = HOME_PROJECT_QUOTES_PATH.exec(request.pathname)
        if (projectQuotesMatch?.[1] && projectQuotesMatch[2]) {
          return success(await service.listProjectQuotes(
            context,
            projectQuotesMatch[1],
            projectQuotesMatch[2],
          ))
        }
        const artifactsMatch = HOME_ARTIFACTS_PATH.exec(request.pathname)
        if (artifactsMatch?.[1]) {
          return success(await service.listArtifacts(context, artifactsMatch[1]))
        }
        return problem(404, 'not_found')
      }

      if (request.method === 'POST' && request.pathname === '/api/v1/homes') {
        if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
          return problem(400, 'invalid_request')
        }
        return success(await service.createHome(context, request.jsonBody), 201)
      }

      if (request.method === 'POST') {
        const projectsMatch = HOME_PROJECTS_PATH.exec(request.pathname)
        if (projectsMatch?.[1]) {
          if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
            return problem(400, 'invalid_request')
          }
          return success(await service.createProject(
            context,
            projectsMatch[1],
            request.jsonBody,
          ), 201)
        }
        const projectQuoteMatch = HOME_PROJECT_QUOTE_PATH.exec(request.pathname)
        if (projectQuoteMatch?.[1] && projectQuoteMatch[2] && projectQuoteMatch[3]) {
          if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
            return problem(400, 'invalid_request')
          }
          return success(await service.saveProjectQuote(
            context,
            projectQuoteMatch[1],
            projectQuoteMatch[2],
            projectQuoteMatch[3],
            request.jsonBody,
          ))
        }
        const projectQuotesMatch = HOME_PROJECT_QUOTES_PATH.exec(request.pathname)
        if (projectQuotesMatch?.[1] && projectQuotesMatch[2]) {
          if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
            return problem(400, 'invalid_request')
          }
          return success(await service.createProjectQuote(
            context,
            projectQuotesMatch[1],
            projectQuotesMatch[2],
            request.jsonBody,
          ), 201)
        }
        const roofingProjectMatch = HOME_ROOFING_PROJECTS_PATH.exec(request.pathname)
        if (roofingProjectMatch?.[1]) {
          if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
            return problem(400, 'invalid_request')
          }
          return success(await service.startRoofingProject(
            context,
            roofingProjectMatch[1],
            request.jsonBody,
          ), 201)
        }
        const intakeMatch = HOME_INTAKE_PATH.exec(request.pathname)
        if (intakeMatch?.[1]) {
          if (request.search !== '' || !request.hasBody || request.jsonBody === undefined) {
            return problem(400, 'invalid_request')
          }
          return success(await service.recordInitialIntake(
            context,
            intakeMatch[1],
            request.jsonBody,
          ), 201)
        }
      }

      if (request.pathname === '/api/v1/session'
         || request.pathname === '/api/v1/homes'
         || HOME_PATH.test(request.pathname)
         || HOME_INTAKE_PATH.test(request.pathname)
         || HOME_PROJECTS_PATH.test(request.pathname)
         || HOME_PROJECT_PATH.test(request.pathname)
         || HOME_PROJECT_QUOTES_PATH.test(request.pathname)
         || HOME_PROJECT_QUOTE_PATH.test(request.pathname)
         || HOME_ARTIFACTS_PATH.test(request.pathname)
         || HOME_ROOFING_PROJECTS_PATH.test(request.pathname)) {
        return problem(405, 'method_not_allowed')
      }
      return problem(404, 'not_found')
    } catch (error) {
      return mappedError(error)
    }
  }
}

export const HOMEOWNER_HTTP_WARNING =
  'This boundary defines authenticated home, project, quote, and artifact-metadata reads plus exact home, intake, bounded all-home project, roofing-intent, and private-quote commands. Multipart artifact upload and private content delivery remain separate server-only adapters; no open-ended mutation or Jobrolo delivery exists here.'
