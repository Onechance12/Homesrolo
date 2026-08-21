'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort, usePortMode } from '../../../lib/port/provider.tsx'
import { usePortCall } from '../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../components/states.tsx'
import { RELATIONSHIP_COPY } from '../../../components/relationship.ts'
import { HomeResearchAssistant } from '../../../components/HomeResearchAssistant.tsx'
import { homeLabel, homeLocality } from '../../../lib/port/types.ts'

/**
 * The home dashboard: the front page of the property's Rolodex. A masthead
 * that reads like a document header, the record so far, and a few useful
 * destinations — deliberately not a metrics wall.
 */
export default function DashboardPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  const port = usePort()
  const home = usePortCall(() => port.getHome(homeId))
  const timeline = usePortCall(() => port.listTimeline(homeId), value => value.length === 0)
  const projects = usePortCall(() => port.listProjects(homeId))
  const documents = usePortCall(() => port.listDocuments(homeId))
  const warranties = usePortCall(() => port.listWarranties(homeId))
  const maintenance = usePortCall(() => port.listMaintenance(homeId))

  if (home.state.status === 'loading') {
    return <div className="panel"><Skeleton lines={5} label="Opening the home file" /></div>
  }
  if (home.state.status === 'error') {
    return home.state.error === 'not_found'
      ? <EmptyState title="No such home" body="This file does not exist in the demo. Pick a home from your list."
          action={<Link className="btn btn--quiet" href="/homes">Your homes</Link>} />
      : <ErrorState retry={home.retry} error={home.state.status === 'error' ? home.state.error : undefined} />
  }
  if (home.state.status !== 'ready') return null
  const file = home.state.value

  const count = (s: { status: string; value?: unknown }) =>
    s.status === 'ready' && Array.isArray(s.value) ? s.value.length : null

  // Synthetic counts come from listing the demo records; server counts come
  // from the home view itself, because the list routes do not exist yet.
  const projectCount = file.source === 'server' ? file.projectCount : count(projects.state)
  const documentCount = file.source === 'server' ? file.documentCount : count(documents.state)
  const warrantyCount = file.source === 'server' ? file.warrantyCount : count(warranties.state)
  const upcoming = file.source === 'server'
    ? file.maintenanceCount
    : maintenance.state.status === 'ready'
      ? maintenance.state.value.filter(item => item.state === 'upcoming').length
      : null

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <header className="filehead">
        <p className="filehead__label">
          <span>Home Rolodex</span>
          <span aria-hidden="true">{file.homeRef.slice(0, 14)}…</span>
        </p>
        <h1>{homeLabel(file)}</h1>
        <p className="filehead__where">{homeLocality(file)}</p>
        {file.source === 'synthetic' ? (
          <dl className="filehead__facts">
            {file.keyFacts.map(fact => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          // The server view supplies exactly these facts and no others; nothing
          // here is invented to fill the row out.
          <dl className="filehead__facts">
            <div>
              <dt>Relationship</dt>
              <dd>{RELATIONSHIP_COPY[file.relationshipLabel]}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{file.updatedAt.slice(0, 10)}</dd>
            </div>
          </dl>
        )}
      </header>

      <section className="roof-callout" aria-labelledby="home-rolo-callout-title">
        <div>
          <p className="mono">Everything about this home, connected</p>
          <h2 id="home-rolo-callout-title">Build the Rolodex for the whole home.</h2>
          <p>
            Keep roof, HVAC, plumbing, electrical, interior, exterior, yard, pest,
            appliance, and other work attached to one home—past, present, or planned.
          </p>
        </div>
        <Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Open project center</Link>
      </section>

      <HomeResearchAssistant homeRef={homeId} suggestedAddress={homeLocality(file)} />

      <dl className="cardgrid cardgrid--2 cardgrid--4" style={{ margin: 0 }}>
        <Link className="stat" href={`/home/${homeId}/projects`}>
          <dt>Projects</dt>
          <dd>{projectCount ?? '—'}</dd>
          <span className="stat__note">Work recorded on this home</span>
        </Link>
        <Link className="stat" href={`/home/${homeId}/documents`}>
          <dt>Home library</dt>
          <dd>{documentCount ?? '—'}</dd>
          <span className="stat__note">Photos, papers, manuals, and records</span>
        </Link>
        <Link className="stat" href={`/home/${homeId}/warranties`}>
          <dt>Warranties</dt>
          <dd>{warrantyCount ?? '—'}</dd>
          <span className="stat__note">Coverage on past work</span>
        </Link>
        <Link className="stat" href={`/home/${homeId}/timeline`}>
          <dt>Upcoming care</dt>
          <dd>{upcoming ?? '—'}</dd>
          <span className="stat__note">Maintenance on the calendar</span>
        </Link>
      </dl>

      <section className="panel" aria-labelledby="record-so-far">
        <div className="panel__head">
          <h2 id="record-so-far">The record so far</h2>
          <Link className="panel__more" href={`/home/${homeId}/timeline`}>Full timeline →</Link>
        </div>
        {file.source === 'server' ? (
          <EmptyState
            title="The record view is not available yet"
            body="The project center is available now. The full home timeline comes next."
            action={<Link className="btn btn--quiet" href={`/home/${homeId}/projects`}>Open projects</Link>}
          />
        ) : (
          <>
        {timeline.state.status === 'loading' && <Skeleton lines={4} label="Loading the record" />}
        {timeline.state.status === 'error' && <ErrorState retry={timeline.retry} error={timeline.state.status === 'error' ? timeline.state.error : undefined} />}
        {timeline.state.status === 'empty' && (
          <EmptyState
            title="The record starts with you"
            body="Nothing has been added to this home's record yet. Its first past, current, or planned project becomes page one."
            action={<Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Add a project</Link>}
          />
        )}
        {timeline.state.status === 'ready' && (
          <ol className="thread">
            {timeline.state.value.slice(0, 4).map(entry => (
              <li key={entry.entryRef}>
                <span className="mono thread__on">{entry.on}</span>
                {entry.href
                  ? <Link className="thread__title" href={entry.href}>{entry.title}</Link>
                  : <span className="thread__title">{entry.title}</span>}
                <p className="thread__detail">{entry.detail}</p>
              </li>
            ))}
          </ol>
        )}
          </>
        )}
      </section>

      {mode === 'synthetic' ? (
        <p className="mono">
          Every entry above is synthetic demo data. This shell saves nothing.
        </p>
      ) : null}
    </div>
  )
}
