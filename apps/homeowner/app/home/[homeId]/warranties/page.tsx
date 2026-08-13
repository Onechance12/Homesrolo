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
  const port = usePort()
  const mode = usePortMode()
  const warranties = usePortCall(() => port.listWarranties(homeId), value => value.length === 0)
  const files = usePortCall(
    () => port.listDocuments(homeId),
    value => value.filter(document => document.kind === 'warranty').length === 0,
  )

  if (mode === 'remote') {
    const warrantyFiles = files.state.status === 'ready'
      ? files.state.value.filter(document => document.kind === 'warranty')
      : []
    return (
      <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
        <div className="pagehead">
          <h1>Warranty documents</h1>
          <p>Keep the coverage papers that belong to this home.</p>
        </div>
        <div className="notice">
          A saved warranty file records the document only. Homesrolo does not infer coverage dates or terms from it.
        </div>
        <Link className="btn btn--primary" href={`/home/${homeId}/documents`}>Add warranty document</Link>
        {files.state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading warranty files" /></div>}
        {files.state.status === 'error' && <ErrorState retry={files.retry} error={files.state.error} />}
        {files.state.status === 'empty' && (
          <EmptyState title="No warranty files yet" body="Add the PDF or photo you received when the work was completed." />
        )}
        {files.state.status === 'ready' && warrantyFiles.length > 0 ? (
          <ul className="rows panel panel--flush" style={{ display: 'block' }}>
            {warrantyFiles.map(file => (
              <li key={file.documentRef}>
                <span className="row">
                  <span className="row__body">
                    <span className="row__title">{file.title}</span>
                    <span className="row__sub">Added {file.addedOn}</span>
                  </span>
                  <span className="row__end">
                    {file.downloadHref ? <a href={file.downloadHref}>Download</a> : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

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
