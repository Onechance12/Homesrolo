'use client'

import Link from 'next/link'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { usePort, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { PORT_IMPLEMENTATION_STATUS } from '../../../../lib/port/types.ts'

/**
 * Account and home settings. Nearly everything here is honestly disabled:
 * a settings screen that pretends to save would be the exact overclaim this
 * repository keeps refusing to make.
 */
export default function SettingsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const router = useRouter()
  const { state: session, refresh } = useSession()
  const home = usePortCall(() => port.getHome(homeId))

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
            <p style={{ fontWeight: 650 }}>{session.session.displayName}</p>
            <p className="mono">{session.session.accountRef.slice(0, 16)}… · demo session, memory only</p>
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
        {home.state.status === 'error' && <ErrorState retry={home.retry} />}
        {home.state.status === 'ready' && (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.8rem' }}>
            <div className="field">
              <label htmlFor="alias">Alias</label>
              <input id="alias" type="text" defaultValue={home.state.value.alias} disabled />
              <span className="field__hint">Renaming is not wired in the demo shell.</span>
            </div>
            <div className="field">
              <label htmlFor="area">Area</label>
              <input id="area" type="text" defaultValue={home.state.value.locality} disabled />
            </div>
            <button type="button" className="btn btn--primary" disabled title="Saving is not built yet">
              Save changes — not built yet
            </button>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="whats-real">
        <div className="panel__head"><h2 id="whats-real">What is real in this build</h2></div>
        <ul className="rows" style={{ display: 'block' }}>
          {Object.entries(PORT_IMPLEMENTATION_STATUS).map(([flag, value]) => (
            <li key={flag}>
              <span className="row" style={{ paddingInline: 0, minHeight: '2.2rem' }}>
                <span className="row__body"><span className="row__sub" style={{ fontSize: '0.88rem' }}>{flag}</span></span>
                <span className="row__end">
                  <span className={value ? 'pill pill--recorded' : 'pill pill--muted'}>{String(value)}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mono" style={{ marginTop: '0.6rem' }}>
          Every flag is false on purpose. The shell ships before the runtime, and says so.
        </p>
      </section>
    </div>
  )
}
