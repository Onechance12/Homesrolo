import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const roloScreen = readFileSync(
  new URL('../../app/home/[homeId]/rolo.tsx', import.meta.url),
  'utf8',
)

test('Rolo resolves task assignments from the safe exact-home roster', () => {
  assert.match(roloScreen, /api\.getHousehold\(homeId\)/)
  assert.match(roloScreen, /assignableHouseholdMembers\(household\.members\)/)
  assert.match(
    roloScreen,
    /householdMembers\.find\(member => member\.membershipRef === proposal\.assignedMembershipRef\)/,
  )
  assert.match(roloScreen, /`Assigned to \$\{proposalAssignee\.displayLabel\}`/)
  assert.doesNotMatch(roloScreen, /Assigned to \$\{proposal\.assignedMembershipRef\}/)
})

test('Rolo shares only an approved task and preserves its assignment and due date', () => {
  assert.match(
    roloScreen,
    /workCreateFieldsFromRoloDraft\(proposal, localCalendarDate\(\)\)[\s\S]*api\.createWork/,
  )
  assert.match(roloScreen, /proposal\.kind === 'task' \? 'Share this to-do' : 'Add to Work'/)
  assert.match(roloScreen, /Your raw Rolo chat stays private to this account and device/)
  assert.match(roloScreen, /Only a to-do, Work record, photo, or update you explicitly approve is shared/)
})
