import assert from 'node:assert/strict'
import test from 'node:test'
import { roloRequestCanCommit } from './request-generation.ts'

test('only the mounted current Rolo request may mutate state or release the send guard', () => {
  assert.equal(roloRequestCanCommit(4, 4, true), true)
  assert.equal(roloRequestCanCommit(3, 4, true), false,
    'a stale reply cannot release the newer request guard')
  assert.equal(roloRequestCanCommit(4, 4, false), false,
    'an unmounted request cannot commit state')
})
