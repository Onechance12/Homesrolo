import { createHash, createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  homeownerMembershipSchema,
  homeownerUtcInstantSchema,
} from './homeowner-runtime.v1.ts'

/**
 * Private household collaboration contracts.
 *
 * A household member is an existing Home Record membership. This module does
 * not create a parallel family account, expose account identity, or make a
 * professional invitation into home access. Email exists only at the trusted
 * identity/invitation boundary and never appears in a response schema.
 */
export const HOMEOWNER_HOUSEHOLD_VERSION = 'homeowner-household.v1' as const

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

export const householdDisplayLabelSchema = z.string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’()&-]*$/u,
    'must be a short human-readable label',
  )

export const householdRoleSchema = z.enum([
  'workspace_controller',
  'member',
  'viewer',
])

export const householdInvitableRoleSchema = z.enum(['member', 'viewer'])
export const householdAssignableRoleSchema = z.enum(['workspace_controller', 'member'])

export const householdInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'expired',
])

/** Safe roster row. It intentionally has no principal or email identity. */
export const householdMemberSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_HOUSEHOLD_VERSION),
  membershipRef: opaqueRef('hmbr'),
  homeRef: opaqueRef('hhom'),
  displayLabel: householdDisplayLabelSchema,
  role: householdRoleSchema,
  state: z.enum(['active', 'revoked']),
  isCurrentPrincipal: z.boolean(),
  revision: z.number().int().min(1),
  joinedAt: homeownerUtcInstantSchema,
  revokedAt: homeownerUtcInstantSchema.optional(),
}).strict().superRefine((member, context) => {
  if ((member.state === 'revoked') !== (member.revokedAt !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['revokedAt'],
      message: 'revokedAt belongs exactly on revoked members',
    })
  }
})

/** Safe invitation row. The target email hash and inviter identity stay private. */
export const householdInvitationSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_HOUSEHOLD_VERSION),
  invitationRef: opaqueRef('hhiv'),
  homeRef: opaqueRef('hhom'),
  inviteeDisplayLabel: householdDisplayLabelSchema,
  desiredRole: householdInvitableRoleSchema,
  status: householdInvitationStatusSchema,
  expiresAt: homeownerUtcInstantSchema,
  revision: z.number().int().min(1),
  createdAt: homeownerUtcInstantSchema,
  acceptedAt: homeownerUtcInstantSchema.optional(),
  revokedAt: homeownerUtcInstantSchema.optional(),
}).strict().superRefine((invitation, context) => {
  if (invitation.expiresAt <= invitation.createdAt) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiry must follow creation' })
  }
  if ((invitation.status === 'accepted') !== (invitation.acceptedAt !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['acceptedAt'],
      message: 'acceptedAt belongs exactly on accepted invitations',
    })
  }
  if ((invitation.status === 'revoked') !== (invitation.revokedAt !== undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['revokedAt'],
      message: 'revokedAt belongs exactly on revoked invitations',
    })
  }
})

export const householdRosterSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_HOUSEHOLD_VERSION),
  homeRef: opaqueRef('hhom'),
  members: z.array(householdMemberSchema).max(24),
  // Live invitations and recent history have independent bounds. History may
  // never crowd an actionable invitation out of the access-management UI.
  invitations: z.array(householdInvitationSchema).max(48),
}).strict().superRefine((roster, context) => {
  const pendingCount = roster.invitations.filter(invitation => invitation.status === 'pending').length
  if (pendingCount > 24 || roster.invitations.length - pendingCount > 24) {
    context.addIssue({
      code: 'custom', path: ['invitations'],
      message: 'live invitations and recent history are each bounded to 24',
    })
  }
  if (new Set(roster.members.map(member => member.membershipRef)).size !== roster.members.length) {
    context.addIssue({ code: 'custom', path: ['members'], message: 'members must be unique' })
  }
  if (new Set(roster.invitations.map(invitation => invitation.invitationRef)).size
    !== roster.invitations.length) {
    context.addIssue({ code: 'custom', path: ['invitations'], message: 'invitations must be unique' })
  }
  if (roster.members.some(member => member.homeRef !== roster.homeRef)
    || roster.invitations.some(invitation => invitation.homeRef !== roster.homeRef)) {
    context.addIssue({ code: 'custom', path: ['homeRef'], message: 'the roster must belong to one home' })
  }
  if (roster.members.filter(member => member.isCurrentPrincipal).length !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['members'],
      message: 'an authorized roster identifies exactly one current principal',
    })
  }
})

