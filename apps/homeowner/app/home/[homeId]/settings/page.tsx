'use client'

import Link from 'next/link'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { RELATIONSHIP_COPY } from '../../../../components/relationship.ts'
import { homeLabel, homeLocality } from '../../../../lib/port/types.ts'

/** Account controls and truthful, read-only context for the currently open home. */
export default function SettingsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const router = useRouter()
  const { state: session, refresh } = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const checkupsEnabled = mode === 'remote'
    && session.kind === 'signed_in'
    && session.capabilities.photoCheckups

  async function signOut() {
    await port.signOut()
    await refresh()
    router.push('/signin')
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <div>
          <p className="mono">Private account</p>
          <h1>Account &amp; settings</h1>
        </div>
        <p>Manage your session and move between the homes connected to this account.</p>
      </div>

      <section className="panel" aria-labelledby="account-settings">
        <div className="panel__head"><h2 id="account-settings">Account</h2></div>
        {session.kind === 'signed_in' ? (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.75rem' }}>
            <p style={{ fontWeight: 650 }}>{session.session.displayName?.trim() || 'Homeowner account'}</p>
            {mode === 'synthetic' ? <p className="mono">Sample session · memory only</p> : null}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link className="btn btn--quiet" href="/homes">Switch home</Link>
              <button type="button" className="btn btn--quiet" onClick={signOut}>Sign out</button>
            </div>
          </div>
        ) : <Skeleton lines={2} label="Loading account" />}
      </section>

      <section className="panel" aria-labelledby="open-home-settings">
        <div className="panel__head"><h2 id="open-home-settings">Open home</h2></div>
        {home.state.status === 'loading' && <Skeleton lines={3} label="Loading home" />}
        {home.state.status === 'error' && <ErrorState retry={home.retry} error={home.state.error} />}
        {home.state.status === 'ready' && (
          <>
            <dl className="jobdoc__rows" style={{ marginTop: 0 }}>
              <div><dt>Name</dt><dd>{homeLabel(home.state.value)}</dd></div>
              <div><dt>Area</dt><dd>{homeLocality(home.state.value)}</dd></div>
              <div>
                <dt>Access</dt>
                <dd>{home.state.value.source === 'server'
                  ? RELATIONSHIP_COPY[home.state.value.relationshipLabel]
                  : 'Sample home'}</dd>
              </div>
            </dl>
            <div className="settings-shortcuts" aria-label="Open home sections">
              <Link className="btn btn--quiet" href={`/home/${homeId}`}>Home</Link>
              <Link className="btn btn--quiet" href={`/home/${homeId}/projects`}>Projects</Link>
              <Link className="btn btn--quiet" href={`/home/${homeId}/documents`}>Home record</Link>
              {checkupsEnabled
                ? <Link className="btn btn--quiet" href={`/home/${homeId}/checkups`}>Checkups</Link>
                : null}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
