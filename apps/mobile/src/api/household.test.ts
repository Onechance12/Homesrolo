import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeHouseholdMembers,
  assignableHouseholdMembers,
  acceptHouseholdInvitationBody,
  createHouseholdInvitationBody,
  currentHouseholdMembershipRef,
  canCurrentHouseholdMemberUpdate,
  householdRevisionBody,
  householdRoleBody,
  parseHouseholdAcceptanceEnvelope,
  parseHouseholdInvitationEnvelope,
  parseHouseholdMemberEnvelope,
  parseHouseholdMembers,
  parseHouseholdRosterEnvelope,
} from './household.ts'
import type {
  CreateHouseholdInvitationInput,
  RevokeHouseholdInvitationInput,
} from './model.ts'

const HOME = `hhom_${'h'.repeat(43)}`
const OTHER_HOME = `hhom_${'o'.repeat(43)}`
const CURRENT = `hmbr_${'c'.repeat(43)}`
const PARTNER = `hmbr_${'p'.repeat(43)}`
const VERSION = 'homeowner-household.v1'

function member(overrides: Record<string, unknown> = {}) {
  return {
    recordVersion: 'homeowner-household.v1',
    membershipRef: CURRENT,
    homeRef: HOME,
    displayLabel: 'Chance',
    role: 'workspace_controller',
    state: 'active',
    isCurrentPrincipal: true,
    revision: 1,
    joinedAt: '2026-08-30T12:00:00.000Z',
    revokedAt: undefined,
    ...overrides,
  }
}

test('parses safe exact-home members and identifies only the signed-in membership', () => {
  const envelope = {
    household: {
      recordVersion: 'homeowner-household.v1',
      homeRef: HOME,
      members: [member(), member({
        membershipRef: PARTNER,
        displayLabel: 'Alex',
        role: 'member',
        isCurrentPrincipal: false,
      })],
      invitations: [],
    },
  }
  const members = parseHouseholdMembers(envelope, HOME)
  const roster = parseHouseholdRosterEnvelope(envelope, HOME)
  assert.equal(roster.recordVersion, VERSION)
  assert.equal(roster.members[0]?.recordVersion, VERSION)
  assert.deepEqual(roster.invitations, [])

  assert.equal(currentHouseholdMembershipRef(members), CURRENT)
  assert.deepEqual(activeHouseholdMembers(members).map(item => item.displayLabel), ['Chance', 'Alex'])
  assert.equal('principalRef' in members[0]!, false)
  assert.equal('email' in members[0]!, false)
})

test('parses invitation, acceptance, and member mutation envelopes with exact scope', () => {
  const invitationRef = `hhiv_${'i'.repeat(43)}`
  const invitation = {
    recordVersion: 'homeowner-household.v1',
    invitationRef,
    homeRef: HOME,
    inviteeDisplayLabel: 'Alex',
    desiredRole: 'member',
    status: 'pending',
    expiresAt: '2026-09-06T12:00:00.000Z',
    revision: 1,
    createdAt: '2026-08-30T12:00:00.000Z',
  }
  const parsedInvitation = parseHouseholdInvitationEnvelope({ invitation }, HOME)
  assert.equal(parsedInvitation.recordVersion, VERSION)
  assert.equal(parsedInvitation.status, 'pending')
  const acceptedInvitation = {
    ...invitation,
    status: 'accepted',
    revision: 2,
    acceptedAt: '2026-08-30T13:00:00.000Z',
  }
  const acceptedMember = member({
    membershipRef: PARTNER,
    displayLabel: 'Alex',
    role: 'member',
  })
  assert.equal(parseHouseholdAcceptanceEnvelope({
    member: acceptedMember,
    invitation: acceptedInvitation,
  }, invitationRef).member.membershipRef, PARTNER)
  assert.equal(parseHouseholdMemberEnvelope({ member: acceptedMember }, HOME, PARTNER).displayLabel, 'Alex')
  assert.throws(() => parseHouseholdInvitationEnvelope({ invitation }, OTHER_HOME), /invalid_wire_data/)
})

