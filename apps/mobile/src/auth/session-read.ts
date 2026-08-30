import type { HomesroloApi } from '../api/contract.ts'
import type { ServerSession } from '../api/model.ts'

const RETRY_DELAYS_MS = [250, 700] as const

type Pause = (milliseconds: number) => Promise<void>

function defaultPause(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function retryableSessionRead(error: unknown): boolean {
  if (!(error instanceof Error) || !Object.hasOwn(error, 'status')) return false
  const status = (error as Error & { readonly status?: unknown }).status
  return status === 0 || status === 502 || status === 503 || status === 504
}

/**
 * A startup session read is idempotent, so it may absorb two short connection
 * blips. No write or command call shares this retry behavior.
 */
export async function readSessionWithRetry(
  api: Pick<HomesroloApi, 'session'>,
  pause: Pause = defaultPause,
): Promise<ServerSession> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.session()
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !retryableSessionRead(error)) throw error
      await pause(delay)
    }
  }
}
