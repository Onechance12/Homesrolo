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
  assert.deepEqual(decideStartupDestination(false, false, null), {
    destination: '/onboarding', workspace: null,
  })
})

test('startup opens the only available workspace', () => {
  assert.deepEqual(decideStartupDestination(true, false, 'pro'), {
    destination: '/homes', workspace: 'home',
  })
  assert.deepEqual(decideStartupDestination(false, true, 'home'), {
    destination: '/pro', workspace: 'pro',
  })
})

test('startup respects a stored choice when both workspaces exist and defaults home', () => {
  assert.deepEqual(decideStartupDestination(true, true, 'pro'), {
    destination: '/pro', workspace: 'pro',
  })
  assert.deepEqual(decideStartupDestination(true, true, null), {
    destination: '/homes', workspace: 'home',
  })
})
