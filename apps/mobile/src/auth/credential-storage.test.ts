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

test('web credential storage persists only valid session tokens', async () => {
  const originStorage = fakeOriginStorage()
  const storage = webCredentialStorage(() => originStorage)

  await storage.write(validToken)
  assert.equal(await storage.read(), validToken)
  await storage.remove()
  assert.equal(await storage.read(), null)
  await assert.rejects(storage.write('bad'), /invalid_session_token/)
})

test('web credential storage removes a corrupt value instead of authenticating with it', async () => {
  const originStorage = fakeOriginStorage('corrupt')
  const storage = webCredentialStorage(() => originStorage)

  assert.equal(await storage.read(), null)
  assert.equal(await storage.read(), null)
})
