/** Shared browser-only invalidation hint. Not a server/authority contract. */
export const BROWSER_SESSION_SIGNAL_KEY = 'homesrolo.browser-session-change.v1'

export type BrowserSessionSignalPhase = 'changing' | 'changed'

export function parseBrowserSessionSignal(value: unknown): {
  readonly phase: BrowserSessionSignalPhase
  readonly changeId: string
} | null {
  if (typeof value !== 'string' || value.length > 100) return null
  const match = /^(changing|changed):(\d+:\d+)$/.exec(value)
  return (match?.[1] === 'changing' || match?.[1] === 'changed') && match[2]
    ? { phase: match[1], changeId: match[2] } : null
}

/** Storage failures must not prevent the cookie sign-in or sign-out itself. */
export function beginBrowserSessionChange(
  write: (key: string, value: string) => void,
): () => void {
  const changeId = `${Date.now()}:${Math.floor(Math.random() * 1_000_000_000)}`
  const emit = (phase: BrowserSessionSignalPhase) => {
    try { write(BROWSER_SESSION_SIGNAL_KEY, `${phase}:${changeId}`) } catch {
      // Focus and visibility checks remain available without storage.
    }
  }
  emit('changing')
  return () => emit('changed')
}
