import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { HomesroloApi } from '../api/contract.ts'
import type { ServerSession } from '../api/model.ts'
import { revalidateSession, SessionCheckRequired, SessionFence, sessionBoundApi } from './session-fence.ts'
import { retryResourceAfterSessionCheck } from '../hooks/session-resource-retry.ts'

const capabilities = {
  emailCodeSignIn: true, magicLinkSignIn: false, persistence: true, projectQuotes: true,
  homeResearch: false, homeAssistant: true, homeAssistantVision: false, uploads: true,
  photoCheckups: false, projectReview: false, projectReviewAttachments: false,
  homeRecordHandoffs: false, invitations: true, sharing: true,
}
const alice: ServerSession = {
  apiVersion: 'homeowner-api.v1-draft', kind: 'signed_in',
  principalRef: `hprn_${'A'.repeat(43)}`, capabilities,
}
const bob: ServerSession = { ...alice, principalRef: `hprn_${'B'.repeat(43)}` }
const signedOut: ServerSession = { apiVersion: 'homeowner-api.v1-draft', kind: 'signed_out', capabilities }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('a cookie mutation cannot dispatch before session confirmation or while uncertain', async () => {
  const fence = new SessionFence()
  let writes = 0
  const raw = { async createWork() { writes += 1; return 'saved' } } as unknown as HomesroloApi
  await assert.rejects(sessionBoundApi(raw, fence, null, true).createWork('home', {} as never), SessionCheckRequired)
  assert.equal(writes, 0)
  fence.confirm(0, alice)
  const api = sessionBoundApi(raw, fence, alice.principalRef, true)
  await api.createWork('home', {} as never)
  assert.equal(writes, 1)
  fence.invalidate()
  await assert.rejects(api.createWork('home', {} as never), SessionCheckRequired)
  assert.equal(writes, 1)
})

test('old identity API references stay blocked after a different principal is confirmed', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  let writes = 0
  const raw = { async createWork() { writes += 1; return 'saved' } } as unknown as HomesroloApi
  const oldApi = sessionBoundApi(raw, fence, alice.principalRef, true)
  fence.confirm(fence.invalidate(), bob)
  await assert.rejects(oldApi.createWork('shared-home', {} as never), SessionCheckRequired)
  const newApi = sessionBoundApi(raw, fence, bob.principalRef, true)
  await newApi.createWork('shared-home', {} as never)
  assert.equal(writes, 1)
})

test('same-principal revalidation reopens the existing API binding', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  const raw = { async listHomes() { return [] } } as unknown as HomesroloApi
  const api = sessionBoundApi(raw, fence, alice.principalRef, true)
  const generation = fence.invalidate()
  await assert.rejects(api.listHomes(), SessionCheckRequired)
  fence.confirm(generation, alice)
  assert.deepEqual(await api.listHomes(), [])
})

test('late private success and rejection cannot reach a newly confirmed identity', async () => {
  for (const outcome of ['success', '401'] as const) {
    const fence = new SessionFence()
    fence.confirm(0, alice)
    const read = deferred<unknown>()
    const raw = { listHomes: () => read.promise } as unknown as HomesroloApi
    const oldApi = sessionBoundApi(raw, fence, alice.principalRef, true)
    const result = oldApi.listHomes()
    const rejected = assert.rejects(result, SessionCheckRequired)
    fence.confirm(fence.invalidate(), bob)
    if (outcome === 'success') read.resolve(['private Alice home'])
    else read.reject(Object.assign(new Error('signed_out'), { status: 401 }))
    await rejected
    assert.doesNotThrow(() => fence.capture(bob.principalRef))
  }
})

