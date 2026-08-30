import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createHomeownerHouseholdHttpHandler,
  type HomeownerHouseholdHttpRequest,
} from '../homeowner-household-http.v1.ts'
import type { HomeownerHouseholdService } from '../homeowner-household.v1.ts'

const body = (character: string) => character.repeat(43)
const refs = {
  home: `hhom_${body('h')}`,
  invitation: `hhiv_${body('i')}`,
  membership: `hmbr_${body('m')}`,
  command: `hcmd_${body('c')}`,
}
const now = '2026-08-30T21:00:00.000Z'

const member = {
  recordVersion: 'homeowner-household.v1' as const,
  membershipRef: refs.membership,
  homeRef: refs.home,
  displayLabel: 'Chance',
  role: 'workspace_controller' as const,
  state: 'active' as const,
  isCurrentPrincipal: true,
  revision: 1,
  joinedAt: now,
}

const invitation = {
  recordVersion: 'homeowner-household.v1' as const,
  invitationRef: refs.invitation,
  homeRef: refs.home,
  inviteeDisplayLabel: 'Alex',
  desiredRole: 'member' as const,
  status: 'pending' as const,
  expiresAt: '2026-09-06T21:00:00.000Z',
  revision: 1,
  createdAt: now,
}

function request(overrides: Partial<HomeownerHouseholdHttpRequest> = {}) {
  return {
    method: 'GET',
    pathname: `/api/v1/homes/${refs.home}/household`,
    search: '',
    hasBody: false,
    jsonBody: undefined,
    sessionHandle: 'opaque-session',
    ...overrides,
  }
}

test('an exact-home member may receive the safe household roster only', async () => {
  let received: unknown
  const service = {
    async listHousehold(...input: unknown[]) {
      received = input
      return {
        recordVersion: 'homeowner-household.v1',
        homeRef: refs.home,
        members: [member],
        invitations: [invitation],
      }
    },
  } as unknown as HomeownerHouseholdService
  const response = await createHomeownerHouseholdHttpHandler(service)(request())
  assert.equal(response.status, 200)
  assert.deepEqual(received, ['opaque-session', refs.home])
  const encoded = JSON.stringify(response.body)
  assert.match(encoded, /Chance/)
  assert.match(encoded, /Alex/)
  assert.doesNotMatch(encoded, /principalRef|email|hash|token|secret/i)
})

test('creation accepts bounded body data while authority remains server resolved', async () => {
  let received: unknown
  const service = {
    async createInvitation(...input: unknown[]) {
      received = input
      return invitation
    },
  } as unknown as HomeownerHouseholdService
  const command = {
    commandRef: refs.command,
    inviteeEmail: 'alex@example.com',
    inviteeDisplayLabel: 'Alex',
    desiredRole: 'member',
    expiresInDays: 7,
  }
  const response = await createHomeownerHouseholdHttpHandler(service)(request({
    method: 'POST',
    pathname: `/api/v1/homes/${refs.home}/household/invitations`,
    hasBody: true,
    jsonBody: command,
  }))
  assert.equal(response.status, 201)
  assert.deepEqual(received, ['opaque-session', refs.home, command])
})

test('acceptance binds the opaque path ref instead of trusting a body ref', async () => {
  let received: unknown
  const service = {
    async acceptInvitation(...input: unknown[]) {
      received = input
      return { member, invitation: { ...invitation, status: 'accepted', acceptedAt: now } }
    },
  } as unknown as HomeownerHouseholdService
  const response = await createHomeownerHouseholdHttpHandler(service)(request({
    method: 'POST',
    pathname: `/api/v1/household/invitations/${refs.invitation}/accept`,
    hasBody: true,
    jsonBody: { commandRef: refs.command, invitationRef: `hhiv_${body('x')}` },
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(received, [
    'opaque-session',
    { commandRef: refs.command, invitationRef: refs.invitation },
  ])
})

test('member mutation paths bind their exact path references', async () => {
  let received: unknown
  const service = {
    async setMemberRole(...input: unknown[]) {
      received = input
      return { ...member, role: 'member', revision: 2 }
    },
  } as unknown as HomeownerHouseholdService
  const response = await createHomeownerHouseholdHttpHandler(service)(request({
    method: 'POST',
    pathname: `/api/v1/homes/${refs.home}/household/members/${refs.membership}/role`,
    hasBody: true,
    jsonBody: {
      commandRef: refs.command,
      membershipRef: `hmbr_${body('x')}`,
      expectedRevision: 1,
      desiredRole: 'member',
    },
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(received, [
    'opaque-session',
    refs.home,
    {
      commandRef: refs.command,
      membershipRef: refs.membership,
      expectedRevision: 1,
      desiredRole: 'member',
    },
  ])
})

test('household routes reject query smuggling and remain independently gated', async () => {
  const service = {
    async listHousehold() { throw new Error('must not run') },
  } as unknown as HomeownerHouseholdService
  assert.equal((await createHomeownerHouseholdHttpHandler(service)(request({
    search: '?homeRef=another',
  }))).status, 400)
  assert.equal((await createHomeownerHouseholdHttpHandler(null)(request())).status, 503)
})
