import { z } from 'zod'

/**
 * Server-side contracts for the first private HomesRolo homeowner workspace.
 *
 * This module does not implement authentication, a database, object storage,
 * uploads, public sharing, or Jobrolo transport. It defines the boundary those
 * adapters must satisfy so the browser can never decide who may access a home.
 */
export const HOMEOWNER_RUNTIME_VERSION = 'homeowner-runtime.v1-draft' as const

export const HOMEOWNER_RUNTIME_STATUS = Object.freeze({
  contractsImplemented: true,
  authenticationImplemented: false,
  persistenceImplemented: false,
  objectStorageImplemented: false,
  uploadsImplemented: false,
  invitationsImplemented: false,
  publicSharingImplemented: false,
  jobroloTransportImplemented: false,
  productionReady: false,
} as const)

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => new Date(value).toISOString() === value, 'must be a canonical UTC instant')

export const homeownerPrincipalSchema = z.object({
  principalRef: opaqueRef('hprn'),
  status: z.enum(['active', 'disabled', 'deleted']),
  emailVerified: z.boolean(),
  sessionVersion: z.number().int().min(1),
}).strict()

export type HomeownerPrincipal = z.infer<typeof homeownerPrincipalSchema>

export const homeownerMembershipSchema = z.object({
  membershipRef: opaqueRef('hmbr'),
  principalRef: opaqueRef('hprn'),
  homeRef: opaqueRef('hhom'),
  role: z.enum(['workspace_controller', 'member', 'viewer']),
  basis: z.enum(['self_created_workspace', 'verified_control', 'accepted_invitation']),
  state: z.enum(['pending', 'active', 'revoked']),
  relationshipLabel: z.enum(['claimed_unverified', 'verified_controller', 'invited_participant']),
  revision: z.number().int().min(1),
  createdAt: utcInstant,
  revokedAt: utcInstant.optional(),
}).strict()

export type HomeownerMembership = z.infer<typeof homeownerMembershipSchema>

export function parseHomeownerMembership(input: unknown): HomeownerMembership {
  const membership = homeownerMembershipSchema.parse(input)
  if (membership.state === 'revoked' && !membership.revokedAt) {
    throw new Error('A revoked membership must record when it was revoked')
  }
  if (membership.state !== 'revoked' && membership.revokedAt) {
    throw new Error('Only a revoked membership may carry revokedAt')
  }
  if (membership.basis === 'self_created_workspace'
    && membership.relationshipLabel !== 'claimed_unverified') {
    throw new Error('Creating a workspace does not verify legal ownership or control')
  }
  if (membership.basis === 'verified_control'
    && membership.relationshipLabel !== 'verified_controller') {
    throw new Error('Verified control must use the verified-controller label')
  }
  if (membership.basis === 'accepted_invitation'
    && membership.relationshipLabel !== 'invited_participant') {
    throw new Error('Invitation membership must remain labeled as invited')
  }
  return membership
}

export const HOMEOWNER_WORKSPACE_ACTIONS = Object.freeze([
  'workspace.read',
  'workspace.update',
  'project.create',
  'project.update',
  'artifact.create_metadata',
  'artifact.read_metadata',
  'warranty.create',
  'warranty.update',
] as const)

export type HomeownerWorkspaceAction = (typeof HOMEOWNER_WORKSPACE_ACTIONS)[number]

const CONTROLLER_ACTIONS: readonly HomeownerWorkspaceAction[] = HOMEOWNER_WORKSPACE_ACTIONS
const MEMBER_ACTIONS: readonly HomeownerWorkspaceAction[] = Object.freeze([
  'workspace.read',
  'project.create',
  'project.update',
  'artifact.create_metadata',
  'artifact.read_metadata',
  'warranty.create',
  'warranty.update',
])
const VIEWER_ACTIONS: readonly HomeownerWorkspaceAction[] = Object.freeze([
  'workspace.read',
  'artifact.read_metadata',
])

export type HomeownerAccessDecision =
  | {
      readonly authorized: true
      readonly principalRef: string
      readonly homeRef: string
      readonly membershipRef: string
      readonly membershipRevision: number
      readonly action: HomeownerWorkspaceAction
      readonly recheckedAt: string
    }
  | {
      readonly authorized: false
      readonly reason:
        | 'invalid_authoritative_state'
        | 'principal_inactive'
        | 'email_unverified'
        | 'membership_inactive'
        | 'principal_mismatch'
        | 'home_mismatch'
        | 'role_denied'
    }

/**
 * Derives one exact workspace decision from fresh, server-owned snapshots.
 * It deliberately accepts no address, cookie claim, browser role, provider ID,
 * or resource payload. It does not authorize third-party contributions; those
 * continue through the stricter controller/share rules in home-file-record.v1.
 */
