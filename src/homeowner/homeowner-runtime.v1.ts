import { z } from 'zod'
import { isRealCalendarDate } from '../contracts/home-file-record.v1.ts'

/**
 * Server-side contracts for the first private HomesRolo homeowner workspace.
 *
 * This module defines the authorization boundary those adapters must satisfy
 * so the browser can never decide who may access a home. Exact-project
 * professional invitations live behind a separate capability and never create
 * one of the home memberships defined below.
 */
export const HOMEOWNER_RUNTIME_VERSION = 'homeowner-runtime.v1-draft' as const

export const HOMEOWNER_RUNTIME_STATUS = Object.freeze({
  contractsImplemented: true,
  authenticationImplemented: true,
  persistenceImplemented: true,
  objectStorageImplemented: true,
  uploadsImplemented: true,
  invitationsImplemented: true,
  publicSharingImplemented: false,
  jobroloTransportImplemented: true,
  productionReady: false,
} as const)

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

export const homeownerUtcInstantSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => new Date(value).toISOString() === value, 'must be a canonical UTC instant')

const utcInstant = homeownerUtcInstantSchema

const calendarDate = z.string()
  .refine(isRealCalendarDate, 'must be a real calendar date')

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
  'home_record.read',
  'home_record.update',
  'intake.record',
  'project.create',
  'project.update',
  'project.activity.append',
  'project.item.save',
  'quote.create',
  'quote.save',
  'professional.invite',
  'professional.invitation.revoke',
  'proposal.decide',
  'artifact.create_metadata',
  'artifact.upload',
  'artifact.update_metadata',
  'artifact.read_metadata',
  'project.submit_for_review',
  'handoff.preview',
  'handoff.accept',
  'handoff.reject',
  'home_record.export',
  'warranty.create',
  'warranty.update',
  'maintenance.create',
  'maintenance.update',
] as const)

export type HomeownerWorkspaceAction = (typeof HOMEOWNER_WORKSPACE_ACTIONS)[number]

