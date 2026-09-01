import type {
  AcceptHouseholdInvitationInput,
  CreateHouseholdInvitationInput,
  HouseholdInvitation,
  HouseholdInvitationAcceptance,
  HouseholdInvitationStatus,
  HouseholdInvitableRole,
  HouseholdMember,
  HouseholdMemberRole,
  HouseholdMemberState,
  HouseholdRoster,
  RemoveHouseholdMemberInput,
  RevokeHouseholdInvitationInput,
  SetHouseholdMemberRoleInput,
} from './model.ts'
import { isHomeRef } from './protocol.ts'

const HOUSEHOLD_VERSION = 'homeowner-household.v1'
const MEMBERSHIP_REF = /^hmbr_[A-Za-z0-9_-]{43}$/
const INVITATION_REF = /^hhiv_[A-Za-z0-9_-]{43}$/
const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DISPLAY_LABEL = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’()&-]*$/u
const ROLES = new Set<HouseholdMemberRole>(['workspace_controller', 'member', 'viewer'])
const INVITABLE_ROLES = new Set<HouseholdInvitableRole>(['member', 'viewer'])
const MEMBER_STATES = new Set<HouseholdMemberState>(['active', 'revoked'])
const INVITATION_STATES = new Set<HouseholdInvitationStatus>([
  'pending', 'accepted', 'revoked', 'expired',
])

export function parseHouseholdRosterEnvelope(
  value: unknown,
  expectedHomeRef: string,
): HouseholdRoster {
  const envelope = exactObject(value, ['household'])
  const roster = envelope ? exactObject(envelope.household, [
    'recordVersion', 'homeRef', 'members', 'invitations',
  ]) : null
  if (!isHomeRef(expectedHomeRef) || !roster
    || roster.recordVersion !== HOUSEHOLD_VERSION || roster.homeRef !== expectedHomeRef
    || !Array.isArray(roster.members) || !Array.isArray(roster.invitations)) {
    throw new Error('invalid_wire_data')
  }
  const members = roster.members.map(parseHouseholdMember)
  const invitations = roster.invitations.map(parseHouseholdInvitation)
  if (members.some(member => member.homeRef !== expectedHomeRef)
    || invitations.some(invitation => invitation.homeRef !== expectedHomeRef)
    || new Set(members.map(member => member.membershipRef)).size !== members.length
    || new Set(invitations.map(invitation => invitation.invitationRef)).size !== invitations.length
    || members.filter(member => member.isCurrentPrincipal).length !== 1) {
    throw new Error('invalid_wire_data')
  }
  return {
    recordVersion: HOUSEHOLD_VERSION,
    homeRef: expectedHomeRef,
    members,
    invitations,
  }
}

export function parseHouseholdInvitationEnvelope(
  value: unknown,
  expectedHomeRef: string,
  expectedInvitationRef?: string,
): HouseholdInvitation {
  const envelope = exactObject(value, ['invitation'])
  if (!envelope) throw new Error('invalid_wire_data')
  const invitation = parseHouseholdInvitation(envelope.invitation)
  if (invitation.homeRef !== expectedHomeRef
    || (expectedInvitationRef !== undefined && invitation.invitationRef !== expectedInvitationRef)) {
    throw new Error('invalid_wire_data')
  }
  return invitation
}

export function parseHouseholdAcceptanceEnvelope(
  value: unknown,
  expectedInvitationRef: string,
): HouseholdInvitationAcceptance {
  const envelope = exactObject(value, ['member', 'invitation'])
  if (!envelope) throw new Error('invalid_wire_data')
  const member = parseHouseholdMember(envelope.member)
  const invitation = parseHouseholdInvitation(envelope.invitation)
  if (invitation.invitationRef !== expectedInvitationRef
    || invitation.homeRef !== member.homeRef || invitation.status !== 'accepted'
    || member.state !== 'active' || !member.isCurrentPrincipal) {
    throw new Error('invalid_wire_data')
  }
  return { member, invitation }
}

