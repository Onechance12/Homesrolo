import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImperativeRouter } from 'expo-router'
import {
  HOME_CHOOSER_ROUTE,
  openSelectedHome,
  returnToHomeChooser,
  type SelectedHomeRoute,
} from './navigation.ts'

test('switching homes dismisses to the chooser instead of adding stale home history', () => {
  const destinations: unknown[] = []
  const navigation = {
    dismissTo: (destination: Parameters<ImperativeRouter['dismissTo']>[0]) => {
      destinations.push(destination)
    },
  }

  returnToHomeChooser(navigation)

  assert.deepEqual(destinations, [HOME_CHOOSER_ROUTE])
})

test('selecting a home pushes it above the chooser anchor', () => {
  const homeId = `hhom_${'h'.repeat(43)}`
  const destinations: SelectedHomeRoute[] = []
  const navigation = {
    push: (destination: Parameters<ImperativeRouter['push']>[0]) => {
      destinations.push(destination as SelectedHomeRoute)
    },
  }

  openSelectedHome(navigation, homeId)

  assert.deepEqual(destinations, [{
    pathname: '/home/[homeId]/rolo',
    params: { homeId },
  }])
})

test('choosing a second home and going back cannot uncover the first home', () => {
  const firstHomeId = `hhom_${'a'.repeat(43)}`
  const secondHomeId = `hhom_${'b'.repeat(43)}`
  const history = [HOME_CHOOSER_ROUTE as string]
  const navigation = {
    push: (destination: Parameters<ImperativeRouter['push']>[0]) => {
      const route = destination as SelectedHomeRoute
      history.push(`/home/${route.params.homeId}/rolo`)
    },
    dismissTo: (destination: Parameters<ImperativeRouter['dismissTo']>[0]) => {
      const index = history.lastIndexOf(destination as string)
      if (index >= 0) history.splice(index + 1)
      else history.splice(history.length - 1, 1, destination as string)
    },
  }

  openSelectedHome(navigation, firstHomeId)
  history.push(`/home/${firstHomeId}/work/hprj_${'p'.repeat(43)}`)
  returnToHomeChooser(navigation)
  openSelectedHome(navigation, secondHomeId)
  history.pop()

  assert.deepEqual(history, [HOME_CHOOSER_ROUTE])
  assert.equal(history.some(route => route.includes(firstHomeId)), false)
})
