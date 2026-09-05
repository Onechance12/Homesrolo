import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { HomesroloApi } from '../api/contract.ts'
import type { HomeSummary, ProfessionalOrganization } from '../api/model.ts'
import { publicRoofingIntent, publicRoofingPrompt } from '../auth/entry-intent.ts'
import {
  FirstCompanyNameConflict, HOME_INTENTS, firstCompanyAttempt, firstHomeAttempt,
  firstRunProgress, firstRunRoloPrompt, initialHomeIntent, previousFirstRunStep,
  reviewFirstCompany, reviewFirstHome,
} from './first-run.ts'

const ADDRESS = {
  line1: '123 Synthetic Street', line2: 'Unit 2', city: 'Fort Worth', regionCode: 'TX', postalCode: '76102',
}

function reviewedHome() {
  const reviewed = reviewFirstHome('My home', ADDRESS)
  assert.ok(reviewed.ok)
  return reviewed.value
}

function homeApi(failure: 'create_ack' | 'record_read' | 'record_write' | 'record_ack' | null = null) {
  let refs = 0
  let fail = failure
  const homes = new Map<string, HomeSummary>()
  const creates: unknown[] = []
  const updates: unknown[] = []
  let profile: Awaited<ReturnType<HomesroloApi['getHomeRecord']>> = {
    homeRef: `hhome_${'h'.repeat(43)}`, address: null, revision: 1,
    homeType: 'unknown', yearBuilt: null, systems: [],
    source: 'homeowner_recollection', updatedAt: '2026-09-05T00:00:00Z',
  }
  const api = {
    async newCommandRef() { return `hcmd_${String(++refs).padStart(43, 'r')}` },
    async createHome(label, location, commandRef) {
      assert.ok(commandRef)
      creates.push({ label, location, commandRef })
      let home = homes.get(commandRef)
      if (!home) {
        home = { homeRef: `hhome_${'h'.repeat(43)}`, displayLabel: label, privateLocationLabel: location, relationshipLabel: 'claimed_unverified' }
        homes.set(commandRef, home)
      }
      if (fail === 'create_ack') { fail = null; throw new Error('network_unavailable') }
      return home
    },
    async getHomeRecord() {
      if (fail === 'record_read') { fail = null; throw new Error('network_unavailable') }
      return profile
    },
    async updateHomeRecord(_homeRef, input) {
      updates.push(input)
      if (fail === 'record_write') { fail = null; throw new Error('network_unavailable') }
      profile = { ...profile, address: input.address, revision: 2 }
      if (fail === 'record_ack') { fail = null; throw new Error('network_unavailable') }
      return profile
    },
  } satisfies Partial<HomesroloApi>
  return { api: api as unknown as HomesroloApi, homes, creates, updates, minted: () => refs }
}

test('first-run review keeps explicit address facts and normalizes only the reviewed label', () => {
  const reviewed = reviewFirstHome('  ', { ...ADDRESS, city: ' Fort Worth ', regionCode: 'tx' })
  assert.equal(reviewed.ok, true)
  if (!reviewed.ok) return
  assert.equal(reviewed.value.label, 'My home')
  assert.equal(reviewed.value.address.address.city, 'Fort Worth')
  assert.equal(reviewed.value.address.address.line2, 'Unit 2')
  assert.equal(reviewed.value.address.address.regionCode, 'TX')
  assert.equal(reviewFirstHome('x'.repeat(81), ADDRESS).ok, false)
  for (const patch of [{ line1: '' }, { city: '' }, { regionCode: 'Texas' }, { postalCode: '123' }]) {
    assert.equal(reviewFirstHome('My home', { ...ADDRESS, ...patch }).ok, false)
  }
})

test('company review requires bounded basics and preserves commas in a single service area', () => {
  assert.deepEqual(reviewFirstCompany(' Synthetic Roofing ', 'roofing', ' Fort Worth, Texas '), {
    ok: true,
    value: { displayName: 'Synthetic Roofing', slug: 'synthetic-roofing', trade: 'roofing', serviceArea: 'Fort Worth, Texas' },
  })
  for (const [name, area] of [['', 'Fort Worth'], ['ab', 'Fort Worth'], ['x'.repeat(121), 'Fort Worth'], ['Synthetic', ''], ['Synthetic', 'x'], ['Synthetic', 'x'.repeat(81)]]) {
    assert.equal(reviewFirstCompany(name!, 'roofing', area!).ok, false)
  }
})

