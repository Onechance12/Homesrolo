import assert from 'node:assert/strict'
import test from 'node:test'
import { roloConversationAccessReady } from './conversation-access.ts'

const homePersistenceKey = `hprn_${'P'.repeat(43)}.hhom_${'H'.repeat(43)}`
const persistenceKey = `${homePersistenceKey}.hprj_${'J'.repeat(43)}`

test('a hanging or failed home authorization cannot expose a previously hydrated thread', () => {
  const formerlyHydrated = {
    persistenceKey,
    homePersistenceKey,
    hydratedScope: persistenceKey,
  }

  assert.equal(roloConversationAccessReady({
    ...formerlyHydrated,
    authorizedHomeScope: null,
  }), false)
  assert.equal(roloConversationAccessReady({
    ...formerlyHydrated,
    authorizedHomeScope: `${homePersistenceKey}-other-home`,
  }), false)
})

test('an exact-home authorization renders only its exact hydrated thread', () => {
  assert.equal(roloConversationAccessReady({
    persistenceKey,
    homePersistenceKey,
    authorizedHomeScope: homePersistenceKey,
    hydratedScope: persistenceKey,
  }), true)
  assert.equal(roloConversationAccessReady({
    persistenceKey,
    homePersistenceKey,
    authorizedHomeScope: homePersistenceKey,
    hydratedScope: null,
  }), false)
})
