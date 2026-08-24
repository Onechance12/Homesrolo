import { z } from 'zod'
import {
  HOMEOWNER_SYSTEM_KINDS,
  authorizeHomeownerWorkspace,
  authorizePrivateHomeCreation,
  createHomeownerProjectInputSchema,
  createHomeWorkspaceInputSchema,
  homeownerApproximateYearSchema,
  homeownerArtifactMetadataSchema,
  homeownerHomeTypeSchema,
  homeownerProjectSchema,
  homeownerSystemKindSchema,
  homeownerUtcInstantSchema,
  parseHomeownerPropertyFacts,
  parseHomeownerSystem,
  parseHomeownerMembership,
  privateHomeProfileSchema,
  recordHomeownerIntakeInputSchema,
  storeHomeownerArtifactInputSchema,
  requireHomeownerActionGrant,
  type HomeownerCommandPort,
  type HomeownerIdentityPort,
  type HomeownerPrivateObjectPort,
  type HomeownerMembership,
  type HomeownerProject,
  type HomeownerRepositoryPort,
  type HomeownerWorkspaceAction,
  type PrivateHomeProfile,
} from './homeowner-runtime.v1.ts'
import {
  homeownerArtifactUploadInputSchema,
  validateHomeownerArtifactPayload,
} from './homeowner-artifacts.v1.ts'
import {
  HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES,
  HOMEOWNER_CHECKUP_PHOTO_MAX_PER_HOME,
  HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES,
  createHomeownerCheckupPhotoInputSchema,
  homeownerCheckupPhotoMetadataSchema,
  homeownerCheckupPhotoReservationSchema,
  type HomeownerCheckupPhotoMetadata,
  type HomeownerCheckupPhotoPort,
  type HomeownerCheckupPhotoReservation,
  type HomeownerCheckupPhotoVariant,
  type SanitizedHomeownerCheckupPhoto,
} from './homeowner-checkup-photos.v1.ts'
import {
  createHomeownerProjectQuoteInputSchema,
  homeownerProjectQuoteSchema,
  homeownerQuoteScopeSchema,
  saveHomeownerProjectQuoteInputSchema,
  type HomeownerProjectQuote,
  type HomeownerProjectQuotePort,
} from './homeowner-project-quotes.v1.ts'

/**
 * Server application boundary for the private homeowner app.
 *
 * Route adapters may pass only a server-resolved session handle into this
 * service. The browser never supplies a principal, membership, role, provider
 * identifier, or storage location.
 */
export const HOMEOWNER_API_VERSION = 'homeowner-api.v1-draft' as const

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

export const homeownerApiCapabilitiesSchema = z.object({
  magicLinkSignIn: z.boolean(),
  persistence: z.boolean(),
  projectQuotes: z.boolean(),
  homeResearch: z.boolean(),
  uploads: z.boolean(),
  photoCheckups: z.boolean(),
  projectReview: z.boolean(),
  projectReviewAttachments: z.boolean(),
  homeRecordHandoffs: z.boolean(),
  invitations: z.boolean(),
  sharing: z.boolean(),
}).strict()

export type HomeownerApiCapabilities = z.infer<typeof homeownerApiCapabilitiesSchema>

export const homeownerApiSessionSchema = z.discriminatedUnion('kind', [
  z.object({
    apiVersion: z.literal(HOMEOWNER_API_VERSION),
    kind: z.literal('signed_out'),
    capabilities: homeownerApiCapabilitiesSchema,
  }).strict(),
  z.object({
    apiVersion: z.literal(HOMEOWNER_API_VERSION),
    kind: z.literal('signed_in'),
    principalRef: opaqueRef('hprn'),
    capabilities: homeownerApiCapabilitiesSchema,
  }).strict(),
])

export type HomeownerApiSession = z.infer<typeof homeownerApiSessionSchema>

export const homeownerApiHomeSummarySchema = z.object({
  homeRef: opaqueRef('hhom'),
  displayLabel: z.string().trim().min(1).max(80),
  privateLocationLabel: z.string().trim().min(1).max(200),
  relationshipLabel: z.enum([
    'claimed_unverified',
    'verified_controller',
    'invited_participant',
  ]),
}).strict()

export type HomeownerApiHomeSummary = z.infer<typeof homeownerApiHomeSummarySchema>

export const homeownerApiCreateHomeInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  displayLabel: z.string().trim().min(1).max(80),
  privateLocationLabel: z.string().trim().min(1).max(200),
}).strict()

export type HomeownerApiCreateHomeInput = z.infer<typeof homeownerApiCreateHomeInputSchema>

const homeownerApiSystemInputSchema = z.object({
  kind: homeownerSystemKindSchema,
  present: z.enum(['yes', 'no', 'unknown']),
  installedOrReplacedYear: homeownerApproximateYearSchema.nullable(),
}).strict()

export const homeownerApiRecordIntakeInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  systems: z.array(homeownerApiSystemInputSchema).length(HOMEOWNER_SYSTEM_KINDS.length),
}).strict()

export const homeownerApiIntakeViewSchema = z.object({
  homeRef: opaqueRef('hhom'),
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  source: z.literal('homeowner_recollection'),
  systems: z.array(homeownerApiSystemInputSchema).length(HOMEOWNER_SYSTEM_KINDS.length),
  updatedAt: homeownerUtcInstantSchema,
}).strict().superRefine((view, context) => {
  const kinds = view.systems.map(system => system.kind)
  if (new Set(kinds).size !== HOMEOWNER_SYSTEM_KINDS.length
    || HOMEOWNER_SYSTEM_KINDS.some(kind => !kinds.includes(kind))) {
    context.addIssue({
      code: 'custom',
      path: ['systems'],
      message: 'the view must contain each supported system exactly once',
    })
  }
})

