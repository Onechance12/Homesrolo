export interface RoloConversationAccessState {
  readonly persistenceKey: string | null
  readonly homePersistenceKey: string | null
  readonly authorizedHomeScope: string | null
  readonly hydratedScope: string | null
}

/**
 * A saved conversation may render only after the current session has proved
 * access to this exact home and hydrated this exact thread. Keeping both
 * checks explicit prevents a previously open thread from flashing while a
 * focus-time authorization request is pending, hanging, or rejected.
 */
export function roloConversationAccessReady(state: RoloConversationAccessState): boolean {
  return state.persistenceKey !== null
    && state.homePersistenceKey !== null
    && state.authorizedHomeScope === state.homePersistenceKey
    && state.hydratedScope === state.persistenceKey
}
