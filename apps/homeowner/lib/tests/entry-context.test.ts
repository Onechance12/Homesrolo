import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  handoffShareRef,
  homeownerEntryContext,
  homeownerEntryDestination,
  homeownerPostSignInPath,
  withHomeownerEntryContext,
} from '../entry-context.ts'

const shareId = `hshr_${'s'.repeat(43)}`
const homeRef = `hhom_${'h'.repeat(43)}`

test('ordinary sign-in reaches first-run workspace routing without dropping explicit entry context', () => {
  assert.equal(homeownerPostSignInPath(homeownerEntryContext({})), '/start')
  assert.equal(homeownerPostSignInPath(homeownerEntryContext({ intent: 'not-an-intent' })), '/start')
  assert.equal(homeownerPostSignInPath(homeownerEntryContext({ intent: 'repair' })), '/homes?intent=repair')
  assert.equal(homeownerPostSignInPath(homeownerEntryContext({ handoff: shareId })), `/homes?handoff=${shareId}`)
  assert.equal(homeownerPostSignInPath(homeownerEntryContext({ intent: 'inspection', handoff: shareId })), `/homes?intent=inspection&handoff=${shareId}`)
})

test('entry context accepts one exact opaque handoff ref and rejects ambiguous input', () => {
  assert.equal(handoffShareRef(shareId), shareId)
  for (const invalid of [
    null,
    undefined,
    ['hshr_' + 's'.repeat(43)],
    'hshr_short',
    `hshr_${'s'.repeat(44)}`,
    `hshr_${'s'.repeat(42)}?email=person@example.com`,
    ` hshr_${'s'.repeat(43)}`,
  ]) {
    assert.equal(handoffShareRef(invalid), null)
  }
})

test('entry URLs preserve only validated intent and handoff context', () => {
  const context = homeownerEntryContext({ intent: 'inspection', handoff: shareId })
  assert.deepEqual(context, { intent: 'inspection', handoff: shareId })
  assert.equal(
    withHomeownerEntryContext('/signin', context),
    `/signin?intent=inspection&handoff=${shareId}`,
  )
  assert.equal(
    withHomeownerEntryContext('/homes', homeownerEntryContext({
      intent: 'insurance_claim',
      handoff: `hshr_${'x'.repeat(42)}&address=Main`,
    })),
    '/homes',
  )
})

test('a handoff selects the exact home documents route before any project intent', () => {
  assert.equal(
    homeownerEntryDestination(homeRef, { intent: 'repair', handoff: shareId }),
    `/home/${homeRef}/documents?handoff=${shareId}`,
  )
  assert.equal(
    homeownerEntryDestination(homeRef, { intent: 'repair', handoff: null }),
    `/home/${homeRef}/projects?intent=repair`,
  )
  assert.equal(
    homeownerEntryDestination(homeRef, { intent: null, handoff: null }),
    `/home/${homeRef}`,
  )
})
