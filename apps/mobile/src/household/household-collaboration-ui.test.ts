import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('People separates household access from the existing home-pro Rolodex', () => {
  const people = read('app/home/[homeId]/people.tsx')

  assert.match(people, /label="Household"/)
  assert.match(people, /label="Home pros"/)
  assert.match(people, /One home, kept together\./)
  assert.match(people, /Invite someone to this home/)
  assert.match(people, /Home admin/)
  assert.match(people, /Can update/)
  assert.match(people, /View only/)
  assert.match(people, /Raw Rolo conversations stay private/)
  assert.match(people, /assignmentCountFor/)
  assert.match(people, /Share invitation again/)
  assert.match(people, /onShare\(invitation\)/)
  assert.match(people, /invitation is still pending/)
})

test('household invitation acceptance preserves the current browser and exact-home boundary', () => {
  const join = read('app/join-household.tsx')
  const returnRoute = read('src/auth/return-route.ts')
  const people = read('app/home/[homeId]/people.tsx')

  assert.match(join, /householdInvitationReturnPath\(invitationRef\)/)
  assert.match(join, /label=\{busy \? 'Joining…' : 'Join this home'\}/)
  assert.match(join, /accepted\.member\.homeRef/)
  assert.match(join, /The link works only for the invited email/)
  assert.match(returnRoute, /\/join-household\?invitation=/)
  assert.match(people, /api\.createHouseholdInvitation\(homeId/)
  assert.match(people, /api\.removeHouseholdMember\(homeId/)
  assert.match(people, /api\.setHouseholdMemberRole\(homeId/)
  assert.match(people, /https:\/\/app\.homesrolo\.com\/join-household/)
})

test('the invitation screen never treats possession of a link as authorization', () => {
  const join = read('app/join-household.tsx')

  assert.match(join, /auth\.kind === 'signed_out'/)
  assert.match(join, /<Redirect href=\{\{ pathname: '\/sign-in'/)
  assert.match(join, /api\.acceptHouseholdInvitation\(invitationRef/)
  assert.doesNotMatch(join, /inviteeEmail/)
})