const CONTROLLER_ACTIONS: readonly HomeownerWorkspaceAction[] = HOMEOWNER_WORKSPACE_ACTIONS
const MEMBER_ACTIONS: readonly HomeownerWorkspaceAction[] = Object.freeze([
  'workspace.read',
  'project.create',
  'project.update',
  'project.activity.append',
  'project.item.save',
  'artifact.create_metadata',
  'artifact.upload',
  'artifact.read_metadata',
  'warranty.create',
  'warranty.update',
  'maintenance.create',
  'maintenance.update',
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

export type AuthorizedHomeownerWorkspace = Extract<
  HomeownerAccessDecision,
  { readonly authorized: true }
>

export type AuthorizedHomeownerAction<Action extends HomeownerWorkspaceAction> =
  Omit<AuthorizedHomeownerWorkspace, 'action'> & { readonly action: Action }

export function requireHomeownerActionGrant<Action extends HomeownerWorkspaceAction>(
  decision: HomeownerAccessDecision,
  action: Action,
): AuthorizedHomeownerAction<Action> | null {
  if (!decision.authorized || decision.action !== action) return null
  return { ...decision, action }
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

export const HOMEOWNER_SYSTEM_KINDS = Object.freeze([
  'roof',
  'heating',
  'cooling',
  'water_heater',
  'gutters',
  'foundation',
] as const)

export const homeownerSystemKindSchema = z.enum(HOMEOWNER_SYSTEM_KINDS)

export const homeownerApproximateYearSchema = z.object({
  value: z.number().int().min(1800).max(9999),
  precision: z.enum(['exact', 'approximate']),
}).strict()

export const homeownerHomeTypeSchema = z.enum([
  'house',
  'townhouse',
  'condo',
  'other',
  'unknown',
])

export const homeownerPropertyFactsSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  propertyFactsRef: opaqueRef('hfac'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  source: z.literal('homeowner_recollection'),
  revision: z.number().int().min(1),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

export const homeownerSystemSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  systemRef: opaqueRef('hsys'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  kind: homeownerSystemKindSchema,
  present: z.enum(['yes', 'no', 'unknown']),
  installedOrReplacedYear: homeownerApproximateYearSchema.nullable(),
  source: z.literal('homeowner_recollection'),
  revision: z.number().int().min(1),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

function assertYearNotAfterInstant(
  year: z.infer<typeof homeownerApproximateYearSchema> | null,
  instant: string,
  label: string,
): void {
  if (year && year.value > new Date(instant).getUTCFullYear()) {
    throw new Error(`${label} may not be in the future`)
  }
}

export function parseHomeownerPropertyFacts(input: unknown) {
  const facts = homeownerPropertyFactsSchema.parse(input)
  if (facts.updatedAt < facts.createdAt) {
    throw new Error('Property facts may not be updated before they were created')
  }
  assertYearNotAfterInstant(facts.yearBuilt, facts.createdAt, 'Year built')
  return facts
}

export function parseHomeownerSystem(input: unknown) {
  const system = homeownerSystemSchema.parse(input)
  if (system.present !== 'yes' && system.installedOrReplacedYear !== null) {
    throw new Error('Only a present system may carry an installed or replaced year')
  }
  if (system.updatedAt < system.createdAt) {
    throw new Error('A system record may not be updated before it was created')
  }
  assertYearNotAfterInstant(
    system.installedOrReplacedYear,
    system.createdAt,
    'Installed or replaced year',
  )
  return system
}

/**
 * The kind of home work represented by the existing project record. This is
 * deliberately a discriminator on that record, not a second persistence
 * model: projects, issues, repairs, services, and incidents share one durable
 * workspace and evidence history.
 */
export const homeownerProjectWorkKindSchema = z.enum([
  'project',
  'issue',
  'repair',
  'service',
  'incident',
])

export const homeownerProjectSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  projectRef: opaqueRef('hprj'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  title: z.string().trim().min(1).max(120),
  /** Older persisted rows and payloads are canonical projects. */
  workKind: homeownerProjectWorkKindSchema.default('project'),
  category: z.enum([
    'roofing',
    'exterior',
    'interior',
    'electrical',
    'plumbing',
    'hvac',
    'landscaping',
    'appliances',
    'pest',
    'pool',
    'new_construction',
    'other',
  ]),
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
  occurredOn: calendarDate.optional(),
  summary: z.string().trim().max(2000).optional(),
  professionalLabel: z.string().trim().min(1).max(160).optional(),
  revision: z.number().int().min(1),
  archivedAt: utcInstant.optional(),
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
  /** Optional photo evidence fields remain absent on pre-migration records. */
  observedOn: calendarDate.optional(),
  phase: z.enum(['before', 'during', 'after', 'reference']).optional(),
  areaLabel: z.string().trim().min(1).max(120)
    .regex(/^[^\u0000-\u001f\u007f]*$/).optional(),
  geoPin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(100_000),
    capturedAt: utcInstant,
    provenance: z.literal('device_confirmed'),
  }).strict().optional(),
  revision: z.number().int().min(1).optional(),
  createdAt: utcInstant,
  updatedAt: utcInstant.optional(),
}).strict()

export const homeownerWarrantySchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  warrantyRef: opaqueRef('hwty'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj').optional(),
  controllerPrincipalRef: opaqueRef('hprn'),
  coverageSummary: z.string().trim().min(1).max(2000),
  issuerLabel: z.string().trim().min(1).max(160),
  startsOn: calendarDate,
  endsOn: calendarDate.optional(),
  documentArtifactRef: opaqueRef('hart').optional(),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

export const homeownerMaintenanceSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_RUNTIME_VERSION),
  maintenanceRef: opaqueRef('hmnt'),
  homeRef: opaqueRef('hhom'),
  controllerPrincipalRef: opaqueRef('hprn'),
  title: z.string().trim().min(1).max(160),
  cadence: z.enum(['one_time', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom']),
  dueOn: calendarDate,
  state: z.enum(['upcoming', 'completed', 'dismissed']),
  completedAt: utcInstant.optional(),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict()

export function parseHomeownerWarranty(input: unknown) {
  const warranty = homeownerWarrantySchema.parse(input)
  if (warranty.endsOn && warranty.endsOn < warranty.startsOn) {
    throw new Error('A warranty may not end before it starts')
  }
  if (warranty.updatedAt < warranty.createdAt) {
    throw new Error('A warranty may not be updated before it was created')
  }
  return warranty
}

export function parseHomeownerMaintenance(input: unknown) {
  const maintenance = homeownerMaintenanceSchema.parse(input)
  if (maintenance.state === 'completed' && !maintenance.completedAt) {
    throw new Error('Completed maintenance must record when it was completed')
  }
  if (maintenance.state !== 'completed' && maintenance.completedAt) {
    throw new Error('Only completed maintenance may carry completedAt')
  }
  if (maintenance.completedAt && maintenance.completedAt < maintenance.createdAt) {
    throw new Error('Maintenance may not be completed before it was created')
  }
  if (maintenance.updatedAt < maintenance.createdAt) {
    throw new Error('Maintenance may not be updated before it was created')
  }
  return maintenance
}

export type PrivateHomeProfile = z.infer<typeof privateHomeProfileSchema>
export type HomeownerPropertyFacts = z.infer<typeof homeownerPropertyFactsSchema>
export type HomeownerSystem = z.infer<typeof homeownerSystemSchema>
export type HomeownerProject = z.infer<typeof homeownerProjectSchema>
export type HomeownerArtifactMetadata = z.infer<typeof homeownerArtifactMetadataSchema>
export type HomeownerWarranty = z.infer<typeof homeownerWarrantySchema>
export type HomeownerMaintenance = z.infer<typeof homeownerMaintenanceSchema>

export const createHomeWorkspaceInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  displayLabel: z.string().trim().min(1).max(80),
  privateLocationLabel: z.string().trim().min(1).max(200),
  requestedAt: utcInstant,
}).strict()

export const createHomeownerProjectInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  title: z.string().trim().min(1).max(120),
  /** Omission preserves the behavior of every pre-discriminator client. */
  workKind: homeownerProjectWorkKindSchema.default('project'),
  category: homeownerProjectSchema.shape.category,
  status: homeownerProjectSchema.shape.status,
  occurredOn: calendarDate.optional(),
  summary: z.string().trim().max(2000).optional(),
  professionalLabel: z.string().trim().min(1).max(160).optional(),
  initialActivity: z.object({
    kind: z.enum(['note', 'milestone']),
    body: z.string().trim().min(1).max(2000),
  }).strict().optional(),
  requestedAt: utcInstant,
}).strict()

