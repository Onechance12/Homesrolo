import { useEffect, useRef, useState } from 'react'
import {
  Image,
  type ImageProps,
  Platform,
} from 'react-native'
import {
  loadProtectedWebImage,
  type ProtectedImageSource,
  requiresProtectedWebFetch,
} from '../api/image-source.ts'

export function ProtectedImage({ source, onSourceError, style, ...props }: {
  readonly source: ProtectedImageSource
  readonly onSourceError?: () => void
} & Omit<ImageProps, 'source' | 'onError'>) {
  const needsWebFetch = Platform.OS === 'web' && requiresProtectedWebFetch(source)
  const sourceKey = `${source.uri}\n${Object.entries(source.headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key.toLowerCase()}:${value}`)
    .join('\n')}`
  const [resolvedUri, setResolvedUri] = useState<string | null>(needsWebFetch ? null : source.uri)
  const onSourceErrorRef = useRef(onSourceError)
  onSourceErrorRef.current = onSourceError

  useEffect(() => {
    if (!needsWebFetch) {
      setResolvedUri(source.uri)
      return undefined
    }
    const abort = new AbortController()
    let release: (() => void) | null = null
    setResolvedUri(null)
    void loadProtectedWebImage(source, abort.signal).then(lease => {
      if (abort.signal.aborted) {
        lease.release()
        return
      }
      release = lease.release
      setResolvedUri(lease.uri)
    }).catch(() => {
      if (!abort.signal.aborted) onSourceErrorRef.current?.()
    })
    return () => {
      abort.abort()
      release?.()
    }
  // sourceKey captures both the protected URL and credential without exposing
  // either to the rendered tree.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsWebFetch, sourceKey])

  if (resolvedUri === null) {
    return (
      <Image
        {...props}
        source={{ uri: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        style={style}
      />
    )
  }
  return (
    <Image
      {...props}
      source={needsWebFetch ? { uri: resolvedUri } : source}
      style={style}
      onError={() => onSourceErrorRef.current?.()}
    />
  )
}
