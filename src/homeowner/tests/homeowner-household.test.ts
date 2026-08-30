import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  HOMEOWNER_HOUSEHOLD_VERSION,
  HomeownerHouseholdService,
  HouseholdServiceError,
  acceptHouseholdInvitationInputSchema,
  authorizeHouseholdController,
  authorizeHouseholdMember,
  createHouseholdInvitationInputSchema,
  householdCommandDigest,
  householdDisplayLabelSchema,
  householdInvitationSchema,
  householdMemberSchema,
  householdRosterSchema,
  setHouseholdMemberRoleInputSchema,
  type AuthorizedHouseholdController,
  type AuthorizedHouseholdMember,
  type HomeownerHouseholdPort,
  type HouseholdInvitation,
  type HouseholdMember,
  type HouseholdRoster,
} from '../homeowner-household.v1.ts'

const body = (character: string) => character.repeat(43)
const now = '2026-08-30T18:00:00.000Z'
const later = '2026-09-06T18:00:00.000Z'
const homeRef = `hhom_${body('h')}`
const controllerPrincipalRef = `hprn_${body('c')}`
const memberPrincipalRef = `hprn_${body('m')}`
const controllerMembershipRef = `hmbr_${body('a')}`
const memberMembershipRef = `hmbr_${body('b')}`

const authorityMembership = (role: 'workspace_controller' | 'member' | 'viewer') => ({
  membershipRef: role === 'workspace_controller' ? controllerMembershipRef : memberMembershipRef,
  principalRef: role === 'workspace_controller' ? controllerPrincipalRef : memberPrincipalRef,
  homeRef,
  role,
  basis: role === 'workspace_controller' ? 'self_created_workspace' as const : 'accepted_invitation' as const,
  state: 'active' as const,
  relationshipLabel: role === 'workspace_controller'
    ? 'claimed_unverified' as const
    : 'invited_participant' as const,
  displayLabel: role === 'workspace_controller' ? 'Chance' : 'Taylor',
  revision: 1,
  createdAt: now,
})

const publicMember = (role: 'workspace_controller' | 'member', current: boolean): HouseholdMember => ({
  recordVersion: HOMEOWNER_HOUSEHOLD_VERSION,
  membershipRef: role === 'workspace_controller' ? controllerMembershipRef : memberMembershipRef,
  homeRef,
  displayLabel: role === 'workspace_controller' ? 'Chance' : 'Taylor',
  role,
  state: 'active',
  isCurrentPrincipal: current,
  revision: 1,
  joinedAt: now,
})

const invitation: HouseholdInvitation = {
  recordVersion: HOMEOWNER_HOUSEHOLD_VERSION,
  invitationRef: `hhiv_${body('i')}`,
  homeRef,
  inviteeDisplayLabel: 'Taylor',
  desiredRole: 'member',
  status: 'pending',
  expiresAt: later,
  revision: 1,
  createdAt: now,
}

test('public household rows are strict and never expose private identity material', () => {
  assert.equal(householdMemberSchema.safeParse(publicMember('member', true)).success, true)
  assert.equal(householdInvitationSchema.safeParse(invitation).success, true)
  const sensitiveFields = [
    'principalRef', 'email', 'emailCanonical', 'emailHash', 'inviteeEmailHash',
    'token', 'secret', 'invitedByPrincipalRef',
  ]
  for (const field of sensitiveFields) {
    assert.equal(householdMemberSchema.safeParse({
      ...publicMember('member', true),
      [field]: 'private',
    }).success, false, `member ${field}`)
    assert.equal(householdInvitationSchema.safeParse({
      ...invitation,
      [field]: 'private',
    }).success, false, `invitation ${field}`)
  }
  assert.equal(householdDisplayLabelSchema.safeParse('Taylor Pearson').success, true)
  assert.equal(householdDisplayLabelSchema.safeParse('taylor@example.com').success, false)
  assert.equal(householdDisplayLabelSchema.safeParse('https://example.com').success, false)
})

