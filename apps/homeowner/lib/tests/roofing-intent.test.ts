import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROOFING_INTENTS,
  roofingIntent,
  withRoofingIntent,
} from '../roofing-intent.ts'

test('roofing intent accepts only the five existing project choices', () => {
  assert.deepEqual(ROOFING_INTENTS, [
    'repair', 'replacement', 'inspection', 'storm_damage', 'not_sure',
  ])
  for (const intent of ROOFING_INTENTS) assert.equal(roofingIntent(intent), intent)
  for (const rejected of [
    undefined, null, '', 'urgent', 'insurance_claim', 'repair?admin=1',
    { intent: 'repair' }, ['repair'],
  ]) {
    assert.equal(roofingIntent(rejected), null)
  }
})

test('roofing intent adds one bounded query value and nothing else', () => {
  assert.equal(withRoofingIntent('/homes', null), '/homes')
  assert.equal(withRoofingIntent('/homes', 'repair'), '/homes?intent=repair')
  assert.equal(
    withRoofingIntent('/home/hhom_example/projects', 'storm_damage'),
    '/home/hhom_example/projects?intent=storm_damage',
  )
})
