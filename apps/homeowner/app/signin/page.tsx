'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../lib/port/provider.tsx'
import { SYNTHETIC_NOTICE } from '../../lib/port/types.ts'
import {
  homeownerEntryContext,
  withHomeownerEntryContext,
  type HomeownerEntryContext,
} from '../../lib/entry-context.ts'
import { HouseMark } from '../../components/icons.tsx'
import { Skeleton } from '../../components/states.tsx'

/**
 * Sign in.
 *
 * Synthetic mode (the default): an honest sample-account doorway. No account
 * exists, and the screen says so.
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

function MagicLinkForm({ context }: { context: HomeownerEntryContext }) {
  const port = usePort()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<MagicLinkState>({ kind: 'idle' })

  async function request(event: React.FormEvent) {
    event.preventDefault()
    setState({ kind: 'sending' })
    const result = await port.requestMagicLink(email.trim(), context.intent, context.handoff)
    if (result.ok) { setState({ kind: 'accepted' }); return }
    if (result.error === 'rate_limited') { setState({ kind: 'rate_limited' }); return }
    if (result.error === 'invalid') { setState({ kind: 'invalid' }); return }
    setState({ kind: 'failed' })
  }

  if (state.kind === 'accepted') {
    return (
      <div className="state signin__status" role="status">
        <span className="signin__status-mark" aria-hidden="true">✓</span>
        <h3>Request received</h3>
        <p>
          If that address can sign in here, watch for a link in your inbox. It
          can take a few minutes, and it may land in junk or spam.
        </p>
        <button type="button" className="signin__try-again" onClick={() => setState({ kind: 'idle' })}>
          Try a different email
        </button>
      </div>
    )
  }

  return (
    <form className="signin__form" onSubmit={request}>
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
        <span className="field__hint">We&rsquo;ll email a one-time link. No password to remember.</span>
      </div>
      {state.kind === 'rate_limited' && (
        <p role="alert" className="signin__error">
          Too many requests. Give it a moment, then try again.
        </p>
      )}
      {state.kind === 'invalid' && (
        <p role="alert" className="signin__error">
          The server rejected that request. Check the address and try again.
        </p>
      )}
      {state.kind === 'failed' && (
        <p role="alert" className="signin__error">
          That did not go through. Nothing was sent. Try again in a moment.
        </p>
      )}
      <div className="signin__action">
        <button type="submit" className="btn btn--primary btn--block" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Requesting your link…' : 'Email me a sign-in link'}
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
      <div className="notice signin__demo-notice">
        <strong>Demo shell.</strong> {SYNTHETIC_NOTICE} The button below starts a
        sample session in memory; refreshing ends it.
      </div>
      <div className="signin__action">
        <button type="button" className="btn btn--primary btn--block" onClick={enterDemo} disabled={busy}>
          {busy ? 'Opening the demo…' : 'Continue with a sample account'}
        </button>
      </div>
      <p className="mono signin__footnote">
        No account is created and nothing is stored.
      </p>
    </>
  )
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[]; handoff?: string | string[] }>
}) {
  const query = use(searchParams)
  const context = homeownerEntryContext({ intent: query.intent, handoff: query.handoff })
  const { intent, handoff } = context
  const isRoofInspectionEntry = intent === 'inspection'
  const isHandoffEntry = handoff !== null
  const mode = usePortMode()
  const { state: session } = useSession()
  const eyebrow = isHandoffEntry
    ? 'COMPLETION RECORD'
    : isRoofInspectionEntry
      ? 'ROOF RECORD'
      : 'YOUR HOME RECORD'
  const title = isHandoffEntry
    ? 'Bring this work home.'
    : isRoofInspectionEntry
      ? 'Start your private roof record.'
      : 'Open your Home Record.'
  const summary = isHandoffEntry
    ? 'Sign in, choose the right home, and review every detail before anything is added to its private record.'
    : isRoofInspectionEntry
      ? 'Choose or add your home, then create a private roof-inspection request with your own notes. This does not schedule a Roof Watch visit or send your request to a contractor.'
      : 'Keep the projects, photos, documents, systems, and decisions that shape your home together—under your control.'

  return (
    <div className="signin">
      <header className="signin__topbar">
        <Link href="/" className="signin__brand" aria-label="Homesrolo home">
          <span className="signin__brand-mark"><HouseMark /></span>
          <span>homesrolo</span>
        </Link>
        <span className="signin__privacy"><span aria-hidden="true" /> Private by default</span>
      </header>
      <main id="main" tabIndex={-1} className="signin__main">
        <section className="signin__intro" aria-labelledby="signin-title">
          <p className="signin__eyebrow">{eyebrow}</p>
          <h1 id="signin-title">{title}</h1>
          <p className="signin__summary">{summary}</p>

          <div className="signin__record-preview" aria-hidden="true">
            <div className="signin__record-tab signin__record-tab--lime" />
            <div className="signin__record-tab signin__record-tab--blue" />
            <div className="signin__record-card">
              <span>HOME RECORD</span>
              <strong>The Martin home</strong>
              <div><i /> Projects and service history</div>
              <div><i /> Photos, documents, and warranties</div>
              <div><i /> One timeline for the whole home</div>
            </div>
          </div>

          <ul className="signin__trust" role="list">
            <li><span aria-hidden="true">✓</span> You control sharing</li>
            <li><span aria-hidden="true">✓</span> No public home profile</li>
            <li><span aria-hidden="true">✓</span> The whole home, not one trade</li>
          </ul>
        </section>

        <section className="signin__panel" aria-labelledby="signin-panel-title">
          <p className="signin__panel-kicker">
            {isHandoffEntry ? 'Homeowner approval' : 'Passwordless sign in'}
          </p>
          <h2 id="signin-panel-title">
            {isHandoffEntry ? 'Choose where this record belongs' : 'Continue with your email'}
          </h2>
          <p className="signin__panel-copy">
            We use a private, one-time link so there is no password to keep or reuse.
          </p>
          {mode === 'synthetic' ? (
            <SyntheticEntry />
          ) : session.kind === 'loading' ? (
            <div className="signin__loading">
              <Skeleton lines={3} label="Checking what sign-in is available" />
            </div>
          ) : session.kind === 'signed_in' ? (
            <div className="signin__signed-in">
              <p>
                {session.session.displayName?.trim()
                  ? `You are already signed in as ${session.session.displayName}.`
                  : 'You are already signed in.'}
              </p>
              <Link className="btn btn--primary btn--block" href={withHomeownerEntryContext('/homes', context)}>
                {isHandoffEntry
                  ? 'Choose the home for this record'
                  : isRoofInspectionEntry
                  ? 'Continue to my roof record'
                  : intent ? 'Continue my roof project' : 'Go to your homes'}
              </Link>
            </div>
          ) : session.capabilities.magicLinkSignIn ? (
            <div className="signin__form-wrap">
              <MagicLinkForm context={context} />
            </div>
          ) : (
            <div className="state signin__status signin__status--unavailable">
              <h3>Sign-in is temporarily unavailable</h3>
              <p>
                The server is reachable but reports no sign-in method. Nothing to
                do here for now.
              </p>
            </div>
          )}
          <p className="signin__panel-footer">One secure link. No password. No public address page.</p>
        </section>
      </main>
    </div>
  )
}