test('invitation commands canonicalize email and reject browser authority fields', () => {
  const parsed = createHouseholdInvitationInputSchema.parse({
    commandRef: `hcmd_${body('i')}`,
    inviteeEmail: '  Taylor@Example.COM ',
    inviteeDisplayLabel: 'Taylor',
    desiredRole: 'member',
  })
  assert.equal(parsed.inviteeEmail, 'taylor@example.com')
  assert.equal(parsed.expiresInDays, 7)
  for (const field of ['homeRef', 'principalRef', 'membershipRef', 'role', 'token']) {
    assert.equal(createHouseholdInvitationInputSchema.safeParse({
      ...parsed,
      [field]: 'browser-authority',
    }).success, false, field)
  }
  assert.equal(acceptHouseholdInvitationInputSchema.safeParse({
    commandRef: `hcmd_${body('a')}`,
    invitationRef: invitation.invitationRef,
    email: 'taylor@example.com',
  }).success, false)
  assert.equal(setHouseholdMemberRoleInputSchema.safeParse({
    commandRef: `hcmd_${body('r')}`,
    membershipRef: memberMembershipRef,
    expectedRevision: 1,
    desiredRole: 'owner',
  }).success, false)
})

test('active exact-home members may list while only a controller receives mutation authority', () => {
  for (const role of ['workspace_controller', 'member', 'viewer'] as const) {
    const membership = authorityMembership(role)
    const identity = {
      principalRef: membership.principalRef,
      emailCanonical: `${role}@example.com`,
      status: 'active',
      emailVerified: true,
    }
    const memberGrant = authorizeHouseholdMember({
      identity,
      membership,
      requestedHomeRef: homeRef,
      authorizedAt: now,
    })
    assert.equal(memberGrant?.role, role)
    const controllerGrant = authorizeHouseholdController({
      identity,
      membership,
      requestedHomeRef: homeRef,
      authorizedAt: now,
    })
    assert.equal(controllerGrant !== null, role === 'workspace_controller')
  }
  assert.equal(authorizeHouseholdMember({
    identity: {
      principalRef: memberPrincipalRef,
      emailCanonical: 'member@example.com',
      status: 'active',
      emailVerified: true,
    },
    membership: { ...authorityMembership('member'), homeRef: `hhom_${body('x')}` },
    requestedHomeRef: homeRef,
    authorizedAt: now,
  }), null)
})

test('a roster is exact-home and identifies exactly one current principal', () => {
  const roster: HouseholdRoster = {
    recordVersion: HOMEOWNER_HOUSEHOLD_VERSION,
    homeRef,
    members: [publicMember('workspace_controller', true), publicMember('member', false)],
    invitations: [invitation],
  }
  assert.equal(householdRosterSchema.safeParse(roster).success, true)
  assert.equal(householdRosterSchema.safeParse({
    ...roster,
    members: roster.members.map(member => ({ ...member, isCurrentPrincipal: false })),
  }).success, false)
  assert.equal(householdRosterSchema.safeParse({
    ...roster,
    invitations: [{ ...invitation, homeRef: `hhom_${body('x')}` }],
  }).success, false)
})

