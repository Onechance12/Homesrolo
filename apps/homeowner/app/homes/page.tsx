'use client'

import Link from 'next/link'
import { usePort, useSession } from '../../lib/port/provider.tsx'
import { usePortCall } from '../../lib/port/hooks.ts'
import { HouseMark, IconHome, IconPlus } from '../../components/icons.tsx'
import { EmptyState, ErrorState, Skeleton, UnauthorizedState } from '../../components/states.tsx'
import { SYNTHETIC_NOTICE, homeLabel, homeLocality } from '../../lib/port/types.ts'
import { RELATIONSHIP_COPY } from '../../components/relationship.ts'

/** Home selection: a person may keep more than one home's file. */
export default function HomesPage() {
  const port = usePort()
  const { state: session } = useSession()
  const { state, retry } = usePortCall(() => port.listHomes())

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card gate__card--wide">
          {session.kind === 'signed_out' ? <UnauthorizedState /> : (
            <>
              <p className="mono" style={{ marginBottom: '0.4rem' }}>Step 2 of 2 — the home</p>
              <h1 style={{ fontSize: '1.5rem' }}>Whose file are we opening?</h1>
              <p className="mono" style={{ marginTop: '0.35rem' }}>{SYNTHETIC_NOTICE}</p>

              <div className="stack" style={{ marginTop: '1.25rem', ['--stack-gap' as never]: '0.6rem' }}>
                {state.status === 'loading' && <Skeleton lines={4} label="Loading homes" />}
                {state.status === 'error' && (state.error === 'not_signed_in'
                  ? <UnauthorizedState />
                  : <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />)}
                {state.status === 'ready' && (
                  <ul className="rows panel panel--flush" style={{ display: 'block' }}>
                    {state.value.map(home => (
                      <li key={home.homeRef}>
                        <Link className="row" href={`/home/${home.homeRef}`}>
                          <span className="row__glyph"><IconHome /></span>
                          <span className="row__body">
                            <span className="row__title">{homeLabel(home)}</span>
                            <span className="row__sub">{homeLocality(home)}</span>
                          </span>
                          <span className="row__end">
                            {home.source === 'synthetic' ? (
                              <>
                                <span className="mono">{home.projectCount} projects</span>
                                <span className="mono">{home.openMaintenanceCount} upcoming tasks</span>
                              </>
                            ) : (
                              <span className="mono">{RELATIONSHIP_COPY[home.relationshipLabel]}</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {state.status === 'empty' && (
                  <EmptyState
                    title="No homes yet"
                    body="A home file starts with the home itself. Add yours to begin its record."
                  />
                )}
                <Link className="btn btn--quiet btn--block" href="/homes/new">
                  <IconPlus /> Start a new home file
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
