import assert from 'node:assert/strict'
import test from 'node:test'
import { publicRoofingIntent, publicRoofingPrompt } from './entry-intent.ts'

test('public roofing context starts one bounded conversation and carries no private data', () => {
  for (const intent of ['repair', 'replacement', 'inspection', 'storm_damage', 'not_sure'] as const) {
    assert.equal(publicRoofingIntent(intent), intent)
    const prompt = publicRoofingPrompt(intent)
    assert.ok(prompt.length >= 40 && prompt.length <= 220)
    assert.doesNotMatch(prompt, /address|email|phone|policy number/i)
  }
  for (const value of [undefined, null, '', ['inspection'], 'free_form', 'INSPECTION']) {
    assert.equal(publicRoofingIntent(value), null)
  }
  assert.match(publicRoofingPrompt('inspection'), /Roof Watch checkup/)
  assert.match(publicRoofingPrompt('storm_damage'), /Do not make insurance decisions/)
})
