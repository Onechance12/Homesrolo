import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { classifyRequest } from '../../../../src/constitution/detector.ts'
import {
  homeownerMutationRequestAllowed,
  homeownerRequestAuthentication,
} from './request-auth.ts'
import { HomeResearchRateLimiter } from './home-research.ts'
import {
  askRoloRequestSchema,
  homeAssistantBoundaryResult,
  homeAssistantBoundaryIdsFromAnswer,
  HomeAssistantError,
  type HomeAssistantClient,
  type HomeAssistantContext,
  type HomeAssistantSelectedPhoto,
} from './home-assistant.ts'
import {
  PhotoTransformBusyError,
  sanitizeHomeownerPhotoForAnalysis,
} from './checkup-photo-http.ts'

const MAX_JSON_BYTES = 24 * 1024
const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
})

const sharedRateLimiter = new HomeResearchRateLimiter({ limit: 16, windowMs: 10 * 60 * 1_000 })
const sharedVisionRateLimiter = new HomeResearchRateLimiter({ limit: 4, windowMs: 10 * 60 * 1_000 })

function boundaryAwareRequest(request: z.infer<typeof askRoloRequestSchema>) {
  const current = classifyRequest(request.message)
  const cleanHistory: typeof request.history[number][] = []
  let dropReplyToRefusedTurn = false
  let latestHistoricalRefusals: typeof current.refusals = []
  let safeUserTurnAfterLatestRefusal = false
  for (const turn of request.history) {
    if (turn.role === 'user') {
      const historical = classifyRequest(turn.text)
      if (historical.refusals.length > 0) {
        latestHistoricalRefusals = historical.refusals
        safeUserTurnAfterLatestRefusal = false
        dropReplyToRefusedTurn = true
        continue
      }
      if (latestHistoricalRefusals.length > 0) safeUserTurnAfterLatestRefusal = true
      dropReplyToRefusedTurn = false
      cleanHistory.push(turn)
      continue
    }
    if (dropReplyToRefusedTurn) {
      dropReplyToRefusedTurn = false
      continue
    }
    cleanHistory.push(turn)
  }
  const sanitizedRequest = { ...request, history: cleanHistory }
  if (current.refusals.length > 0) return { request: sanitizedRequest, refusals: current.refusals }

  const last = request.history.at(-1)
  const replyBoundary = last?.role === 'assistant'
    ? homeAssistantBoundaryIdsFromAnswer(last.text)
    : []
  const activeBoundary = replyBoundary.length > 0
    ? replyBoundary
    : safeUserTurnAfterLatestRefusal ? [] : latestHistoricalRefusals
  if (activeBoundary.length === 0) return { request: sanitizedRequest, refusals: [] }

  const explicitTopic = request.message.match(/^\s*(?:new (?:question|topic)|different question)\s*:\s*(.+)$/is)?.[1]?.trim()
  if (explicitTopic) {
    const explicitClassification = classifyRequest(explicitTopic)
    return {
      request: { ...request, message: explicitTopic, history: [] },
      refusals: explicitClassification.refusals,
    }
  }
  if (current.educational) {
    // General education is permitted, but the prohibited exchange is removed
    // before a model sees the new standalone question.
    return { request: { ...sanitizedRequest, history: [] }, refusals: [] }
  }
  // Ambiguous pressure after a boundary is still the same refused request.
  // This is state-based rather than phrase-based, so wording cannot bypass it.
  return { request: sanitizedRequest, refusals: activeBoundary }
}

