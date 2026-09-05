import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { fetchJsonTransport } from '../port/transport.ts'
import { BROWSER_SESSION_SIGNAL_KEY, parseBrowserSessionSignal } from '../../../../shared/browser-session-signal.ts'

function fakeBrowser(context: TestContext, blocked = false) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values: string[] = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { setItem(key: string, value: string) {
      assert.equal(key, BROWSER_SESSION_SIGNAL_KEY)
      if (blocked) throw new Error('storage unavailable')
      values.push(value)
    } } },
  })
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return values
}

for (const path of ['/api/v1/auth/email-code/verify', '/api/v1/auth/exchange', '/api/v1/auth/signout']) {
  test(`legacy cookie mutation ${path} emits one credential-free pair around actual transport`, async context => {
    const values = fakeBrowser(context)
    context.mock.method(globalThis, 'fetch', async () => {
      assert.equal(values.length, 1)
      assert.equal(parseBrowserSessionSignal(values[0])?.phase, 'changing')
      return Response.json({ data: {} })
    })
    const result = await fetchJsonTransport({ method: 'POST', path, body: { synthetic: 'test-only' } })
    assert.equal(result.kind, 'reply')
    assert.equal(values.length, 2)
    assert.equal(parseBrowserSessionSignal(values[1])?.phase, 'changed')
    assert.equal(parseBrowserSessionSignal(values[0])?.changeId, parseBrowserSessionSignal(values[1])?.changeId)
    assert.match(values.join('\n'), /^changing:\d+:\d+\nchanged:\d+:\d+$/)
  })
}

test('failed cookie exchanges still finish their signal', async context => {
  const values = fakeBrowser(context)
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('network unavailable') })
  assert.deepEqual(await fetchJsonTransport({ method: 'POST', path: '/api/v1/auth/exchange' }), { kind: 'network_failure' })
  assert.equal(parseBrowserSessionSignal(values[1])?.phase, 'changed')
})

test('blocked storage never prevents cookie mutation transport', async context => {
  fakeBrowser(context, true)
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('network unavailable') })
  assert.deepEqual(await fetchJsonTransport({ method: 'POST', path: '/api/v1/auth/signout' }), { kind: 'network_failure' })
})

test('session reads, OTP requests, and ordinary writes do not broadcast cookie changes', async context => {
  const values = fakeBrowser(context)
  context.mock.method(globalThis, 'fetch', async () => Response.json({ data: {} }))
  await fetchJsonTransport({ method: 'GET', path: '/api/v1/session' })
  await fetchJsonTransport({ method: 'POST', path: '/api/v1/auth/email-code' })
  await fetchJsonTransport({ method: 'POST', path: '/api/v1/homes' })
  assert.deepEqual(values, [])
})
