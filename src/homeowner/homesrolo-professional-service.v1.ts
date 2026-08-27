import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  HomeownerApiError,
  type HomeownerApiRequestContext,
} from './homeowner-api.v1.ts'
import {
  authorizeHomeownerWorkspace,
  type HomeownerIdentityPort,
  type HomeownerRepositoryPort,
  type HomeownerWorkspaceAction,
} from './homeowner-runtime.v1.ts'
import {
  createProfessionalOrganizationInputSchema,
  createProjectInvitationInputSchema,
  decideProfessionalProposalInputSchema,
  professionalCommandIntent,
  professionalMembershipSchema,
  professionalOrganizationSchema,
  professionalProposalSchema,
  professionalTradeSchema,
  projectInvitationDisclosureSchema,
  projectInvitationSchema,
  respondToProjectInvitationInputSchema,
  revokeProjectInvitationInputSchema,
  saveProfessionalProfileInputSchema,
  reviseProfessionalProposalInputSchema,
  submitProfessionalProposalInputSchema,
  type HomesroloProfessionalPort,
  type ProfessionalMembership,
  type ProfessionalOrganization,
  type ProfessionalProposal,
  type ProfessionalInvitationArtifact,
  type ProjectInvitation,
} from './homesrolo-professional.v1.ts'

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

const organizationSlugSchema = z.string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(3)
  .max(80)
  .refine(slug => !new Set([
    'api', 'home', 'homes', 'new', 'pro', 'pros', 'signin', 'settings',
  ]).has(slug), 'reserved slug')

const publicDirectoryQuerySchema = z.object({
  trade: professionalTradeSchema.optional(),
  serviceArea: z.string().trim().min(2).max(80).optional(),
}).strict()

export const professionalApiCreateOrganizationInputSchema =
  createProfessionalOrganizationInputSchema.extend({ slug: organizationSlugSchema }).strict()
export const professionalApiSaveProfileInputSchema = saveProfessionalProfileInputSchema
export const professionalApiCreateInvitationInputSchema =
  createProjectInvitationInputSchema.omit({ projectRef: true, requestedAt: true })
export const professionalApiRespondInvitationInputSchema =
  respondToProjectInvitationInputSchema.omit({ invitationRef: true, requestedAt: true })
export const professionalApiRevokeInvitationInputSchema =
  revokeProjectInvitationInputSchema.omit({ invitationRef: true, requestedAt: true })
export const professionalApiSubmitProposalInputSchema =
  submitProfessionalProposalInputSchema.omit({ invitationRef: true, requestedAt: true })
export const professionalApiReviseProposalInputSchema =
  reviseProfessionalProposalInputSchema.omit({
    invitationRef: true,
    quoteRef: true,
    requestedAt: true,
  })