const emailInputSchema = z.string().trim().email().max(254)
  .transform(value => value.toLocaleLowerCase('en-US'))

export const createHouseholdInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  inviteeEmail: emailInputSchema,
  inviteeDisplayLabel: householdDisplayLabelSchema,
  desiredRole: householdInvitableRoleSchema,
  expiresInDays: z.number().int().min(1).max(14).default(7),
}).strict()

export const acceptHouseholdInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  invitationRef: opaqueRef('hhiv'),
}).strict()

export const revokeHouseholdInvitationInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  invitationRef: opaqueRef('hhiv'),
  expectedRevision: z.number().int().min(1),
}).strict()

export const removeHouseholdMemberInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  membershipRef: opaqueRef('hmbr'),
  expectedRevision: z.number().int().min(1),
}).strict()

export const setHouseholdMemberRoleInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  membershipRef: opaqueRef('hmbr'),
  expectedRevision: z.number().int().min(1),
  desiredRole: householdRoleSchema,
}).strict()

export const householdInvitationAcceptanceSchema = z.object({
  member: householdMemberSchema,
  invitation: householdInvitationSchema,
}).strict()

export type HouseholdMember = z.infer<typeof householdMemberSchema>
export type HouseholdInvitation = z.infer<typeof householdInvitationSchema>
export type HouseholdRoster = z.infer<typeof householdRosterSchema>
export type CreateHouseholdInvitationInput = z.infer<typeof createHouseholdInvitationInputSchema>
export type AcceptHouseholdInvitationInput = z.infer<typeof acceptHouseholdInvitationInputSchema>
export type RevokeHouseholdInvitationInput = z.infer<typeof revokeHouseholdInvitationInputSchema>
export type RemoveHouseholdMemberInput = z.infer<typeof removeHouseholdMemberInputSchema>
export type SetHouseholdMemberRoleInput = z.infer<typeof setHouseholdMemberRoleInputSchema>

/** Internal identity row. It may never be serialized through a response schema. */
const householdIdentitySchema = z.object({
  principalRef: opaqueRef('hprn'),
  emailCanonical: emailInputSchema,
  status: z.enum(['active', 'disabled', 'deleted']),
  emailVerified: z.boolean(),
}).strict()

/** Internal membership snapshot used only to derive controller authority. */
export const householdAuthorityMembershipSchema = homeownerMembershipSchema.extend({
  displayLabel: householdDisplayLabelSchema,
}).strict()

export interface AuthorizedHouseholdMember {
  readonly principalRef: string
  readonly homeRef: string
  readonly membershipRef: string
  readonly membershipRevision: number
  readonly role: z.infer<typeof householdRoleSchema>
  readonly authorizedAt: string
}

export interface AuthorizedHouseholdController extends Omit<AuthorizedHouseholdMember, 'role'> {
  readonly role: 'workspace_controller'
}

export function authorizeHouseholdMember(input: {
  readonly identity: unknown
  readonly membership: unknown
  readonly requestedHomeRef: string
  readonly authorizedAt: string
}): AuthorizedHouseholdMember | null {
  const identity = householdIdentitySchema.safeParse(input.identity)
  const membership = householdAuthorityMembershipSchema.safeParse(input.membership)
  const homeRef = opaqueRef('hhom').safeParse(input.requestedHomeRef)
  const authorizedAt = homeownerUtcInstantSchema.safeParse(input.authorizedAt)
  if (!identity.success || !membership.success || !homeRef.success || !authorizedAt.success) {
    return null
  }
  if (identity.data.status !== 'active' || !identity.data.emailVerified
    || membership.data.state !== 'active'
    || membership.data.principalRef !== identity.data.principalRef
    || membership.data.homeRef !== homeRef.data) return null
  return {
    principalRef: identity.data.principalRef,
    homeRef: homeRef.data,
    membershipRef: membership.data.membershipRef,
    membershipRevision: membership.data.revision,
    role: membership.data.role,
    authorizedAt: authorizedAt.data,
  }
}

