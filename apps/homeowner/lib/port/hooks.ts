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
  const callRef = useRef(call)
  callRef.current = call
  const emptyRef = useRef(isEmpty)
  emptyRef.current = isEmpty

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    void callRef.current().then(result => {
      if (!live) return
      if (!result.ok) { setState({ status: 'error', error: result.error }); return }
      if (emptyRef.current?.(result.value)) { setState({ status: 'empty' }); return }
      setState({ status: 'ready', value: result.value })
    }).catch(() => {
      if (live) setState({ status: 'error', error: 'unavailable' })
    })
    return () => { live = false }
  }, [attempt])

  const retry = useCallback(() => setAttempt(a => a + 1), [])
  return { state, retry }
}