export const professionalApiDecideProposalInputSchema =
  decideProfessionalProposalInputSchema.omit({ quoteRef: true, requestedAt: true })

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key =>
    `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

const TRADE_LABELS: Readonly<Record<z.infer<typeof professionalTradeSchema>, string>> = {
  roofing: 'Roofing',
  exterior: 'Exterior',
  interior: 'Interior remodeling',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  landscaping: 'Yard & landscaping',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Home service',
}

export interface HomesroloProfessionalServiceOptions {
  readonly enabled: boolean
  readonly identity: HomeownerIdentityPort
  readonly homeownerRepository: HomeownerRepositoryPort
  readonly professionals: HomesroloProfessionalPort
  readonly now: () => string
}

/**
 * One service powers both roles without merging them. Homeowner writes derive
 * a fresh controller grant. Professional writes derive a fresh organization
 * membership in the persistence transaction. Neither trusts a browser role.
 */
export class HomesroloProfessionalService {
  readonly #enabled: boolean
  readonly #identity: HomeownerIdentityPort
  readonly #homeownerRepository: HomeownerRepositoryPort
  readonly #professionals: HomesroloProfessionalPort
  readonly #now: () => string

  constructor(options: HomesroloProfessionalServiceOptions) {
    this.#enabled = options.enabled
    this.#identity = options.identity
    this.#homeownerRepository = options.homeownerRepository
    this.#professionals = options.professionals
    this.#now = options.now
  }

  async #principal(context: HomeownerApiRequestContext) {
    if (!this.#enabled) throw new HomeownerApiError('unavailable')
    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal || principal.status !== 'active' || !principal.emailVerified) {
      throw new HomeownerApiError('signed_out')
    }
    return principal
  }

  async #homeGrant(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    action: HomeownerWorkspaceAction,
  ) {
    const parsedHomeRef = opaqueRef('hhom').safeParse(requestedHomeRef)
    if (!parsedHomeRef.success) throw new HomeownerApiError('invalid_request')
    const principal = await this.#principal(context)
    const membership = await this.#homeownerRepository.readMembership(
      principal.principalRef,
      parsedHomeRef.data,
    )
    if (!membership) throw new HomeownerApiError('not_found')
    const grant = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef: parsedHomeRef.data,
      action,
      recheckedAt: this.#now(),
    })
    if (!grant.authorized) throw new HomeownerApiError('not_found')
    return grant
  }

  async listPublishedOrganizations(input: unknown = {}): Promise<readonly ProfessionalOrganization[]> {
    if (!this.#enabled) throw new HomeownerApiError('unavailable')
    const parsed = publicDirectoryQuerySchema.safeParse(input)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const rows = await this.#professionals.listPublishedOrganizations(parsed.data)
    return rows.map(row => professionalOrganizationSchema.parse(row))
  }

  async readPublishedOrganization(slug: string): Promise<ProfessionalOrganization> {
    if (!this.#enabled) throw new HomeownerApiError('unavailable')
    const parsed = organizationSlugSchema.safeParse(slug)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const row = await this.#professionals.readPublishedOrganization(parsed.data)
    if (!row) throw new HomeownerApiError('not_found')
    return professionalOrganizationSchema.parse(row)
  }

  async listMyOrganizations(
    context: HomeownerApiRequestContext,
  ): Promise<readonly ProfessionalOrganization[]> {
    const principal = await this.#principal(context)
    const rows = await this.#professionals.listOrganizationsForPrincipal(principal.principalRef)
    return rows.map(row => professionalOrganizationSchema.parse(row))
  }

  async listMyMemberships(
    context: HomeownerApiRequestContext,
  ): Promise<readonly ProfessionalMembership[]> {
    const principal = await this.#principal(context)
    const rows = await this.#professionals.listProfessionalMemberships(principal.principalRef)
    return rows.map(row => professionalMembershipSchema.parse(row))
  }

  async createOrganization(
    context: HomeownerApiRequestContext,
    input: unknown,
  ): Promise<{ readonly organization: ProfessionalOrganization; readonly membership: ProfessionalMembership }> {
    const principal = await this.#principal(context)
    const parsed = professionalApiCreateOrganizationInputSchema.safeParse(input)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const command = { ...parsed.data, requestedAt: this.#now() }
    const result = await this.#professionals.createOrganization({
      principalRef: principal.principalRef,
      command,
    })
    const organization = professionalOrganizationSchema.parse(result.organization)
    const membership = professionalMembershipSchema.parse(result.membership)
    if (membership.principalRef !== principal.principalRef
      || membership.organizationRef !== organization.organizationRef
      || membership.role !== 'owner'
      || organization.displayName !== command.displayName
      || organization.slug !== command.slug) {
      throw new HomeownerApiError('unavailable')
    }
    return { organization, membership }
  }

  async saveProfile(
    context: HomeownerApiRequestContext,
    input: unknown,
  ): Promise<ProfessionalOrganization> {
    const principal = await this.#principal(context)
    const parsed = professionalApiSaveProfileInputSchema.safeParse(input)
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const command = { ...parsed.data, requestedAt: this.#now() }
    const saved = professionalOrganizationSchema.parse(
      await this.#professionals.saveProfile({
        principalRef: principal.principalRef,
        command,
      }),
    )
    if (saved.organizationRef !== command.organizationRef
      || saved.revision !== command.expectedRevision + 1
      || saved.displayName !== command.displayName
      || saved.publicationState !== command.publicationState) {
      throw new HomeownerApiError('unavailable')
    }
    return saved
  }

  async createInvitation(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    input: unknown,
  ): Promise<ProjectInvitation> {
    const projectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    const parsed = professionalApiCreateInvitationInputSchema.safeParse(input)
    if (!projectRef.success || !parsed.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#homeGrant(context, requestedHomeRef, 'professional.invite')
    const projects = await this.#homeownerRepository.listProjects(grant)
    const project = projects.find(candidate => candidate.homeRef === grant.homeRef
      && candidate.projectRef === projectRef.data)
    if (!project) throw new HomeownerApiError('not_found')

    const artifacts = await this.#homeownerRepository.listArtifactMetadata(grant)
    const selected = parsed.data.selectedArtifactRefs
    if (selected.some(artifactRef => !artifacts.some(artifact =>
      artifact.artifactRef === artifactRef
      && artifact.homeRef === grant.homeRef
      && artifact.projectRef === project.projectRef))) {
      throw new HomeownerApiError('not_found')
    }
    const disclosure = projectInvitationDisclosureSchema.parse({
      title: project.title,
      workKind: project.workKind,
      category: project.category,
      trade: TRADE_LABELS[project.category],
      status: project.status,
      summary: project.summary ?? '',
      selectedArtifactRefs: selected,
    })
    const requestedAt = this.#now()
    const command = createProjectInvitationInputSchema.parse({
      ...parsed.data,
      projectRef: project.projectRef,
      requestedAt,
    })
    const created = projectInvitationSchema.parse(
      await this.#professionals.createInvitation({
        grant: { ...grant, action: 'professional.invite' },
        command,
        disclosure,
        disclosureDigest: digest(disclosure),
      }),
    )
    if (created.homeRef !== grant.homeRef
      || created.projectRef !== project.projectRef
      || created.professionalOrganizationRef !== command.professionalOrganizationRef
      || created.invitedByPrincipalRef !== grant.principalRef
      || created.disclosureDigest !== digest(disclosure)
      || stableJson(created.disclosure) !== stableJson(disclosure)) {
      throw new HomeownerApiError('unavailable')
    }
    return created
  }

  async listHomeownerInvitations(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
  ): Promise<readonly ProjectInvitation[]> {
    const projectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    if (!projectRef.success) throw new HomeownerApiError('invalid_request')
    const grant = await this.#homeGrant(context, requestedHomeRef, 'workspace.read')
    const rows = await this.#professionals.listHomeownerInvitations({
      grant: { ...grant, action: 'workspace.read' },
      projectRef: projectRef.data,
    })
    return rows.map(row => {
      const invitation = projectInvitationSchema.parse(row)
      if (invitation.homeRef !== grant.homeRef || invitation.projectRef !== projectRef.data) {
        throw new HomeownerApiError('unavailable')
      }
      return invitation
    })
  }

  async listMyInvitations(
    context: HomeownerApiRequestContext,
  ): Promise<readonly ProjectInvitation[]> {
    const principal = await this.#principal(context)
    const rows = await this.#professionals.listProfessionalInvitations(principal.principalRef)
    return rows.map(row => projectInvitationSchema.parse(row))
  }

  async readMyProposal(
    context: HomeownerApiRequestContext,
    requestedInvitationRef: string,
  ): Promise<ProfessionalProposal | null> {
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    if (!invitationRef.success) throw new HomeownerApiError('invalid_request')
    const principal = await this.#principal(context)
    const row = await this.#professionals.readProposalForInvitation({
      principalRef: principal.principalRef,
      invitationRef: invitationRef.data,
    })
    if (!row) return null
    const proposal = professionalProposalSchema.parse(row)
    if (proposal.invitationRef !== invitationRef.data) {
      throw new HomeownerApiError('unavailable')
    }
    return proposal
  }

  async readMyInvitationArtifact(
    context: HomeownerApiRequestContext,
    requestedInvitationRef: string,
    requestedArtifactRef: string,
  ): Promise<ProfessionalInvitationArtifact> {
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    const artifactRef = opaqueRef('hart').safeParse(requestedArtifactRef)
    if (!invitationRef.success || !artifactRef.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const principal = await this.#principal(context)
    const artifact = await this.#professionals.readInvitationArtifact({
      principalRef: principal.principalRef,
      invitationRef: invitationRef.data,
      artifactRef: artifactRef.data,
    })
    if (artifact.artifactRef !== artifactRef.data
      || artifact.byteLength !== artifact.bytes.byteLength
      || !['application/pdf', 'image/jpeg', 'image/png'].includes(artifact.mediaType)) {
      throw new HomeownerApiError('unavailable')
    }
    return artifact
  }

  async respondToInvitation(
    context: HomeownerApiRequestContext,
    requestedInvitationRef: string,
    input: unknown,
  ): Promise<ProjectInvitation> {
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    const parsed = professionalApiRespondInvitationInputSchema.safeParse(input)
    if (!invitationRef.success || !parsed.success) throw new HomeownerApiError('invalid_request')
    const principal = await this.#principal(context)
    const command = respondToProjectInvitationInputSchema.parse({
      ...parsed.data,
      invitationRef: invitationRef.data,
      requestedAt: this.#now(),
    })
    const result = projectInvitationSchema.parse(
      await this.#professionals.respondToInvitation({
        principalRef: principal.principalRef,
        command,
      }),
    )
    if (result.invitationRef !== command.invitationRef
      || result.status !== command.response
      || result.revision !== command.expectedRevision + 1) {
      throw new HomeownerApiError('unavailable')
    }
    return result
  }

  async revokeInvitation(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    requestedInvitationRef: string,
    input: unknown,
  ): Promise<ProjectInvitation> {
    const projectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    const parsed = professionalApiRevokeInvitationInputSchema.safeParse(input)
    if (!projectRef.success || !invitationRef.success || !parsed.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#homeGrant(
      context,
      requestedHomeRef,
      'professional.invitation.revoke',
    )
    const command = revokeProjectInvitationInputSchema.parse({
      ...parsed.data,
      invitationRef: invitationRef.data,
      requestedAt: this.#now(),
    })
    const result = projectInvitationSchema.parse(
      await this.#professionals.revokeInvitation({
        grant: { ...grant, action: 'professional.invitation.revoke' },
        projectRef: projectRef.data,
        command,
      }),
    )
    if (result.homeRef !== grant.homeRef
      || result.projectRef !== projectRef.data
      || result.invitationRef !== command.invitationRef
      || result.status !== 'revoked'
      || result.revision !== command.expectedRevision + 1) {
      throw new HomeownerApiError('unavailable')
    }
    return result
  }

  async submitProposal(
    context: HomeownerApiRequestContext,
    requestedInvitationRef: string,
    input: unknown,
  ): Promise<ProfessionalProposal> {
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    const parsed = professionalApiSubmitProposalInputSchema.safeParse(input)
    if (!invitationRef.success || !parsed.success) throw new HomeownerApiError('invalid_request')
    const principal = await this.#principal(context)
    const command = submitProfessionalProposalInputSchema.parse({
      ...parsed.data,
      invitationRef: invitationRef.data,
      requestedAt: this.#now(),
    })
    const proposal = professionalProposalSchema.parse(
      await this.#professionals.submitProposal({
        principalRef: principal.principalRef,
        command,
      }),
    )
    if (proposal.invitationRef !== command.invitationRef
      || proposal.submittedByPrincipalRef !== principal.principalRef
      || proposal.revision !== 1
      || proposal.state !== 'submitted'
      || proposal.homeownerDecision !== 'undecided') {
      throw new HomeownerApiError('unavailable')
    }
    return proposal
  }

  async reviseProposal(
    context: HomeownerApiRequestContext,
    requestedInvitationRef: string,
    requestedQuoteRef: string,
    input: unknown,
  ): Promise<ProfessionalProposal> {
    const invitationRef = opaqueRef('hinv').safeParse(requestedInvitationRef)
    const quoteRef = opaqueRef('hquo').safeParse(requestedQuoteRef)
    const parsed = professionalApiReviseProposalInputSchema.safeParse(input)
    if (!invitationRef.success || !quoteRef.success || !parsed.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const principal = await this.#principal(context)
    const command = reviseProfessionalProposalInputSchema.parse({
      ...parsed.data,
      invitationRef: invitationRef.data,
      quoteRef: quoteRef.data,
      requestedAt: this.#now(),
    })
    const proposal = professionalProposalSchema.parse(
      await this.#professionals.reviseProposal({
        principalRef: principal.principalRef,
        command,
      }),
    )
    if (proposal.invitationRef !== command.invitationRef
      || proposal.quoteRef !== command.quoteRef
      || proposal.professionalOrganizationRef === ''
      || proposal.revision !== command.expectedRevision + 1
      || proposal.state !== 'submitted') {
      throw new HomeownerApiError('unavailable')
    }
    return proposal
  }

  async decideProposal(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    requestedQuoteRef: string,
    input: unknown,
  ): Promise<ProfessionalProposal> {
    const projectRef = opaqueRef('hprj').safeParse(requestedProjectRef)
    const quoteRef = opaqueRef('hquo').safeParse(requestedQuoteRef)
    const parsed = professionalApiDecideProposalInputSchema.safeParse(input)
    if (!projectRef.success || !quoteRef.success || !parsed.success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#homeGrant(context, requestedHomeRef, 'proposal.decide')
    const command = decideProfessionalProposalInputSchema.parse({
      ...parsed.data,
      quoteRef: quoteRef.data,
      requestedAt: this.#now(),
    })
    const proposal = professionalProposalSchema.parse(
      await this.#professionals.decideProposal({
        grant: { ...grant, action: 'proposal.decide' },
        projectRef: projectRef.data,
        command,
      }),
    )
    if (proposal.homeRef !== grant.homeRef
      || proposal.projectRef !== projectRef.data
      || proposal.quoteRef !== quoteRef.data
      || proposal.homeownerDecision !== command.decision
      || proposal.decisionRevision !== command.expectedDecisionRevision + 1) {
      throw new HomeownerApiError('unavailable')
    }
    return proposal
  }
}

export { digest as homesroloProfessionalDigest, stableJson as homesroloProfessionalStableJson }
