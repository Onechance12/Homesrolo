import Link from 'next/link'

/** Loading, empty, error, and unauthorized — real screens, not afterthoughts. */

export function Skeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  const widths = ['skeleton__bar--wide', 'skeleton__bar--mid', 'skeleton__bar--short']
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label ?? 'Loading'}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} aria-hidden="true" className={`skeleton__bar ${widths[i % widths.length]}`} />
      ))}
    </div>
  )
}

export function EmptyState({ title, body, action }: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

/** Boring on purpose: each failure kind gets one plain sentence and one action. */
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_signed_in: {
    title: 'You are signed out',
    body: 'This part of the record needs a session. Sign in again to continue.',
  },
  forbidden: {
    title: 'No access to this record',
    body: 'Your account does not have access to this home file.',
  },
  conflict: {
    title: 'This changed somewhere else',
    body: 'The record was updated elsewhere while you were looking at it. Reload to see the current version.',
  },
  invalid: {
    title: 'The server sent something unexpected',
    body: 'The response did not match what this app accepts, so nothing was displayed. Trying again may help.',
  },
  rate_limited: {
    title: 'Too many requests',
    body: 'Give it a moment, then try again.',
  },
}

export function ErrorState({ retry, error }: { retry?: () => void; error?: string }) {
  const copy = (error && ERROR_COPY[error]) || {
    title: 'That did not load',
    body: 'Something went wrong reading this part of the record. Nothing was lost.',
  }
  return (
    <div className="state state--error" role="alert">
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      {error === 'not_signed_in' ? (
        <Link className="btn btn--quiet" href="/signin">Go to sign in</Link>
      ) : retry ? (
        <button type="button" className="btn btn--quiet" onClick={retry}>Try again</button>
      ) : null}
    </div>
  )
}

export function UnauthorizedState() {
  return (
    <div className="state">
      <h2>You are signed out</h2>
      <p>
        This is a home&rsquo;s private file, so it needs a session. In this demo shell a
        session lives in memory only — a refresh clears it.
      </p>
      <Link className="btn btn--primary" href="/signin">Go to sign in</Link>
    </div>
  )
}
