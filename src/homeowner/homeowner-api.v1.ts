import { z } from 'zod'
import {
  authorizeHomeownerWorkspace,
  authorizePrivateHomeCreation,
  type HomeownerIdentityPort,
  type HomeownerMembership,
  type HomeownerRepositoryPort,
  type PrivateHomeProfile,
} from './homeowner-runtime.v1.ts'

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

export const homeownerApiHomeViewSchema = homeownerApiHomeSummarySchema.extend({
  projectCount: z.number().int().min(0),
  documentCount: z.number().int().min(0),
  warrantyCount: z.number().int().min(0),
  maintenanceCount: z.number().int().min(0),
  updatedAt: z.string().datetime({ offset: false }),
}).strict()

export type HomeownerApiHomeView = z.infer<typeof homeownerApiHomeViewSchema>

export type HomeownerApiProblemCode =
  | 'signed_out'
  | 'not_found'
  | 'forbidden'
  | 'invalid_request'
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

/**
 * Read-only Phase 2A application service. It intentionally exposes no write,
 * upload, invitation, sharing, provider, or object-storage operation.
 */
export class HomeownerApiService {
  readonly #identity: HomeownerIdentityPort
  readonly #repository: HomeownerRepositoryPort
  readonly #now: () => string
  readonly #capabilities: HomeownerApiCapabilities

  constructor(options: HomeownerApiServiceOptions) {
    this.#identity = options.identity
    this.#repository = options.repository
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
      documentCount: artifacts.filter(item => item.kind === 'document').length,
      warrantyCount: warranties.length,
      maintenanceCount: maintenance.length,
      updatedAt: home.updatedAt,
    })
  }
}

export const HOMEOWNER_API_WARNING =
  'Phase 2A is a read-only server boundary. Email delivery, persistence, uploads, invitations, and sharing remain unavailable until separately configured and verified.'
