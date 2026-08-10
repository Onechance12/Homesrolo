'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'

/**
 * The timeline: the home's whole record on one thread, plus the maintenance
 * that keeps the record moving. This is the carfax-shaped view — everything
 * that ever happened, in order, with what's next at the top.
 */
export default function TimelinePage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const timeline = usePortCall(() => port.listTimeline(homeId), value => value.length === 0)
  const maintenance = usePortCall(() => port.listMaintenance(homeId), value => value.length === 0)

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Timeline</h1>
        <p>Everything this home&rsquo;s file remembers, newest first.</p>
      </div>

      <section className="panel" aria-labelledby="upcoming-care">
        <div className="panel__head"><h2 id="upcoming-care">Upcoming care</h2></div>
        {maintenance.state.status === 'loading' && <Skeleton lines={3} label="Loading maintenance" />}
        {maintenance.state.status === 'error' && <ErrorState retry={maintenance.retry} />}
        {maintenance.state.status === 'empty' && (
          <EmptyState title="Nothing scheduled" body="Seasonal upkeep for this home would be tracked here." />
        )}
        {maintenance.state.status === 'ready' && (
          <ul className="rows" style={{ display: 'block' }}>
            {maintenance.state.value.map(item => (
              <li key={item.itemRef}>
                <span className="row" style={{ paddingInline: 0 }}>
                  <span className="row__body">
                    <span className="row__title">{item.title}</span>
                    <span className="row__sub">{item.cadence}</span>
                  </span>
                  <span className="row__end">
                    {item.state === 'done'
                      ? <span className="pill pill--muted">Done</span>
                      : <span className="pill pill--progress">{item.dueInSeason}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="the-record">
        <div className="panel__head"><h2 id="the-record">The record</h2></div>
        {timeline.state.status === 'loading' && <Skeleton lines={6} label="Loading the record" />}
        {timeline.state.status === 'error' && <ErrorState retry={timeline.retry} />}
        {timeline.state.status === 'empty' && (
          <EmptyState
            title="Page one is unwritten"
            body="This home's record has no entries yet. Recording its first project starts the file."
            action={<Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Record a project</Link>}
          />
        )}
        {timeline.state.status === 'ready' && (
          <ol className="thread">
            {timeline.state.value.map(entry => (
              <li key={entry.entryRef}>
                <span className="mono thread__on">{entry.on} · {entry.kind}</span>
                {entry.href
                  ? <Link className="thread__title" href={entry.href}>{entry.title}</Link>
                  : <span className="thread__title">{entry.title}</span>}
                <p className="thread__detail">{entry.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mono">A durable record outlives owners and companies. This demo&rsquo;s version lives in memory only.</p>
    </div>
  )
}
