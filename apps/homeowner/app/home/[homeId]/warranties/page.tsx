'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'

const DEMO_TODAY = '2026-08-10'

function coverageRemaining(startsOn: string, endsOn: string): number {
  const start = Date.parse(`${startsOn}T00:00:00.000Z`)
  const end = Date.parse(`${endsOn}T00:00:00.000Z`)
  const now = Date.parse(`${DEMO_TODAY}T00:00:00.000Z`)
  if (now >= end) return 0
  if (now <= start) return 1
  return (end - now) / (end - start)
}

export default function WarrantiesPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  return mode === 'remote'
    ? <RemoteWarrantiesPage homeId={homeId} />
    : <SyntheticWarrantiesPage homeId={homeId} />
}

function RemoteWarrantiesPage({ homeId }: { homeId: string }) {
  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <p className="mono">Your home Rolodex</p>
        <h1>Warranties</h1>
        <p>Coverage records should stay attached to the work and equipment they belong to.</p>
      </div>
      <div className="notice">
        <strong>Warranty storage is not open yet.</strong> Homesrolo is not holding a warranty file or inferring
        coverage dates, exclusions, or terms from this page.
      </div>
      <section className="panel" aria-labelledby="warranty-record-plan">
        <div className="panel__head"><h2 id="warranty-record-plan">What will belong here</h2></div>
        <EmptyState
          title="No warranty records connected"
          body="Manufacturer registration, workmanship coverage, equipment serials, start and end dates, and the project or appliance they cover will live together after secure storage opens."
          action={<Link className="btn btn--quiet" href={`/home/${homeId}/documents`}>Open Home library</Link>}
        />
      </section>
    </div>
  )
}

function SyntheticWarrantiesPage({ homeId }: { homeId: string }) {
  const port = usePort()
  const warranties = usePortCall(() => port.listWarranties(homeId), value => value.length === 0)
  const state = warranties.state
  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Warranties</h1>
        <p>Coverage that recorded work left behind.</p>
      </div>
      {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading warranties" /></div>}
      {state.status === 'error' && <ErrorState retry={warranties.retry} error={state.error} />}
      {state.status === 'empty' && <EmptyState title="No coverage recorded" body="This demo has no coverage records for the home." />}
      {state.status === 'ready' && (
        <div className="cardgrid cardgrid--2">
          {state.value.map(warranty => {
            const remaining = coverageRemaining(warranty.startsOn, warranty.endsOn)
            const low = remaining < 0.25
            return (
              <article key={warranty.warrantyRef} className="panel">
                <div className="panel__head" style={{ marginBottom: '0.4rem' }}>
                  <h2 style={{ fontSize: '1.05rem' }}>{warranty.coverage}</h2>
                  {remaining === 0
                    ? <span className="pill pill--expiring">Ended</span>
                    : low
                      ? <span className="pill pill--expiring">Ending soon</span>
                      : <span className="pill pill--recorded">Active</span>}
                </div>
                <p className="mono" style={{ marginBottom: '0.7rem' }}>{warranty.issuedBy}</p>
                <div className="coverage">
                  <span className="coverage__track" role="presentation">
                    <span className={low ? 'coverage__fill coverage__fill--low' : 'coverage__fill'} style={{ width: `${Math.round(remaining * 100)}%` }} />
                  </span>
                  <span className="mono">{warranty.startsOn} → {warranty.endsOn}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <p className="mono">Coverage bars in this demo use the fixed date {DEMO_TODAY}.</p>
    </div>
  )
}