test('home and company progress/back paths include review and stop at success', () => {
  const home = ['welcome', 'reason', 'home-details', 'home-review', 'home-ready'] as const
  const pro = ['welcome', 'pro-details', 'pro-review', 'pro-ready'] as const
  for (const [steps, workspace] of [[home, 'home'], [pro, 'pro']] as const) {
    steps.forEach((step, index) => {
      assert.deepEqual(firstRunProgress(step, workspace), { current: index + 1, total: steps.length })
      assert.equal(previousFirstRunStep(step), index === 0 || index === steps.length - 1 ? null : steps[index - 1])
    })
  }
})

test('validated public roofing intent only seeds an unsent fixed starter and can be changed', () => {
  assert.equal(initialHomeIntent(null), null)
  assert.equal(initialHomeIntent(publicRoofingIntent(['repair'])), null)
  assert.equal(initialHomeIntent(publicRoofingIntent('https://attacker.test')), null)
  assert.equal(initialHomeIntent('replacement'), 'plan')
  assert.equal(initialHomeIntent('storm_damage'), 'attention')
  assert.equal(firstRunRoloPrompt('attention', 'repair'), publicRoofingPrompt('repair'))
  assert.equal(firstRunRoloPrompt('plan', 'replacement'), publicRoofingPrompt('replacement'))
  for (const intent of HOME_INTENTS) {
    assert.ok(firstRunRoloPrompt(intent.value, null).length > 20)
    assert.ok(firstRunRoloPrompt(intent.value, null).length < 1_600)
  }
  assert.equal(firstRunRoloPrompt('organize', 'storm_damage'), firstRunRoloPrompt('organize', null))
})

test('review and creating an attempt do not write; concurrent create taps share one request sequence', async () => {
  const harness = homeApi()
  const attempt = firstHomeAttempt(reviewedHome())
  assert.equal(harness.minted(), 0)
  assert.deepEqual(harness.creates, [])
  const first = attempt.run(harness.api)
  const second = attempt.run(harness.api)
  assert.equal(first, second)
  const home = await first
  assert.equal(home.displayLabel, 'My home')
  assert.equal(harness.homes.size, 1)
  assert.equal(harness.creates.length, 1)
  assert.equal(harness.updates.length, 1)
  assert.equal(harness.minted(), 2)
  assert.equal(await attempt.run(harness.api), home)
  assert.equal(harness.creates.length, 1, 'reopening success cannot create again')
})

for (const failure of ['create_ack', 'record_read', 'record_write', 'record_ack'] as const) {
  test(`home retry after ${failure} retains exact command refs and never creates a second home`, async () => {
    const harness = homeApi(failure)
    const attempt = firstHomeAttempt(reviewedHome())
    await assert.rejects(attempt.run(harness.api), /network_unavailable/)
    const home = await attempt.run(harness.api)
    assert.ok(home.homeRef)
    assert.equal(harness.homes.size, 1)
    assert.equal(harness.minted(), 2)
    assert.equal(harness.creates.length, 2)
    assert.deepEqual(harness.creates[0], harness.creates[1], 'same payload and create ref')
    if (failure === 'record_write') assert.deepEqual(harness.updates[0], harness.updates[1])
    if (failure === 'record_ack') assert.equal(harness.updates.length, 1, 'the reviewed address is already saved')
  })
}

test('a command-ref failure never starts a home write; retry mints a full pair', async () => {
  const harness = homeApi()
  const attempt = firstHomeAttempt(reviewedHome())
  let calls = 0
  const flaky = { ...harness.api, async newCommandRef() {
    if (++calls === 2) throw new Error('network_unavailable')
    return `hcmd_${String(calls).padStart(43, 'r')}`
  } } as HomesroloApi
  await assert.rejects(attempt.run(flaky), /network_unavailable/)
  assert.equal(harness.creates.length, 0)
  await attempt.run(flaky)
  assert.equal(harness.creates.length, 1)
  assert.equal(calls, 4)
})

test('an attempt snapshots reviewed data instead of accepting edited values on retry', async () => {
  const harness = homeApi('record_read')
  const review = reviewedHome()
  const attempt = firstHomeAttempt(review)
  await assert.rejects(attempt.run(harness.api), /network_unavailable/)
  ;(review.address.address as { line1: string }).line1 = '456 Different Street'
  await attempt.run(harness.api)
  assert.deepEqual(harness.creates[0], harness.creates[1])
  assert.equal((harness.updates[0] as { address: { line1: string } }).address.line1, ADDRESS.line1)
})