export function parseHouseholdMemberEnvelope(
  value: unknown,
  expectedHomeRef: string,
  expectedMembershipRef: string,
): HouseholdMember {
  const envelope = exactObject(value, ['member'])
  if (!envelope) throw new Error('invalid_wire_data')
  const member = parseHouseholdMember(envelope.member)
  if (member.homeRef !== expectedHomeRef || member.membershipRef !== expectedMembershipRef) {
    throw new Error('invalid_wire_data')
  }
  return member
}

/** Compatibility projection for consumers that only need assignment labels. */
export function parseHouseholdMembers(value: unknown, expectedHomeRef: string): readonly HouseholdMember[] {
  return parseHouseholdRosterEnvelope(value, expectedHomeRef).members
}

export function currentHouseholdMembershipRef(
  members: readonly HouseholdMember[],
): string | null {
  return members.find(member => member.state === 'active' && member.isCurrentPrincipal)?.membershipRef ?? null
}

export function activeHouseholdMembers(
  members: readonly HouseholdMember[],
): readonly HouseholdMember[] {
  return members.filter(member => member.state === 'active')
}

export function assignableHouseholdMembers(
  members: readonly HouseholdMember[],
): readonly HouseholdMember[] {
  return members.filter(member => member.state === 'active'
    && (member.role === 'workspace_controller' || member.role === 'member'))
}

export function canCurrentHouseholdMemberUpdate(
  members: readonly HouseholdMember[],
): boolean {
  const current = members.find(member => member.state === 'active' && member.isCurrentPrincipal)
  return current?.role === 'workspace_controller' || current?.role === 'member'
}

export function isCurrentHouseholdController(
  members: readonly HouseholdMember[],
): boolean {
  const current = members.find(member => member.state === 'active' && member.isCurrentPrincipal)
  return current?.role === 'workspace_controller'
}

export function createHouseholdInvitationBody(
  input: CreateHouseholdInvitationInput,
): CreateHouseholdInvitationInput | null {
  const inviteeEmail = input.inviteeEmail.trim().toLocaleLowerCase('en-US')
  const inviteeDisplayLabel = input.inviteeDisplayLabel.trim()
  if (!COMMAND_REF.test(input.commandRef) || inviteeEmail.length > 254 || !EMAIL.test(inviteeEmail)
    || !validDisplayLabel(inviteeDisplayLabel) || !INVITABLE_ROLES.has(input.desiredRole)
    || !Number.isSafeInteger(input.expiresInDays)
    || input.expiresInDays < 1 || input.expiresInDays > 14) return null
  return {
    commandRef: input.commandRef,
    inviteeEmail,
    inviteeDisplayLabel,
    desiredRole: input.desiredRole,
    expiresInDays: input.expiresInDays,
  }
}

export function acceptHouseholdInvitationBody(
  input: AcceptHouseholdInvitationInput,
): AcceptHouseholdInvitationInput | null {
  return COMMAND_REF.test(input.commandRef) ? { commandRef: input.commandRef } : null
}

export function householdRevisionBody(
  input: RevokeHouseholdInvitationInput | RemoveHouseholdMemberInput,
): RevokeHouseholdInvitationInput | null {
  return COMMAND_REF.test(input.commandRef) && validRevision(input.expectedRevision)
    ? { commandRef: input.commandRef, expectedRevision: input.expectedRevision }
    : null
}

export function householdRoleBody(
  input: SetHouseholdMemberRoleInput,
): SetHouseholdMemberRoleInput | null {
  return householdRevisionBody(input) && ROLES.has(input.desiredRole) ? {
    commandRef: input.commandRef,
    expectedRevision: input.expectedRevision,
    desiredRole: input.desiredRole,
  } : null
}

export function isHouseholdInvitationRef(value: unknown): value is string {
  return typeof value === 'string' && INVITATION_REF.test(value)
}

export function isHouseholdMembershipRef(value: unknown): value is string {
  return typeof value === 'string' && MEMBERSHIP_REF.test(value)
}

