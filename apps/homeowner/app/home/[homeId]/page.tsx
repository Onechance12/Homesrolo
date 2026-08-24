'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { usePortCall } from '../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../components/states.tsx'
import { RELATIONSHIP_COPY } from '../../../components/relationship.ts'
import { STATUS_LABEL, STATUS_PILL } from '../../../components/projectStatus.ts'
import { homeLabel, homeLocality } from '../../../lib/port/types.ts'

const HOME_AREAS = [
  'Interior & remodel',
  'Heating & cooling',
  'Plumbing',
  'Electrical',
  'Appliances',
  'Exterior & gutters',
  'Roof',
  'Yard & landscaping',
  'Pest control',
  'Pool',
  'New construction',
  'Something else',
] as const

/** The useful front door to one private home record. */
export default function DashboardPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  const port = usePort()
  const session = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const projects = usePortCall(() => port.listProjects(homeId), value => value.length === 0)
  const checkupsEnabled = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.photoCheckups

  if (home.state.status === 'loading') {
    return <div className="panel"><Skeleton lines={5} label="Opening the home record" /></div>
  }
  if (home.state.status === 'error') {
    return home.state.error === 'not_found'
      ? <EmptyState title="No such home" body="This home record could not be found. Pick another home from your list."
          action={<Link className="btn btn--quiet" href="/homes">Your homes</Link>} />
      : <ErrorState retry={home.retry} error={home.state.error} />
  }
  if (home.state.status !== 'ready') return null
  const file = home.state.value
  const projectCount = file.source === 'server'
    ? file.projectCount
    : projects.state.status === 'ready'
      ? projects.state.value.length
      : file.projectCount

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <header className="filehead">
        <p className="filehead__label">
          <span>Private home record</span>
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
          <p className="mono">Plan it · Track it · Remember it</p>
          <h2 id="home-rolo-callout-title">One record for work across the whole home.</h2>
          <p>
            Start a new project, keep up with work in progress, or add something completed years ago.
            Exact dates are optional when you do not know them.
          </p>
        </div>
        <Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Add a project</Link>
      </section>

      <dl className="cardgrid cardgrid--2 cardgrid--4" style={{ margin: 0 }}>
        <Link className="stat" href={`/home/${homeId}/projects`}>
          <dt>Projects</dt>
          <dd>{projectCount}</dd>
          <span className="stat__note">Planned, active, and completed work</span>
        </Link>
        <Link className="stat" href={`/home/${homeId}/projects`}>
          <dt>Past work</dt>
          <dd>Add history</dd>
          <span className="stat__note">Record an old repair, service, or remodel</span>
        </Link>
        {checkupsEnabled ? (
          <Link className="stat" href={`/home/${homeId}/checkups`}>
            <dt>Checkups</dt>
            <dd>Photos</dd>
            <span className="stat__note">Repeat and compare the same home views</span>
          </Link>
        ) : null}
        <Link className="stat" href={`/home/${homeId}/documents`}>
          <dt>Home record</dt>
          <dd>Open</dd>
          <span className="stat__note">Find this home&rsquo;s connected records</span>
        </Link>
      </dl>

      <section className="panel" aria-labelledby="whole-home-areas">
        <div className="panel__head">
          <div>
            <p className="mono">Twelve starting points</p>
            <h2 id="whole-home-areas">Every part of the home belongs here.</h2>
          </div>
          <Link className="panel__more" href={`/home/${homeId}/projects`}>Choose a category →</Link>
        </div>
        <ul className="home-area-list">
          {HOME_AREAS.map((area, index) => (
            <li key={area}><span>{String(index + 1).padStart(2, '0')}</span>{area}</li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="recent-projects">
        <div className="panel__head">
          <h2 id="recent-projects">Project history</h2>
          <Link className="panel__more" href={`/home/${homeId}/projects`}>All projects →</Link>
        </div>
        {projects.state.status === 'loading' && <Skeleton lines={4} label="Loading project history" />}
        {projects.state.status === 'error' && <ErrorState retry={projects.retry} error={projects.state.error} />}
        {projects.state.status === 'empty' && (
          <EmptyState
            title="Start anywhere in the home&rsquo;s history"
            body="Add something being considered, work happening now, or a project completed in the past."
            action={<Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Add the first project</Link>}
          />
        )}
        {projects.state.status === 'ready' && (
          <ul className="rows">
            {projects.state.value.slice(0, 4).map(project => (
              <li key={project.projectRef}>
                <Link className="row" href={`/home/${homeId}/projects/${project.projectRef}`}>
                  <span className="row__body">
                    <span className="row__title">{project.title}</span>
                    <span className="row__sub">{project.trade} · {project.performedOn ?? 'Date not recorded'}</span>
                  </span>
                  <span className="row__end">
                    <span className={STATUS_PILL[project.status]}>{STATUS_LABEL[project.status]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === 'synthetic' ? (
        <p className="mono">Every entry above is synthetic demo data. This shell saves nothing.</p>
      ) : null}
    </div>
  )
}
