import {
  BROWSER_SESSION_SIGNAL_KEY,
  parseBrowserSessionSignal,
} from '../../../../shared/browser-session-signal.ts'

type BrowserEvent = 'focus' | 'blur' | 'pageshow' | 'visibilitychange' | 'storage'
interface SessionSignalEvent {
  readonly key?: string | null
  readonly newValue?: string | null
}

export interface BrowserSessionEvents {
  isVisible(): boolean
  readSignal?(): string | null
  listen(type: BrowserEvent, listener: (event: SessionSignalEvent) => void): () => void
  after(milliseconds: number, callback: () => void): () => void
}

export function subscribeBrowserSessionSync(
  events: BrowserSessionEvents | null,
  invalidate: () => void,
  revalidate: () => void,
  stalled: () => void,
  changes?: { begin(id: string): void; end(id: string): void },
): () => void {
  if (!events) return () => undefined
  const pending = new Map<string, () => void>()
  const receive = (value: unknown) => {
    const signal = parseBrowserSessionSignal(value)
    if (!signal) return
    if (signal.phase === 'changing') {
      changes?.begin(signal.changeId)
      invalidate()
      if (!pending.has(signal.changeId)) {
        pending.set(signal.changeId, events.after(60_000, () => {
          pending.delete(signal.changeId)
          changes?.end(signal.changeId)
          invalidate()
          stalled()
        }))
      }
    } else {
      pending.get(signal.changeId)?.()
      pending.delete(signal.changeId)
      changes?.end(signal.changeId)
      resume()
    }
  }
  const resume = () => {
    if (pending.size > 0) invalidate()
    else if (events.isVisible()) revalidate()
    else invalidate()
  }
  const stop = [
    events.listen('blur', invalidate),
    events.listen('focus', resume),
    events.listen('pageshow', resume),
    events.listen('visibilitychange', resume),
    events.listen('storage', event => {
      if (event.key !== BROWSER_SESSION_SIGNAL_KEY) return
      receive(event.newValue)
    }),
  ]
  // A tab opened during another tab's exchange did not receive its storage event.
  // Only the pending phase matters; settled markers need no redundant refresh.
  const initial = events.readSignal?.()
  if (parseBrowserSessionSignal(initial)?.phase === 'changing') receive(initial)
  return () => {
    for (const unsubscribe of stop) unsubscribe()
    for (const [id, cancel] of pending) { cancel(); changes?.end(id) }
    pending.clear()
  }
}

export function browserSessionEvents(): BrowserSessionEvents | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return {
    isVisible: () => document.visibilityState === 'visible',
    readSignal() {
      try { return window.localStorage.getItem(BROWSER_SESSION_SIGNAL_KEY) } catch { return null }
    },
    after(milliseconds, callback) {
      const timer = window.setTimeout(callback, milliseconds)
      return () => window.clearTimeout(timer)
    },
    listen(type, listener) {
      if (type === 'storage') {
        const receive = (event: StorageEvent) => listener({ key: event.key, newValue: event.newValue })
        window.addEventListener(type, receive)
        return () => window.removeEventListener(type, receive)
      }
      const target = type === 'visibilitychange' ? document : window
      const receive = () => listener({})
      target.addEventListener(type, receive)
      return () => target.removeEventListener(type, receive)
    },
  }
}
