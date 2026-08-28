import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImperativeRouter } from 'expo-router'
import { replaceWorkspace, type WorkspaceRoute } from './navigation.ts'

test('switching spaces clears the old navigation stack before opening the destination', () => {
  const calls: Array<'dismissAll' | { readonly replace: WorkspaceRoute }> = []
  const navigation = {
    dismissAll: () => { calls.push('dismissAll') },
    replace: (destination: Parameters<ImperativeRouter['replace']>[0]) => {
      calls.push({ replace: destination as WorkspaceRoute })
    },
  }
  const destination = {
    pathname: '/home/[homeId]',
    params: { homeId: `hhom_${'h'.repeat(43)}` },
  } as const

  replaceWorkspace(navigation, destination)

  assert.deepEqual(calls, ['dismissAll', { replace: destination }])
})

test('the Pro workspace uses the same clean-root switch', () => {
  const calls: string[] = []
  replaceWorkspace({
    dismissAll: () => { calls.push('dismiss') },
    replace: destination => { calls.push(String(destination)) },
  }, '/pro')

  assert.deepEqual(calls, ['dismiss', '/pro'])
})
