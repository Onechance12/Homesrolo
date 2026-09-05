import { SessionCheckRequired } from '../auth/session-fence.ts'

/** Only read loaders use this recovery; submitted mutations must never replay. */
export async function retryResourceAfterSessionCheck(
  error: unknown,
  isActive: () => boolean,
  reload: () => void,
): Promise<void> {
  if (error instanceof SessionCheckRequired && error.resumeWhenVerified
    && await error.resumeWhenVerified() && isActive()) reload()
}