test('household service hashes target email internally and returns only safe invitation data', async () => {
  let role: 'workspace_controller' | 'member' = 'workspace_controller'
  let capturedEmailHash = ''
  let capturedCanonicalEmail = ''
  const rosterFor = (grant: AuthorizedHouseholdMember): HouseholdRoster => ({
    recordVersion: HOMEOWNER_HOUSEHOLD_VERSION,
    homeRef,
    members: [
      publicMember('workspace_controller', grant.principalRef === controllerPrincipalRef),
      publicMember('member', grant.principalRef === memberPrincipalRef),
    ],
    invitations: [invitation],
  })
  const port: HomeownerHouseholdPort = {
    async readAuthorityMembership() { return authorityMembership(role) },
    async listHousehold(grant) { return rosterFor(grant) },
    async createHouseholdInvitation(input) {
      capturedEmailHash = input.inviteeEmailHash
      assert.equal(Object.hasOwn(input.command, 'inviteeEmail'), false)
      return invitation
    },
    async acceptHouseholdInvitation(input) {
      capturedEmailHash = input.inviteeEmailHash
      capturedCanonicalEmail = input.emailCanonical
      return {
        member: publicMember('member', true),
        invitation: {
          ...invitation,
          status: 'accepted',
          acceptedAt: now,
          revision: 2,
        },
      }
    },
    async revokeHouseholdInvitation() {
      return { ...invitation, status: 'revoked', revokedAt: now, revision: 2 }
    },
    async removeHouseholdMember(input) {
      return {
        ...publicMember('member', input.command.membershipRef === memberMembershipRef),
        state: 'revoked',
        revokedAt: now,
        revision: 2,
      }
    },
    async setHouseholdMemberRole(input) {
      return { ...publicMember('member', false), role: input.command.desiredRole, revision: 2 }
    },
  }
  const service = new HomeownerHouseholdService({
    enabled: true,
    identity: {
      async resolveHouseholdIdentity() {
        return role === 'workspace_controller'
          ? {
              principalRef: controllerPrincipalRef,
              emailCanonical: 'chance@example.com',
              status: 'active',
              emailVerified: true,
            }
          : {
              principalRef: memberPrincipalRef,
              emailCanonical: 'taylor@example.com',
              status: 'active',
              emailVerified: true,
            }
      },
    },
    households: port,
    now: () => now,
    emailHashKey: 'household-test-key-that-is-longer-than-thirty-two-characters',
    newRef: prefix => prefix === 'hhiv' ? invitation.invitationRef : memberMembershipRef,
  })

  const created = await service.createInvitation('session', homeRef, {
    commandRef: `hcmd_${body('c')}`,
    inviteeEmail: 'Taylor@Example.com',
    inviteeDisplayLabel: 'Taylor',
    desiredRole: 'member',
  })
  assert.equal(created.invitationRef, invitation.invitationRef)
  assert.match(capturedEmailHash, /^[a-f0-9]{64}$/)
  assert.notEqual(capturedEmailHash, 'taylor@example.com')
  assert.equal(JSON.stringify(created).includes('email'), false)

  role = 'member'
  const memberRoster = await service.listHousehold('session', homeRef)
  assert.equal(memberRoster.members.find(member => member.isCurrentPrincipal)?.membershipRef,
    memberMembershipRef)
  await assert.rejects(
    service.createInvitation('session', homeRef, {
      commandRef: `hcmd_${body('x')}`,
      inviteeEmail: 'another@example.com',
      inviteeDisplayLabel: 'Another adult',
      desiredRole: 'viewer',
    }),
    (error: unknown) => error instanceof HouseholdServiceError && error.code === 'not_found',
  )
  const accepted = await service.acceptInvitation('session', {
    commandRef: `hcmd_${body('a')}`,
    invitationRef: invitation.invitationRef,
  })
  assert.equal(capturedCanonicalEmail, 'taylor@example.com')
  assert.equal(accepted.member.isCurrentPrincipal, true)
  assert.equal(JSON.stringify(accepted).includes('principalRef'), false)
})

test('command digests are stable across object key order', () => {
  assert.equal(
    householdCommandDigest({ commandRef: 'one', desiredRole: 'member' }),
    householdCommandDigest({ desiredRole: 'member', commandRef: 'one' }),
  )
})

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202608300001_homeowner_household.sql',
), 'utf8')
const memberAccessMigration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202608300003_household_member_access.sql',
), 'utf8')

