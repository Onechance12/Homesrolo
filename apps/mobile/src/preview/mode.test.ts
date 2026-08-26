import assert from 'node:assert/strict'
import test from 'node:test'
import { isHomesroloPreviewEnabled } from './mode.ts'

test('requires development, web, and the exact explicit preview flag', () => {
  assert.equal(isHomesroloPreviewEnabled({ development: true, platform: 'web', flag: '1' }), true)
  assert.equal(isHomesroloPreviewEnabled({ development: false, platform: 'web', flag: '1' }), false)
  assert.equal(isHomesroloPreviewEnabled({ development: true, platform: 'ios', flag: '1' }), false)
  assert.equal(isHomesroloPreviewEnabled({ development: true, platform: 'web', flag: undefined }), false)
  assert.equal(isHomesroloPreviewEnabled({ development: true, platform: 'web', flag: 'true' }), false)
})
