'use client'

/**
 * The port provider — the ONE place the application chooses its data source.
 *
 * FOR CODEX: to attach the real authenticated runtime, implement
 * `HomeownerDataPort` and change the `port` line below (or inject per
 * environment). Every screen consumes the port through `usePort()` and
 * `useSession()`; none of them know which implementation is behind it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { syntheticPort } from './synthetic.ts'
import type { HomeownerDataPort, SessionState } from './types.ts'

// MOCK: the Phase 1 shell wires the synthetic in-memory adapter.
const port: HomeownerDataPort = syntheticPort

type SessionView =
  | { readonly kind: 'loading' }
  | SessionState

const PortContext = createContext<HomeownerDataPort>(port)
const SessionContext = createContext<{
  state: SessionView
  refresh: () => Promise<void>
}>({ state: { kind: 'loading' }, refresh: async () => {} })

export function PortProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionView>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    const next = await port.getSession()
    setState(next)
  }, [])

  useEffect(() => {
    // The session read settles asynchronously, so the setState inside refresh
    // is never synchronous within this effect.
    let live = true
    void port.getSession().then(next => { if (live) setState(next) })
    return () => { live = false }
  }, [])

  const sessionValue = useMemo(() => ({ state, refresh }), [state, refresh])

  return (
    <PortContext.Provider value={port}>
      <SessionContext.Provider value={sessionValue}>
        {children}
      </SessionContext.Provider>
    </PortContext.Provider>
  )
}

export function usePort(): HomeownerDataPort {
  return useContext(PortContext)
}

export function useSession() {
  return useContext(SessionContext)
}
