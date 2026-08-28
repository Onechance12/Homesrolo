import type { ImperativeRouter } from 'expo-router'

export const HOME_CHOOSER_ROUTE = '/homes' as const

export type SelectedHomeRoute = {
  readonly pathname: '/home/[homeId]/rolo'
  readonly params: { readonly homeId: string }
}

/**
 * Return to the homes anchor instead of placing another homes screen on top of
 * the current home's history. This clears nested work/tab history when the
 * chooser is already in the stack and safely replaces the current route when
 * a user entered through a deep link.
 */
export function returnToHomeChooser(navigation: Pick<ImperativeRouter, 'dismissTo'>): void {
  navigation.dismissTo(HOME_CHOOSER_ROUTE)
}

/**
 * Keep the chooser underneath the selected home. Returning to the chooser can
 * then dismiss the current home rather than uncovering a previously selected
 * one.
 */
export function openSelectedHome(
  navigation: Pick<ImperativeRouter, 'push'>,
  homeId: string,
): void {
  navigation.push({ pathname: '/home/[homeId]/rolo', params: { homeId } })
}
