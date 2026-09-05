import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { HomeRecordAddress } from '../api/model.ts'
import type { HomesroloApi } from '../api/contract.ts'
import { emptyPropertyFacts, initialPropertySnapshotAttempt, PropertyLookupDraftGate, propertyDraft, reviewPropertyDraft } from './property-review.ts'

const ADDRESS: HomeRecordAddress = { line1: '123 Synthetic Street', line2: null, city: 'Fort Worth', regionCode: 'TX', postalCode: '76102', countryCode: 'US' }

test('unknown property fields remain null; bedrooms never generate a total-room count', () => {
  const draft = propertyDraft({ ...emptyPropertyFacts(), bedrooms: 3, bathrooms: 2.5, centralAir: false })
  assert.equal(draft.rooms, '')
  assert.equal(draft.centralAir, 'no')
  const reviewed = reviewPropertyDraft(draft, null)
  assert.equal(reviewed.kind, 'reviewed')
  if (reviewed.kind !== 'reviewed') return
  assert.equal(reviewed.value.facts.rooms, null)
  assert.equal(reviewed.value.facts.bedrooms, 3)
  assert.equal(reviewed.value.facts.centralAir, false)
  assert.equal(reviewed.value.receipt, null)
  assert.deepEqual(reviewPropertyDraft(propertyDraft(), null), { kind: 'none' }, 'skip/empty manual facts need no snapshot write')
})

test('reviewed corrections retain the opaque source receipt and reject invalid draft numbers', () => {
  const receipt = `opaque_test_payload.${'r'.repeat(43)}`
  const draft = { ...propertyDraft(), squareFeet: '1850', rooms: '', bathrooms: '2.75' }
  const corrected = reviewPropertyDraft(draft, receipt)
  assert.equal(corrected.kind, 'reviewed')
  if (corrected.kind === 'reviewed') {
    assert.equal(corrected.value.receipt, receipt)
    assert.equal(corrected.value.facts.squareFeet, 1850)
    assert.equal(corrected.value.facts.rooms, null)
  }
  for (const value of ['about 1850', '1,850', '-1', 'Infinity', '1e3', '1850.5']) {
    assert.equal(reviewPropertyDraft({ ...draft, squareFeet: value }, receipt).kind, 'invalid')
  }
  assert.equal(reviewPropertyDraft({ ...draft, bathrooms: '2.3' }, receipt).kind, 'invalid')
})

test('late lookup responses cannot replace newer results or cross address/principal drafts', async () => {
  const gate = new PropertyLookupDraftGate('principal-A', ADDRESS)
  const first = gate.begin()
  const second = gate.begin()
  assert.equal(gate.current(first), false)
  assert.equal(gate.current(second), true)
  assert.equal(new PropertyLookupDraftGate('principal-B', ADDRESS).current(second), false)
  const otherAddress = new PropertyLookupDraftGate('principal-A', { ...ADDRESS, line1: '456 Other Street' })
  otherAddress.begin(); otherAddress.begin()
  assert.equal(otherAddress.current(second), false)
  gate.discard()
  assert.equal(gate.current(second), false, 'Skip and unmount invalidate in-flight adoption')
  let resolve!: (value: string) => void
  const delayed = new Promise<string>(complete => { resolve = complete })
  const ticket = gate.begin()
  let adopted = false
  const read = delayed.then(() => { if (gate.current(ticket)) adopted = true })
  gate.discard()
  resolve('old record')
  await read
  assert.equal(adopted, false)
})

test('review UI requires deliberate consent, supports skip, and never renders or persists a receipt', () => {
  const view = readFileSync(new URL('../components/PropertyDetailsReview.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../../app/onboarding.tsx', import.meta.url), 'utf8')
  assert.match(view, /async function lookup\(\)/)
  assert.match(view, /api\.lookupProperty\(address\)/)
  assert.match(view, /U\.S\. Census address service/)
  assert.match(view, /Tarrant County, Texas/)
  assert.match(view, /onPress=\{\(\) => void lookup\(\)\}/)
  assert.match(view, /useEffect\(\(\) => \(\) => gate\.discard\(\), \[gate\]\)/)
  assert.match(view, /gate\.current\(ticket\)/)
  assert.match(view, /function skip\(\)[\s\S]*gate\.discard\(\)/)
  assert.match(view, /Blank means Unknown/)
  assert.doesNotMatch(view, /saveHomeProperty\(|createHome\(|localStorage|sessionStorage|console\.|<Text[^>]*>[^<]*receipt/)
  assert.match(route, /propertySelection\.kind === 'pending' \|\| propertySelection\.kind === 'invalid'/)
  assert.match(route, /setPropertySelection\(\{ kind: 'none' \}\)[\s\S]*setHomeReview\(reviewed\.value\)/)
  const saved = readFileSync(new URL('../components/HomePropertyDetails.tsx', import.meta.url), 'utf8')
  assert.match(saved, /if \(!sameHomeRecordAddress\(currentAddress, snapshot\.address\)\) return/)
  assert.match(saved, /earlier property facts are hidden/)
  assert.match(saved, /Details reviewed for/)
  assert.match(saved, /JSON\.stringify\(\[state\.session\.principalRef, homeRef, currentAddress\]\)/)
  assert.match(saved, /!canEdit \|\| !currentAddress \|\| !api\.saveHomeProperty/)
  assert.match(saved, /resource\.state\.value !== null/)
  assert.match(saved, /context="home-record"/)
})

test('missing-snapshot recovery only saves an explicit frozen review and reuses its command after failure', async () => {
  const HOME = `hhom_${'h'.repeat(43)}`
  const review = { facts: { ...emptyPropertyFacts(), squareFeet: 1850, rooms: null }, receipt: null }
  let minted = 0
  const calls: unknown[] = []
  const api = {
    async newCommandRef() { minted += 1; return `hcmd_${'c'.repeat(43)}` },
    async saveHomeProperty(homeRef, input) {
      calls.push(structuredClone({ homeRef, input }))
      if (calls.length === 1) throw new Error('network_unavailable')
      return { version: 'home-property-snapshot.v1', homeRef, address: input.address,
        facts: input.facts, lookup: null, reviewedAt: '2026-09-05T12:00:00.000Z' }
    },
  } satisfies Partial<HomesroloApi>
  const attempt = initialPropertySnapshotAttempt(HOME, ADDRESS, review)
  assert.equal(minted, 0)
  assert.equal(calls.length, 0)
  const first = attempt.run(api as HomesroloApi)
  assert.equal(attempt.run(api as HomesroloApi), first, 'concurrent save taps share the same request')
  await assert.rejects(first, /network_unavailable/)
  review.facts.squareFeet = 9999
  const snapshot = await attempt.run(api as HomesroloApi)
  assert.equal(snapshot.facts.squareFeet, 1850)
  assert.equal(snapshot.facts.rooms, null)
  assert.equal(minted, 1)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(await attempt.run(api as HomesroloApi), snapshot)
  assert.equal(calls.length, 2)
})
