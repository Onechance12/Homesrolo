import assert from 'node:assert/strict'
import test from 'node:test'
import { decideStartupDestination, hasActiveProfessionalWorkspace } from './startup.ts'

test('professional workspace presence requires an active membership for a returned organization', () => {
  assert.equal(hasActiveProfessionalWorkspace({
    organizations: [{ organizationRef: 'org_one' }],
    memberships: [{ organizationRef: 'org_one', state: 'active' }],
  }), true)
  assert.equal(hasActiveProfessionalWorkspace({
    organizations: [{ organizationRef: 'org_one' }],
    memberships: [{ organizationRef: 'org_one', state: 'revoked' }],
  }), false)
  assert.equal(hasActiveProfessionalWorkspace({
    organizations: [{ organizationRef: 'org_one' }],
    memberships: [{ organizationRef: 'org_other', state: 'active' }],
  }), false)
})

test('startup sends an empty account to onboarding', () => {
  assert.deepEqual(decideStartupDestination([], false, null), {
    destination: '/onboarding', workspace: null,
  })
})

test('startup opens the only available workspace', () => {
  const homeId = `hhom_${'h'.repeat(43)}`
  assert.deepEqual(decideStartupDestination([homeId], false, 'pro'), {
    destination: { pathname: '/home/[homeId]/rolo', params: { homeId } }, workspace: 'home',
  })
  assert.deepEqual(decideStartupDestination([], true, 'home'), {
    destination: '/pro', workspace: 'pro',
  })
})

test('startup respects a stored role and opens a single home directly in Rolo', () => {
  const homeId = `hhom_${'a'.repeat(43)}`
  assert.deepEqual(decideStartupDestination([homeId], true, 'pro'), {
    destination: '/pro', workspace: 'pro',
  })
  assert.deepEqual(decideStartupDestination([homeId], true, 'home'), {
    destination: { pathname: '/home/[homeId]/rolo', params: { homeId } }, workspace: 'home',
  })
  assert.deepEqual(decideStartupDestination([homeId], true, null), {
    destination: { pathname: '/home/[homeId]/rolo', params: { homeId } }, workspace: 'home',
  })
})

test('startup never guesses when a homeowner has more than one home', () => {
  const homeIds = [`hhom_${'a'.repeat(43)}`, `hhom_${'b'.repeat(43)}`]
  assert.deepEqual(decideStartupDestination(homeIds, false, null), {
    destination: '/homes', workspace: 'home',
  })
  assert.deepEqual(decideStartupDestination(homeIds, true, null), {
    destination: '/homes', workspace: 'home',
  })
  assert.deepEqual(decideStartupDestination(homeIds, true, 'pro'), {
    destination: '/pro', workspace: 'pro',
  })
  assert.deepEqual(decideStartupDestination(homeIds, true, 'home'), {
    destination: '/homes', workspace: 'home',
  })
})
