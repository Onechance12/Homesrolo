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
import { createRemotePort } from './remote.ts'
import { fetchJsonTransport } from './transport.ts'
import { activePortMode, type PortMode } from './mode.ts'
import type { HomeownerDataPort, SessionState } from './types.ts'

/**
 * The adapter is chosen once, from the fail-closed mode resolver: synthetic
 * unless the build was deliberately configured 'remote'. No other file makes
 * this choice, and no runtime input can change it.
 */
const mode: PortMode = activePortMode()
const port: HomeownerDataPort = mode === 'remote'
  ? createRemotePort(fetchJsonTransport)
  : syntheticPort

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

/** Which adapter this build runs. Screens use it for honest labelling only. */
export function usePortMode(): PortMode {
  return mode
}

export function useSession() {
  return useContext(SessionContext)
}
