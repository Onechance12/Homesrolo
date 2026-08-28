import type { ImperativeRouter } from 'expo-router'

export type WorkspaceRoute = '/pro' | {
  readonly pathname: '/home/[homeId]'
  readonly params: { readonly homeId: string }
}

/**
 * A workspace switch is a new app root, not another page on the old stack.
 * Clearing the stack first prevents Back from revealing a different home or
 * the homeowner UI underneath the Pro workspace.
 */
export function replaceWorkspace(
  navigation: Pick<ImperativeRouter, 'dismissAll' | 'replace'>,
  destination: WorkspaceRoute,
): void {
  navigation.dismissAll()
  navigation.replace(destination)
}
