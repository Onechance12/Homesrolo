import assert from 'node:assert/strict'
import test from 'node:test'
import { webCredentialStorage } from './credential-storage.ts'

const validToken = `hsess_${'s'.repeat(43)}`

function fakeOriginStorage(initial: string | null = null) {
  const values = new Map<string, string>()
  if (initial !== null) values.set('homesrolo.web.session.v1', initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

test('web credential storage can consume a legacy token but never persist a new one', async () => {
  const originStorage = fakeOriginStorage(validToken)
  const storage = webCredentialStorage(() => originStorage)

  assert.equal(await storage.read(), validToken)
  await storage.remove()
  assert.equal(await storage.read(), null)
  await assert.rejects(storage.write(validToken), /web_sessions_are_cookie_only/)
  assert.equal(await storage.read(), null)
})

test('web credential storage removes a corrupt value instead of authenticating with it', async () => {
  const originStorage = fakeOriginStorage('corrupt')
  const storage = webCredentialStorage(() => originStorage)

  assert.equal(await storage.read(), null)
  assert.equal(await storage.read(), null)
})

test('cookie authentication does not fail when browser storage is unavailable', async () => {
  const storage = webCredentialStorage(() => { throw new Error('blocked') })
  assert.equal(await storage.read(), null)
  await storage.remove()
  await assert.rejects(storage.write(validToken), /web_sessions_are_cookie_only/)
})
