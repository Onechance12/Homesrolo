import type { RoloConversationStorage, RoloHomeConversationScope } from './conversation-storage.ts'

export type RoloHomeAccessFailure = 'revoked' | 'unavailable'

/** Only an authoritative denial of this exact home's request may purge it. */
export function roloHomeAccessFailureKind(error: unknown): RoloHomeAccessFailure {
  if (!(error instanceof Error) || !Object.hasOwn(error, 'status')) return 'unavailable'
  const { status, code } = error as Error & { readonly status?: unknown; readonly code?: unknown }
  // A 401 is handled by session revalidation/sign-out, not by guessing which
  // principal lost access here. Network, malformed-response and 5xx failures
  // never prove that the homeowner's saved conversations should be deleted.
  // A proxy's generic 403/404 page is not an application authorization result.
  return (status === 403 && code === 'forbidden') || (status === 404 && code === 'not_found')
    ? 'revoked' : 'unavailable'
}

export async function clearRoloHomeAfterConfirmedDenial(
  error: unknown,
  scope: RoloHomeConversationScope,
  storage: Pick<RoloConversationStorage, 'clearHome'>,
): Promise<void> {
  if (roloHomeAccessFailureKind(error) !== 'revoked') return
  // Failure to remove inaccessible local data must not reopen the UI fence.
  try { await storage.clearHome(scope) } catch { /* Access remains closed. */ }
}