export function authorizeHouseholdController(input: {
  readonly identity: unknown
  readonly membership: unknown
  readonly requestedHomeRef: string
  readonly authorizedAt: string
}): AuthorizedHouseholdController | null {
  const member = authorizeHouseholdMember(input)
  if (!member || member.role !== 'workspace_controller') return null
  return { ...member, role: 'workspace_controller' }
}

export type HouseholdServiceErrorCode =
  | 'signed_out'
  | 'invalid_request'
  | 'not_found'
  | 'conflict'
  | 'unavailable'

export class HouseholdServiceError extends Error {
  readonly code: HouseholdServiceErrorCode

  constructor(code: HouseholdServiceErrorCode) {
    super(code)
    this.name = 'HouseholdServiceError'
    this.code = code
  }
}

interface HouseholdIdentity {
  readonly principalRef: string
  readonly emailCanonical: string
  readonly status: 'active' | 'disabled' | 'deleted'
  readonly emailVerified: boolean
}

export interface HomeownerHouseholdIdentityPort {
  resolveHouseholdIdentity(sessionHandle: string): Promise<HouseholdIdentity | null>
}

export interface HomeownerHouseholdPort {
  readAuthorityMembership(
    principalRef: string,
    homeRef: string,
  ): Promise<z.infer<typeof householdAuthorityMembershipSchema> | null>
  listHousehold(grant: AuthorizedHouseholdMember): Promise<HouseholdRoster>
  createHouseholdInvitation(input: {
    readonly grant: AuthorizedHouseholdController
    readonly invitationRef: string
    readonly inviteeEmailHash: string
    readonly commandDigest: string
    readonly command: Omit<CreateHouseholdInvitationInput, 'inviteeEmail' | 'expiresInDays'> & {
      readonly expiresAt: string
      readonly requestedAt: string
    }
  }): Promise<HouseholdInvitation>
  acceptHouseholdInvitation(input: {
    readonly principalRef: string
    readonly emailCanonical: string
    readonly inviteeEmailHash: string
    readonly membershipRef: string
    readonly commandDigest: string
    readonly command: AcceptHouseholdInvitationInput & { readonly requestedAt: string }
  }): Promise<{ readonly member: HouseholdMember; readonly invitation: HouseholdInvitation }>
  revokeHouseholdInvitation(input: {
    readonly grant: AuthorizedHouseholdController
    readonly commandDigest: string
    readonly command: RevokeHouseholdInvitationInput & { readonly requestedAt: string }
  }): Promise<HouseholdInvitation>
  removeHouseholdMember(input: {
    readonly grant: AuthorizedHouseholdController
    readonly commandDigest: string
    readonly command: RemoveHouseholdMemberInput & { readonly requestedAt: string }
  }): Promise<HouseholdMember>
  setHouseholdMemberRole(input: {
    readonly grant: AuthorizedHouseholdController
    readonly commandDigest: string
    readonly command: SetHouseholdMemberRoleInput & { readonly requestedAt: string }
  }): Promise<HouseholdMember>
}

