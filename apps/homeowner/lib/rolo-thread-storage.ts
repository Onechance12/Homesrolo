'use client'

const ROLO_THREAD_PREFIX = 'homesrolo:rolo-thread:'

export function roloThreadStorageKey(homeRef: string, principalRef: string) {
  return `${ROLO_THREAD_PREFIX}${principalRef}:${homeRef}`
}

export function clearRoloThreadsForPrincipal(principalRef: string) {
  try {
    const prefix = `${ROLO_THREAD_PREFIX}${principalRef}:`
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key)
    }
  } catch {
    // Sign-out still succeeds when browser storage is unavailable.
  }
}
