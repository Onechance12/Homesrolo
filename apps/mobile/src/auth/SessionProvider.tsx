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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { beginBrowserSessionChange } from '../../../../shared/browser-session-signal.ts'
import { NativeApiError } from '../api/client.ts'
import type { HomesroloApi } from '../api/contract.ts'
import type { ServerSession } from '../api/model.ts'
import type { RoloConversationStorage } from '../rolo/conversation-storage.ts'
import { createSessionRuntime, type SessionRuntime } from './runtime.ts'
import { bootstrapSessionToken } from './session-bootstrap.ts'
import { readSessionWithRetry } from './session-read.ts'
import { subscribeBrowserSessionSync } from './browser-session-sync.ts'
import { revalidateSession, SessionFence, sessionBoundApi } from './session-fence.ts'

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
  readonly privateContentVisible: boolean
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
  const unauthorizedRef = useRef<() => void>(() => undefined)
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const cleanupRef = useRef<Promise<unknown>>(Promise.resolve())
  const authMutationBusy = useRef(false)
  const localChangeSequence = useRef(0)
  const mounted = useRef(true)
  const fence = useMemo(() => new SessionFence(), [])
  const runtime = useMemo(() => injectedRuntime ?? createSessionRuntime({
    tokenProvider: () => tokenRef.current,
    onSignedOut: () => unauthorizedRef.current(),
    privateRequestGuard: () => fence.capture(),
  }), [fence, injectedRuntime])
  const { api: rawApi } = runtime
  const cookieSession = runtime.sessionTransport === 'cookie' && !runtime.previewMode
  const [state, setState] = useState<AuthState>(() => {
    if (runtime.initialSession) {
      fence.confirm(0, runtime.initialSession)
      return { kind: 'signed_in', session: runtime.initialSession }
    }
    return { kind: 'loading' }
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const [verification, setVerification] = useState<'checking' | 'ready' | 'error'>(
    runtime.initialSession ? 'ready' : 'checking',
  )
  const principalRef = state.kind === 'signed_in' ? state.session.principalRef : null
  // React may batch A → B → A (or sign-out → A) before rendering. The
  // confirmed identity lifetime, not just the final ref, owns private state.
  const identityVersion = cookieSession ? fence.identityVersion : 0
  const api = useMemo(() => sessionBoundApi(rawApi, fence, principalRef, cookieSession),
    [cookieSession, fence, identityVersion, principalRef, rawApi])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; fence.reset() }
  }, [fence])

  const invalidateCookieSession = useCallback(() => {
    fence.invalidate()
    if (mounted.current) setVerification('checking')
  }, [fence])

  const beginCookieChange = useCallback(() => {
    if (!cookieSession) return () => undefined
    const id = `local-${++localChangeSequence.current}`
    fence.beginChange(id)
    if (mounted.current) setVerification('checking')
    const emitFinished = beginBrowserSessionChange((key, value) => window.localStorage.setItem(key, value))
    let finished = false
    return () => {
      if (finished) return
      finished = true
      fence.endChange(id)
      emitFinished()
    }
  }, [cookieSession, fence])

  const clearLocalSession = useCallback(async () => {
    fence.reset()
    tokenRef.current = null
    if (mounted.current) {
      stateRef.current = { kind: 'signed_out' }
      setState(stateRef.current)
      setVerification('ready')
    }
    cleanupRef.current = Promise.allSettled([
      runtime.storage.remove(),
      runtime.roloStorage.clearAll(),
    ])
    await cleanupRef.current
  }, [fence, runtime.roloStorage, runtime.storage])

  const refreshSession = useCallback(async () => {
    if (!mounted.current) return
    setVerification('checking')
    // Cookie rechecks retain the mounted screen behind the privacy curtain.
    // Keeping signed_in here preserves unsaved local forms for the same person.
    if (!cookieSession) setState({ kind: 'loading' })
    if (runtime.sessionTransport === 'bearer') {
      if (!tokenRef.current && !runtime.previewMode) {
        await clearLocalSession()
        return
      }
    }
    await revalidateSession(fence, async () => {
      await cleanupRef.current
      return readSessionWithRetry(rawApi)
    }, async session => {
      if (!mounted.current) return
      if (session.kind === 'signed_out') {
        await clearLocalSession()
      } else {
        stateRef.current = { kind: 'signed_in', session }
        setState(stateRef.current)
        setVerification('ready')
      }
    }, error => {
      if (!mounted.current) return
      if (error instanceof NativeApiError && error.status === 401) {
        void clearLocalSession()
      } else {
        setVerification('error')
        if (!cookieSession || stateRef.current.kind !== 'signed_in') setState({
          kind: 'error',
          message: 'The connection didn’t finish. Try again and we’ll pick up where you left off.',
        })
      }
    })
  }, [clearLocalSession, cookieSession, fence, rawApi, runtime.previewMode, runtime.sessionTransport])
  refreshRef.current = refreshSession
  unauthorizedRef.current = () => {
    if (cookieSession) void refreshRef.current()
    else void clearLocalSession()
  }

  useEffect(() => cookieSession ? subscribeBrowserSessionSync(
    runtime.browserEvents ?? null,
    invalidateCookieSession,
    () => { if (!authMutationBusy.current) void refreshRef.current() },
    () => {
      if (!mounted.current) return
      setVerification('error')
      // A new tab can discover an abandoned change before it has an identity.
      // It still needs the ordinary retry surface, not an endless launch spinner.
      if (stateRef.current.kind !== 'signed_in') setState({
        kind: 'error',
        message: 'We couldn’t confirm your sign-in. Try again to continue.',
      })
    },
    { begin: id => fence.beginChange(id), end: id => fence.endChange(id) },
  ) : undefined, [cookieSession, fence, invalidateCookieSession, runtime.browserEvents])

  useEffect(() => {
    let active = true
    if (runtime.initialSession) return () => { active = false }
    void (async () => {
      try {
        const token = await bootstrapSessionToken(
          rawApi,
          runtime.storage,
          runtime.sessionTransport,
          beginCookieChange,
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
        if (active) setState({
          kind: 'error',
          message: 'The connection didn’t finish. Try again and we’ll pick up where you left off.',
        })
      }
    })()
    return () => { active = false }
  }, [
    rawApi,
    beginCookieChange,
    clearLocalSession,
    refreshSession,
    runtime.initialSession,
    runtime.sessionTransport,
    runtime.storage,
  ])

  const requestCode = useCallback((email: string) => rawApi.requestEmailCode(email), [rawApi])

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (authMutationBusy.current) throw new Error('session_check_required')
    authMutationBusy.current = true
    invalidateCookieSession()
    const finishChange = beginCookieChange()
    try {
      await cleanupRef.current
      const credential = await rawApi.verifyEmailCode(email, code)
      if (runtime.sessionTransport === 'bearer') {
        if (!credential) throw new NativeApiError(200, 'invalid_response')
        await runtime.storage.write(credential.token)
        tokenRef.current = credential.token
      } else {
        if (credential) throw new NativeApiError(200, 'invalid_response')
        tokenRef.current = null
        await runtime.storage.remove()
      }
    } catch (error) {
      finishChange()
      await refreshSession()
      throw error
    } finally {
      finishChange()
      authMutationBusy.current = false
    }
    await refreshSession()
  }, [beginCookieChange, invalidateCookieSession, rawApi, refreshSession, runtime.sessionTransport, runtime.storage])

  const signOut = useCallback(async () => {
    if (authMutationBusy.current) throw new Error('session_check_required')
    if (cookieSession) fence.capture(principalRef)
    authMutationBusy.current = true
    invalidateCookieSession()
    const finishChange = beginCookieChange()
    try {
      if (tokenRef.current || runtime.sessionTransport === 'cookie' || runtime.previewMode) {
        await rawApi.signOut()
      }
    } finally {
      await clearLocalSession()
      finishChange()
      authMutationBusy.current = false
    }
  }, [beginCookieChange, clearLocalSession, cookieSession, fence, invalidateCookieSession, principalRef, rawApi, runtime.previewMode, runtime.sessionTransport])

  const curtain = cookieSession && state.kind === 'signed_in' && verification !== 'ready'

  return (
    <AuthContext.Provider value={{
      state, api, roloStorage: runtime.roloStorage, previewMode: runtime.previewMode,
      privateContentVisible: !cookieSession || (state.kind === 'signed_in' && verification === 'ready'),
      requestCode, verifyCode, signOut, refreshSession,
    }}>
      <View style={styles.container}>
        <View
          key={cookieSession ? `${principalRef ?? 'signed-out'}:${identityVersion}` : 'native-session'}
          style={[styles.container, curtain && styles.hidden]}
          pointerEvents={curtain ? 'none' : 'auto'}
          accessibilityElementsHidden={curtain}
          importantForAccessibility={curtain ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        {curtain ? (
          <View style={styles.curtain} accessibilityRole="summary" accessibilityLiveRegion="polite">
            {verification === 'checking' ? <ActivityIndicator color="#c9ff31" /> : null}
            <Text style={styles.message}>{verification === 'error'
              ? 'We couldn’t confirm your sign-in. Your draft is still here.'
              : 'Checking your sign-in…'}</Text>
            {verification === 'error' ? (
              <Pressable accessibilityRole="button" onPress={() => void refreshSession()} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </AuthContext.Provider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hidden: { display: 'none' },
  curtain: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: '#071c27', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
  },
  message: { color: '#f5f2e8', fontSize: 16, textAlign: 'center' },
  retry: { paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#c9ff31', borderRadius: 12 },
  retryText: { color: '#071c27', fontWeight: '700' },
})

export function useSession(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('SessionProvider is required')
  return context
}
