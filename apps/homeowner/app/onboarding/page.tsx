'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../lib/port/provider.tsx'
import { HouseMark } from '../../components/icons.tsx'
import { Skeleton, UnauthorizedState } from '../../components/states.tsx'

/**
 * Account onboarding — MOCK. Collects a display name for the demo session and
 * nothing else. No profile is stored anywhere.
 */
export default function OnboardingPage() {
  const port = usePort()
  const mode = usePortMode()
  const { state, refresh } = useSession()
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'remote' || state.kind === 'loading') return
    router.replace(state.kind === 'signed_in' ? '/homes/new' : '/signin')
  }, [mode, router, state.kind])

  async function continueOn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    // MOCK: re-minting the demo session is how the shell "saves" a name.
    await port.enterDemoSession(name || 'Sample homeowner')
    await refresh()
    router.push('/homes')
  }

  if (mode === 'remote') {
    return (
      <main className="gate__main" style={{ minHeight: '100dvh' }}>
        <div className="gate__card">
          <Skeleton lines={3} label="Opening home setup" />
        </div>
      </main>
    )
  }

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card">
          {state.kind === 'signed_out' ? <UnauthorizedState /> : (
            <>
              <p className="mono" style={{ marginBottom: '0.4rem' }}>Step 1 of 2 — you</p>
              <h1 style={{ fontSize: '1.5rem' }}>What should we call you?</h1>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.92rem', marginTop: '0.6rem' }}>
                Just a display name. The home file belongs to the home; you are its
                current keeper.
              </p>
              <form onSubmit={continueOn}>
                <div className="field">
                  <label htmlFor="display-name">Display name</label>
                  <input
                    id="display-name"
                    type="text"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="Sample homeowner"
                    autoComplete="off"
                  />
                  <span className="field__hint">Demo only — kept in memory, never stored.</span>
                </div>
                <div style={{ marginTop: '1.25rem' }}>
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? 'One moment…' : 'Continue to your homes'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