test('newer session confirmation wins over both old success and old 401', async () => {
  for (const outcome of ['success', '401'] as const) {
    const fence = new SessionFence()
    const oldRead = deferred<ServerSession>()
    const applied: ServerSession[] = []
    const failures: unknown[] = []
    const old = revalidateSession(fence, () => oldRead.promise,
      value => { applied.push(value) }, error => { failures.push(error) })
    await revalidateSession(fence, async () => bob,
      value => { applied.push(value) }, error => { failures.push(error) })
    if (outcome === 'success') oldRead.resolve(alice)
    else oldRead.reject(Object.assign(new Error('signed_out'), { status: 401 }))
    await old
    assert.deepEqual(applied, [bob])
    assert.deepEqual(failures, [])
    assert.doesNotThrow(() => fence.capture(bob.principalRef))
  }
})

test('transient checks do not request a purge; only current authoritative sign-out does', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  let purges = 0
  let errors = 0
  const apply = (session: ServerSession) => { if (session.kind === 'signed_out') purges += 1 }
  await revalidateSession(fence, async () => { throw new Error('network unavailable') }, apply, () => { errors += 1 })
  assert.equal(errors, 1)
  assert.equal(purges, 0)
  assert.throws(() => fence.capture(alice.principalRef), SessionCheckRequired)
  await revalidateSession(fence, async () => alice, apply, () => { errors += 1 })
  assert.equal(purges, 0)
  await revalidateSession(fence, async () => signedOut, apply, () => { errors += 1 })
  assert.equal(purges, 1)
  assert.throws(() => fence.capture(), SessionCheckRequired)
})

test('request lease rejects a stale 401 before the signed-out callback can run', () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  const confirmCurrent = fence.capture()
  let signedOutCalls = 0
  fence.confirm(fence.invalidate(), bob)
  assert.throws(() => {
    confirmCurrent()
    signedOutCalls += 1
  }, SessionCheckRequired)
  assert.equal(signedOutCalls, 0)
})

test('native bearer and preview API behavior is unchanged by the cookie fence', async () => {
  const raw = { async listHomes() { return ['native'] } } as unknown as HomesroloApi
  const api = sessionBoundApi(raw, new SessionFence(), null, false)
  assert.equal(api, raw)
  assert.deepEqual(await api.listHomes(), ['native'])
})

test('provider keeps cookie descendants mounted behind an inaccessible curtain during checks', () => {
  const provider = readFileSync(new URL('./SessionProvider.tsx', import.meta.url), 'utf8')
  assert.match(provider, /if \(!cookieSession\) setState\(\{ kind: 'loading' \}\)/)
  assert.match(provider, /const identityVersion = cookieSession \? fence\.identityVersion : 0/)
  assert.match(provider, /\[cookieSession, fence, identityVersion, principalRef, rawApi\]/)
  assert.ok(provider.includes("key={cookieSession ? `${principalRef ?? 'signed-out'}:${identityVersion}` : 'native-session'}"))
  assert.match(provider, /hidden: \{ display: 'none' \}/)
  assert.match(provider, /pointerEvents=\{curtain \? 'none' : 'auto'\}/)
  assert.match(provider, /importantForAccessibility=\{curtain \? 'no-hide-descendants' : 'auto'\}/)
  assert.match(provider, /if \(cookieSession\) void refreshRef\.current\(\)/)
  assert.match(provider, /privateContentVisible: !cookieSession \|\| \(state.kind === 'signed_in' && verification === 'ready'\)/)
  const preview = readFileSync(new URL('../components/PhotoPreview.tsx', import.meta.url), 'utf8')
  assert.match(preview, /const \{ privateContentVisible \} = useSession\(\)/)
  assert.ok(preview.indexOf('if (!privateContentVisible) return null') < preview.indexOf('<Modal'))
  assert.match(provider, /if \(stateRef\.current\.kind !== 'signed_in'\) setState\(\{\s*kind: 'error'/)
})

test('all session reads are blocked during pending cookie changes, including direct/bootstrap refreshes', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  fence.beginChange('other-tab')
  let reads = 0
  let applied = 0
  const read = async () => { reads += 1; return alice }
  const apply = () => { applied += 1 }
  await revalidateSession(fence, read, apply, () => assert.fail('unexpected session failure'))
  assert.equal(reads, 0)
  assert.equal(applied, 0)
  assert.equal(fence.confirm(fence.invalidate(), alice), false)
  assert.throws(() => fence.capture(), SessionCheckRequired)
  fence.endChange('other-tab')
  await revalidateSession(fence, read, apply, () => assert.fail('unexpected session failure'))
  assert.equal(reads, 1)
  assert.equal(applied, 1)
})

test('a cookie change arriving during a session read prevents that completion from reopening the fence', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  const read = deferred<ServerSession>()
  const applied: ServerSession[] = []
  const refresh = revalidateSession(fence, () => read.promise, value => { applied.push(value) }, () => assert.fail('unexpected session failure'))
  fence.beginChange('other-tab')
  read.resolve(alice)
  await refresh
  assert.deepEqual(applied, [])
  assert.throws(() => fence.capture(), SessionCheckRequired)
})

