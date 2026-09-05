'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { HouseMark } from '../../../components/icons.tsx'
import { exchangeHomeownerProviderCredential } from '../../../lib/port/transport.ts'
import {
  homeownerEntryContext,
  homeownerPostSignInPath,
  withHomeownerEntryContext,
} from '../../../lib/entry-context.ts'

export default function CompleteSignInPage() {
  const [failed, setFailed] = useState(false)
  const [retryHref, setRetryHref] = useState('/signin')

  useEffect(() => {
    let active = true
    async function complete() {
      const query = new URLSearchParams(window.location.search)
      const context = homeownerEntryContext({
        intent: query.get('intent'),
        handoff: query.get('handoff'),
      })
      if (active) setRetryHref(withHomeownerEntryContext('/signin', context))
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = fragment.get('access_token')
      // Remove provider credentials from the address bar and browser history
      // before making any network request from the page.
      window.history.replaceState(null, '', '/auth/complete')
      if (!accessToken) {
        if (active) setFailed(true)
        return
      }
      try {
        if (!await exchangeHomeownerProviderCredential(accessToken)) throw new Error('exchange_failed')
        // This alternate callback can complete without mounting the PWA form.
        // Remove only its non-secret, tab-local pending email state.
        try { window.sessionStorage.removeItem('homesrolo.email-code-challenge.v1') } catch { /* storage may be unavailable */ }
        window.location.replace(homeownerPostSignInPath(context))
      } catch {
        if (active) setFailed(true)
      }
    }
    void complete()
    return () => { active = false }
  }, [])

  return (
    <div className="signin signin--complete">
      <header className="signin__topbar">
        <Link href="https://homesrolo.com/" className="signin__brand" aria-label="Homesrolo home">
          <span className="signin__brand-mark"><HouseMark /></span>
          <span>homesrolo</span>
        </Link>
        <span className="signin__privacy"><span aria-hidden="true" /> Private by default</span>
      </header>
      <main id="main" tabIndex={-1} className="signin__complete-main">
        <section className="signin__panel signin__complete-panel" role="status" aria-live="polite">
          <span className={`signin__complete-mark${failed ? ' signin__complete-mark--failed' : ''}`} aria-hidden="true">
            {failed ? '!' : <HouseMark />}
          </span>
          <p className="signin__panel-kicker">Homesrolo sign in</p>
          <h1>{failed ? 'That sign-in link did not work.' : 'Opening your Home Record\u2026'}</h1>
          <p className="signin__complete-copy">
            {failed
              ? 'The link may be expired or already used. Return to sign in and request a fresh one.'
              : 'Your private home information stays under your control.'}
          </p>
          {failed && <a className="btn btn--primary" href={retryHref}>Back to sign in</a>}
        </section>
      </main>
    </div>
  )
}