export function assistantLocalityFromAddress(
  address: { readonly city: string; readonly regionCode: string } | null,
): string | null {
  if (!address) return null
  const city = address.city.trim()
  const regionCode = address.regionCode.trim().toUpperCase()
  return city && /^[A-Z]{2}$/.test(regionCode) ? `${city}, ${regionCode}` : null
}

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
  if (error instanceof PhotoTransformBusyError) {
    return response(429, { error: { code: 'rate_limited' } }, { 'retry-after': '5' })
  }
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
  readonly visionEnabled?: boolean
  readonly visionRateLimiter?: HomeResearchRateLimiter
  readonly readSelectedPhoto?: (
    sessionHandle: string,
    homeRef: string,
    selectedPhoto: NonNullable<z.infer<typeof askRoloRequestSchema>['selectedPhoto']>,
  ) => Promise<HomeAssistantSelectedPhoto>
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
  const authentication = homeownerRequestAuthentication(request)
  if (authentication.kind === 'invalid') {
    return response(400, { error: { code: 'invalid_request' } })
  }
  if (!homeownerMutationRequestAllowed(request, dependencies.appOrigin, authentication)) {
    return response(403, { error: { code: 'forbidden' } })
  }
  const rawBody = await boundedJson(request)
  const parsed = askRoloRequestSchema.safeParse(rawBody)
  if (!parsed.success) return response(400, { error: { code: 'invalid_request' } })
  // Each new message is classified on its own. A safely answered boundary from
  // an earlier turn must not poison the rest of a homeowner's conversation.
  const boundaryDecision = boundaryAwareRequest(parsed.data)
  const sessionHandle = authentication.sessionHandle
  if (!sessionHandle) return response(401, { error: { code: 'signed_out' } })

  try {
    const allowance = dependencies.rateLimiter.consume(rateLimitKey(sessionHandle, homeRef))
    if (!allowance.allowed) {
      return response(429, { error: { code: 'rate_limited' } }, {
        'retry-after': String(allowance.retryAfterSeconds),
      })
    }
    if (boundaryDecision.refusals.length > 0) {
      return response(200, {
        data: homeAssistantBoundaryResult(boundaryDecision.request, boundaryDecision.refusals),
      })
    }
    let selectedPhoto: HomeAssistantSelectedPhoto | null = null
    if (boundaryDecision.request.selectedPhoto) {
      if (!dependencies.visionEnabled
        || !dependencies.visionRateLimiter
        || !dependencies.readSelectedPhoto) {
        return response(503, { error: { code: 'unavailable' } })
      }
      const visionAllowance = dependencies.visionRateLimiter.consume(
        `${rateLimitKey(sessionHandle, homeRef)}:vision`,
      )
      if (!visionAllowance.allowed) {
        return response(429, { error: { code: 'rate_limited' } }, {
          'retry-after': String(visionAllowance.retryAfterSeconds),
        })
      }
      selectedPhoto = await dependencies.readSelectedPhoto(
        sessionHandle,
        homeRef,
        boundaryDecision.request.selectedPhoto,
      )
    }
    const context = await dependencies.readContext(
      sessionHandle,
      homeRef,
      boundaryDecision.request.projectRef,
    )
    const result = await dependencies.client.answer(
      boundaryDecision.request,
      context,
      selectedPhoto,
    )
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
    visionEnabled: configuration?.privateUploadsEnabled === true
      && configuration.roloVisionEnabled === true,
    visionRateLimiter: sharedVisionRateLimiter,
    async readSelectedPhoto(sessionHandle, requestedHomeRef, selection) {
      const service = runtime.homeownerApiService()
      const result = await service.readArtifactContent(
        { sessionHandle },
        requestedHomeRef,
        selection.artifactRef,
      )
      if (result.artifact.kind !== 'photo'
        || (result.artifact.mediaType !== 'image/jpeg'
          && result.artifact.mediaType !== 'image/png')) {
        throw new HomeownerApiError('invalid_request')
      }
      const sanitized = await sanitizeHomeownerPhotoForAnalysis(result.bytes)
      return { bytes: sanitized.fullBytes, mediaType: 'image/jpeg' }
    },
    async readContext(sessionHandle, requestedHomeRef, requestedProjectRef) {
      const service = runtime.homeownerApiService()
      const requestContext = { sessionHandle }
      const home = await service.readHome(requestContext, requestedHomeRef)
      const projects = await service.listProjects(requestContext, requestedHomeRef)
      let files: Awaited<ReturnType<typeof service.listArtifacts>> = []
      let systems: HomeAssistantContext['systems'] = []
      let locality: string | null = null
      try {
        files = await service.listArtifacts(requestContext, requestedHomeRef)
      } catch (error) {
        if (!(error instanceof HomeownerApiError) || error.code !== 'unavailable') throw error
      }
      try {
        const record = await service.readHomeRecord(requestContext, requestedHomeRef)
        locality = assistantLocalityFromAddress(record.address)
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
          // Never fall back to privateLocationLabel here. Older and native-created
          // homes may store a full street address in that legacy display field.
          locality,
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
