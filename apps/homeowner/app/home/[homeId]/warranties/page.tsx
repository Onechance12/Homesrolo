'use client'

import { use } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'

/**
 * Warranties: coverage that exists because of recorded work. The meter shows
 * where each coverage stands against the demo's fixed "today" — fixtures use
 * a constant date so the shell renders deterministically.
 */
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
  const port = usePort()
  const mode = usePortMode()
  const { state, retry } = usePortCall(() => port.listWarranties(homeId), value => value.length === 0)

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Warranties</h1>
        <p>Coverage that recorded work left behind.</p>
      </div>

      {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading warranties" /></div>}
      {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
      {state.status === 'empty' && (
        <EmptyState
          title="No coverage recorded"
          body="When a project carries a warranty, recording the work records the coverage — and its expiry stops being a surprise."
        />
      )}
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
                <p className="mono" style={{ marginBottom: '0.7rem' }}>
                  {warranty.issuedBy}
                </p>
                <div className="coverage">
                  <span className="coverage__track" role="presentation">
                    <span
                      className={low ? 'coverage__fill coverage__fill--low' : 'coverage__fill'}
                      style={{ width: `${Math.round(remaining * 100)}%` }}
                    />
                  </span>
                  <span className="mono">{warranty.startsOn} → {warranty.endsOn}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className="mono">
        {mode === 'synthetic'
          ? `Coverage bars in this demo use the fixed date ${DEMO_TODAY}.`
          : 'Warranty filing is not available yet. No coverage is inferred from a roof project.'}
      </p>
    </div>
  )
}