export interface HomeownerHouseholdServiceOptions {
  readonly enabled: boolean
  readonly identity: HomeownerHouseholdIdentityPort
  readonly households: HomeownerHouseholdPort
  readonly now: () => string
  /** Server-only HMAC key. Never send this or a derived email hash to a client. */
  readonly emailHashKey: string
  readonly newRef?: (prefix: 'hhiv' | 'hmbr') => string
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key =>
    `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

export function householdCommandDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function defaultRef(prefix: 'hhiv' | 'hmbr'): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

/**
 * Coordination service. Persistence implementations still recheck every grant,
 * invitation state, email binding, revision, and last-controller invariant in
 * the same database transaction as the mutation.
 */
export class HomeownerHouseholdService {
  readonly #enabled: boolean
  readonly #identity: HomeownerHouseholdIdentityPort
  readonly #households: HomeownerHouseholdPort
  readonly #now: () => string
  readonly #emailHashKey: string
  readonly #newRef: (prefix: 'hhiv' | 'hmbr') => string

  constructor(options: HomeownerHouseholdServiceOptions) {
    if (options.emailHashKey.length < 32) {
      throw new Error('Household email hash key must contain at least 32 characters')
    }
    this.#enabled = options.enabled
    this.#identity = options.identity
    this.#households = options.households
    this.#now = options.now
    this.#emailHashKey = options.emailHashKey
    this.#newRef = options.newRef ?? defaultRef
  }

  async #identityFor(sessionHandle: string): Promise<z.infer<typeof householdIdentitySchema>> {
    if (!this.#enabled) throw new HouseholdServiceError('unavailable')
    if (!sessionHandle) throw new HouseholdServiceError('signed_out')
    const identity = householdIdentitySchema.safeParse(
      await this.#identity.resolveHouseholdIdentity(sessionHandle),
    )
    if (!identity.success || identity.data.status !== 'active' || !identity.data.emailVerified) {
      throw new HouseholdServiceError('signed_out')
    }
    return identity.data
  }

  async #controller(sessionHandle: string, requestedHomeRef: string) {
    const resolved = await this.#member(sessionHandle, requestedHomeRef)
    const grant = authorizeHouseholdController({
      identity: resolved.identity,
      membership: resolved.membership,
      requestedHomeRef: resolved.grant.homeRef,
      authorizedAt: resolved.now,
    })
    if (!grant) throw new HouseholdServiceError('not_found')
    return { identity: resolved.identity, grant, now: resolved.now }
  }

  async #member(sessionHandle: string, requestedHomeRef: string) {
    const identity = await this.#identityFor(sessionHandle)
    const parsedHomeRef = opaqueRef('hhom').safeParse(requestedHomeRef)
    if (!parsedHomeRef.success) throw new HouseholdServiceError('invalid_request')
    const now = homeownerUtcInstantSchema.safeParse(this.#now())
    if (!now.success) throw new HouseholdServiceError('unavailable')
    const membership = await this.#households.readAuthorityMembership(
      identity.principalRef,
      parsedHomeRef.data,
    )
    if (!membership) throw new HouseholdServiceError('not_found')
    const grant = authorizeHouseholdMember({
      identity,
      membership,
      requestedHomeRef: parsedHomeRef.data,
      authorizedAt: now.data,
    })
    if (!grant) throw new HouseholdServiceError('not_found')
    return { identity, membership, grant, now: now.data }
  }

  #emailHash(emailCanonical: string): string {
    return createHmac('sha256', this.#emailHashKey).update(emailCanonical).digest('hex')
  }

  async listHousehold(sessionHandle: string, homeRef: string): Promise<HouseholdRoster> {
    const { grant } = await this.#member(sessionHandle, homeRef)
    const roster = householdRosterSchema.parse(await this.#households.listHousehold(grant))
    if (roster.homeRef !== grant.homeRef) throw new HouseholdServiceError('unavailable')
    return roster
  }

  async createInvitation(
    sessionHandle: string,
    homeRef: string,
    input: unknown,
  ): Promise<HouseholdInvitation> {
    const parsed = createHouseholdInvitationInputSchema.safeParse(input)
    if (!parsed.success) throw new HouseholdServiceError('invalid_request')
    const { identity, grant, now } = await this.#controller(sessionHandle, homeRef)
    if (parsed.data.inviteeEmail === identity.emailCanonical) {
      throw new HouseholdServiceError('conflict')
    }
    const expiresAt = new Date(
      new Date(now).getTime() + parsed.data.expiresInDays * 86_400_000,
    ).toISOString()
    const intent = {
      commandRef: parsed.data.commandRef,
      homeRef: grant.homeRef,
      inviteeEmailHash: this.#emailHash(parsed.data.inviteeEmail),
      inviteeDisplayLabel: parsed.data.inviteeDisplayLabel,
      desiredRole: parsed.data.desiredRole,
      expiresInDays: parsed.data.expiresInDays,
    }
    const invitation = householdInvitationSchema.parse(await this.#households.createHouseholdInvitation({
      grant,
      invitationRef: this.#newRef('hhiv'),
      inviteeEmailHash: intent.inviteeEmailHash,
      commandDigest: householdCommandDigest(intent),
      command: {
        commandRef: parsed.data.commandRef,
        inviteeDisplayLabel: parsed.data.inviteeDisplayLabel,
        desiredRole: parsed.data.desiredRole,
        expiresAt,
        requestedAt: now,
      },
    }))
    if (invitation.homeRef !== grant.homeRef
      || invitation.inviteeDisplayLabel !== parsed.data.inviteeDisplayLabel
      || invitation.desiredRole !== parsed.data.desiredRole) {
      throw new HouseholdServiceError('unavailable')
    }
    return invitation
  }

  async acceptInvitation(sessionHandle: string, input: unknown) {
    const parsed = acceptHouseholdInvitationInputSchema.safeParse(input)
    if (!parsed.success) throw new HouseholdServiceError('invalid_request')
    const identity = await this.#identityFor(sessionHandle)
    const now = homeownerUtcInstantSchema.safeParse(this.#now())
    if (!now.success) throw new HouseholdServiceError('unavailable')
    const intent = {
      ...parsed.data,
      inviteeEmailHash: this.#emailHash(identity.emailCanonical),
    }
    const accepted = householdInvitationAcceptanceSchema.parse(
      await this.#households.acceptHouseholdInvitation({
        principalRef: identity.principalRef,
        emailCanonical: identity.emailCanonical,
        inviteeEmailHash: intent.inviteeEmailHash,
        membershipRef: this.#newRef('hmbr'),
        commandDigest: householdCommandDigest(intent),
        command: { ...parsed.data, requestedAt: now.data },
      }),
    )
    if (accepted.invitation.status !== 'accepted'
      || accepted.member.state !== 'active'
      || !accepted.member.isCurrentPrincipal
      || accepted.member.homeRef !== accepted.invitation.homeRef
      || accepted.member.role !== accepted.invitation.desiredRole) {
      throw new HouseholdServiceError('unavailable')
    }
    return accepted
  }

  async revokeInvitation(
    sessionHandle: string,
    homeRef: string,
    input: unknown,
  ): Promise<HouseholdInvitation> {
    const parsed = revokeHouseholdInvitationInputSchema.safeParse(input)
    if (!parsed.success) throw new HouseholdServiceError('invalid_request')
    const { grant, now } = await this.#controller(sessionHandle, homeRef)
    const command = { ...parsed.data, requestedAt: now }
    const invitation = householdInvitationSchema.parse(await this.#households.revokeHouseholdInvitation({
      grant,
      commandDigest: householdCommandDigest({ ...parsed.data, homeRef: grant.homeRef }),
      command,
    }))
    if (invitation.homeRef !== grant.homeRef || invitation.status !== 'revoked') {
      throw new HouseholdServiceError('unavailable')
    }
    return invitation
  }

  async removeMember(
    sessionHandle: string,
    homeRef: string,
    input: unknown,
  ): Promise<HouseholdMember> {
    const parsed = removeHouseholdMemberInputSchema.safeParse(input)
    if (!parsed.success) throw new HouseholdServiceError('invalid_request')
    const { grant, now } = await this.#controller(sessionHandle, homeRef)
    const command = { ...parsed.data, requestedAt: now }
    const member = householdMemberSchema.parse(await this.#households.removeHouseholdMember({
      grant,
      commandDigest: householdCommandDigest({ ...parsed.data, homeRef: grant.homeRef }),
      command,
    }))
    if (member.homeRef !== grant.homeRef || member.state !== 'revoked') {
      throw new HouseholdServiceError('unavailable')
    }
    return member
  }

  async setMemberRole(
    sessionHandle: string,
    homeRef: string,
    input: unknown,
  ): Promise<HouseholdMember> {
    const parsed = setHouseholdMemberRoleInputSchema.safeParse(input)
    if (!parsed.success) throw new HouseholdServiceError('invalid_request')
    const { grant, now } = await this.#controller(sessionHandle, homeRef)
    const command = { ...parsed.data, requestedAt: now }
    const member = householdMemberSchema.parse(await this.#households.setHouseholdMemberRole({
      grant,
      commandDigest: householdCommandDigest({ ...parsed.data, homeRef: grant.homeRef }),
      command,
    }))
    if (member.homeRef !== grant.homeRef || member.role !== parsed.data.desiredRole) {
      throw new HouseholdServiceError('unavailable')
    }
    return member
  }
}

export const HOUSEHOLD_PRIVACY_RULE =
  'Household invitations grant access to one exact private Home Record after the verified signed-in email accepts. ' +
  'Roster responses expose display labels and membership references, never email addresses, email hashes, invitation secrets, or principal references.'