const recordHomeownerSystemInputSchema = z.object({
  kind: homeownerSystemKindSchema,
  present: z.enum(['yes', 'no', 'unknown']),
  installedOrReplacedYear: homeownerApproximateYearSchema.nullable(),
}).strict().superRefine((system, context) => {
  if (system.present !== 'yes' && system.installedOrReplacedYear !== null) {
    context.addIssue({
      code: 'custom',
      path: ['installedOrReplacedYear'],
      message: 'only a present system may carry a year',
    })
  }
})

export const recordHomeownerIntakeInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  homeType: homeownerHomeTypeSchema,
  yearBuilt: homeownerApproximateYearSchema.nullable(),
  systems: z.array(recordHomeownerSystemInputSchema).length(HOMEOWNER_SYSTEM_KINDS.length),
  requestedAt: utcInstant,
}).strict().superRefine((command, context) => {
  const kinds = command.systems.map(system => system.kind)
  if (new Set(kinds).size !== HOMEOWNER_SYSTEM_KINDS.length
    || HOMEOWNER_SYSTEM_KINDS.some(kind => !kinds.includes(kind))) {
    context.addIssue({
      code: 'custom',
      path: ['systems'],
      message: 'the intake must contain each supported system exactly once',
    })
  }
  const requestedYear = new Date(command.requestedAt).getUTCFullYear()
  if (command.yearBuilt && command.yearBuilt.value > requestedYear) {
    context.addIssue({ code: 'custom', path: ['yearBuilt'], message: 'year built may not be in the future' })
  }
  command.systems.forEach((system, index) => {
    if (system.installedOrReplacedYear
      && system.installedOrReplacedYear.value > requestedYear) {
      context.addIssue({
        code: 'custom',
        path: ['systems', index, 'installedOrReplacedYear'],
        message: 'installed or replaced year may not be in the future',
      })
    }
  })
})

