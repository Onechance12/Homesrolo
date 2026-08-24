'use client'

import { useEffect, useState } from 'react'
import { exchangeHomeownerProviderCredential } from '../../../lib/port/transport.ts'
import {
  homeownerEntryContext,
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
        window.location.replace(withHomeownerEntryContext('/homes', context))
      } catch {
        if (active) setFailed(true)
      }
    }
    void complete()
    return () => { active = false }
  }, [])

  return (
    <main className="gate__main" style={{ minHeight: '100dvh' }}>
      <div className="gate__card" role="status" aria-live="polite">
        <p className="mono">Homesrolo sign in</p>
        <h1 style={{ fontSize: '1.5rem', marginTop: '0.45rem' }}>
          {failed ? 'That sign-in link did not work.' : 'Opening your home file\u2026'}
        </h1>
        {failed && (
          <p style={{ marginTop: '0.7rem' }}>
            The link may be expired or already used. Return to the sign-in page and request a new one.
          </p>
        )}
        {failed && <a className="btn btn--primary" href={retryHref} style={{ marginTop: '1rem' }}>Back to sign in</a>}
      </div>
    </main>
  )
}
