import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkspacePreferenceStore,
  parseWorkspacePreference,
  workspacePreferenceKey,
  type WorkspacePreferenceStorage,
} from './preference-core.ts'

const principalRef = `hprn_${'p'.repeat(43)}`

function memoryStorage(initial: string | null = null) {
  let value = initial
  const storage: WorkspacePreferenceStorage = {
    read: async key => key === workspacePreferenceKey(principalRef) ? value : null,
    write: async (key, next) => {
      assert.equal(key, workspacePreferenceKey(principalRef))
      value = next
    },
    remove: async key => {
      assert.equal(key, workspacePreferenceKey(principalRef))
      value = null
    },
  }
  return { storage, value: () => value }
}

test('workspace preferences accept only the two supported workspaces', () => {
  assert.equal(parseWorkspacePreference('home'), 'home')
  assert.equal(parseWorkspacePreference('pro'), 'pro')
  assert.equal(parseWorkspacePreference('professional'), null)
  assert.equal(parseWorkspacePreference(null), null)
})

test('workspace preference keys are principal scoped and reject malformed refs', () => {
  assert.equal(workspacePreferenceKey(principalRef), `homesrolo.workspace.v1.${principalRef}`)
  assert.notEqual(
    workspacePreferenceKey(principalRef),
    workspacePreferenceKey(`hprn_${'q'.repeat(43)}`),
  )
  assert.throws(() => workspacePreferenceKey('hprn_bad'), /invalid_principal_ref/)
})

test('workspace preference store reads, writes, and clears a scoped choice', async () => {
  const memory = memoryStorage()
  const store = createWorkspacePreferenceStore(memory.storage)

  assert.equal(await store.read(principalRef), null)
  await store.write(principalRef, 'pro')
  assert.equal(memory.value(), 'pro')
  assert.equal(await store.read(principalRef), 'pro')
  await store.clear(principalRef)
  assert.equal(await store.read(principalRef), null)
})

test('storage failures never prevent workspace navigation', async () => {
  const failing: WorkspacePreferenceStorage = {
    read: async () => { throw new Error('unavailable') },
    write: async () => { throw new Error('unavailable') },
    remove: async () => { throw new Error('unavailable') },
  }
  const store = createWorkspacePreferenceStore(failing)
  assert.equal(await store.read(principalRef), null)
  await assert.doesNotReject(store.write(principalRef, 'home'))
  await assert.doesNotReject(store.clear(principalRef))
})
