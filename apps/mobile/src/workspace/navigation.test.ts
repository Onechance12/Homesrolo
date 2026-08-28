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
    pathname: '/home/[homeId]/rolo',
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

test('repeated Home and Pro switches replace the prior role instead of appending it', () => {
  let history: string[] = ['/home/first/rolo', '/home/first/work/project']
  const navigation = {
    dismissAll: () => { history = [] },
    replace: (destination: Parameters<ImperativeRouter['replace']>[0]) => {
      history = [typeof destination === 'string'
        ? destination
        : `${destination.pathname}:${String(destination.params?.homeId ?? '')}`]
    },
  }

  replaceWorkspace(navigation, '/pro')
  assert.deepEqual(history, ['/pro'])

  replaceWorkspace(navigation, {
    pathname: '/home/[homeId]/rolo',
    params: { homeId: `hhom_${'b'.repeat(43)}` },
  })
  assert.deepEqual(history, [`/home/[homeId]/rolo:hhom_${'b'.repeat(43)}`])
})
