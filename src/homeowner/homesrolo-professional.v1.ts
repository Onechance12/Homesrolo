import { z } from 'zod'
import {
  homeownerQuoteScopeSchema,
} from './homeowner-project-quotes.v1.ts'
import {
  homeownerProjectCategorySchema,
  homeownerProjectStatusSchema,
} from './homeowner-project-workspace.v1.ts'
import {
  homeownerProjectWorkKindSchema,
  homeownerUtcInstantSchema,
  type AuthorizedHomeownerAction,
} from './homeowner-runtime.v1.ts'

/**
 * Contractor identity and invitation contracts for Homesrolo.
 *
 * This is deliberately not a contractor CRM. A professional organization may
 * publish its own facts, receive access to one exact homeowner project, and
 * submit a proposal into that project's existing comparison workspace.
 * Nothing here creates home membership or access to the rest of a Home Record.
 */
export const HOMESROLO_PROFESSIONAL_VERSION = 'homesrolo-professional.v1' as const

const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`))

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'must be a real calendar date')

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

function isPublicHostname(hostname: string): boolean {
  const bare = hostname.toLocaleLowerCase('en-US').replace(/^\[|\]$/g, '')
  if (bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.local')) return false
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare)
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number)
    if (octets.some(octet => octet > 255)) return false
    const first = octets[0] ?? 999
    const second = octets[1] ?? 999
    return !(first === 0 || first === 10 || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || first >= 224)
  }
  return !(bare === '::' || bare === '::1' || bare.startsWith('fc')
    || bare.startsWith('fd') || /^fe[89ab]/.test(bare) || bare.startsWith('::ffff:'))
}

const publicUrl = z.string().max(2_048).url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
    && (!url.port || url.port === '443') && !url.hash && isPublicHostname(url.hostname)
}, 'must be a public HTTPS URL')

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values.map(value => value.toLocaleLowerCase('en-US'))).size === values.length
}

export const professionalTradeSchema = homeownerProjectCategorySchema

export const professionalPublicationStateSchema = z.enum([
  'draft',
  'published',
  'suspended',
])

export const professionalOrganizationSchema = z.object({
  recordVersion: z.literal(HOMESROLO_PROFESSIONAL_VERSION),
  organizationRef: opaqueRef('horg'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),
  displayName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(1_200).optional(),
  publicPhone: z.string().trim().min(7).max(32).optional(),
  publicEmail: z.string().email().max(254).optional(),
  websiteUrl: publicUrl.optional(),
  logoUrl: publicUrl.optional(),
  trades: z.array(professionalTradeSchema).max(12),
  serviceAreas: z.array(z.string().trim().min(2).max(80)).max(40),
  publicationState: professionalPublicationStateSchema,
  provenance: z.literal('company_self_reported'),
  revision: z.number().int().min(1),
  createdAt: homeownerUtcInstantSchema,
  updatedAt: homeownerUtcInstantSchema,
}).strict().superRefine((organization, context) => {
  if (!uniqueValues(organization.trades)) {
    context.addIssue({ code: 'custom', path: ['trades'], message: 'trades must be unique' })
  }
  if (!uniqueValues(organization.serviceAreas)) {
    context.addIssue({ code: 'custom', path: ['serviceAreas'], message: 'service areas must be unique' })
  }
  if (organization.publicationState === 'published'
    && (organization.trades.length < 1 || organization.serviceAreas.length < 1)) {
    context.addIssue({
      code: 'custom',
      path: ['publicationState'],
      message: 'a published profile needs at least one trade and service area',
    })
  }
  if (organization.updatedAt < organization.createdAt) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt must follow createdAt' })
  }
})

export const professionalMembershipSchema = z.object({
  recordVersion: z.literal(HOMESROLO_PROFESSIONAL_VERSION),
  membershipRef: opaqueRef('hpmr'),
  organizationRef: opaqueRef('horg'),
  principalRef: opaqueRef('hprn'),
  role: z.enum(['owner', 'admin', 'member']),
  state: z.enum(['active', 'revoked']),
  revision: z.number().int().min(1),
  createdAt: homeownerUtcInstantSchema,
  revokedAt: homeownerUtcInstantSchema.optional(),
}).strict().superRefine((membership, context) => {
  if ((membership.state === 'revoked') !== (membership.revokedAt !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['revokedAt'],
      message: 'revokedAt must exist exactly when the membership is revoked',
    })
  }
})

export const createProfessionalOrganizationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  displayName: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),
}).strict()

export const saveProfessionalProfileInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  organizationRef: opaqueRef('horg'),
  expectedRevision: z.number().int().min(1),
  displayName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(160).nullable(),
  description: z.string().trim().min(1).max(1_200).nullable(),
  publicPhone: z.string().trim().min(7).max(32).nullable(),
  publicEmail: z.string().email().max(254).nullable(),
  websiteUrl: publicUrl.nullable(),
  logoUrl: publicUrl.nullable(),
  trades: z.array(professionalTradeSchema).max(12),
  serviceAreas: z.array(z.string().trim().min(2).max(80)).max(40),
  publicationState: z.enum(['draft', 'published']),
}).strict().superRefine((profile, context) => {
  if (!uniqueValues(profile.trades)) {
    context.addIssue({ code: 'custom', path: ['trades'], message: 'trades must be unique' })
  }
  if (!uniqueValues(profile.serviceAreas)) {
    context.addIssue({ code: 'custom', path: ['serviceAreas'], message: 'service areas must be unique' })
  }
  if (profile.publicationState === 'published'
    && (profile.trades.length < 1 || profile.serviceAreas.length < 1)) {
    context.addIssue({
      code: 'custom',
      path: ['publicationState'],
      message: 'a published profile needs at least one trade and service area',
    })
  }
})

export const projectInvitationDisclosureSchema = z.object({
  title: z.string().trim().min(1).max(120),
  workKind: homeownerProjectWorkKindSchema,
  category: homeownerProjectCategorySchema,
  trade: z.string().trim().min(1).max(80),
  status: homeownerProjectStatusSchema,
  summary: z.string().trim().max(2_000),
  selectedArtifactRefs: z.array(opaqueRef('hart')).max(25),
}).strict().superRefine((disclosure, context) => {
  if (!uniqueValues(disclosure.selectedArtifactRefs)) {
    context.addIssue({
      code: 'custom',
      path: ['selectedArtifactRefs'],
      message: 'selected artifact references must be unique',
    })
  }
})

export const projectInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
])

export const projectInvitationSchema = z.object({
  recordVersion: z.literal(HOMESROLO_PROFESSIONAL_VERSION),
  invitationRef: opaqueRef('hinv'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  controllerPrincipalRef: opaqueRef('hprn'),
  invitedByPrincipalRef: opaqueRef('hprn'),
  professionalOrganizationRef: opaqueRef('horg'),
  /** Retained invitation label, independent of current public discovery. */
  professionalDisplayLabel: z.string().trim().min(1).max(120).optional(),
  status: projectInvitationStatusSchema,
  message: z.string().trim().min(1).max(1_000).optional(),
  disclosure: projectInvitationDisclosureSchema,
  disclosureDigest: sha256,
  expiresAt: homeownerUtcInstantSchema,
  revision: z.number().int().min(1),
  createdAt: homeownerUtcInstantSchema,
  respondedAt: homeownerUtcInstantSchema.optional(),
  revokedAt: homeownerUtcInstantSchema.optional(),
}).strict().superRefine((invitation, context) => {
  if (invitation.expiresAt <= invitation.createdAt) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiry must follow creation' })
  }
  if ((invitation.status === 'accepted' || invitation.status === 'declined')
    && invitation.respondedAt === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['respondedAt'],
      message: 'accepted and declined invitations require respondedAt',
    })
  }
  if ((invitation.status === 'pending' || invitation.status === 'revoked')
    && invitation.respondedAt !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['respondedAt'],
      message: 'pending and revoked invitations cannot carry respondedAt',
    })
  }
  if ((invitation.status === 'revoked') !== (invitation.revokedAt !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['revokedAt'],
      message: 'revokedAt belongs only on revoked invitations',
    })
  }
})

export const createProjectInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj'),
  professionalOrganizationRef: opaqueRef('horg'),
  message: z.string().trim().min(1).max(1_000).optional(),
  selectedArtifactRefs: z.array(opaqueRef('hart')).max(25),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  requestedAt: homeownerUtcInstantSchema,
}).strict().superRefine((command, context) => {
  if (!uniqueValues(command.selectedArtifactRefs)) {
    context.addIssue({
      code: 'custom',
      path: ['selectedArtifactRefs'],
      message: 'selected artifact references must be unique',
    })
  }
})

export const respondToProjectInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  invitationRef: opaqueRef('hinv'),
  expectedRevision: z.number().int().min(1),
  response: z.enum(['accepted', 'declined']),
  requestedAt: homeownerUtcInstantSchema,
}).strict()

export const revokeProjectInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  invitationRef: opaqueRef('hinv'),
  expectedRevision: z.number().int().min(1),
  requestedAt: homeownerUtcInstantSchema,
}).strict()

export const professionalProposalStateSchema = z.enum(['submitted', 'withdrawn'])
export const homeownerProposalDecisionSchema = z.enum([
  'undecided',
  'shortlisted',
  'selected',
  'declined',
])

export const professionalProposalSchema = z.object({
  recordVersion: z.literal(HOMESROLO_PROFESSIONAL_VERSION),
  quoteRef: opaqueRef('hquo'),
  versionRef: opaqueRef('hpvr'),
  invitationRef: opaqueRef('hinv'),
  professionalOrganizationRef: opaqueRef('horg'),
  submittedByPrincipalRef: opaqueRef('hprn'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  controllerPrincipalRef: opaqueRef('hprn'),
  contractorLabel: z.string().trim().min(1).max(120),
  proposalDate: calendarDate,
  totalAmountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  currencyCode: z.literal('USD'),
  summary: z.string().trim().min(1).max(2_000).optional(),
  scope: homeownerQuoteScopeSchema,
  state: professionalProposalStateSchema,
  homeownerDecision: homeownerProposalDecisionSchema,
  decisionRevision: z.number().int().min(1),
  revision: z.number().int().min(1),
  contentDigest: sha256,
  createdAt: homeownerUtcInstantSchema,
  updatedAt: homeownerUtcInstantSchema,
}).strict().superRefine((proposal, context) => {
  if (proposal.updatedAt < proposal.createdAt) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt must follow createdAt' })
  }
  if (proposal.state === 'withdrawn' && proposal.homeownerDecision === 'selected') {
    context.addIssue({
      code: 'custom',
      path: ['homeownerDecision'],
      message: 'a selected proposal cannot be withdrawn',
    })
  }
})

export const submitProfessionalProposalInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  invitationRef: opaqueRef('hinv'),
  proposalDate: calendarDate,
  totalAmountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  summary: z.string().trim().min(1).max(2_000).optional(),
  scope: homeownerQuoteScopeSchema,
  requestedAt: homeownerUtcInstantSchema,
}).strict()

export const reviseProfessionalProposalInputSchema =
  submitProfessionalProposalInputSchema.extend({
    quoteRef: opaqueRef('hquo'),
    expectedRevision: z.number().int().min(1),
  }).strict()

export const decideProfessionalProposalInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  quoteRef: opaqueRef('hquo'),
  expectedDecisionRevision: z.number().int().min(1),
  decision: homeownerProposalDecisionSchema.exclude(['undecided']),
  requestedAt: homeownerUtcInstantSchema,
}).strict()

export type ProfessionalOrganization = z.infer<typeof professionalOrganizationSchema>
export type ProfessionalMembership = z.infer<typeof professionalMembershipSchema>
export type ProjectInvitation = z.infer<typeof projectInvitationSchema>
export type ProjectInvitationDisclosure = z.infer<typeof projectInvitationDisclosureSchema>
export type ProfessionalProposal = z.infer<typeof professionalProposalSchema>
export type CreateProfessionalOrganizationInput = z.infer<typeof createProfessionalOrganizationInputSchema>
export type SaveProfessionalProfileInput = z.infer<typeof saveProfessionalProfileInputSchema>
export type CreateProjectInvitationInput = z.infer<typeof createProjectInvitationInputSchema>
export type RespondToProjectInvitationInput = z.infer<typeof respondToProjectInvitationInputSchema>
export type RevokeProjectInvitationInput = z.infer<typeof revokeProjectInvitationInputSchema>
export type SubmitProfessionalProposalInput = z.infer<typeof submitProfessionalProposalInputSchema>
export type ReviseProfessionalProposalInput = z.infer<typeof reviseProfessionalProposalInputSchema>
export type DecideProfessionalProposalInput = z.infer<typeof decideProfessionalProposalInputSchema>

export interface ProfessionalInvitationArtifact {
  readonly artifactRef: string
  readonly displayName: string
  readonly mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'
  readonly byteLength: number
  readonly payloadSha256: string
  readonly bytes: Uint8Array
}

export function professionalCommandIntent<T extends { readonly requestedAt?: string }>(command: T) {
  const { requestedAt: _executionTime, ...intent } = command
  return intent
}

/** The only homeowner authority accepted by an invitation write. */
export type AuthorizedProjectInvitation = AuthorizedHomeownerAction<'professional.invite'>

/**
 * Persistence seam. Implementations must recheck organization membership and
 * invitation state in the same transaction as every mutation.
 */
export interface HomesroloProfessionalPort {
  listPublishedOrganizations(input?: {
    readonly trade?: z.infer<typeof professionalTradeSchema>
    readonly serviceArea?: string
  }): Promise<readonly ProfessionalOrganization[]>
  readPublishedOrganization(slug: string): Promise<ProfessionalOrganization | null>
  listOrganizationsForPrincipal(principalRef: string): Promise<readonly ProfessionalOrganization[]>
  listProfessionalMemberships(principalRef: string): Promise<readonly ProfessionalMembership[]>
  createOrganization(input: {
    readonly principalRef: string
    readonly command: CreateProfessionalOrganizationInput & { readonly requestedAt: string }
  }): Promise<{ readonly organization: ProfessionalOrganization; readonly membership: ProfessionalMembership }>
  saveProfile(input: {
    readonly principalRef: string
    readonly command: SaveProfessionalProfileInput & { readonly requestedAt: string }
  }): Promise<ProfessionalOrganization>
  createInvitation(input: {
    readonly grant: AuthorizedProjectInvitation
    readonly command: CreateProjectInvitationInput
    readonly disclosure: ProjectInvitationDisclosure
    readonly disclosureDigest: string
  }): Promise<ProjectInvitation>
  listHomeownerInvitations(input: {
    readonly grant: AuthorizedHomeownerAction<'workspace.read'>
    readonly projectRef: string
  }): Promise<readonly ProjectInvitation[]>
  listProfessionalInvitations(principalRef: string): Promise<readonly ProjectInvitation[]>
  readProposalForInvitation(input: {
    readonly principalRef: string
    readonly invitationRef: string
  }): Promise<ProfessionalProposal | null>
  readInvitationArtifact(input: {
    readonly principalRef: string
    readonly invitationRef: string
    readonly artifactRef: string
  }): Promise<ProfessionalInvitationArtifact>
  respondToInvitation(input: {
    readonly principalRef: string
    readonly command: RespondToProjectInvitationInput
  }): Promise<ProjectInvitation>
  revokeInvitation(input: {
    readonly grant: AuthorizedHomeownerAction<'professional.invitation.revoke'>
    readonly projectRef: string
    readonly command: RevokeProjectInvitationInput
  }): Promise<ProjectInvitation>
  submitProposal(input: {
    readonly principalRef: string
    readonly command: SubmitProfessionalProposalInput
  }): Promise<ProfessionalProposal>
  reviseProposal(input: {
    readonly principalRef: string
    readonly command: ReviseProfessionalProposalInput
  }): Promise<ProfessionalProposal>
  decideProposal(input: {
    readonly grant: AuthorizedHomeownerAction<'proposal.decide'>
    readonly projectRef: string
    readonly command: DecideProfessionalProposalInput
  }): Promise<ProfessionalProposal>
}

export const PROFESSIONAL_ACCESS_RULE =
  'A professional receives access to one exact invited project and its selected evidence. Professional participation never creates Home Record membership.'
