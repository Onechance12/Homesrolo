'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePort, usePortMode, useSession } from '../../lib/port/provider.tsx'
import { SYNTHETIC_NOTICE } from '../../lib/port/types.ts'
import { HouseMark } from '../../components/icons.tsx'
import { Skeleton } from '../../components/states.tsx'

/**
 * Sign in.
 *
 * Synthetic mode (the default): the honest demo button and a disabled real
 * sign-in affordance, exactly as before — no account exists and the screen
 * says so.
 *
 * Remote mode: the email magic-link form renders ONLY when the server's own
 * session capabilities report it live. Acceptance shows a generic message that
 * never reveals whether an address exists, and nothing claims an email was
 * sent unless the server accepted the request.
 */

type MagicLinkState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'accepted' }
  | { kind: 'rate_limited' }
  | { kind: 'invalid' }
  | { kind: 'failed' }

function MagicLinkForm() {
  const port = usePort()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<MagicLinkState>({ kind: 'idle' })

  async function request(event: React.FormEvent) {
    event.preventDefault()
    setState({ kind: 'sending' })
    const result = await port.requestMagicLink(email.trim())
    if (result.ok) { setState({ kind: 'accepted' }); return }
    if (result.error === 'rate_limited') { setState({ kind: 'rate_limited' }); return }
    if (result.error === 'invalid') { setState({ kind: 'invalid' }); return }
    setState({ kind: 'failed' })
  }

  if (state.kind === 'accepted') {
    return (
      <div className="state" role="status">
        <h2 style={{ fontSize: '1.1rem' }}>Check your email</h2>
        <p>
          If that address can sign in here, a link is on its way. It may take a
          minute to arrive.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={request}>
      <div className="field">
        <label htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <span className="field__hint">We email a sign-in link. No password exists to forget.</span>
      </div>
      {state.kind === 'rate_limited' && (
        <p role="alert" style={{ color: 'var(--brick)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          Too many requests. Give it a moment, then try again.
        </p>
      )}
      {state.kind === 'invalid' && (
        <p role="alert" style={{ color: 'var(--brick)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          The server rejected that request. Check the address and try again.
        </p>
      )}
      {state.kind === 'failed' && (
        <p role="alert" style={{ color: 'var(--brick)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          That did not go through. Nothing was sent. Try again in a moment.
        </p>
      )}
      <div style={{ marginTop: '1.25rem' }}>
        <button type="submit" className="btn btn--primary btn--block" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Asking the server…' : 'Email me a sign-in link'}
        </button>
      </div>
    </form>
  )
}

function SyntheticEntry() {
  const port = usePort()
  const { refresh } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function enterDemo() {
    setBusy(true)
    await port.enterDemoSession('Sample homeowner')
    await refresh()
    router.push('/onboarding')
  }

  return (
    <>
      <div className="notice" style={{ marginTop: '1.25rem' }}>
        <strong>Demo shell.</strong> {SYNTHETIC_NOTICE} The button below starts a
        sample session in memory; refreshing ends it.
      </div>
      <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.6rem' }}>
        <button type="button" className="btn btn--primary btn--block" onClick={enterDemo} disabled={busy}>
          {busy ? 'Opening the demo…' : 'Continue with a sample account'}
        </button>
        <button type="button" className="btn btn--quiet btn--block" disabled
          title="Real accounts are not built yet">
          Sign in with email — not built yet
        </button>
      </div>
      <p className="mono" style={{ marginTop: '1.1rem' }}>
        No account is created and nothing is stored.
      </p>
    </>
  )
}

export default function SignInPage() {
  const mode = usePortMode()
  const { state: session } = useSession()

  return (
    <div className="gate">
      <Link href="/" className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></Link>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card">
          <p className="mono" style={{ marginBottom: '0.4rem' }}>Homeowner sign in</p>
          <h1 style={{ fontSize: '1.5rem' }}>Open your home&rsquo;s file.</h1>
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.92rem', marginTop: '0.6rem' }}>
            Every roof, repair, document, and warranty — kept on the home itself,
            not scattered across contractors and inboxes.
          </p>

          {mode === 'synthetic' ? (
            <SyntheticEntry />
          ) : session.kind === 'loading' ? (
            <div style={{ marginTop: '1.25rem' }}>
              <Skeleton lines={3} label="Checking what sign-in is available" />
            </div>
          ) : session.kind === 'signed_in' ? (
            <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.6rem' }}>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.92rem' }}>
                {session.session.displayName?.trim()
                  ? `You are already signed in as ${session.session.displayName}.`
                  : 'You are already signed in.'}
              </p>
              <Link className="btn btn--primary btn--block" href="/homes">Go to your homes</Link>
            </div>
          ) : session.capabilities.magicLinkSignIn ? (
            <div style={{ marginTop: '1.25rem' }}>
              <MagicLinkForm />
            </div>
          ) : (
            <div className="state" style={{ marginTop: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Sign-in is not available yet</h2>
              <p>
                The server is reachable but reports no sign-in method. Nothing to
                do here for now.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
