import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsFirstRunOnboarding } from './first-run-entry.ts'

const firstRun = { homeCount: 0, explicitAdd: false, hasProjectContext: false, hasHandoffContext: false }
test('an empty first-run homes picker enters guided onboarding', () => {
  assert.equal(needsFirstRunOnboarding(firstRun), true)
})
test('existing homes and explicit home/project/document workflows keep their destination', () => {
  assert.equal(needsFirstRunOnboarding({ ...firstRun, homeCount: 1 }), false)
  assert.equal(needsFirstRunOnboarding({ ...firstRun, explicitAdd: true }), false)
  assert.equal(needsFirstRunOnboarding({ ...firstRun, hasProjectContext: true }), false)
  assert.equal(needsFirstRunOnboarding({ ...firstRun, hasHandoffContext: true }), false)
})
