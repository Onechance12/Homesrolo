import assert from 'node:assert/strict'
import test from 'node:test'
import { projectRoloConversation } from './conversation-persistence.ts'
import { createRoloConversationStorage, memoryRoloRawStorage } from './conversation-storage.ts'
import { roloConversationAccessReady } from './conversation-access.ts'
import { clearRoloHomeAfterConfirmedDenial, roloHomeAccessFailureKind } from './home-access.ts'

const scope = { principalRef: `hprn_${'P'.repeat(43)}`, homeRef: `hhom_${'H'.repeat(43)}` }
const otherPrincipal = { ...scope, principalRef: `hprn_${'Q'.repeat(43)}` }
const otherHome = { ...scope, homeRef: `hhom_${'G'.repeat(43)}` }
const projectA = `hprj_${'A'.repeat(43)}`
const projectB = `hprj_${'B'.repeat(43)}`

function conversation(target = scope, projectRef = projectA) {
  return projectRoloConversation({
    ...target, projectRef,
    turns: [{ role: 'user', text: 'Private synthetic project discussion.' }],
    proposedWork: null, followUp: null, suggestion: null, attachment: null,
    photoReview: null, photoReviewTitle: null, photoReviewRef: null,
  })!
}

function failure(status: number, code = status === 403 ? 'forbidden' : status === 404 ? 'not_found' : 'unavailable'): Error {
  return Object.assign(new Error('synthetic request failure'), { status, code })
}

for (const error of [new TypeError('Failed to fetch'), failure(0), failure(200), failure(401),
  failure(403, 'invalid_response'), failure(404, 'unavailable'),
  failure(408), failure(429), failure(500), failure(502), failure(503), failure(504)]) {
  test(`uncertain home access (${Object.hasOwn(error, 'status') ? (error as Error & { status: number }).status : 'network'}) preserves all project threads behind the fence`, async () => {
    const storage = createRoloConversationStorage(memoryRoloRawStorage())
    const a = conversation()
    const b = conversation(scope, projectB)
    await storage.write(a)
    await storage.write(b)

    assert.equal(roloHomeAccessFailureKind(error), 'unavailable')
    await clearRoloHomeAfterConfirmedDenial(error, scope, storage)
    const homePersistenceKey = `${scope.principalRef}.${scope.homeRef}`
    const persistenceKey = `${homePersistenceKey}.${projectA}`
    assert.equal(roloConversationAccessReady({
      persistenceKey, homePersistenceKey, authorizedHomeScope: null, hydratedScope: persistenceKey,
    }), false)
    // A later successful authorization can rehydrate the exact original data.
    assert.deepEqual(await storage.read({ ...scope, projectRef: projectA }), a)
    assert.deepEqual(await storage.read({ ...scope, projectRef: projectB }), b)
    assert.equal(roloConversationAccessReady({
      persistenceKey, homePersistenceKey, authorizedHomeScope: homePersistenceKey, hydratedScope: persistenceKey,
    }), true)
  })
}

for (const status of [403, 404]) {
  test(`confirmed ${status} denial clears only the exact principal/home`, async () => {
    const storage = createRoloConversationStorage(memoryRoloRawStorage())
    for (const value of [conversation(), conversation(scope, projectB),
      conversation(otherPrincipal), conversation(otherHome)]) await storage.write(value)

    assert.equal(roloHomeAccessFailureKind(failure(status)), 'revoked')
    await clearRoloHomeAfterConfirmedDenial(failure(status), scope, storage)
    assert.equal(await storage.read({ ...scope, projectRef: projectA }), null)
    assert.equal(await storage.read({ ...scope, projectRef: projectB }), null)
    assert.deepEqual(await storage.read({ ...otherPrincipal, projectRef: projectA }), conversation(otherPrincipal))
    assert.deepEqual(await storage.read({ ...otherHome, projectRef: projectA }), conversation(otherHome))
  })
}

test('unknown error shapes do not authorize deletion, and a failed purge does not throw', async () => {
  assert.equal(roloHomeAccessFailureKind({ status: 403 }), 'unavailable')
  assert.equal(roloHomeAccessFailureKind(Object.assign(new Error('bad status'), { status: '403' })), 'unavailable')
  await assert.doesNotReject(clearRoloHomeAfterConfirmedDenial(failure(403), scope, {
    clearHome: async () => { throw new Error('storage unavailable') },
  }))
})
