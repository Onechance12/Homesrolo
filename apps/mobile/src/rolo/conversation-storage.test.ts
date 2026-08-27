import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  projectRoloConversation,
  serializeRoloConversation,
  type RoloConversationScope,
} from './conversation-persistence.ts'
import {
  createRoloConversationStorage,
  memoryRoloRawStorage,
  webRoloRawStorage,
} from './conversation-storage.ts'

const scope: RoloConversationScope = {
  principalRef: `hprn_${'P'.repeat(43)}`,
  homeRef: `hhom_${'H'.repeat(43)}`,
}
const key = `${scope.principalRef}.${scope.homeRef}`

function conversation() {
  return projectRoloConversation({
    ...scope,
    turns: [{ role: 'user', text: 'My faucet is leaking.' }],
    proposedWork: null,
    followUp: 'Is the water shutoff reachable?',
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
  })!
}

test('conversation storage round-trips only within its exact principal and home key', async () => {
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)
  const value = conversation()
  await storage.write(value)
  assert.deepEqual(await storage.read(scope), value)
  assert.equal(await storage.read({ ...scope, homeRef: `hhom_${'X'.repeat(43)}` }), null)
  await storage.remove(scope)
  assert.equal(await storage.read(scope), null)
})

test('corrupt, oversized, and scope-mismatched values are removed', async () => {
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)

  await driver.write(key, '{broken')
  assert.equal(await storage.read(scope), null)
  assert.equal(driver.values.has(key), false)

  await driver.write(key, 'x'.repeat(25 * 1024))
  assert.equal(await storage.read(scope), null)
  assert.equal(driver.values.has(key), false)

  const wrongScope = {
    ...conversation(),
    homeRef: `hhom_${'X'.repeat(43)}`,
  }
  await driver.write(key, JSON.stringify(wrongScope))
  assert.equal(await storage.read(scope), null)
  assert.equal(driver.values.has(key), false)
})

test('clearAll removes every Rolo thread without touching other origin data', async () => {
  const values = new Map<string, string>()
  const origin = {
    get length() { return values.size },
    getItem: (item: string) => values.get(item) ?? null,
    setItem: (item: string, value: string) => { values.set(item, value) },
    removeItem: (item: string) => { values.delete(item) },
    key: (index: number) => [...values.keys()][index] ?? null,
  }
  values.set('homesrolo.web.session.v1', 'keep-this-credential-key-until-session-clears-it')
  const storage = createRoloConversationStorage(webRoloRawStorage(() => origin))
  await storage.write(conversation())
  const other = {
    ...conversation(),
    homeRef: `hhom_${'X'.repeat(43)}`,
  }
  await storage.write(other)
  await storage.clearAll()
  assert.deepEqual([...values.keys()], ['homesrolo.web.session.v1'])
})

test('serialized conversation contains no storage-only wrapper or hidden payload', async () => {
  const value = conversation()
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)
  await storage.write(value)
  assert.equal(driver.values.get(key), serializeRoloConversation(value))
})

test('every local sign-out path clears credentials and all Rolo continuity data', () => {
  const provider = readFileSync(
    new URL('../auth/SessionProvider.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    provider,
    /const clearLocalSession[\s\S]*Promise\.allSettled\(\[[\s\S]*runtime\.storage\.remove\(\)[\s\S]*runtime\.roloStorage\.clearAll\(\)[\s\S]*\]\)/,
  )
  assert.match(provider, /if \(!tokenRef\.current && !runtime\.previewMode\) \{\s*await clearLocalSession\(\)/)
  assert.match(provider, /if \(!token\) \{\s*await clearLocalSession\(\)/)
  assert.match(provider, /finally \{ await clearLocalSession\(\) \}/)
})