test('company partial-save retry preserves both refs, private draft state, and comma service area', async () => {
  const reviewed = reviewFirstCompany('Synthetic Roofing', 'roofing', 'Fort Worth, Texas')
  assert.ok(reviewed.ok)
  const company = {
    organizationRef: `horg_${'o'.repeat(43)}`, slug: 'synthetic-roofing', displayName: 'Synthetic Roofing',
    trades: [], serviceAreas: [], publicationState: 'draft', provenance: 'company_self_reported',
    revision: 1, createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z',
  } as ProfessionalOrganization
  const creates: unknown[] = []
  const saves: unknown[] = []
  let refs = 0
  const api = {
    async newCommandRef() { return `hcmd_${String(++refs).padStart(43, 'r')}` },
    async createProfessionalOrganization(input) {
      creates.push(input)
      return { organization: company, membership: {} } as Awaited<ReturnType<HomesroloApi['createProfessionalOrganization']>>
    },
    async saveProfessionalProfile(input) {
      saves.push(input)
      if (saves.length === 1) throw new Error('network_unavailable')
      return { ...company, trades: input.trades, serviceAreas: input.serviceAreas, revision: 2 }
    },
  } satisfies Partial<HomesroloApi>
  const attempt = firstCompanyAttempt(reviewed.value)
  await assert.rejects(attempt.run(api as HomesroloApi), /network_unavailable/)
  const saved = await attempt.run(api as HomesroloApi)
  assert.equal(saved.publicationState, 'draft')
  assert.deepEqual(saved.serviceAreas, ['Fort Worth, Texas'])
  assert.deepEqual(creates[0], creates[1])
  assert.deepEqual(saves[0], saves[1])
  assert.equal(refs, 2)
  assert.equal(await attempt.run(api as HomesroloApi), saved)
  assert.equal(creates.length, 2)
})

test('only a confirmed initial company-name conflict permits an edited creation attempt', async () => {
  const reviewed = reviewFirstCompany('Synthetic Roofing', 'roofing', 'Fort Worth, Texas')
  assert.ok(reviewed.ok)
  const conflict = { status: 409, code: 'conflict' }
  const base = { async newCommandRef() { return `hcmd_${'r'.repeat(43)}` } }
  const nameConflict = { ...base, async createProfessionalOrganization() { throw conflict } } as unknown as HomesroloApi
  await assert.rejects(firstCompanyAttempt(reviewed.value).run(nameConflict), FirstCompanyNameConflict)
  const profileConflict = {
    ...base,
    async createProfessionalOrganization() { return { organization: { organizationRef: `horg_${'o'.repeat(43)}`, revision: 1 } } },
    async saveProfessionalProfile() { throw conflict },
  } as unknown as HomesroloApi
  await assert.rejects(firstCompanyAttempt(reviewed.value).run(profileConflict), error => error === conflict)
  const uncertain = { ...base, async createProfessionalOrganization() { throw new Error('network_unavailable') } } as unknown as HomesroloApi
  await assert.rejects(firstCompanyAttempt(reviewed.value).run(uncertain), /network_unavailable/)
})

test('route wiring binds drafts to the principal and only explicit reviewed creation reaches an attempt', () => {
  const route = readFileSync(new URL('../../app/onboarding.tsx', import.meta.url), 'utf8')
  assert.match(route, /<FirstRunFlow key=\{auth\.session\.principalRef\}/)
  assert.match(route, /useState<FirstRunStep>\('welcome'\)/)
  assert.match(route, /api\.listHomes\(\)/)
  assert.match(route, /professionalEnabled \? api\.getProfessionalProfile\(\)/)
  assert.match(route, /step !== 'home-review' \|\| !homeReview \|\| !visible\.current \|\| actionBusy\.current/)
  assert.match(route, /step !== 'pro-review' \|\| !companyReview \|\| !professionalEnabled/)
  assert.match(route, /previousStep && !locked/)
  assert.match(route, /setStep\('home-ready'\)/)
  assert.match(route, /setStep\('pro-ready'\)/)
  assert.match(route, /withStarter && assistantEnabled \? \{ prompt: starter \}/)
  assert.match(route, /keyboardShouldPersistTaps="handled"/)
  assert.match(route, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/)
  assert.match(route, /maxWidth: 1080/)
  assert.doesNotMatch(route, /localStorage|sessionStorage|sendHomeAssistant|publicationState: 'published'/)
})
