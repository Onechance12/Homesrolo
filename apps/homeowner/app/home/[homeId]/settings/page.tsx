'use client'

import Link from 'next/link'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import {
  homeLabel,
  homeLocality,
  type SignInCapabilities,
} from '../../../../lib/port/types.ts'

const CAPABILITY_LABELS: ReadonlyArray<{
  readonly key: keyof SignInCapabilities
  readonly label: string
}> = [
  { key: 'magicLinkSignIn', label: 'Email sign-in' },
  { key: 'persistence', label: 'Saved home records' },
  { key: 'projectQuotes', label: 'Project quote records' },
  { key: 'homeResearch', label: 'Home research assistant' },
  { key: 'uploads', label: 'Private file uploads' },
  { key: 'photoCheckups', label: 'Seasonal photo checkups' },
  { key: 'projectReview', label: 'Project review requests' },
  { key: 'projectReviewAttachments', label: 'Project review attachments' },
  { key: 'invitations', label: 'Home invitations' },
  { key: 'sharing', label: 'Home sharing' },
]

/**
 * Account and home settings. Nearly everything here is honestly disabled:
 * a settings screen that pretends to save would be the exact overclaim this
 * repository keeps refusing to make.
 */
export default function SettingsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const router = useRouter()
  const { state: session, refresh } = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const runtimeCapabilities = session.kind === 'loading' ? null : session.capabilities

  async function signOut() {
    await port.signOut()
    await refresh()
    router.push('/signin')
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Settings</h1>
        <p>The account, and this home&rsquo;s file.</p>
      </div>

      <section className="panel" aria-labelledby="account-settings">
        <div className="panel__head"><h2 id="account-settings">Account</h2></div>
        {session.kind === 'signed_in' ? (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.6rem' }}>
            <p style={{ fontWeight: 650 }}>{session.session.displayName ?? 'Signed in'}</p>
            <p className="mono">{session.session.principalRef.slice(0, 16)}…{mode === 'synthetic' ? ' · demo session, memory only' : ''}</p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--quiet" onClick={signOut}>Sign out</button>
              <Link className="btn btn--quiet" href="/homes">Switch home</Link>
            </div>
          </div>
        ) : <Skeleton lines={2} label="Loading account" />}
      </section>

      <section className="panel" aria-labelledby="home-settings">
        <div className="panel__head"><h2 id="home-settings">This home</h2></div>
        {home.state.status === 'loading' && <Skeleton lines={3} label="Loading home" />}
        {home.state.status === 'error' && <ErrorState retry={home.retry} error={home.state.status === 'error' ? home.state.error : undefined} />}
        {home.state.status === 'ready' && (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.8rem' }}>
            <div className="field">
              <label htmlFor="alias">Alias</label>
              <input id="alias" type="text" defaultValue={homeLabel(home.state.value)} disabled />
              <span className="field__hint">Renaming this saved home is not available yet.</span>
            </div>
            <div className="field">
              <label htmlFor="area">Area</label>
              <input id="area" type="text" defaultValue={homeLocality(home.state.value)} disabled />
            </div>
            <button type="button" className="btn btn--primary" disabled title="Saving is not built yet">
              Save changes — not built yet
            </button>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="whats-available">
        <div className="panel__head"><h2 id="whats-available">Available for this session</h2></div>
        {runtimeCapabilities === null ? <Skeleton lines={5} label="Loading availability" /> : (
          <ul className="rows" style={{ display: 'block' }}>
            {CAPABILITY_LABELS.map(({ key, label }) => {
              const available = runtimeCapabilities[key]
              return (
                <li key={key}>
                  <span className="row" style={{ paddingInline: 0, minHeight: '2.2rem' }}>
                    <span className="row__body">
                      <span className="row__sub" style={{ fontSize: '0.88rem' }}>{label}</span>
                    </span>
                    <span className="row__end">
                      <span className={available ? 'pill pill--recorded' : 'pill pill--muted'}>
                        {available ? 'Available' : 'Off'}
                      </span>
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mono" style={{ marginTop: '0.6rem' }}>
          Availability comes from the current server session. A feature appears
          as available only when the server reports it.
        </p>
      </section>
    </div>
  )
}
