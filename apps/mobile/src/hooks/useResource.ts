import { useCallback, useEffect, useState } from 'react'
import { retryResourceAfterSessionCheck } from './session-resource-retry.ts'

export type ResourceState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string }

export function useResource<T>(loader: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<ResourceState<T>>({ kind: 'loading' })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setState({ kind: 'loading' })
    if (!enabled) return () => { active = false }
    void loader().then(
      value => { if (active) setState({ kind: 'ready', value }) },
      error => {
        if (active) setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'unavailable',
        })
        void retryResourceAfterSessionCheck(error, () => active,
          () => setRevision(value => value + 1))
      },
    )
    return () => { active = false }
  }, [enabled, loader, revision])

  const reload = useCallback(() => setRevision(value => value + 1), [])
  return { state, reload }
}
