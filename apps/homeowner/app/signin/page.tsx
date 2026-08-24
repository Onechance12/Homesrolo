'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useRef, useState } from 'react'
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
 * Remote mode: the same-browser email-code form is preferred when the server
 * reports it live. The legacy link form remains a capability-gated fallback
 * during migration. Neither request path reveals whether an address exists.
 */

type EmailCodeRequestState = 'idle' | 'sending' | 'rate_limited' | 'invalid' | 'failed'
type EmailCodeVerifyState = 'idle' | 'verifying' | 'rate_limited' | 'invalid' | 'failed'

function maskedEmail(value: string): string {
  const [local = '', domain = ''] = value.split('@')
  if (!local || !domain) return value
  const hidden = '•'.repeat(Math.min(5, Math.max(2, local.length - 1)))
  return `${local.slice(0, 1)}${hidden}@${domain}`
}

function EmailCodeForm({ context }: { context: HomeownerEntryContext }) {
  const port = usePort()
  const { refresh } = useSession()
  const router = useRouter()
  const emailInput = useRef<HTMLInputElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const operationGeneration = useRef(0)
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [destinationEmail, setDestinationEmail] = useState('')
  const [code, setCode] = useState('')
  const [requestState, setRequestState] = useState<EmailCodeRequestState>('idle')
  const [verifyState, setVerifyState] = useState<EmailCodeVerifyState>('idle')
  const [resendAvailableAt, setResendAvailableAt] = useState(0)
  const [secondsUntilResend, setSecondsUntilResend] = useState(0)

  useEffect(() => {
    if (stage === 'code') codeInput.current?.focus()
    else {
      emailInput.current?.focus()
      if (emailInput.current?.value) emailInput.current.select()
    }
  }, [stage])

  useEffect(() => {
    if (stage !== 'code' || resendAvailableAt <= 0) return
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1_000))
      setSecondsUntilResend(remaining)
      if (remaining === 0) setResendAvailableAt(0)
    }
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1_000)
    window.addEventListener('focus', updateCountdown)
    document.addEventListener('visibilitychange', updateCountdown)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', updateCountdown)
      document.removeEventListener('visibilitychange', updateCountdown)
    }
  }, [stage, resendAvailableAt])

  async function sendCode(address: string) {
    if (requestState === 'sending') return false
    setRequestState('sending')
    const result = await port.requestEmailCode(address)
    if (result.ok) {
      setRequestState('idle')
      setVerifyState('idle')
      setResendAvailableAt(Date.now() + 60_000)
      setSecondsUntilResend(60)
      return true
    }
    if (result.error === 'rate_limited') setRequestState('rate_limited')
    else if (result.error === 'invalid') setRequestState('invalid')
    else setRequestState('failed')
    return false
  }

  async function request(event: React.FormEvent) {
    event.preventDefault()
    const requestedEmail = email.trim().toLowerCase()
    if (await sendCode(requestedEmail)) {
      setDestinationEmail(requestedEmail)
      setStage('code')
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (verifyState === 'verifying') return
    if (!/^\d{6}$/.test(code)) {
      setVerifyState('invalid')
      return
    }
    setRequestState('idle')
    setVerifyState('verifying')
    const generation = ++operationGeneration.current
    const result = await port.verifyEmailCode(
      destinationEmail, code, context.intent, context.handoff,
    )
    if (generation !== operationGeneration.current) return
    if (result.ok) {
      await refresh()
      router.replace(withHomeownerEntryContext('/homes', context))
      return
    }
    if (result.error === 'rate_limited') setVerifyState('rate_limited')
    else if (result.error === 'invalid') {
      setVerifyState('invalid')
      window.setTimeout(() => codeInput.current?.select(), 0)
    } else setVerifyState('failed')
  }

  async function resend() {
    if (secondsUntilResend > 0 || requestState === 'sending' || verifyState === 'verifying') return
    setVerifyState('idle')
    if (await sendCode(destinationEmail)) {
      setCode('')
      window.setTimeout(() => codeInput.current?.focus(), 0)
    }
  }

  function changeEmail() {
    if (verifyState === 'verifying') return
    operationGeneration.current += 1
    setCode('')
    setDestinationEmail('')
    setRequestState('idle')
    setVerifyState('idle')
    setResendAvailableAt(0)
    setSecondsUntilResend(0)
    setStage('email')
  }

  if (stage === 'code') {
    const errorId = verifyState === 'invalid' || verifyState === 'rate_limited'
      || verifyState === 'failed' || requestState === 'rate_limited'
      || requestState === 'invalid' || requestState === 'failed'
      ? 'signin-code-error'
      : null
    return (
      <form className="signin__form signin__code-form" onSubmit={verify}>
        <div className="signin__code-heading" role="status">
          <span className="signin__status-mark" aria-hidden="true">✓</span>
          <div>
            <h3>Enter the code here</h3>
            <p>If that address can sign in, use the six-digit code sent to <strong>{maskedEmail(destinationEmail)}</strong>.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="signin-code">6-digit code</label>
          <input
            ref={codeInput}
            id="signin-code"
            className="signin__code-input"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={event => {
              const normalized = event.target.value.replace(/[\s-]/g, '')
              if (/^\d{0,6}$/.test(normalized)) {
                setCode(normalized)
                if (verifyState === 'invalid' || verifyState === 'failed') {
                  setVerifyState('idle')
                }
              }
            }}
            aria-describedby={['signin-code-help', errorId].filter(Boolean).join(' ')}
            aria-invalid={verifyState === 'invalid'}
          />
          <span id="signin-code-help" className="field__hint">
            Read the email wherever you like, then return here and enter the code.
          </span>
        </div>
        {verifyState === 'invalid' && (
          <p id="signin-code-error" role="alert" className="signin__error">
            That code is invalid or expired. Check all six digits or request a new code.
          </p>
        )}
        {(verifyState === 'rate_limited' || requestState === 'rate_limited') && (
          <p id="signin-code-error" role="alert" className="signin__error">
            Too many attempts. Wait a minute, then try again.
          </p>
        )}
        {(verifyState === 'failed' || requestState === 'invalid' || requestState === 'failed') && (
          <p id="signin-code-error" role="alert" className="signin__error">
            That did not go through. Try again in a moment.
          </p>
        )}
        <div className="signin__action">
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={verifyState === 'verifying' || code.length !== 6}
          >
            {verifyState === 'verifying' ? 'Checking your code…' : 'Verify and open my home'}
          </button>
        </div>
        <div className="signin__code-options">
          <button
            type="button"
            className="signin__try-again"
            onClick={changeEmail}
            disabled={verifyState === 'verifying'}
          >
            Change email
          </button>
          <button
            type="button"
            className="signin__try-again"
            onClick={resend}
            disabled={secondsUntilResend > 0 || requestState === 'sending' || verifyState === 'verifying'}
          >
            {requestState === 'sending'
              ? 'Requesting a new code…'
              : secondsUntilResend > 0
                ? `Send a new code in ${secondsUntilResend}s`
                : 'Send a new code'}
          </button>
          <span className="sr-only" aria-live="polite">
            {secondsUntilResend === 0 ? 'You can request a new code now.' : ''}
          </span>
        </div>
      </form>
    )
  }

  return (
    <form className="signin__form" onSubmit={request}>
      <div className="field">
        <label htmlFor="signin-email">Email</label>
        <input
          ref={emailInput}
          id="signin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          disabled={requestState === 'sending'}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <span className="field__hint">We&rsquo;ll email a six-digit code. No password to remember.</span>
      </div>
      {requestState === 'rate_limited' && (
        <p role="alert" className="signin__error">Too many requests. Wait a minute, then try again.</p>
      )}
      {requestState === 'invalid' && (
        <p role="alert" className="signin__error">Check the email address and try again.</p>
      )}
      {requestState === 'failed' && (
        <p role="alert" className="signin__error">That did not go through. Try again in a moment.</p>
      )}
      <div className="signin__action">
        <button type="submit" className="btn btn--primary btn--block" disabled={requestState === 'sending'}>
          {requestState === 'sending' ? 'Requesting your code…' : 'Email me a sign-in code'}
        </button>
      </div>
    </form>
  )
}

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
  const emailCodeAvailable = mode === 'remote'
    && session.kind === 'signed_out'
    && session.capabilities.emailCodeSignIn
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
    ? 'Sign in, choose the right home, and review the Completion record details before anything can be copied into its private Home Record. The PDF becomes available only after you accept it.'
    : isRoofInspectionEntry
      ? 'Choose or add your home, then create a private roof-inspection request with your own notes. This does not schedule a Roof Watch visit or send your request to a contractor.'
      : 'Keep the projects, photos, documents, systems, and decisions that shape your home together—under your control.'

  return (
    <div className="signin">
      <header className="signin__topbar">
        <Link href="https://homesrolo.com/" className="signin__brand" aria-label="Homesrolo home">
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
            {emailCodeAvailable
              ? 'We’ll email a six-digit code. Keep this page open and enter it here—no browser switching.'
              : 'We use a private, one-time link so there is no password to keep or reuse.'}
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
          ) : session.capabilities.emailCodeSignIn ? (
            <div className="signin__form-wrap">
              <EmailCodeForm context={context} />
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
          <p className="signin__panel-footer">
            {emailCodeAvailable
              ? 'One secure code. Same browser. No password. No public address page.'
              : 'One secure link. No password. No public address page.'}
          </p>
        </section>
      </main>
    </div>
  )
}
