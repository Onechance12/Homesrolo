import assert from 'node:assert/strict'
import test from 'node:test'
import type { CredentialStorage } from './credential-storage.ts'
import { bootstrapSessionToken } from './session-bootstrap.ts'

const TOKEN = 'p'.repeat(43)

function storage(initial: string | null, calls: string[]): CredentialStorage {
  let value = initial
  return {
    async read() { calls.push('read'); return value },
    async write(token) { calls.push(`write:${token}`); value = token },
    async remove() { calls.push('remove'); value = null },
  }
}

test('cookie bootstrap erases and exchanges the old PWA bearer without persisting it again', async () => {
  const calls: string[] = []
  const token = await bootstrapSessionToken({
    async upgradeLegacyPwaSession(legacyBearer) { calls.push(`upgrade:${legacyBearer}`) },
  }, storage(TOKEN, calls), 'cookie')
  assert.equal(token, null)
  assert.deepEqual(calls, ['read', 'remove', `upgrade:${TOKEN}`])
})

test('native bootstrap restores SecureStore without entering the PWA bridge', async () => {
  const calls: string[] = []
  const token = await bootstrapSessionToken({
    async upgradeLegacyPwaSession() {
      calls.push('upgrade')
      throw new Error('native must not enter the browser bridge')
    },
  }, storage(TOKEN, calls), 'bearer')
  assert.equal(token, TOKEN)
  assert.deepEqual(calls, ['read'])
})

test('cookie bootstrap validates an existing HttpOnly session without local credentials', async () => {
  const calls: string[] = []
  const token = await bootstrapSessionToken({
    async upgradeLegacyPwaSession(legacyBearer) { calls.push(`upgrade:${legacyBearer}`) },
  }, storage(null, calls), 'cookie')
  assert.equal(token, null)
  assert.deepEqual(calls, ['read', 'remove', 'upgrade:null'])
})

test('cookie bootstrap leaves no persisted bearer when migration is unavailable', async () => {
  const calls: string[] = []
  const unavailable = {
    async upgradeLegacyPwaSession(): Promise<void> {
      calls.push('upgrade')
      throw new Error('unavailable')
    },
  }
  await assert.rejects(
    bootstrapSessionToken(unavailable, storage(TOKEN, calls), 'cookie'),
    /unavailable/,
  )
  assert.deepEqual(calls, ['read', 'remove', 'upgrade', 'upgrade'])
})

test('cookie bootstrap falls back to an unambiguous HttpOnly cookie after credential mismatch', async () => {
  const calls: Array<string | null> = []
  const token = await bootstrapSessionToken({
    async upgradeLegacyPwaSession(legacyBearer) {
      calls.push(legacyBearer)
      if (legacyBearer) throw new Error('credential_mismatch')
    },
  }, storage(TOKEN, []), 'cookie')
  assert.equal(token, null)
  assert.deepEqual(calls, [TOKEN, null])
})
