'use client'

import Link from 'next/link'
import { use } from 'react'
import { usePort } from '../../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../../components/states.tsx'
import { PhotoPlate } from '../../../../../components/PhotoPlate.tsx'
import { IconDocs } from '../../../../../components/icons.tsx'
import { STATUS_LABEL } from '../../../../../components/projectStatus.ts'

/**
 * A single project, rendered as the document it is becoming: the job's
 * facts in ruled rows, its photo plates, its papers, and its warranty.
 */
export default function ProjectPage({
  params,
}: {
  params: Promise<{ homeId: string; projectId: string }>
}) {
  const { homeId, projectId } = use(params)
  const port = usePort()
  const { state, retry } = usePortCall(() => port.getProject(homeId, projectId))

  if (state.status === 'loading') {
    return <div className="panel"><Skeleton lines={6} label="Opening the project record" /></div>
  }
  if (state.status === 'error') {
    return state.error === 'not_found'
      ? <EmptyState title="No such project" body="This project is not available in this home file."
          action={<Link className="btn btn--quiet" href={`/home/${homeId}/projects`}>All projects</Link>} />
      : <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />
  }
  if (state.status !== 'ready') return null
  const project = state.value

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <Link href={`/home/${homeId}/projects`} className="backlink">← All projects</Link>

      <article className="jobdoc">
        <p className="jobdoc__serial">
          <span>Project record</span>
          <span aria-hidden="true">{project.projectRef.slice(0, 14)}…</span>
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.45rem' }}>{project.title}</h1>
          <span className={project.status === 'completed' ? 'stamp' : 'stamp stamp--muted'}>
            {STATUS_LABEL[project.status]}
          </span>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.94rem', marginTop: '0.6rem', maxWidth: '58ch', whiteSpace: 'pre-wrap' }}>
          {project.summary}
        </p>
        <dl className="jobdoc__rows">
          <div><dt>{project.status === 'planned' ? 'Started' : 'Performed'}</dt><dd>{project.performedOn}</dd></div>
          <div><dt>Trade</dt><dd>{project.trade}</dd></div>
          {project.contractor ? <div><dt>By</dt><dd>{project.contractor}</dd></div> : null}
          {project.materials.map(m => (
            <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>
          ))}
        </dl>
      </article>

      <section className="panel" aria-labelledby="project-photos">
        <div className="panel__head"><h2 id="project-photos">Photos</h2></div>
        {project.photos.length === 0 ? (
          <EmptyState title="No photos yet" body="Photos will live with this project as the file grows." />
        ) : (
          <div className="plates">
            {project.photos.map(photo => <PhotoPlate key={photo.photoRef} photo={photo} />)}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="project-docs">
        <div className="panel__head"><h2 id="project-docs">Papers</h2></div>
        {project.documents.length === 0 ? (
          <EmptyState title="No documents" body="Contracts and invoices for this job would be filed here." />
        ) : (
          <ul className="rows" style={{ display: 'block' }}>
            {project.documents.map(doc => (
              <li key={doc.documentRef}>
                <span className="row">
                  <span className="row__glyph"><IconDocs /></span>
                  <span className="row__body">
                    <span className="row__title">{doc.title}</span>
                    <span className="row__sub">{doc.kind.replace('_', ' ')} · {doc.pages} pages</span>
                  </span>
                  <span className="row__end"><span className="mono">{doc.addedOn}</span></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="project-warranty">
        <div className="panel__head"><h2 id="project-warranty">Warranty</h2></div>
        {project.warranty ? (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.5rem' }}>
            <p style={{ fontWeight: 650 }}>{project.warranty.coverage}</p>
            <p className="mono">
              {project.warranty.issuedBy} · {project.warranty.startsOn} → {project.warranty.endsOn}
            </p>
          </div>
        ) : (
          <EmptyState title="No warranty recorded" body="If this work carries coverage, it would be recorded here with its dates." />
        )}
      </section>

      {project.isSynthetic ? (
        <p className="mono">Synthetic record — no real project, company, or document exists behind it.</p>
      ) : null}
    </div>
  )
}