test('migration reuses memberships and keeps all household persistence browser-private', () => {
  assert.match(migration, /alter table public\.homesrolo_homeowner_memberships[\s\S]*add column if not exists display_label/i)
  assert.doesNotMatch(migration, /create table public\.homesrolo_household_members/i)
  for (const table of [
    'homesrolo_household_invitations',
    'homesrolo_household_command_receipts',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(migration, new RegExp(
      `revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,
      'i',
    ))
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to service_role`, 'i'))
  }
  assert.doesNotMatch(migration, /create\s+policy/i)
  assert.doesNotMatch(migration,
    /grant\s+(?:insert|update|delete)[^;]*homesrolo_household_/i)
})

test('migration enforces exact email acceptance, controller mutations, and last-controller safety', () => {
  const listStart = migration.indexOf('create or replace function public.homesrolo_list_household')
  const createStart = migration.indexOf('create or replace function public.homesrolo_create_household_invitation')
  const acceptStart = migration.indexOf('create or replace function public.homesrolo_accept_household_invitation')
  const revokeStart = migration.indexOf('create or replace function public.homesrolo_revoke_household_invitation')
  const removeStart = migration.indexOf('create or replace function public.homesrolo_remove_household_member')
  const roleStart = migration.indexOf('create or replace function public.homesrolo_set_household_member_role')
  assert.ok(listStart >= 0 && createStart > listStart && acceptStart > createStart)
  const listBody = migration.slice(listStart, createStart)
  assert.match(listBody, /role in \('workspace_controller', 'member', 'viewer'\)/)
  for (const bodyText of [
    migration.slice(createStart, acceptStart),
    migration.slice(revokeStart, removeStart),
    migration.slice(removeStart, roleStart),
    migration.slice(roleStart),
  ]) assert.match(bodyText, /role = 'workspace_controller'/)
  const acceptBody = migration.slice(acceptStart, revokeStart)
  assert.match(acceptBody, /email_canonical = p_email_canonical/)
  assert.match(acceptBody, /v_invitation\.invitee_email_hash <> p_invitee_email_hash/)
  assert.match(acceptBody, /v_invitation\.status <> 'pending'/)
  assert.match(acceptBody, /v_invitation\.expires_at <= p_requested_at/)
  assert.match(migration, /last_household_controller_required/g)
  assert.match(migration, /create trigger homesrolo_last_household_controller_guard/i)
  assert.equal((migration.match(/p_expected_revision is null or p_expected_revision < 1/g) ?? []).length, 3)
  assert.match(migration,
    /p_desired_role is null[\s\S]*p_desired_role not in \('workspace_controller', 'member', 'viewer'\)/)
})

test('every household mutation is idempotent and public SQL projections omit sensitive fields', () => {
  for (const action of [
    'household.invitation.create', 'household.invitation.accept',
    'household.invitation.revoke', 'household.member.remove',
    'household.member.role.set',
  ]) assert.ok(migration.includes(`'${action}'`), action)
  assert.ok((migration.match(/pg_advisory_xact_lock/g) ?? []).length >= 5)
  assert.ok((migration.match(/command_digest_mismatch/g) ?? []).length >= 5)
  const memberProjection = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_household_member_json'),
    migration.indexOf('create or replace function public.homesrolo_household_invitation_json'),
  )
  const invitationProjection = migration.slice(
    migration.indexOf('create or replace function public.homesrolo_household_invitation_json'),
    migration.indexOf('create or replace function public.homesrolo_list_household'),
  )
  assert.doesNotMatch(memberProjection, /'principalRef'|'email'|'token'/)
  assert.doesNotMatch(invitationProjection, /'principalRef'|'emailHash'|'token'/)
  assert.match(memberProjection, /'isCurrentPrincipal'/)
})

test('one home-scoped capacity lock serializes invite creation and acceptance before cap checks', () => {
  const createStart = migration.indexOf('create or replace function public.homesrolo_create_household_invitation')
  const acceptStart = migration.indexOf('create or replace function public.homesrolo_accept_household_invitation')
  const revokeStart = migration.indexOf('create or replace function public.homesrolo_revoke_household_invitation')
  const createBody = migration.slice(createStart, acceptStart)
  const acceptBody = migration.slice(acceptStart, revokeStart)
  const createCapacityLock = createBody.indexOf("p_home_ref || ':household.capacity'")
  const acceptCapacityLock = acceptBody.indexOf("v_invitation.home_ref || ':household.capacity'")

  assert.ok(createCapacityLock >= 0)
  assert.ok(acceptCapacityLock >= 0)
  assert.ok(createCapacityLock < createBody.indexOf('where home_ref = p_home_ref and state = \'active\''))
  assert.ok(createCapacityLock < createBody.indexOf('where home_ref = p_home_ref and status = \'pending\''))
  assert.ok(acceptCapacityLock < acceptBody.indexOf('for update;'))
  assert.ok(acceptCapacityLock < acceptBody.indexOf('where home_ref = v_invitation.home_ref and state = \'active\''))
  assert.equal((migration.match(/:household\.capacity/g) ?? []).length, 2)
})

test('viewer access is read-only at the Home Record SQL boundary', () => {
  const metadataStart = memberAccessMigration.indexOf(
    'create or replace function public.homesrolo_update_homeowner_artifact_metadata',
  )
  const readBody = memberAccessMigration.slice(0, metadataStart)
  const metadataBody = memberAccessMigration.slice(metadataStart)
  assert.match(readBody, /role in \('workspace_controller', 'member', 'viewer'\)/)
  assert.match(metadataBody, /role in \('workspace_controller', 'member'\)/)
  assert.doesNotMatch(metadataBody, /role in \('workspace_controller', 'member', 'viewer'\)/)
})
