import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { NativeApiError } from '../api/client.ts'
import type { HomesroloApi } from '../api/contract.ts'
import type { ServerSession } from '../api/model.ts'
import type { RoloConversationStorage } from '../rolo/conversation-storage.ts'
import { createSessionRuntime, type SessionRuntime } from './runtime.ts'
import { bootstrapSessionToken } from './session-bootstrap.ts'

type AuthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'signed_in'; readonly session: Extract<ServerSession, { kind: 'signed_in' }> }

interface AuthContextValue {
  readonly state: AuthState
  readonly api: HomesroloApi
  readonly roloStorage: RoloConversationStorage
  readonly previewMode: boolean
  readonly requestCode: (email: string) => Promise<void>
  readonly verifyCode: (email: string, code: string) => Promise<void>
  readonly signOut: () => Promise<void>
  readonly refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function SessionProvider({ children, runtime: injectedRuntime }: {
  readonly children: ReactNode
  readonly runtime?: SessionRuntime
}) {
  const tokenRef = useRef<string | null>(null)
  const clearRef = useRef<() => void>(() => undefined)
  const runtime = useMemo(() => injectedRuntime ?? createSessionRuntime({
    tokenProvider: () => tokenRef.current,
    onSignedOut: () => clearRef.current(),
  }), [injectedRuntime])
  const { api } = runtime
  const [state, setState] = useState<AuthState>(() => runtime.initialSession
    ? { kind: 'signed_in', session: runtime.initialSession }
    : { kind: 'loading' })

  const clearLocalSession = useCallback(async () => {
    tokenRef.current = null
    setState({ kind: 'signed_out' })
    await Promise.allSettled([
      runtime.storage.remove(),
      runtime.roloStorage.clearAll(),
    ])
  }, [runtime.roloStorage, runtime.storage])
  clearRef.current = () => { void clearLocalSession() }

  const refreshSession = useCallback(async () => {
    setState({ kind: 'loading' })
    if (runtime.sessionTransport === 'bearer') {
      if (!tokenRef.current && !runtime.previewMode) {
        await clearLocalSession()
        return
      }
    }
    try {
      const session = await api.session()
      if (session.kind === 'signed_out') await clearLocalSession()
      else setState({ kind: 'signed_in', session })
    } catch (error) {
      if (error instanceof NativeApiError && error.status === 401) await clearLocalSession()
      else setState({ kind: 'error', message: 'Homesrolo could not verify your secure session.' })
    }
  }, [api, clearLocalSession, runtime.previewMode, runtime.sessionTransport])

  useEffect(() => {
    let active = true
    if (runtime.initialSession) return () => { active = false }
    void (async () => {
      try {
        const token = await bootstrapSessionToken(
          api,
          runtime.storage,
          runtime.sessionTransport,
        )
        if (!active) return
        tokenRef.current = token
        if (runtime.sessionTransport === 'bearer') {
          if (!token) {
            await clearLocalSession()
            return
          }
        }
        await refreshSession()
      } catch {
        if (active) setState({ kind: 'error', message: 'Homesrolo could not open your secure session.' })
      }
    })()
    return () => { active = false }
  }, [
    api,
    clearLocalSession,
    refreshSession,
    runtime.initialSession,
    runtime.sessionTransport,
    runtime.storage,
  ])

  const requestCode = useCallback((email: string) => api.requestEmailCode(email), [api])

  const verifyCode = useCallback(async (email: string, code: string) => {
    const credential = await api.verifyEmailCode(email, code)
    if (runtime.sessionTransport === 'bearer') {
      if (!credential) throw new NativeApiError(200, 'invalid_response')
      await runtime.storage.write(credential.token)
      tokenRef.current = credential.token
    } else {
      if (credential) throw new NativeApiError(200, 'invalid_response')
      tokenRef.current = null
      await runtime.storage.remove()
    }
    await refreshSession()
  }, [api, refreshSession, runtime.sessionTransport, runtime.storage])

  const signOut = useCallback(async () => {
    try {
      if (tokenRef.current || runtime.sessionTransport === 'cookie' || runtime.previewMode) {
        await api.signOut()
      }
    } finally { await clearLocalSession() }
  }, [api, clearLocalSession, runtime.previewMode, runtime.sessionTransport])

  return (
    <AuthContext.Provider value={{
      state, api, roloStorage: runtime.roloStorage, previewMode: runtime.previewMode,
      requestCode, verifyCode, signOut, refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useSession(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('SessionProvider is required')
  return context
}