export type HomeownerApiRecordIntakeInput = z.infer<typeof homeownerApiRecordIntakeInputSchema>
export type HomeownerApiIntakeView = z.infer<typeof homeownerApiIntakeViewSchema>

export const homeownerApiRoofingNeedSchema = z.enum([
  'repair',
  'replacement',
  'inspection',
  'storm_damage',
  'not_sure',
])

export const homeownerApiRoofingTimingSchema = z.enum([
  'urgent',
  'within_30_days',
  'researching',
  'not_sure',
])

export const homeownerApiStartRoofingProjectInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  need: homeownerApiRoofingNeedSchema,
  timing: homeownerApiRoofingTimingSchema,
  notes: z.string().trim().max(1500).optional(),
}).strict()

/** A homeowner-authored record for work anywhere on the home. */
export const homeownerApiCreateProjectInputSchema =
  createHomeownerProjectInputSchema.omit({ requestedAt: true })

export const homeownerApiProjectViewSchema = z.object({
  projectRef: opaqueRef('hprj'),
  homeRef: opaqueRef('hhom'),
  title: z.string().trim().min(1).max(120),
  category: homeownerProjectSchema.shape.category,
  status: homeownerProjectSchema.shape.status,
  occurredOn: homeownerProjectSchema.shape.occurredOn.nullable(),
  summary: z.string().trim().max(2000),
  createdAt: homeownerUtcInstantSchema,
  updatedAt: homeownerUtcInstantSchema,
}).strict()

export type HomeownerApiStartRoofingProjectInput = z.infer<
  typeof homeownerApiStartRoofingProjectInputSchema
>
export type HomeownerApiCreateProjectInput = z.infer<
  typeof homeownerApiCreateProjectInputSchema
>
export type HomeownerApiProjectView = z.infer<typeof homeownerApiProjectViewSchema>

