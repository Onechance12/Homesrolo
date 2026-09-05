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
const projectRef = `hprj_${'J'.repeat(43)}`
const otherProjectRef = `hprj_${'K'.repeat(43)}`
const projectScope = { ...scope, projectRef }
const key = `${scope.principalRef}.${scope.homeRef}.${projectRef}`
const legacyKey = `${scope.principalRef}.${scope.homeRef}`

function conversation(ref = projectRef, text = 'My faucet is leaking.') {
  return conversationFor(scope, ref, text)
}

function conversationFor(
  targetScope: RoloConversationScope,
  ref = projectRef,
  text = 'My faucet is leaking.',
) {
  return projectRoloConversation({
    ...targetScope,
    projectRef: ref,
    turns: [{ role: 'user', text }],
    proposedWork: null,
    followUp: 'Is the water shutoff reachable?',
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
  })!
}

test('project conversations coexist and round-trip only within their exact scope', async () => {
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)
  const value = conversation()
  const other = conversation(otherProjectRef, 'Help me plan the kitchen.')
  await storage.write(value)
  await storage.write(other)
  assert.deepEqual(await storage.read(projectScope), value)
  assert.deepEqual(await storage.read({ ...scope, projectRef: otherProjectRef }), other)
  assert.equal(await storage.read(scope), null)
  assert.equal(await storage.read({ ...projectScope, homeRef: `hhom_${'X'.repeat(43)}` }), null)
  await storage.remove(projectScope)
  assert.equal(await storage.read(projectScope), null)
  assert.deepEqual(await storage.read({ ...scope, projectRef: otherProjectRef }), other)
})

test('corrupt, oversized, and scope-mismatched values are removed', async () => {
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)

  await driver.write(key, '{broken')
  assert.equal(await storage.read(projectScope), null)
  assert.equal(driver.values.has(key), false)

  await driver.write(key, 'x'.repeat(25 * 1024))
  assert.equal(await storage.read(projectScope), null)
  assert.equal(driver.values.has(key), false)

  const wrongScope = {
    ...conversation(),
    projectRef: otherProjectRef,
  }
  await driver.write(key, JSON.stringify(wrongScope))
  assert.equal(await storage.read(projectScope), null)
  assert.equal(driver.values.has(key), false)
})

test('an exact project can migrate its valid legacy home thread once', async () => {
  const value = conversation()
  const driver = memoryRoloRawStorage({ [legacyKey]: serializeRoloConversation(value) })
  const storage = createRoloConversationStorage(driver)

  assert.deepEqual(await storage.read(projectScope), value)
  assert.equal(driver.values.has(legacyKey), false)
  assert.equal(driver.values.get(key), serializeRoloConversation(value))
})

test('a storage read failure remains an error and cannot be mistaken for an empty thread', async () => {
  const driver = memoryRoloRawStorage()
  const removed: string[] = []
  const storage = createRoloConversationStorage({
    ...driver,
    read: async () => { throw new Error('storage_unavailable') },
    remove: async item => { removed.push(item) },
  })

  await assert.rejects(storage.read(projectScope), /storage_unavailable/)
  assert.deepEqual(removed, [])
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
  const other = conversation(otherProjectRef, 'The upstairs AC is warm.')
  await storage.write(other)
  await storage.clearAll()
  assert.deepEqual([...values.keys()], ['homesrolo.web.session.v1'])
})

test('clearHome removes every thread for only the exact principal and home', async () => {
  const otherHomeScope: RoloConversationScope = {
    ...scope,
    homeRef: `hhom_${'X'.repeat(43)}`,
  }
  const otherPrincipalScope: RoloConversationScope = {
    ...scope,
    principalRef: `hprn_${'Q'.repeat(43)}`,
  }
  const target = conversation()
  const targetOtherProject = conversation(otherProjectRef, 'Plan the kitchen.')
  const otherHome = conversationFor(otherHomeScope, projectRef, 'This belongs to another home.')
  const otherPrincipal = conversationFor(otherPrincipalScope, projectRef, 'This belongs to another person.')
  const driver = memoryRoloRawStorage()
  const storage = createRoloConversationStorage(driver)

  await storage.write(target)
  await storage.write(targetOtherProject)
  await storage.write(otherHome)
  await storage.write(otherPrincipal)
  await driver.write(legacyKey, serializeRoloConversation(target))
  await storage.clearHome(scope)

  assert.equal(await storage.read(projectScope), null)
  assert.equal(await storage.read({ ...scope, projectRef: otherProjectRef }), null)
  assert.equal(driver.values.has(legacyKey), false)
  assert.deepEqual(await storage.read({ ...otherHomeScope, projectRef }), otherHome)
  assert.deepEqual(await storage.read({ ...otherPrincipalScope, projectRef }), otherPrincipal)
})

test('web clearHome preserves unrelated origin data and other homes', async () => {
  const values = new Map<string, string>()
  const origin = {
    get length() { return values.size },
    getItem: (item: string) => values.get(item) ?? null,
    setItem: (item: string, value: string) => { values.set(item, value) },
    removeItem: (item: string) => { values.delete(item) },
    key: (index: number) => [...values.keys()][index] ?? null,
  }
  const otherHomeScope: RoloConversationScope = {
    ...scope,
    homeRef: `hhom_${'X'.repeat(43)}`,
  }
  const otherHome = conversationFor(otherHomeScope)
  values.set('homesrolo.web.session.v1', 'keep-session')
  const storage = createRoloConversationStorage(webRoloRawStorage(() => origin))
  await storage.write(conversation())
  await storage.write(conversation(otherProjectRef))
  await storage.write(otherHome)

  await storage.clearHome(scope)

  assert.equal(await storage.read(projectScope), null)
  assert.equal(await storage.read({ ...scope, projectRef: otherProjectRef }), null)
  assert.deepEqual(await storage.read({ ...otherHomeScope, projectRef }), otherHome)
  assert.equal(values.get('homesrolo.web.session.v1'), 'keep-session')
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
  assert.match(provider, /finally \{\s*await clearLocalSession\(\)/)
})
