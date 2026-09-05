import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionPresentationKey } from './presentation-key.ts'
import { SessionFence } from './session-fence.ts'
import { PREVIEW_SIGNED_IN_SESSION } from '../preview/api.ts'

test('repeated signed-out rechecks retain the public email/code form', () => {
  const fence = new SessionFence()
  const key = sessionPresentationKey(true, null, fence.identityVersion)
  for (let count = 0; count < 4; count += 1) {
    fence.confirm(fence.invalidate(), {
      apiVersion: 'homeowner-api.v1-draft', kind: 'signed_out',
      capabilities: PREVIEW_SIGNED_IN_SESSION.capabilities,
    })
    fence.reset()
    assert.equal(sessionPresentationKey(true, null, fence.identityVersion), key)
  }
  assert.throws(() => fence.capture(), /session_check_required/)
})

test('private identity changes and same-account new lifetimes still remount private views', () => {
  assert.notEqual(sessionPresentationKey(true, 'alice', 1), sessionPresentationKey(true, 'bob', 2))
  assert.notEqual(sessionPresentationKey(true, 'alice', 1), sessionPresentationKey(true, 'alice', 3))
  assert.notEqual(sessionPresentationKey(true, 'alice', 1), sessionPresentationKey(true, null, 2))
  assert.equal(sessionPresentationKey(true, 'alice', 1), sessionPresentationKey(true, 'alice', 1))
})

test('native presentation behavior is unchanged', () => {
  assert.equal(sessionPresentationKey(false, 'alice', 5), 'native-session')
  assert.equal(sessionPresentationKey(false, null, 6), 'native-session')
})