export const homeownerApiArtifactViewSchema = z.object({
  artifactRef: opaqueRef('hart'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj').nullable(),
  kind: homeownerArtifactMetadataSchema.shape.kind,
  displayName: homeownerArtifactMetadataSchema.shape.displayName,
  mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  byteLength: homeownerArtifactMetadataSchema.shape.byteLength,
  createdAt: homeownerUtcInstantSchema,
}).strict()

export type HomeownerApiArtifactView = z.infer<typeof homeownerApiArtifactViewSchema>

export const homeownerApiCreateCheckupPhotoInputSchema =
  createHomeownerCheckupPhotoInputSchema.omit({ requestedAt: true })

export const homeownerApiCheckupPhotoViewSchema = z.object({
  photoRef: opaqueRef('hpho'),
  homeRef: opaqueRef('hhom'),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area: homeownerCheckupPhotoMetadataSchema.shape.area,
  viewLabel: homeownerCheckupPhotoMetadataSchema.shape.viewLabel,
  caption: homeownerCheckupPhotoMetadataSchema.shape.caption,
  fullUrl: z.string().startsWith('/api/v1/homes/').max(256),
  thumbnailUrl: z.string().startsWith('/api/v1/homes/').max(256),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
  createdAt: homeownerUtcInstantSchema,
}).strict()

export type HomeownerApiCreateCheckupPhotoInput = z.infer<
  typeof homeownerApiCreateCheckupPhotoInputSchema
>
export type HomeownerApiCheckupPhotoView = z.infer<
  typeof homeownerApiCheckupPhotoViewSchema
>

const homeownerApiSanitizedCheckupPhotoSchema = z.object({
  fullBytes: z.instanceof(Uint8Array),
  fullPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  thumbnailBytes: z.instanceof(Uint8Array),
  thumbnailPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
}).strict().superRefine((photo, context) => {
  if (photo.fullBytes.byteLength < 1
    || photo.fullBytes.byteLength > HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES) {
    context.addIssue({ code: 'custom', path: ['fullBytes'], message: 'invalid full derivative size' })
  }
  if (photo.thumbnailBytes.byteLength < 1
    || photo.thumbnailBytes.byteLength > HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES) {
    context.addIssue({
      code: 'custom',
      path: ['thumbnailBytes'],
      message: 'invalid thumbnail derivative size',
    })
  }
})

export type HomeownerApiCheckupPhotoUploadReservation =
  | { readonly state: 'available'; readonly photo: HomeownerApiCheckupPhotoView }
  | {
      readonly state: 'reserved'
      readonly command: z.infer<typeof createHomeownerCheckupPhotoInputSchema>
      readonly reservation: HomeownerCheckupPhotoReservation
    }

export const homeownerApiCreateProjectQuoteInputSchema =
  createHomeownerProjectQuoteInputSchema.omit({ projectRef: true, requestedAt: true })

export const homeownerApiSaveProjectQuoteInputSchema =
  saveHomeownerProjectQuoteInputSchema.omit({
    projectRef: true,
    quoteRef: true,
    requestedAt: true,
  })

export const homeownerApiProjectQuoteViewSchema = z.object({
  quoteRef: opaqueRef('hquo'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  contractorLabel: z.string().trim().min(1).max(120),
  proposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  artifactRef: opaqueRef('hart').nullable(),
  scope: homeownerQuoteScopeSchema,
  notes: z.string().trim().max(500),
  source: z.literal('homeowner_entry'),
  revision: z.number().int().min(1),
  createdAt: homeownerUtcInstantSchema,
  updatedAt: homeownerUtcInstantSchema,
}).strict()

export type HomeownerApiCreateProjectQuoteInput = z.infer<
  typeof homeownerApiCreateProjectQuoteInputSchema
>
export type HomeownerApiProjectQuoteView = z.infer<typeof homeownerApiProjectQuoteViewSchema>

export const homeownerApiHomeViewSchema = homeownerApiHomeSummarySchema.extend({
  projectCount: z.number().int().min(0),
  documentCount: z.number().int().min(0),
  warrantyCount: z.number().int().min(0),
  maintenanceCount: z.number().int().min(0),
  updatedAt: homeownerUtcInstantSchema,
}).strict()

export type HomeownerApiHomeView = z.infer<typeof homeownerApiHomeViewSchema>

export type HomeownerApiProblemCode =
  | 'signed_out'
  | 'not_found'
  | 'forbidden'
  | 'invalid_request'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'

export class HomeownerApiError extends Error {
  readonly code: HomeownerApiProblemCode

  constructor(code: HomeownerApiProblemCode) {
    super(code)
    this.name = 'HomeownerApiError'
    this.code = code
  }
}

export interface HomeownerApiRequestContext {
  /** Opaque server-side session lookup handle; never projected to the browser. */
  readonly sessionHandle: string | null
}

export interface HomeownerApiServiceOptions {
  readonly identity: HomeownerIdentityPort
  readonly repository: HomeownerRepositoryPort
  readonly commands: HomeownerCommandPort
  readonly privateObjects?: HomeownerPrivateObjectPort
  readonly projectQuotes?: HomeownerProjectQuotePort
  readonly checkupPhotos?: HomeownerCheckupPhotoPort
  readonly now: () => string
  /**
   * These values must come from verified server configuration. A route must not
   * infer readiness from the presence of UI or from a browser request.
   */
  readonly capabilities: HomeownerApiCapabilities
}

function safeSummary(
  home: PrivateHomeProfile,
  membership: HomeownerMembership,
): HomeownerApiHomeSummary {
  return homeownerApiHomeSummarySchema.parse({
    homeRef: home.homeRef,
    displayLabel: home.displayLabel,
    privateLocationLabel: home.privateLocationLabel,
    relationshipLabel: membership.relationshipLabel,
  })
}

function safeProject(project: HomeownerProject): HomeownerApiProjectView {
  return homeownerApiProjectViewSchema.parse({
    projectRef: project.projectRef,
    homeRef: project.homeRef,
    title: project.title,
    category: project.category,
    status: project.status,
    occurredOn: project.occurredOn ?? null,
    summary: project.summary ?? '',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  })
}

function safeArtifact(input: unknown): HomeownerApiArtifactView {
  const artifact = homeownerArtifactMetadataSchema.parse(input)
  return homeownerApiArtifactViewSchema.parse({
    artifactRef: artifact.artifactRef,
    homeRef: artifact.homeRef,
    projectRef: artifact.projectRef ?? null,
    kind: artifact.kind,
    displayName: artifact.displayName,
    mediaType: artifact.mediaType,
    byteLength: artifact.byteLength,
    createdAt: artifact.createdAt,
  })
}

function safeCheckupPhoto(input: HomeownerCheckupPhotoMetadata): HomeownerApiCheckupPhotoView {
  const photo = homeownerCheckupPhotoMetadataSchema.parse(input)
  const base = `/api/v1/homes/${photo.homeRef}/photo-checkups/${photo.photoRef}`
  return homeownerApiCheckupPhotoViewSchema.parse({
    photoRef: photo.photoRef,
    homeRef: photo.homeRef,
    observedOn: photo.observedOn,
    area: photo.area,
    viewLabel: photo.viewLabel,
    caption: photo.caption,
    fullUrl: `${base}/full`,
    thumbnailUrl: `${base}/thumbnail`,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
  })
}

function safeProjectQuote(input: HomeownerProjectQuote): HomeownerApiProjectQuoteView {
  const quote = homeownerProjectQuoteSchema.parse(input)
  return homeownerApiProjectQuoteViewSchema.parse({
    quoteRef: quote.quoteRef,
    homeRef: quote.homeRef,
    projectRef: quote.projectRef,
    contractorLabel: quote.contractorLabel,
    proposalDate: quote.proposalDate ?? null,
    artifactRef: quote.artifactRef ?? null,
    scope: quote.scope,
    notes: quote.notes ?? '',
    source: quote.source,
    revision: quote.revision,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  })
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key =>
    `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

const ROOFING_NEED_TITLE: Readonly<Record<
  z.infer<typeof homeownerApiRoofingNeedSchema>,
  string
>> = Object.freeze({
  repair: 'Roof repair',
  replacement: 'Roof replacement',
  inspection: 'Roof inspection',
  storm_damage: 'Storm damage roof review',
  not_sure: 'Roofing help',
})

const ROOFING_TIMING_LABEL: Readonly<Record<
  z.infer<typeof homeownerApiRoofingTimingSchema>,
  string
>> = Object.freeze({
  urgent: 'As soon as possible',
  within_30_days: 'Within 30 days',
  researching: 'Researching options',
  not_sure: 'Not sure yet',
})

/**
 * Read-only Phase 2A application service. It intentionally exposes no write,
 * upload, invitation, sharing, provider, or object-storage operation.
 */
export class HomeownerApiService {
  readonly #identity: HomeownerIdentityPort
  readonly #repository: HomeownerRepositoryPort
  readonly #commands: HomeownerCommandPort
  readonly #privateObjects: HomeownerPrivateObjectPort | null
  readonly #projectQuotes: HomeownerProjectQuotePort | null
  readonly #checkupPhotos: HomeownerCheckupPhotoPort | null
  readonly #now: () => string
  readonly #capabilities: HomeownerApiCapabilities

  constructor(options: HomeownerApiServiceOptions) {
    this.#identity = options.identity
    this.#repository = options.repository
    this.#commands = options.commands
    this.#privateObjects = options.privateObjects ?? null
    this.#projectQuotes = options.projectQuotes ?? null
    this.#checkupPhotos = options.checkupPhotos ?? null
    this.#now = options.now
    this.#capabilities = homeownerApiCapabilitiesSchema.parse(options.capabilities)
  }

  async readSession(context: HomeownerApiRequestContext): Promise<HomeownerApiSession> {
    const principal = context.sessionHandle
      ? await this.#identity.resolvePrincipal(context.sessionHandle)
      : null
    if (!principal || principal.status !== 'active' || !principal.emailVerified) {
      return homeownerApiSessionSchema.parse({
        apiVersion: HOMEOWNER_API_VERSION,
        kind: 'signed_out',
        capabilities: this.#capabilities,
      })
    }
    return homeownerApiSessionSchema.parse({
      apiVersion: HOMEOWNER_API_VERSION,
      kind: 'signed_in',
      principalRef: principal.principalRef,
      capabilities: this.#capabilities,
    })
  }

  async listHomes(context: HomeownerApiRequestContext): Promise<readonly HomeownerApiHomeSummary[]> {
    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const principalGrant = authorizePrivateHomeCreation(principal)
    if (!principalGrant.authorized) throw new HomeownerApiError('signed_out')

    const memberships = await this.#repository.listMemberships(principalGrant)
    const homes: HomeownerApiHomeSummary[] = []
    for (const membership of memberships) {
      const decision = authorizeHomeownerWorkspace({
        principal,
        membership,
        requestedHomeRef: membership.homeRef,
        action: 'workspace.read',
        recheckedAt: this.#now(),
      })
      if (!decision.authorized) continue
      const home = await this.#repository.readHome(decision)
      if (!home) continue
      homes.push(safeSummary(home, membership))
    }
    return homes
  }

  async readHome(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<HomeownerApiHomeView> {
    const parsedHomeRef = opaqueRef('hhom').safeParse(requestedHomeRef)
    if (!parsedHomeRef.success) throw new HomeownerApiError('invalid_request')

    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const membership = await this.#repository.readMembership(
      principal.principalRef,
      parsedHomeRef.data,
    )
    if (!membership) throw new HomeownerApiError('not_found')

    const decision = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef: parsedHomeRef.data,
      action: 'workspace.read',
      recheckedAt: this.#now(),
    })
    if (!decision.authorized) throw new HomeownerApiError('not_found')

    const home = await this.#repository.readHome(decision)
    if (!home) throw new HomeownerApiError('not_found')
    const [projects, artifacts, warranties, maintenance] = await Promise.all([
      this.#repository.listProjects(decision),
      this.#repository.listArtifactMetadata(decision),
      this.#repository.listWarranties(decision),
      this.#repository.listMaintenance(decision),
    ])

    return homeownerApiHomeViewSchema.parse({
      ...safeSummary(home, membership),
      projectCount: projects.length,
      documentCount: artifacts.length,
      warrantyCount: warranties.length + artifacts.filter(item => item.kind === 'warranty').length,
      maintenanceCount: maintenance.length,
      updatedAt: home.updatedAt,
    })
  }

  async listProjects(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<readonly HomeownerApiProjectView[]> {
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    const projects = await this.#repository.listProjects(grant)
    return projects.map(project => safeProject(homeownerProjectSchema.parse(project)))
  }

  async readProject(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
  ): Promise<HomeownerApiProjectView> {
    const parsedProjectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    if (!parsedProjectRef.success) throw new HomeownerApiError('invalid_request')
    const projects = await this.listProjects(context, requestedHomeRef)
    const project = projects.find(candidate => candidate.projectRef === parsedProjectRef.data)
    if (!project) throw new HomeownerApiError('not_found')
    return project
  }

  async listProjectQuotes(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
  ): Promise<readonly HomeownerApiProjectQuoteView[]> {
    const parsedProjectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    if (!parsedProjectRef.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    if (!this.#capabilities.persistence
      || !this.#capabilities.projectQuotes
      || !this.#projectQuotes) {
      throw new HomeownerApiError('unavailable')
    }
    const projects = await this.#repository.listProjects(grant)
    const matchedProject = projects.find(project => project.projectRef === parsedProjectRef.data
      && project.homeRef === grant.homeRef
      && project.category === 'roofing')
    if (!matchedProject) {
      throw new HomeownerApiError('not_found')
    }
    const quotes = await this.#projectQuotes.listProjectQuotes(grant, parsedProjectRef.data)
    return quotes.map(input => {
      const quote = homeownerProjectQuoteSchema.parse(input)
      if (quote.homeRef !== grant.homeRef
        || quote.projectRef !== parsedProjectRef.data
        || quote.controllerPrincipalRef !== matchedProject.controllerPrincipalRef) {
        throw new HomeownerApiError('unavailable')
      }
      return safeProjectQuote(quote)
    })
  }

  async createProjectQuote(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    input: unknown,
  ): Promise<HomeownerApiProjectQuoteView> {
    const parsedProjectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    const parsedInput = homeownerApiCreateProjectQuoteInputSchema.safeParse(input)
    if (!parsedProjectRef.success || !parsedInput.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'quote.create')
    if (!this.#capabilities.persistence
      || !this.#capabilities.projectQuotes
      || !this.#projectQuotes) {
      throw new HomeownerApiError('unavailable')
    }
    const projects = await this.#repository.listProjects(grant)
    if (!projects.some(project => project.projectRef === parsedProjectRef.data
      && project.homeRef === grant.homeRef
      && project.category === 'roofing')) {
      throw new HomeownerApiError('not_found')
    }
    if (parsedInput.data.artifactRef) {
      const artifacts = await this.#repository.listArtifactMetadata(grant)
      if (!artifacts.some(artifact => artifact.artifactRef === parsedInput.data.artifactRef
        && artifact.homeRef === grant.homeRef
        && artifact.projectRef === parsedProjectRef.data
        && artifact.kind === 'document'
        && artifact.mediaType === 'application/pdf'
        && artifact.controllerPrincipalRef === grant.principalRef)) {
        throw new HomeownerApiError('not_found')
      }
    }
    const command = createHomeownerProjectQuoteInputSchema.parse({
      ...parsedInput.data,
      projectRef: parsedProjectRef.data,
      requestedAt: this.#now(),
    })
    const created = homeownerProjectQuoteSchema.parse(
      await this.#projectQuotes.createProjectQuote({ grant, command }),
    )
    const coherent = created.homeRef === grant.homeRef
      && created.projectRef === parsedProjectRef.data
      && created.controllerPrincipalRef === grant.principalRef
      && created.contractorLabel === command.contractorLabel
      && created.proposalDate === command.proposalDate
      && created.artifactRef === command.artifactRef
      && stableJson(created.scope) === stableJson(command.scope)
      && created.notes === command.notes
      && created.source === 'homeowner_entry'
      && created.revision === 1
    if (!coherent) throw new HomeownerApiError('unavailable')
    return safeProjectQuote(created)
  }

  async saveProjectQuote(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    requestedQuoteRef: string,
    input: unknown,
  ): Promise<HomeownerApiProjectQuoteView> {
    const parsedProjectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    const parsedQuoteRef = opaqueRef('hquo').safeParse(requestedQuoteRef)
    const parsedInput = homeownerApiSaveProjectQuoteInputSchema.safeParse(input)
    if (!parsedProjectRef.success || !parsedQuoteRef.success || !parsedInput.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'quote.save')
    if (!this.#capabilities.persistence
      || !this.#capabilities.projectQuotes
      || !this.#projectQuotes) {
      throw new HomeownerApiError('unavailable')
    }
    const projects = await this.#repository.listProjects(grant)
    if (!projects.some(project => project.projectRef === parsedProjectRef.data
      && project.homeRef === grant.homeRef
      && project.category === 'roofing')) {
      throw new HomeownerApiError('not_found')
    }
    if (parsedInput.data.artifactRef) {
      const artifacts = await this.#repository.listArtifactMetadata(grant)
      if (!artifacts.some(artifact => artifact.artifactRef === parsedInput.data.artifactRef
        && artifact.homeRef === grant.homeRef
        && artifact.projectRef === parsedProjectRef.data
        && artifact.kind === 'document'
        && artifact.mediaType === 'application/pdf'
        && artifact.controllerPrincipalRef === grant.principalRef)) {
        throw new HomeownerApiError('not_found')
      }
    }
    const command = saveHomeownerProjectQuoteInputSchema.parse({
      ...parsedInput.data,
      projectRef: parsedProjectRef.data,
      quoteRef: parsedQuoteRef.data,
      requestedAt: this.#now(),
    })
    const saved = homeownerProjectQuoteSchema.parse(
      await this.#projectQuotes.saveProjectQuote({ grant, command }),
    )
    const coherent = saved.quoteRef === command.quoteRef
      && saved.homeRef === grant.homeRef
      && saved.projectRef === command.projectRef
      && saved.controllerPrincipalRef === grant.principalRef
      && saved.contractorLabel === command.contractorLabel
      && saved.proposalDate === command.proposalDate
      && saved.artifactRef === command.artifactRef
      && stableJson(saved.scope) === stableJson(command.scope)
      && saved.notes === command.notes
      && saved.source === 'homeowner_entry'
      && saved.revision === command.expectedRevision + 1
    if (!coherent) throw new HomeownerApiError('unavailable')
    return safeProjectQuote(saved)
  }

  async listArtifacts(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<readonly HomeownerApiArtifactView[]> {
    const grant = await this.#workspaceGrant(
      context,
      requestedHomeRef,
      'artifact.read_metadata',
    )
    if (!this.#capabilities.uploads) throw new HomeownerApiError('unavailable')
    const artifacts = await this.#repository.listArtifactMetadata(grant)
    return artifacts.map(safeArtifact)
  }

  /**
   * Cheap authorization gate for the raw-image adapter. It must run before the
   * request body is buffered; reserveCheckupPhotoUpload rechecks the same grant.
   */
  async preauthorizeCheckupPhotoUpload(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<void> {
    await this.#workspaceGrant(context, requestedHomeRef, 'workspace.update')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
  }

  async preauthorizeCheckupPhotoRead(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<void> {
    await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
  }

  async listCheckupPhotos(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
  ): Promise<readonly HomeownerApiCheckupPhotoView[]> {
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
    const photos = await this.#checkupPhotos.listCheckupPhotos(grant)
    if (photos.length > HOMEOWNER_CHECKUP_PHOTO_MAX_PER_HOME) {
      throw new HomeownerApiError('unavailable')
    }
    return photos.map(input => {
      const photo = homeownerCheckupPhotoMetadataSchema.parse(input)
      if (photo.homeRef !== grant.homeRef) throw new HomeownerApiError('unavailable')
      return safeCheckupPhoto(photo)
    })
  }

  async reserveCheckupPhotoUpload(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    input: unknown,
  ): Promise<HomeownerApiCheckupPhotoUploadReservation> {
    const parsed = homeownerApiCreateCheckupPhotoInputSchema.safeParse(input)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const requestedAt = this.#now()
    if (parsed.data.observedOn > requestedAt.slice(0, 10)) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.update')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
    const command = createHomeownerCheckupPhotoInputSchema.parse({
      ...parsed.data,
      requestedAt,
    })
    const result = await this.#checkupPhotos.reserveCheckupPhotoUpload({ grant, command })
    if (result.state === 'available') {
      const photo = homeownerCheckupPhotoMetadataSchema.parse(result.photo)
      if (photo.homeRef !== grant.homeRef
        || photo.controllerPrincipalRef !== grant.principalRef
        || photo.observedOn !== command.observedOn
        || photo.area !== command.area
        || photo.viewLabel !== command.viewLabel
        || photo.caption !== command.caption) {
        throw new HomeownerApiError('unavailable')
      }
      return { state: 'available', photo: safeCheckupPhoto(photo) }
    }
    const reservation = homeownerCheckupPhotoReservationSchema.parse(result.reservation)
    if (reservation.homeRef !== grant.homeRef
      || reservation.controllerPrincipalRef !== grant.principalRef
      || reservation.commandRef !== command.commandRef) {
      throw new HomeownerApiError('unavailable')
    }
    return { state: 'reserved', command, reservation }
  }

  async completeCheckupPhotoUpload(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    commandInput: unknown,
    reservationInput: unknown,
    photoInput: SanitizedHomeownerCheckupPhoto,
  ): Promise<HomeownerApiCheckupPhotoView> {
    const command = createHomeownerCheckupPhotoInputSchema.safeParse(commandInput)
    const reservation = homeownerCheckupPhotoReservationSchema.safeParse(reservationInput)
    const photo = homeownerApiSanitizedCheckupPhotoSchema.safeParse(photoInput)
    if (!command.success || !reservation.success || !photo.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.update')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
    if (reservation.data.homeRef !== grant.homeRef
      || reservation.data.controllerPrincipalRef !== grant.principalRef
      || reservation.data.commandRef !== command.data.commandRef) {
      throw new HomeownerApiError('not_found')
    }
    const stored = homeownerCheckupPhotoMetadataSchema.parse(
      await this.#checkupPhotos.completeCheckupPhotoUpload({
        grant,
        command: command.data,
        reservation: reservation.data,
        photo: photo.data,
      }),
    )
    if (stored.photoRef !== reservation.data.photoRef
      || stored.homeRef !== grant.homeRef
      || stored.controllerPrincipalRef !== grant.principalRef
      || stored.observedOn !== command.data.observedOn
      || stored.area !== command.data.area
      || stored.viewLabel !== command.data.viewLabel
      || stored.caption !== command.data.caption
      || stored.fullStorageObjectRef !== reservation.data.fullStorageObjectRef
      || stored.thumbnailStorageObjectRef !== reservation.data.thumbnailStorageObjectRef
      || stored.fullByteLength !== photo.data.fullBytes.byteLength
      || stored.thumbnailByteLength !== photo.data.thumbnailBytes.byteLength
      || stored.fullPayloadSha256 !== photo.data.fullPayloadSha256
      || stored.thumbnailPayloadSha256 !== photo.data.thumbnailPayloadSha256
      || stored.width !== photo.data.width
      || stored.height !== photo.data.height) {
      throw new HomeownerApiError('unavailable')
    }
    return safeCheckupPhoto(stored)
  }

  async rejectCheckupPhotoUpload(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    reservationInput: unknown,
  ): Promise<void> {
    const reservation = homeownerCheckupPhotoReservationSchema.safeParse(reservationInput)
    if (!reservation.success) return
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.update')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) return
    if (reservation.data.homeRef !== grant.homeRef
      || reservation.data.controllerPrincipalRef !== grant.principalRef) return
    await this.#checkupPhotos.rejectCheckupPhotoUpload({
      grant,
      reservation: reservation.data,
      rejectedAt: this.#now(),
    })
  }

  async readCheckupPhotoContent(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedPhotoRef: string,
    variant: HomeownerCheckupPhotoVariant,
  ): Promise<{ readonly photo: HomeownerApiCheckupPhotoView; readonly bytes: Uint8Array }> {
    const photoRef = opaqueRef('hpho').safeParse(requestedPhotoRef)
    if (!photoRef.success || !['full', 'thumbnail'].includes(variant)) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
    const result = await this.#checkupPhotos.readCheckupPhotoVariant({
      grant,
      photoRef: photoRef.data,
      variant,
    })
    const metadata = homeownerCheckupPhotoMetadataSchema.parse(result.photo)
    const maximum = variant === 'full'
      ? HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES
      : HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES
    const expected = variant === 'full'
      ? metadata.fullByteLength
      : metadata.thumbnailByteLength
    if (metadata.homeRef !== grant.homeRef
      || result.bytes.byteLength !== expected
      || result.bytes.byteLength > maximum) {
      throw new HomeownerApiError('unavailable')
    }
    const finalGrant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.read')
    if (finalGrant.principalRef !== grant.principalRef
      || finalGrant.homeRef !== grant.homeRef
      || finalGrant.membershipRef !== grant.membershipRef
      || finalGrant.membershipRevision !== grant.membershipRevision) {
      throw new HomeownerApiError('not_found')
    }
    return { photo: safeCheckupPhoto(metadata), bytes: result.bytes }
  }

  async deleteCheckupPhoto(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedPhotoRef: string,
  ): Promise<{ readonly photoRef: string; readonly state: 'deleted' }> {
    const photoRef = opaqueRef('hpho').safeParse(requestedPhotoRef)
    if (!photoRef.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'workspace.update')
    if (!this.#capabilities.photoCheckups || !this.#checkupPhotos) {
      throw new HomeownerApiError('unavailable')
    }
    const result = await this.#checkupPhotos.deleteCheckupPhoto({
      grant,
      photoRef: photoRef.data,
      deletedAt: this.#now(),
    })
    if (result.photoRef !== photoRef.data || result.state !== 'deleted') {
      throw new HomeownerApiError('unavailable')
    }
    return result
  }

  async uploadArtifact(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    input: unknown,
    bytes: Uint8Array,
  ): Promise<HomeownerApiArtifactView> {
    const parsed = homeownerArtifactUploadInputSchema.safeParse(input)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    let payload
    try {
      payload = validateHomeownerArtifactPayload({
        kind: parsed.data.kind,
        displayName: parsed.data.displayName,
        bytes,
      })
    } catch {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'artifact.upload')
    if (!this.#capabilities.uploads || !this.#privateObjects) {
      throw new HomeownerApiError('unavailable')
    }
    if (parsed.data.projectRef) {
      const projects = await this.#repository.listProjects(grant)
      if (!projects.some(project => project.projectRef === parsed.data.projectRef
        && project.homeRef === grant.homeRef)) {
        throw new HomeownerApiError('not_found')
      }
    }
    const command = storeHomeownerArtifactInputSchema.parse({
      ...parsed.data,
      displayName: payload.displayName,
      mediaType: payload.mediaType,
      byteLength: payload.byteLength,
      payloadSha256: payload.payloadSha256,
      requestedAt: this.#now(),
    })
    const stored = homeownerArtifactMetadataSchema.parse(await this.#privateObjects.storeArtifact({
      grant,
      command,
      bytes: payload.bytes,
    }))
    const coherent = stored.homeRef === grant.homeRef
      && stored.controllerPrincipalRef === grant.principalRef
      && stored.projectRef === command.projectRef
      && stored.kind === command.kind
      && stored.displayName === command.displayName
      && stored.mediaType === command.mediaType
      && stored.byteLength === command.byteLength
      && stored.payloadSha256 === command.payloadSha256
      && stored.contentClass === 'homeowner_private'
    if (!coherent) throw new HomeownerApiError('unavailable')
    return safeArtifact(stored)
  }

  async readArtifactContent(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedArtifactRef: string,
  ): Promise<{ readonly artifact: HomeownerApiArtifactView; readonly bytes: Uint8Array }> {
    const parsedArtifactRef = opaqueRef('hart').safeParse(requestedArtifactRef)
    if (!parsedArtifactRef.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#workspaceGrant(
      context,
      requestedHomeRef,
      'artifact.read_metadata',
    )
    if (!this.#capabilities.uploads || !this.#privateObjects) {
      throw new HomeownerApiError('unavailable')
    }
    const artifacts = await this.#repository.listArtifactMetadata(grant)
    const artifact = artifacts.find(candidate => candidate.artifactRef === parsedArtifactRef.data)
    if (!artifact || artifact.homeRef !== grant.homeRef) throw new HomeownerApiError('not_found')
    const bytes = await this.#privateObjects.readExactObject({
      grant,
      storageObjectRef: artifact.storageObjectRef,
      expectedSha256: artifact.payloadSha256,
      maximumBytes: artifact.byteLength,
    })
    if (bytes.byteLength !== artifact.byteLength) throw new HomeownerApiError('unavailable')
    const finalGrant = await this.#workspaceGrant(
      context,
      requestedHomeRef,
      'artifact.read_metadata',
    )
    if (finalGrant.principalRef !== grant.principalRef
      || finalGrant.homeRef !== grant.homeRef
      || finalGrant.membershipRef !== grant.membershipRef
      || finalGrant.membershipRevision !== grant.membershipRevision) {
      throw new HomeownerApiError('not_found')
    }
    return { artifact: safeArtifact(artifact), bytes }
  }

  async startRoofingProject(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    input: unknown,
  ): Promise<HomeownerApiProjectView> {
    const parsedInput = homeownerApiStartRoofingProjectInputSchema.safeParse(input)
    if (!parsedInput.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'project.create')
    if (!this.#capabilities.persistence) throw new HomeownerApiError('unavailable')

    const title = ROOFING_NEED_TITLE[parsedInput.data.need]
    const timing = ROOFING_TIMING_LABEL[parsedInput.data.timing]
    const summary = parsedInput.data.notes
      ? `Timing: ${timing}\n\n${parsedInput.data.notes}`
      : `Timing: ${timing}`
    const command = createHomeownerProjectInputSchema.parse({
      commandRef: parsedInput.data.commandRef,
      title,
      category: 'roofing',
      status: 'planned',
      summary,
      requestedAt: this.#now(),
    })
    const created = homeownerProjectSchema.parse(await this.#commands.createProject({ grant, command }))
    const coherent = created.homeRef === grant.homeRef
      && created.controllerPrincipalRef === grant.principalRef
      && created.title === title
      && created.category === 'roofing'
      && created.status === 'planned'
      && created.summary === summary
      && created.occurredOn === undefined
    if (!coherent) throw new HomeownerApiError('unavailable')
    return safeProject(created)
  }

  async createProject(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    input: unknown,
  ): Promise<HomeownerApiProjectView> {
    const parsedInput = homeownerApiCreateProjectInputSchema.safeParse(input)
    if (!parsedInput.success) throw new HomeownerApiError('invalid_request')
    const requestedAt = this.#now()
    if (parsedInput.data.occurredOn && parsedInput.data.occurredOn > requestedAt.slice(0, 10)) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#workspaceGrant(context, requestedHomeRef, 'project.create')
    if (!this.#capabilities.persistence) throw new HomeownerApiError('unavailable')

    const { summary, ...stableInput } = parsedInput.data
    const command = createHomeownerProjectInputSchema.parse({
      ...stableInput,
      ...(summary ? { summary } : {}),
      requestedAt,
    })
    const created = homeownerProjectSchema.parse(
      await this.#commands.createProject({ grant, command }),
    )
    const coherent = created.homeRef === grant.homeRef
      && created.controllerPrincipalRef === grant.principalRef
      && created.title === command.title
      && created.category === command.category
      && created.status === command.status
      && created.occurredOn === command.occurredOn
      && created.summary === command.summary
    if (!coherent) throw new HomeownerApiError('unavailable')
    return safeProject(created)
  }

  async createHome(
    context: HomeownerApiRequestContext,
    input: unknown,
  ): Promise<HomeownerApiHomeSummary> {
    const parsedInput = homeownerApiCreateHomeInputSchema.safeParse(input)
    if (!parsedInput.success) throw new HomeownerApiError('invalid_request')

    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const authorization = authorizePrivateHomeCreation(principal)
    if (!authorization.authorized) throw new HomeownerApiError('signed_out')
    if (!this.#capabilities.persistence) throw new HomeownerApiError('unavailable')

    const command = createHomeWorkspaceInputSchema.parse({
      ...parsedInput.data,
      requestedAt: this.#now(),
    })
    const created = await this.#commands.createPrivateHomeWorkspace({ authorization, command })
    const home = privateHomeProfileSchema.parse(created.home)
    const membership = parseHomeownerMembership(created.membership)

    const coherent = home.createdByPrincipalRef === authorization.principalRef
      && membership.principalRef === authorization.principalRef
      && membership.homeRef === home.homeRef
      && membership.role === 'workspace_controller'
      && membership.basis === 'self_created_workspace'
      && membership.state === 'active'
      && membership.relationshipLabel === 'claimed_unverified'
    if (!coherent) throw new HomeownerApiError('unavailable')

    return safeSummary(home, membership)
  }

  async recordInitialIntake(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    input: unknown,
  ): Promise<HomeownerApiIntakeView> {
    const parsedHomeRef = opaqueRef('hhom').safeParse(requestedHomeRef)
    const parsedInput = homeownerApiRecordIntakeInputSchema.safeParse(input)
    if (!parsedHomeRef.success || !parsedInput.success) {
      throw new HomeownerApiError('invalid_request')
    }

    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const membership = await this.#repository.readMembership(
      principal.principalRef,
      parsedHomeRef.data,
    )
    if (!membership) throw new HomeownerApiError('not_found')

    const decision = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef: parsedHomeRef.data,
      action: 'intake.record',
      recheckedAt: this.#now(),
    })
    if (!decision.authorized) {
      if (decision.reason === 'role_denied') throw new HomeownerApiError('forbidden')
      throw new HomeownerApiError('not_found')
    }
    const grant = requireHomeownerActionGrant(decision, 'intake.record')
    if (!grant) throw new HomeownerApiError('forbidden')
    if (!this.#capabilities.persistence) throw new HomeownerApiError('unavailable')

    const commandResult = recordHomeownerIntakeInputSchema.safeParse({
      ...parsedInput.data,
      requestedAt: this.#now(),
    })
    if (!commandResult.success) throw new HomeownerApiError('invalid_request')
    const command = commandResult.data
    const recorded = await this.#commands.recordInitialIntake({ grant, command })
    const propertyFacts = parseHomeownerPropertyFacts(recorded.propertyFacts)
    const systems = recorded.systems.map(parseHomeownerSystem)
    const coherent = propertyFacts.homeRef === grant.homeRef
      && propertyFacts.controllerPrincipalRef === grant.principalRef
      && propertyFacts.source === 'homeowner_recollection'
      && systems.length === HOMEOWNER_SYSTEM_KINDS.length
      && systems.every(system => system.homeRef === grant.homeRef
        && system.controllerPrincipalRef === grant.principalRef
        && system.source === 'homeowner_recollection')
    if (!coherent) throw new HomeownerApiError('unavailable')

    return homeownerApiIntakeViewSchema.parse({
      homeRef: grant.homeRef,
      homeType: propertyFacts.homeType,
      yearBuilt: propertyFacts.yearBuilt,
      source: propertyFacts.source,
      systems: systems.map(system => ({
        kind: system.kind,
        present: system.present,
        installedOrReplacedYear: system.installedOrReplacedYear,
      })),
      updatedAt: [propertyFacts.updatedAt, ...systems.map(system => system.updatedAt)].sort().at(-1),
    })
  }

  async #workspaceGrant<Action extends HomeownerWorkspaceAction>(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    action: Action,
  ) {
    const parsedHomeRef = opaqueRef('hhom').safeParse(requestedHomeRef)
    if (!parsedHomeRef.success) throw new HomeownerApiError('invalid_request')
    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const membership = await this.#repository.readMembership(
      principal.principalRef,
      parsedHomeRef.data,
    )
    if (!membership) throw new HomeownerApiError('not_found')
    const decision = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef: parsedHomeRef.data,
      action,
      recheckedAt: this.#now(),
    })
    if (!decision.authorized) {
      if (decision.reason === 'role_denied') throw new HomeownerApiError('forbidden')
      throw new HomeownerApiError('not_found')
    }
    const grant = requireHomeownerActionGrant(decision, action)
    if (!grant) throw new HomeownerApiError('forbidden')
    return grant
  }
}

export const HOMEOWNER_API_WARNING =
  'Home creation, exact-home intake, roofing projects, private quote records, and private artifact storage remain fail-closed until their server adapters are configured. Invitations, sharing, and Jobrolo delivery remain unavailable until separately configured and verified.'
