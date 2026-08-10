'use client'

/**
 * One hook for every screen's read path: loading, value, error, retry.
 * Screens stay declarative; the port stays the only data authority.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortResult } from './types.ts'

export type CallState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: 'not_found' | 'not_signed_in' | 'unavailable' }

export function usePortCall<T>(
  call: () => Promise<PortResult<T>>,
  isEmpty?: (value: T) => boolean,
): { state: CallState<T>; retry: () => void } {
  const [state, setState] = useState<CallState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Latest-callable refs, synchronised after render (writing during render is
  // not allowed under the react-hooks rules, and rightly so).
  const callRef = useRef<typeof call>(null)
  const emptyRef = useRef<typeof isEmpty>(null)
  useEffect(() => {
    callRef.current = call
    emptyRef.current = isEmpty
  })

  useEffect(() => {
    let live = true
    // The fetch settles asynchronously, so every setState below is async too;
    // the loading state is set by `retry` and the initial state, never here.
    void Promise.resolve().then(() => callRef.current?.()).then(result => {
      if (!live || !result) return
      if (!result.ok) { setState({ status: 'error', error: result.error }); return }
      if (emptyRef.current?.(result.value)) { setState({ status: 'empty' }); return }
      setState({ status: 'ready', value: result.value })
    }).catch(() => {
      if (live) setState({ status: 'error', error: 'unavailable' })
    })
    return () => { live = false }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt(a => a + 1)
  }, [])
  return { state, retry }
}