export type CreateHomeWorkspaceInput = z.infer<typeof createHomeWorkspaceInputSchema>
export type CreateHomeownerProjectInput = z.infer<typeof createHomeownerProjectInputSchema>
export type RecordHomeownerIntakeInput = z.infer<typeof recordHomeownerIntakeInputSchema>

/** Stable, exact-home receipt intent for the compatibility intake command. */
export function homeownerIntakeCommandIntent(
  homeRef: string,
  input: RecordHomeownerIntakeInput,
) {
  const command = recordHomeownerIntakeInputSchema.parse(input)
  const { requestedAt: _requestedAt, ...intent } = command
  return { homeRef: privateHomeProfileSchema.shape.homeRef.parse(homeRef), ...intent }
}

/**
 * Stable user intent for receipt hashing. Server execution time is deliberately
 * excluded so a lost-response retry can reuse the same commandRef safely.
 */
export function homeownerProjectCommandIntent(
  input: z.input<typeof createHomeownerProjectInputSchema>,
) {
  const command = createHomeownerProjectInputSchema.parse(input)
  const { requestedAt: _requestedAt, workKind, ...legacyIntent } = command
  // Preserve the receipt digest produced before workKind existed. A rolling
  // deploy can therefore retry an in-flight ordinary project command without
  // turning the schema default into an idempotency conflict.
  return workKind === 'project'
    ? legacyIntent
    : { ...legacyIntent, workKind }
}

export const storeHomeownerArtifactInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj').optional(),
  kind: homeownerArtifactMetadataSchema.shape.kind,
  displayName: homeownerArtifactMetadataSchema.shape.displayName,
  mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  byteLength: homeownerArtifactMetadataSchema.shape.byteLength,
  payloadSha256: homeownerArtifactMetadataSchema.shape.payloadSha256,
  requestedAt: utcInstant,
}).strict()

export type StoreHomeownerArtifactInput = z.infer<typeof storeHomeownerArtifactInputSchema>

/** Stable idempotency intent; server execution time is deliberately excluded. */
export function homeownerArtifactCommandIntent(input: StoreHomeownerArtifactInput) {
  const command = storeHomeownerArtifactInputSchema.parse(input)
  const { requestedAt: _requestedAt, ...intent } = command
  return intent
}

export const homeownerSignedUploadGrantSchema = z.object({
  signedUrl: z.string().url().max(4096),
  path: z.string().min(1).max(512).regex(/^[A-Za-z0-9_\/-]+$/),
  token: z.string().min(32).max(4096).regex(/^\S+$/),
  expiresAt: utcInstant,
}).strict()

export type HomeownerSignedUploadGrant = z.infer<typeof homeownerSignedUploadGrantSchema>

export const homeownerArtifactUploadReservationSchema = z.object({
  artifactRef: opaqueRef('hart'),
  homeRef: opaqueRef('hhom'),
  uploaderPrincipalRef: opaqueRef('hprn'),
  commandRef: opaqueRef('hcmd'),
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
  storageObjectRef: opaqueRef('hobj'),
  storageKey: z.string().regex(/^hhom_[A-Za-z0-9_-]{43}\/hobj_[A-Za-z0-9_-]{43}$/),
}).strict()

export type HomeownerArtifactUploadReservation = z.infer<
  typeof homeownerArtifactUploadReservationSchema
>

export type HomeownerArtifactReserveResult =
  | { readonly state: 'available'; readonly artifact: HomeownerArtifactMetadata }
  | {
      readonly state: 'upload_required'
      readonly reservation: HomeownerArtifactUploadReservation
      readonly upload: HomeownerSignedUploadGrant
    }

export type HomeCreationDecision =
  | { readonly authorized: true; readonly principalRef: string }
  | {
      readonly authorized: false
      readonly reason: 'invalid_authoritative_state' | 'principal_inactive' | 'email_unverified'
    }

