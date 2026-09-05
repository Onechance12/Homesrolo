import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('first-run setup chooses a real Home or Pro workspace before entering the app', () => {
  const onboarding = read('app/onboarding.tsx')
  const firstRun = read('src/home/first-run.ts')
  const start = read('app/start.tsx')
  assert.match(start, /decideStartupDestination/)
  assert.match(onboarding, /title="My home"/)
  assert.match(onboarding, /title="My company"/)
  assert.match(onboarding, /step !== 'home-review'[\s\S]*firstHomeAttempt\(homeReview\)/)
  assert.match(onboarding, /step !== 'pro-review'[\s\S]*firstCompanyAttempt\(companyReview\)/)
  assert.match(firstRun, /createReviewedHome\(api/)
  assert.match(firstRun, /createProfessionalOrganization/)
  assert.match(firstRun, /saveProfessionalProfile/)
  assert.match(firstRun, /publicationState: 'draft'/)
  assert.match(firstRun, /company page name is already in use/)
  assert.match(onboarding, /caught instanceof FirstCompanyNameConflict/)
  assert.match(onboarding, /setStep\('home-ready'\)/)
  assert.match(onboarding, /setStep\('pro-ready'\)/)
})

test('validated workspace entry persists the choice and sends new Pros through Rolo setup', () => {
  const homes = read('app/homes.tsx')
  const pro = read('app/pro.tsx')
  const proHub = read('src/components/NativeProfessionalHub.tsx')
  assert.match(homes, /hasValidatedHome/)
  assert.match(homes, /writeWorkspacePreference\(principalRef, 'home'\)/)
  assert.match(pro, /hasActiveProfessionalWorkspace/)
  assert.match(pro, /writeWorkspacePreference\(principalRef, 'pro'\)/)
  assert.match(pro, /pathname: '\/onboarding', params: \{ mode: 'pro' \}/)
  assert.match(proHub, /pathname: '\/onboarding', params: \{ mode: 'pro' \}/)
  assert.doesNotMatch(proHub, /<CreateOrganizationCard/)
})

test('account workspace switches clear the old role or home from navigation history', () => {
  const account = read('app/account.tsx')
  const navigation = read('src/workspace/navigation.ts')
  assert.match(account, /replaceWorkspace\(router/)
  assert.match(account, /pathname: '\/home\/\[homeId\]\/rolo'/)
  assert.doesNotMatch(account, /activeOrganizations\.map/)
  assert.match(navigation, /navigation\.dismissAll\(\)[\s\S]*navigation\.replace\(destination\)/)
})

test('homeowner surfaces do not advertise the Pro workspace as a primary app action', () => {
  const homes = read('app/homes.tsx')
  const people = read('app/home/[homeId]/people.tsx')
  assert.doesNotMatch(homes, /Open Homesrolo Pro/)
  assert.doesNotMatch(people, /I.?m a pro/i)
  assert.match(homes, /router\.push\('\/account'\)/)
})

test('work and Pro detail use operational app sections instead of one long landing page', () => {
  const work = read('app/home/[homeId]/work/[projectRef].tsx')
  const pro = read('src/components/NativeProfessionalHub.tsx')
  for (const label of ['Overview', 'Plan', 'Photos & files', 'Bids', 'Updates']) {
    assert.match(work, new RegExp(`label: '${label}'`))
  }
  for (const label of ['Today', 'Invites', 'Workspaces', 'Company']) {
    assert.match(pro, new RegExp(`label: '${label}'`))
  }
  const hubTabs = pro.match(/const HUB_TABS[\s\S]*?\n\]/)?.[0] ?? ''
  assert.deepEqual(
    [...hubTabs.matchAll(/label: '([^']+)'/g)].map(match => match[1]),
    ['Today', 'Invites', 'Workspaces', 'Company'],
  )
  assert.match(pro, /useState<HubTab>\('today'\)/)
  assert.doesNotMatch(pro, /HomeHeader|HomeRouteProvider|\/home\/\[homeId\]/)
  assert.match(pro, /router\.push\('\/account'\)/)
})

test('professional access rollup checks every work record and reports partial failures', () => {
  const people = read('app/home/[homeId]/people.tsx')
  assert.match(people, /capabilities\.invitations[\s\S]*capabilities\.projectQuotes/)
  assert.match(people, /Promise\.allSettled\(work\.map/)
  assert.doesNotMatch(people, /work\.filter\(item => !item\.archived\)[\s\S]*listProjectInvitations/)
  assert.match(people, /invitationLoadFailures/)
  assert.match(people, /Some company access may be missing from this view/)
  assert.match(people, /view\.invitations\.length === 0 && resource\.state\.value\.invitationLoadFailures === 0/)
})

test('invitation actions deep-link to a bounded Bids section', () => {
  const people = read('app/home/[homeId]/people.tsx')
  const work = read('app/home/[homeId]/work/[projectRef].tsx')
  assert.match(people, /professional: organizationRef, tab: 'bids'/)
  assert.match(people, /projectRef: invitation\.projectRef, tab: 'bids'/)
  assert.match(work, /routeWorkDetailTab\(rawTab\)/)
  assert.match(work, /WORK_DETAIL_TABS\.find\(tab => tab\.value === value\)/)
  assert.match(work, /initialTab=\{requestedTab \?\? \(professional \? 'bids' : 'overview'\)\}/)
})