test('only a blocked resource read recovers after same-person verification; writes are never replayed', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  const check = fence.capture()
  fence.invalidate()
  let blocked: unknown
  try { check() } catch (error) { blocked = error }
  let reloads = 0
  const recovery = retryResourceAfterSessionCheck(blocked, () => true, () => { reloads += 1 })
  assert.equal(reloads, 0)
  fence.confirm(fence.invalidate(), alice)
  await recovery
  assert.equal(reloads, 1)
  await retryResourceAfterSessionCheck(new Error('unavailable'), () => true, () => { reloads += 1 })
  assert.equal(reloads, 1)
})

test('resource recovery never reloads an unmounted or different-principal screen', async () => {
  for (const outcome of ['unmounted', 'changed', 'signed_out'] as const) {
    const fence = new SessionFence()
    fence.confirm(0, alice)
    const check = fence.capture()
    fence.invalidate()
    let blocked: unknown
    try { check() } catch (error) { blocked = error }
    let reloads = 0
    const recovery = retryResourceAfterSessionCheck(blocked, () => outcome !== 'unmounted', () => { reloads += 1 })
    if (outcome === 'signed_out') fence.reset()
    else fence.confirm(fence.invalidate(), outcome === 'changed' ? bob : alice)
    await recovery
    assert.equal(reloads, 0)
  }
})

test('an old account binding never revives after A to B to A', async () => {
  const fence = new SessionFence()
  fence.confirm(0, alice)
  const raw = { async listHomes() { return [] } } as unknown as HomesroloApi
  const oldApi = sessionBoundApi(raw, fence, alice.principalRef, true)
  fence.confirm(fence.invalidate(), bob)
  fence.confirm(fence.invalidate(), alice)
  await assert.rejects(oldApi.listHomes(), SessionCheckRequired)
})

test('confirmed identity lifetime changes across batched account transitions but not ordinary same-person checks', async () => {
  for (const intermediate of ['other-person', 'reset'] as const) {
    const fence = new SessionFence()
    fence.confirm(0, alice)
    const raw = { async listHomes() { return ['current home'] } } as unknown as HomesroloApi
    const oldApi = sessionBoundApi(raw, fence, alice.principalRef, true)
    const firstIdentity = fence.identityVersion
    fence.confirm(fence.invalidate(), alice)
    assert.equal(fence.identityVersion, firstIdentity, 'same-person checks preserve the memo and draft key')
    assert.deepEqual(await oldApi.listHomes(), ['current home'])
    // Neither intermediate state needs to render for the identity lifetime to
    // change; the next provider render sees A again with a new dependency/key.
    if (intermediate === 'reset') fence.reset()
    else fence.confirm(fence.invalidate(), bob)
    fence.confirm(fence.invalidate(), alice)
    assert.notEqual(fence.identityVersion, firstIdentity)
    await assert.rejects(oldApi.listHomes(), SessionCheckRequired)
    const freshApi = sessionBoundApi(raw, fence, alice.principalRef, true)
    assert.deepEqual(await freshApi.listHomes(), ['current home'])
  }
})