function parseHouseholdMember(value: unknown): HouseholdMember {
  const source = exactObject(value, [
    'recordVersion', 'membershipRef', 'homeRef', 'displayLabel', 'role', 'state',
    'isCurrentPrincipal', 'revision', 'joinedAt',
  ], ['revokedAt'])
  if (!source || source.recordVersion !== HOUSEHOLD_VERSION
    || !isHouseholdMembershipRef(source.membershipRef)
    || typeof source.homeRef !== 'string' || !isHomeRef(source.homeRef)
    || typeof source.displayLabel !== 'string' || !validDisplayLabel(source.displayLabel)
    || typeof source.role !== 'string' || !ROLES.has(source.role as HouseholdMemberRole)
    || typeof source.state !== 'string' || !MEMBER_STATES.has(source.state as HouseholdMemberState)
    || typeof source.isCurrentPrincipal !== 'boolean' || !validRevision(source.revision)
    || !validInstant(source.joinedAt)
    || (source.revokedAt !== undefined && !validInstant(source.revokedAt))
    || ((source.state === 'revoked') !== (source.revokedAt !== undefined))) {
    throw new Error('invalid_wire_data')
  }
  return {
    recordVersion: HOUSEHOLD_VERSION,
    membershipRef: source.membershipRef,
    homeRef: source.homeRef,
    displayLabel: source.displayLabel.trim(),
    role: source.role as HouseholdMemberRole,
    state: source.state as HouseholdMemberState,
    isCurrentPrincipal: source.isCurrentPrincipal,
    revision: Number(source.revision),
    joinedAt: source.joinedAt,
    revokedAt: typeof source.revokedAt === 'string' ? source.revokedAt : null,
  }
}

function parseHouseholdInvitation(value: unknown): HouseholdInvitation {
  const source = exactObject(value, [
    'recordVersion', 'invitationRef', 'homeRef', 'inviteeDisplayLabel', 'desiredRole',
    'status', 'expiresAt', 'revision', 'createdAt',
  ], ['acceptedAt', 'revokedAt'])
  if (!source || source.recordVersion !== HOUSEHOLD_VERSION
    || !isHouseholdInvitationRef(source.invitationRef)
    || typeof source.homeRef !== 'string' || !isHomeRef(source.homeRef)
    || typeof source.inviteeDisplayLabel !== 'string' || !validDisplayLabel(source.inviteeDisplayLabel)
    || typeof source.desiredRole !== 'string'
    || !INVITABLE_ROLES.has(source.desiredRole as HouseholdInvitableRole)
    || typeof source.status !== 'string'
    || !INVITATION_STATES.has(source.status as HouseholdInvitationStatus)
    || !validInstant(source.expiresAt) || !validInstant(source.createdAt)
    || !validRevision(source.revision)
    || (source.acceptedAt !== undefined && !validInstant(source.acceptedAt))
    || (source.revokedAt !== undefined && !validInstant(source.revokedAt))
    || ((source.status === 'accepted') !== (source.acceptedAt !== undefined))
    || ((source.status === 'revoked') !== (source.revokedAt !== undefined))) {
    throw new Error('invalid_wire_data')
  }
  return {
    recordVersion: HOUSEHOLD_VERSION,
    invitationRef: source.invitationRef,
    homeRef: source.homeRef,
    inviteeDisplayLabel: source.inviteeDisplayLabel.trim(),
    desiredRole: source.desiredRole as HouseholdInvitableRole,
    status: source.status as HouseholdInvitationStatus,
    expiresAt: source.expiresAt,
    revision: Number(source.revision),
    createdAt: source.createdAt,
    acceptedAt: typeof source.acceptedAt === 'string' ? source.acceptedAt : null,
    revokedAt: typeof source.revokedAt === 'string' ? source.revokedAt : null,
  }
}

function exactObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const keys = Object.keys(source)
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.hasOwn(source, key)) && keys.every(key => allowed.has(key))
    ? source : null
}

function validDisplayLabel(value: string): boolean {
  const clean = value.trim()
  return clean.length >= 1 && clean.length <= 60 && DISPLAY_LABEL.test(clean)
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function validRevision(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1
}
