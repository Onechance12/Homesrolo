'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'

/**
 * The timeline: the home's whole record on one thread, plus the maintenance
 * that keeps the record moving. This is the carfax-shaped view — everything
 * that ever happened, in order, with what's next at the top.
 */
export default function TimelinePage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  return mode === 'remote'
    ? <RemoteCarePage homeId={homeId} />
    : <SyntheticTimelinePage homeId={homeId} />
}

function RemoteCarePage({ homeId }: { homeId: string }) {
  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <p className="mono">Your home Rolodex</p>
        <h1>Events &amp; care</h1>
        <p>The future calendar and condition history for this home.</p>
      </div>
      <div className="notice">
        <strong>Care scheduling is not connected yet.</strong> Homesrolo does not claim that a reminder,
        inspection, or service visit has been scheduled from this page.
      </div>
      <section className="panel" aria-labelledby="remote-upcoming-care">
        <div className="panel__head"><h2 id="remote-upcoming-care">Upcoming care</h2></div>
        <EmptyState
          title="No care calendar yet"
          body="Seasonal checkups, recurring maintenance, and service reminders will live here after a reviewed scheduling record exists."
        />
      </section>
      <section className="panel" aria-labelledby="remote-home-history">
        <div className="panel__head"><h2 id="remote-home-history">Home history</h2></div>
        <EmptyState
          title="Project history is live now"
          body="Past, current, and planned work is available in Projects. A combined event timeline is still being built."
          action={<Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Open projects</Link>}
        />
      </section>
    </div>
  )
}

function SyntheticTimelinePage({ homeId }: { homeId: string }) {
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
        {maintenance.state.status === 'error' && <ErrorState retry={maintenance.retry} error={maintenance.state.status === 'error' ? maintenance.state.error : undefined} />}
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
        {timeline.state.status === 'error' && <ErrorState retry={timeline.retry} error={timeline.state.status === 'error' ? timeline.state.error : undefined} />}
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

      <p className="mono">
        This demo timeline lives in memory and disappears on refresh.
      </p>
    </div>
  )
}
