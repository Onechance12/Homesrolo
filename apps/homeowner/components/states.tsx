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

export function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <h3>That did not load</h3>
      <p>Something went wrong reading this part of the record. Nothing was lost.</p>
      {retry ? (
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