export function authorizeHomeownerWorkspace(input: {
  readonly principal: unknown
  readonly membership: unknown
  readonly requestedHomeRef: string
  readonly action: HomeownerWorkspaceAction
  readonly recheckedAt: string
}): HomeownerAccessDecision {
  const principalResult = homeownerPrincipalSchema.safeParse(input.principal)
  let membership: HomeownerMembership
  try {
    membership = parseHomeownerMembership(input.membership)
    utcInstant.parse(input.recheckedAt)
    opaqueRef('hhom').parse(input.requestedHomeRef)
  } catch {
    return { authorized: false, reason: 'invalid_authoritative_state' }
  }
  if (!principalResult.success) {
    return { authorized: false, reason: 'invalid_authoritative_state' }
  }
  const principal = principalResult.data
  if (principal.status !== 'active') {
    return { authorized: false, reason: 'principal_inactive' }
  }
  if (!principal.emailVerified) {
    return { authorized: false, reason: 'email_unverified' }
  }
  if (membership.state !== 'active') {
    return { authorized: false, reason: 'membership_inactive' }
  }
  if (membership.principalRef !== principal.principalRef) {
    return { authorized: false, reason: 'principal_mismatch' }
  }
  if (membership.homeRef !== input.requestedHomeRef) {
    return { authorized: false, reason: 'home_mismatch' }
  }

  const allowed = membership.role === 'workspace_controller'
    ? CONTROLLER_ACTIONS
    : membership.role === 'member'
      ? MEMBER_ACTIONS
      : VIEWER_ACTIONS
  if (!allowed.includes(input.action)) {
    return { authorized: false, reason: 'role_denied' }
  }
  return {
    authorized: true,
    principalRef: principal.principalRef,
    homeRef: membership.homeRef,
    membershipRef: membership.membershipRef,
    membershipRevision: membership.revision,
    action: input.action,
    recheckedAt: input.recheckedAt,
  }
}

export const privateHomeProfileSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  homeRef: opaqueRef('hhom'),
  createdByPrincipalRef: opaqueRef('hprn'),
  displayLabel: z.string().trim().min(1).max(80),
  privateLocationLabel: z.string().trim().min(1).max(200),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

export const homeownerProjectSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  projectRef: opaqueRef('hprj'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  title: z.string().trim().min(1).max(120),
  category: z.enum([
    'roofing',
    'exterior',
    'interior',
    'electrical',
    'plumbing',
    'hvac',
    'landscaping',
    'other',
  ]),
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  summary: z.string().trim().max(2000).optional(),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

export const homeownerArtifactMetadataSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  artifactRef: opaqueRef('hart'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj').optional(),
  controllerPrincipalRef: opaqueRef('hprn'),
  kind: z.enum(['photo', 'document', 'warranty']),
  displayName: z.string().trim().min(1).max(160),
  mediaType: z.string().trim().min(1).max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  byteLength: z.number().int().min(1).max(25 * 1024 * 1024),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageObjectRef: opaqueRef('hobj'),
  contentClass: z.literal('homeowner_private'),
  createdAt: utcInstant,
}).strict()

export type PrivateHomeProfile = z.infer<typeof privateHomeProfileSchema>
export type HomeownerProject = z.infer<typeof homeownerProjectSchema>
export type HomeownerArtifactMetadata = z.infer<typeof homeownerArtifactMetadataSchema>

/** Adapter surfaces only. Implementations must re-authorize after every read. */
export interface HomeownerIdentityPort {
  resolvePrincipal(sessionHandle: string): Promise<HomeownerPrincipal | null>
}

export interface HomeownerRepositoryPort {
  readMembership(principalRef: string, homeRef: string): Promise<HomeownerMembership | null>
  readHome(homeRef: string): Promise<PrivateHomeProfile | null>
  listProjects(homeRef: string): Promise<readonly HomeownerProject[]>
  listArtifactMetadata(homeRef: string): Promise<readonly HomeownerArtifactMetadata[]>
}

export interface HomeownerPrivateObjectPort {
  readExactObject(input: {
    readonly storageObjectRef: string
    readonly expectedSha256: string
    readonly maximumBytes: number
  }): Promise<Uint8Array>
}

export interface HomeownerAuditPort {
  append(event: {
    readonly principalRef: string
    readonly homeRef: string
    readonly action: HomeownerWorkspaceAction
    readonly authorized: boolean
    readonly occurredAt: string
  }): Promise<void>
}

export const HOMEOWNER_RUNTIME_WARNING =
  'These contracts do not prove ownership, authenticate a person, persist data, expose an upload route, ' +
  'or authorize third-party content. A production adapter must use fresh server-side identity and membership state.'
