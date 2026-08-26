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
import * as SecureStore from 'expo-secure-store'
import { HomesroloNativeApi, NativeApiError } from '../api/client.ts'
import type { ServerSession } from '../api/model.ts'

const SESSION_KEY = 'homesrolo.native.session.v1'

type AuthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'signed_in'; readonly session: Extract<ServerSession, { kind: 'signed_in' }> }

interface AuthContextValue {
  readonly state: AuthState
  readonly api: HomesroloNativeApi
  readonly requestCode: (email: string) => Promise<void>
  readonly verifyCode: (email: string, code: string) => Promise<void>
  readonly signOut: () => Promise<void>
  readonly refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const tokenRef = useRef<string | null>(null)
  const clearRef = useRef<() => void>(() => undefined)
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const api = useMemo(() => new HomesroloNativeApi(
    () => tokenRef.current,
    { onSignedOut: () => clearRef.current() },
  ), [])

  const clearLocalSession = useCallback(async () => {
    tokenRef.current = null
    setState({ kind: 'signed_out' })
    try { await SecureStore.deleteItemAsync(SESSION_KEY) } catch { /* State is already safe. */ }
  }, [])
  clearRef.current = () => { void clearLocalSession() }

  const refreshSession = useCallback(async () => {
    setState({ kind: 'loading' })
    if (!tokenRef.current) {
      setState({ kind: 'signed_out' })
      return
    }
    try {
      const session = await api.session()
      if (session.kind === 'signed_out') await clearLocalSession()
      else setState({ kind: 'signed_in', session })
    } catch (error) {
      if (error instanceof NativeApiError && error.status === 401) await clearLocalSession()
      else setState({ kind: 'error', message: 'Homesrolo could not verify this device session.' })
    }
  }, [api, clearLocalSession])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const token = await SecureStore.getItemAsync(SESSION_KEY)
        if (!active) return
        tokenRef.current = token
        if (!token) {
          setState({ kind: 'signed_out' })
          return
        }
        await refreshSession()
      } catch {
        if (active) setState({ kind: 'error', message: 'Homesrolo could not open the secure device session.' })
      }
    })()
    return () => { active = false }
  }, [refreshSession])

  const requestCode = useCallback((email: string) => api.requestEmailCode(email), [api])

  const verifyCode = useCallback(async (email: string, code: string) => {
    const credential = await api.verifyEmailCode(email, code)
    await SecureStore.setItemAsync(SESSION_KEY, credential.token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    })
    tokenRef.current = credential.token
    await refreshSession()
  }, [api, refreshSession])

  const signOut = useCallback(async () => {
    try { if (tokenRef.current) await api.signOut() } finally { await clearLocalSession() }
  }, [api, clearLocalSession])

  return (
    <AuthContext.Provider value={{ state, api, requestCode, verifyCode, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useSession(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('SessionProvider is required')
  return context
}