export type AuthorizedHomeownerPrincipal = Extract<
  HomeCreationDecision,
  { readonly authorized: true }
>

/** Creating a private workspace is allowed; it still records claimed_unverified. */
export function authorizePrivateHomeCreation(principalInput: unknown): HomeCreationDecision {
  const parsed = homeownerPrincipalSchema.safeParse(principalInput)
  if (!parsed.success) return { authorized: false, reason: 'invalid_authoritative_state' }
  if (parsed.data.status !== 'active') return { authorized: false, reason: 'principal_inactive' }
  if (!parsed.data.emailVerified) return { authorized: false, reason: 'email_unverified' }
  return { authorized: true, principalRef: parsed.data.principalRef }
}

/** Adapter surfaces only. Implementations must re-authorize after every read. */
export interface HomeownerIdentityPort {
  resolvePrincipal(sessionHandle: string): Promise<HomeownerPrincipal | null>
}

export interface HomeownerRepositoryPort {
  listMemberships(
    authorization: AuthorizedHomeownerPrincipal,
  ): Promise<readonly HomeownerMembership[]>
  readMembership(principalRef: string, homeRef: string): Promise<HomeownerMembership | null>
  readHome(grant: AuthorizedHomeownerWorkspace): Promise<PrivateHomeProfile | null>
  readPropertyFacts(grant: AuthorizedHomeownerWorkspace): Promise<HomeownerPropertyFacts | null>
  listSystems(grant: AuthorizedHomeownerWorkspace): Promise<readonly HomeownerSystem[]>
  listProjects(grant: AuthorizedHomeownerWorkspace): Promise<readonly HomeownerProject[]>
  listArtifactMetadata(
    grant: AuthorizedHomeownerWorkspace,
  ): Promise<readonly HomeownerArtifactMetadata[]>
  listWarranties(grant: AuthorizedHomeownerWorkspace): Promise<readonly HomeownerWarranty[]>
  listMaintenance(grant: AuthorizedHomeownerWorkspace): Promise<readonly HomeownerMaintenance[]>
}

export interface HomeownerCommandPort {
  createPrivateHomeWorkspace(input: {
    readonly authorization: AuthorizedHomeownerPrincipal
    readonly command: CreateHomeWorkspaceInput
  }): Promise<{
    readonly home: PrivateHomeProfile
    readonly membership: HomeownerMembership
  }>
  createProject(input: {
    readonly grant: AuthorizedHomeownerAction<'project.create'>
    readonly command: CreateHomeownerProjectInput
  }): Promise<HomeownerProject>
  recordInitialIntake(input: {
    readonly grant: AuthorizedHomeownerAction<'intake.record'>
    readonly command: RecordHomeownerIntakeInput
  }): Promise<{
    readonly propertyFacts: HomeownerPropertyFacts
    readonly systems: readonly HomeownerSystem[]
  }>
}

export interface HomeownerPrivateObjectPort {
  storeArtifact(input: {
    readonly grant: AuthorizedHomeownerAction<'artifact.upload'>
    readonly command: StoreHomeownerArtifactInput
    readonly bytes: Uint8Array
  }): Promise<HomeownerArtifactMetadata>
  readExactObject(input: {
    readonly grant: AuthorizedHomeownerWorkspace
    readonly storageObjectRef: string
    readonly expectedSha256: string
    readonly maximumBytes: number
  }): Promise<Uint8Array>
  reserveArtifactUpload?(input: {
    readonly grant: AuthorizedHomeownerAction<'artifact.upload'>
    readonly command: StoreHomeownerArtifactInput
  }): Promise<HomeownerArtifactReserveResult>
  completeArtifactUpload?(input: {
    readonly grant: AuthorizedHomeownerAction<'artifact.upload'>
    readonly artifactRef: string
    readonly commandRef: string
  }): Promise<HomeownerArtifactMetadata>
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
  'These private workspaces do not prove ownership or legal control. The configured adapter authenticates an email ' +
  'and persists private homeowner-recalled data and private files. It exposes no public share or third-party content grant.'
