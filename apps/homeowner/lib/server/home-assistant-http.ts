import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { classifyRequest } from '../../../../src/constitution/detector.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import { HomeResearchRateLimiter } from './home-research.ts'
import {
  askRoloRequestSchema,
  HomeAssistantError,
  type HomeAssistantClient,
  type HomeAssistantContext,
} from './home-assistant.ts'

const MAX_JSON_BYTES = 12 * 1024
const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
})

const sharedRateLimiter = new HomeResearchRateLimiter({ limit: 16, windowMs: 10 * 60 * 1_000 })

function response(status: number, body: unknown, headers?: Readonly<Record<string, string>>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
}

async function boundedJson(request: Request): Promise<unknown | null> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const declared = request.headers.get('content-length')
  if (mediaType !== 'application/json'
    || !request.body
    || (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES))) {
    return null
  }
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
  if (error instanceof HomeAssistantError) return response(503, { error: { code: 'unavailable' } })
  if (!(error instanceof HomeownerApiError)) return response(503, { error: { code: 'unavailable' } })
  if (error.code === 'signed_out') return response(401, { error: { code: 'signed_out' } })
  if (error.code === 'forbidden') return response(403, { error: { code: 'forbidden' } })
  if (error.code === 'not_found') return response(404, { error: { code: 'not_found' } })
  if (error.code === 'invalid_request') return response(400, { error: { code: 'invalid_request' } })
  return response(503, { error: { code: 'unavailable' } })
}

function rateLimitKey(sessionHandle: string, homeRef: string) {
  return createHash('sha256')
    .update(sessionHandle, 'utf8')
    .update('\0assistant\0', 'utf8')
    .update(homeRef, 'utf8')
    .digest('base64url')
}

export interface HomeAssistantHttpDependencies {
  readonly appOrigin: string | null
  readonly client: HomeAssistantClient | null
  readonly readContext: (
    sessionHandle: string,
    homeRef: string,
    requestedProjectRef?: string,
  ) => Promise<HomeAssistantContext>
  readonly rateLimiter: HomeResearchRateLimiter
}

export async function handleHomeAssistantRequestWithDependencies(
  request: Request,
  homeRef: string,
  dependencies: HomeAssistantHttpDependencies,
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
  const parsed = askRoloRequestSchema.safeParse(rawBody)
  if (!parsed.success) return response(400, { error: { code: 'invalid_request' } })
  const homeownerText = [
    ...parsed.data.history.filter(turn => turn.role === 'user').map(turn => turn.text),
    parsed.data.message,
  ].join('\n')
  if (classifyRequest(homeownerText).refusals.length > 0) {
    return response(400, { error: { code: 'invalid_request' } })
  }
  const sessionHandle = sessionHandleFromCookieHeader(request.headers.get('cookie'))
  if (!sessionHandle) return response(401, { error: { code: 'signed_out' } })

  try {
    const allowance = dependencies.rateLimiter.consume(rateLimitKey(sessionHandle, homeRef))
    if (!allowance.allowed) {
      return response(429, { error: { code: 'rate_limited' } }, {
        'retry-after': String(allowance.retryAfterSeconds),
      })
    }
    const context = await dependencies.readContext(sessionHandle, homeRef, parsed.data.projectRef)
    const result = await dependencies.client.answer(parsed.data, context)
    return response(200, { data: result })
  } catch (error) {
    return mapped(error)
  }
}

export async function handleHomeAssistantRequest(request: Request, homeRef: string) {
  const runtime = await import('./runtime.ts')
  const configuration = runtime.homeownerRuntimeConfiguration()
  return handleHomeAssistantRequestWithDependencies(request, homeRef, {
    appOrigin: configuration?.appOrigin ?? null,
    client: runtime.configuredHomeAssistantClient(),
    async readContext(sessionHandle, requestedHomeRef, requestedProjectRef) {
      const service = runtime.homeownerApiService()
      const requestContext = { sessionHandle }
      const home = await service.readHome(requestContext, requestedHomeRef)
      const projects = await service.listProjects(requestContext, requestedHomeRef)
      let files: Awaited<ReturnType<typeof service.listArtifacts>> = []
      let systems: HomeAssistantContext['systems'] = []
      try {
        files = await service.listArtifacts(requestContext, requestedHomeRef)
      } catch (error) {
        if (!(error instanceof HomeownerApiError) || error.code !== 'unavailable') throw error
      }
      try {
        const record = await service.readHomeRecord(requestContext, requestedHomeRef)
        systems = record.systems.map(system => ({
          kind: system.kind,
          present: system.present,
          installedOrReplacedYear: system.installedOrReplacedYear?.value ?? null,
        }))
      } catch (error) {
        if (!(error instanceof HomeownerApiError) || error.code !== 'unavailable') throw error
      }
      const visibleProjects = projects.filter(project => !project.archived)
      const requestedProject = requestedProjectRef
        ? visibleProjects.find(project => project.projectRef === requestedProjectRef)
        : undefined
      const assistantProjects = requestedProject
        ? [requestedProject, ...visibleProjects.filter(project => project.projectRef !== requestedProjectRef)].slice(0, 24)
        : visibleProjects.slice(0, 24)
      return {
        home: {
          label: home.displayLabel,
          locality: home.privateLocationLabel,
          projectCount: home.projectCount,
          documentCount: home.documentCount,
        },
        projects: assistantProjects.map(project => ({
          projectRef: project.projectRef,
          title: project.title,
          category: project.category,
          status: project.status,
          occurredOn: project.occurredOn ?? null,
          professionalLabel: project.professionalLabel ?? null,
        })),
        files: files.slice(0, 24).map(file => ({
          displayName: file.displayName,
          kind: file.kind,
          projectRef: file.projectRef ?? null,
        })),
        systems,
      }
    },
    rateLimiter: sharedRateLimiter,
  })
}
