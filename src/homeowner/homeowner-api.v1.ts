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
  uploads: z.boolean(),
  projectReview: z.boolean(),
  projectReviewAttachments: z.boolean(),
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
  readonly #now: () => string
  readonly #capabilities: HomeownerApiCapabilities

  constructor(options: HomeownerApiServiceOptions) {
    this.#identity = options.identity
    this.#repository = options.repository
    this.#commands = options.commands
    this.#privateObjects = options.privateObjects ?? null
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
  'Home creation, exact-home intake, roofing projects, and private artifact storage remain fail-closed until their server adapters are configured. Invitations, sharing, and Jobrolo delivery remain unavailable until separately configured and verified.'