test('normalizes and bounds every household mutation body', () => {
  const commandRef = `hcmd_${'c'.repeat(43)}`
  const invitationInputWithPrivateData = {
    commandRef,
    inviteeEmail: '  ALEX@Example.com ',
    inviteeDisplayLabel: '  Alex  ',
    desiredRole: 'member' as const,
    expiresInDays: 7,
    principalRef: 'must-not-cross-the-wire',
  } as CreateHouseholdInvitationInput & { readonly principalRef: string }
  assert.deepEqual(createHouseholdInvitationBody(invitationInputWithPrivateData), {
    commandRef,
    inviteeEmail: 'alex@example.com',
    inviteeDisplayLabel: 'Alex',
    desiredRole: 'member',
    expiresInDays: 7,
  })
  assert.deepEqual(acceptHouseholdInvitationBody({ commandRef }), { commandRef })
  const revisionInputWithPrivateData = {
    commandRef, expectedRevision: 2, principalRef: 'must-not-cross-the-wire',
  } as RevokeHouseholdInvitationInput & { readonly principalRef: string }
  assert.deepEqual(householdRevisionBody(revisionInputWithPrivateData), {
    commandRef, expectedRevision: 2,
  })
  assert.deepEqual(householdRoleBody({
    commandRef, expectedRevision: 2, desiredRole: 'viewer',
  }), { commandRef, expectedRevision: 2, desiredRole: 'viewer' })
  assert.equal(createHouseholdInvitationBody({
    commandRef, inviteeEmail: 'bad', inviteeDisplayLabel: 'Alex', desiredRole: 'member', expiresInDays: 7,
  }), null)
})

test('rejects cross-home members and ambiguous current-member identities', () => {
  assert.throws(() => parseHouseholdMembers({
    household: { recordVersion: 'homeowner-household.v1', homeRef: HOME, members: [member({ homeRef: OTHER_HOME })], invitations: [] },
  }, HOME), /invalid_wire_data/)
  assert.throws(() => parseHouseholdMembers({
    household: { recordVersion: 'homeowner-household.v1', homeRef: HOME, members: [member(), member({ membershipRef: PARTNER })], invitations: [] },
  }, HOME), /invalid_wire_data/)
})

test('fails closed when no active current membership is present', () => {
  const members = parseHouseholdMembers({
    household: { recordVersion: 'homeowner-household.v1', homeRef: HOME, members: [member({ state: 'revoked', revokedAt: '2026-08-30T13:00:00.000Z' })], invitations: [] },
  }, HOME)
  assert.equal(currentHouseholdMembershipRef(members), null)
  assert.deepEqual(activeHouseholdMembers(members), [])
  assert.deepEqual(assignableHouseholdMembers(members), [])
  assert.equal(canCurrentHouseholdMemberUpdate(members), false)
})

test('only active controllers and members can update or receive assigned work', () => {
  const controller = parseHouseholdMemberEnvelope({ member: member() }, HOME, CURRENT)
  const partner = parseHouseholdMemberEnvelope({ member: member({
    membershipRef: PARTNER,
    displayLabel: 'Alex',
    role: 'member',
    isCurrentPrincipal: false,
  }) }, HOME, PARTNER)
  const viewerRef = `hmbr_${'v'.repeat(43)}`
  const viewer = parseHouseholdMemberEnvelope({ member: member({
    membershipRef: viewerRef,
    displayLabel: 'Sam',
    role: 'viewer',
    isCurrentPrincipal: false,
  }) }, HOME, viewerRef)
  const revokedRef = `hmbr_${'r'.repeat(43)}`
  const revoked = parseHouseholdMemberEnvelope({ member: member({
    membershipRef: revokedRef,
    displayLabel: 'Pat',
    role: 'member',
    state: 'revoked',
    isCurrentPrincipal: false,
    revokedAt: '2026-08-30T13:00:00.000Z',
  }) }, HOME, revokedRef)

  assert.deepEqual(
    assignableHouseholdMembers([controller, partner, viewer, revoked]).map(item => item.displayLabel),
    ['Chance', 'Alex'],
  )
  assert.equal(canCurrentHouseholdMemberUpdate([controller, partner, viewer, revoked]), true)
  assert.equal(canCurrentHouseholdMemberUpdate([{ ...viewer, isCurrentPrincipal: true }]), false)
})
