import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginBrowserSessionChange,
  BROWSER_SESSION_SIGNAL_KEY,
  parseBrowserSessionSignal,
} from '../../../../shared/browser-session-signal.ts'
import { subscribeBrowserSessionSync, type BrowserSessionEvents } from './browser-session-sync.ts'
import { SessionFence, SessionCheckRequired, revalidateSession } from './session-fence.ts'

function fakeBrowser() {
  type Listener = Parameters<BrowserSessionEvents['listen']>[1]
  const handlers = new Map<string, Listener>()
  const timers = new Set<() => void>()
  let visible = true
  const events: BrowserSessionEvents = {
    isVisible: () => visible,
    listen(type, handler) { handlers.set(type, handler); return () => { handlers.delete(type) } },
    after(milliseconds, callback) {
      assert.equal(milliseconds, 60_000)
      timers.add(callback)
      return () => { timers.delete(callback) }
    },
  }
  return {
    events, handlers, timers,
    emit(type: string, event: Parameters<Listener>[0] = {}) { handlers.get(type)?.(event) },
    visible(value: boolean) { visible = value },
    expire() { for (const callback of [...timers]) { timers.delete(callback); callback() } },
  }
}

test('cookie change signals contain only a paired invalidation marker and tolerate blocked storage', () => {
  const messages: string[] = []
  const finish = beginBrowserSessionChange((key, value) => {
    assert.equal(key, BROWSER_SESSION_SIGNAL_KEY)
    messages.push(value)
  })
  finish()
  const begin = parseBrowserSessionSignal(messages[0])
  const end = parseBrowserSessionSignal(messages[1])
  assert.equal(begin?.phase, 'changing')
  assert.equal(end?.phase, 'changed')
  assert.equal(begin?.changeId, end?.changeId)
  assert.match(messages.join('\n'), /^changing:\d+:\d+\nchanged:\d+:\d+$/)
  assert.equal(parseBrowserSessionSignal('changed:alice@example.com:token'), null)
  assert.doesNotThrow(() => beginBrowserSessionChange(() => { throw new Error('disabled') })())
})

test('blur and hidden document invalidate; visible focus and pageshow revalidate', () => {
  const browser = fakeBrowser()
  const calls: string[] = []
  const stop = subscribeBrowserSessionSync(browser.events,
    () => { calls.push('invalidate') }, () => { calls.push('read') }, () => { calls.push('stalled') })
  browser.emit('blur')
  browser.visible(false)
  browser.emit('visibilitychange')
  browser.emit('focus')
  browser.visible(true)
  browser.emit('visibilitychange')
  browser.emit('pageshow')
  browser.emit('focus')
  assert.deepEqual(calls, ['invalidate', 'invalidate', 'invalidate', 'read', 'read', 'read'])
  stop()
  assert.equal(browser.handlers.size, 0)
})

test('focus cannot reopen the old cookie while a sign-in exchange is pending', () => {
  const browser = fakeBrowser()
  let reads = 0
  let invalidations = 0
  const stop = subscribeBrowserSessionSync(browser.events,
    () => { invalidations += 1 }, () => { reads += 1 }, () => undefined)
  const finish = beginBrowserSessionChange((key, newValue) => browser.emit('storage', { key, newValue }))
  browser.emit('focus')
  browser.emit('pageshow')
  browser.emit('visibilitychange')
  assert.equal(reads, 0)
  assert.equal(invalidations, 4)
  finish()
  assert.equal(reads, 1)
  assert.equal(browser.timers.size, 0)
  stop()
})

test('overlapping sign-ins require every matching completion before revalidation', () => {
  const browser = fakeBrowser()
  let reads = 0
  subscribeBrowserSessionSync(browser.events, () => undefined, () => { reads += 1 }, () => undefined)
  const emit = (newValue: string) => browser.emit('storage', { key: BROWSER_SESSION_SIGNAL_KEY, newValue })
  emit('changing:1:11')
  emit('changing:2:22')
  emit('changed:1:11')
  browser.emit('focus')
  assert.equal(reads, 0)
  emit('changed:2:22')
  assert.equal(reads, 1)
})

test('a vanished sign-in tab leaves a retryable curtain after a bounded wait', () => {
  const browser = fakeBrowser()
  const calls: string[] = []
  const stop = subscribeBrowserSessionSync(browser.events,
    () => { calls.push('invalidate') }, () => { calls.push('read') }, () => { calls.push('stalled') })
  browser.emit('storage', { key: BROWSER_SESSION_SIGNAL_KEY, newValue: 'changing:1:2' })
  browser.expire()
  assert.deepEqual(calls, ['invalidate', 'invalidate', 'stalled'])
  // A later deliberate return can retry authoritative verification; expiry did
  // not itself read a cookie or reveal cached private content.
  browser.emit('focus')
  assert.equal(calls.at(-1), 'read')
  stop()
})

test('unrelated storage does nothing and native has no browser subscription', () => {
  const browser = fakeBrowser()
  let calls = 0
  const bump = () => { calls += 1 }
  subscribeBrowserSessionSync(browser.events, bump, bump, bump)
  browser.emit('storage', { key: 'unrelated', newValue: 'changed:1:2' })
  browser.emit('storage', { key: BROWSER_SESSION_SIGNAL_KEY, newValue: 'invalid' })
  subscribeBrowserSessionSync(null, bump, bump, bump)()
  assert.equal(calls, 0)
})

test('startup reads the pending marker and shared barrier blocks even direct session refresh', async () => {
  const browser = fakeBrowser()
  const fence = new SessionFence()
  let reads = 0
  const stop = subscribeBrowserSessionSync({ ...browser.events, readSignal: () => 'changing:10:20' },
    () => { fence.invalidate() }, () => undefined, () => undefined,
    { begin: id => fence.beginChange(id), end: id => fence.endChange(id) })
  await revalidateSession(fence, async () => { reads += 1; throw new Error('must not read') },
    () => assert.fail('must not apply'), () => assert.fail('must not fail'))
  assert.equal(reads, 0)
  assert.throws(() => fence.capture(), SessionCheckRequired)
  browser.emit('storage', { key: BROWSER_SESSION_SIGNAL_KEY, newValue: 'changed:10:20' })
  assert.equal(fence.canVerify(), true)
  stop()
})
