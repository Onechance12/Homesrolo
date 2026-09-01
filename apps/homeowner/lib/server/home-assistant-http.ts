import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HouseholdServiceError,
  type HouseholdRoster,
  type HomeownerHouseholdService,
} from '../../../../src/homeowner/homeowner-household.v1.ts'
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

const CURRENT_PROJECT_ACTIVITY_LIMIT = 6
const CURRENT_PROJECT_ITEM_LIMIT = 8

function assistantText(value: string, maximum: number): string {
  return value.trim().slice(0, maximum)
}

function householdLabelKey(label: string): string {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

/**
 * Only exact-home active adults who can own work enter Rolo's context. If two
 * people have the same human label, both are withheld so the model can never
 * resolve an ambiguous name by guessing.
 */
export function assistantAssignableHouseholdMembers(
  roster: HouseholdRoster,
  requestedHomeRef: string,
): HomeAssistantContext['assignableHouseholdMembers'] {
  const eligible = roster.members.filter(member =>
    member.homeRef === requestedHomeRef
    && member.state === 'active'
    && (member.role === 'workspace_controller' || member.role === 'member'))
  const labelCounts = new Map<string, number>()
  for (const member of eligible) {
    const key = householdLabelKey(member.displayLabel)
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1)
  }
  return Object.freeze(eligible
    .filter(member => labelCounts.get(householdLabelKey(member.displayLabel)) === 1)
    .map(member => Object.freeze({
      membershipRef: member.membershipRef,
      displayLabel: member.displayLabel,
    })))
}

export async function readAssistantAssignableHouseholdMembers(
  householdService: Pick<HomeownerHouseholdService, 'listHousehold'> | null,
  sessionHandle: string,
  requestedHomeRef: string,
): Promise<HomeAssistantContext['assignableHouseholdMembers']> {
  if (!householdService) return Object.freeze([])
  try {
    return assistantAssignableHouseholdMembers(
      await householdService.listHousehold(sessionHandle, requestedHomeRef),
      requestedHomeRef,
    )
  } catch (error) {
    // Household collaboration may be staged off, or its not-found response may
    // intentionally hide authorization. Neither case should leak or invent an
    // assignee. Authentication, malformed data, and unexpected failures still
    // fail the entire request rather than weakening the boundary.
    if (error instanceof HouseholdServiceError
      && (error.code === 'unavailable' || error.code === 'not_found')) {
      return Object.freeze([])
    }
    throw error
  }
}

/**
 * Projects, updates, and Plans & Picks already have separate durable models.
 * This is only their small read-only projection for one Rolo request.
 */
export function assistantCurrentProjectContext(input: {
  readonly project: {
    readonly projectRef: string
    readonly title: string
    readonly workKind: string
    readonly category: string
    readonly status: string
    readonly occurredOn: string | null
    readonly summary: string
    readonly professionalLabel: string | null
  }
  readonly activity: readonly {
    readonly kind: string
    readonly body: string
    readonly createdAt: string
  }[]
  readonly items: readonly {
    readonly kind: string
    readonly label: string
    readonly detail: string
    readonly state: string
    readonly updatedAt: string
  }[]
}): NonNullable<HomeAssistantContext['currentProject']> {
  const { project } = input
  return {
    projectRef: project.projectRef,
    title: assistantText(project.title, 120),
    workKind: project.workKind,
    category: project.category,
    status: project.status,
    occurredOn: project.occurredOn,
    summary: assistantText(project.summary, 1_200),
    professionalLabel: project.professionalLabel
      ? assistantText(project.professionalLabel, 160)
      : null,
    recentActivity: [...input.activity]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-CURRENT_PROJECT_ACTIVITY_LIMIT)
      .map(entry => ({
        kind: entry.kind,
        body: assistantText(entry.body, 600),
        createdAt: entry.createdAt,
      })),
    plansAndPicks: [...input.items]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, CURRENT_PROJECT_ITEM_LIMIT)
      .map(item => ({
        kind: item.kind,
        label: assistantText(item.label, 160),
        detail: assistantText(item.detail, 400),
        state: item.state,
      })),
  }
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
    requestedProjectRef?: string,
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
        boundaryDecision.request.projectRef,
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
    async readSelectedPhoto(sessionHandle, requestedHomeRef, selection, requestedProjectRef) {
      const service = runtime.homeownerApiService()
      const result = await service.readArtifactContent(
        { sessionHandle },
        requestedHomeRef,
        selection.artifactRef,
        requestedProjectRef,
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
      const householdService = runtime.configuredHomeownerHouseholdService()
      const requestContext = { sessionHandle }
      const home = await service.readHome(requestContext, requestedHomeRef)
      const projects = await service.listProjects(requestContext, requestedHomeRef)
      let files: Awaited<ReturnType<typeof service.listArtifacts>> = []
      let systems: HomeAssistantContext['systems'] = []
      const assignableHouseholdMembers = await readAssistantAssignableHouseholdMembers(
        householdService,
        sessionHandle,
        requestedHomeRef,
      )
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
      if (requestedProjectRef && !requestedProject) {
        throw new HomeownerApiError('not_found')
      }
      let currentActivity: Awaited<ReturnType<typeof service.listProjectActivity>> = []
      let currentItems: Awaited<ReturnType<typeof service.listProjectItems>> = []
      if (requestedProject) {
        try {
          [currentActivity, currentItems] = await Promise.all([
            service.listProjectActivity(requestContext, requestedHomeRef, requestedProject.projectRef),
            service.listProjectItems(requestContext, requestedHomeRef, requestedProject.projectRef),
          ])
        } catch (error) {
          if (!(error instanceof HomeownerApiError) || error.code !== 'unavailable') throw error
        }
      }
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
        currentProject: requestedProject ? assistantCurrentProjectContext({
          project: {
            ...requestedProject,
            occurredOn: requestedProject.occurredOn ?? null,
            professionalLabel: requestedProject.professionalLabel ?? null,
          },
          activity: currentActivity,
          items: currentItems,
        }) : null,
        files: files.slice(0, 24).map(file => ({
          displayName: file.displayName,
          kind: file.kind,
          projectRef: file.projectRef ?? null,
        })),
        systems,
        assignableHouseholdMembers,
      }
    },
    rateLimiter: sharedRateLimiter,
  })
}
