'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePort, useSession } from '../../lib/port/provider.tsx'
import { SYNTHETIC_NOTICE } from '../../lib/port/types.ts'
import { HouseMark } from '../../components/icons.tsx'

/**
 * Sign in — MOCK. There is no account system. The single button below mints an
 * in-memory demo session so the rest of the shell can be walked. The real
 * sign-in flow is the integration lane's to design; this screen only reserves
 * the doorway.
 */
export default function SignInPage() {
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
        </div>
      </main>
    </div>
  )
}
