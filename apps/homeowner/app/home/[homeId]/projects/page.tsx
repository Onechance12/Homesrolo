'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconProjects } from '../../../../components/icons.tsx'
import { STATUS_LABEL, STATUS_PILL } from '../../../../components/projectStatus.ts'
import type { AddProjectInput } from '../../../../lib/port/types.ts'

/** Projects: the recorded work on this home, plus the door to record more. */
export default function ProjectsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  const port = usePort()
  const { state, retry } = usePortCall(() => port.listProjects(homeId), value => value.length === 0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<AddProjectInput>({
    title: '', trade: '', performedOn: '2026-08-01', contractor: '', summary: '',
  })

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const result = await port.addProject(homeId, form)
    setBusy(false)
    if (!result.ok) { setFailed(true); return }
    setForm({ title: '', trade: '', performedOn: '2026-08-01', contractor: '', summary: '' })
    retry()
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Projects</h1>
        <p>Work that has been recorded on this home.</p>
      </div>

      {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading projects" /></div>}
      {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
      {state.status === 'empty' && (
        <EmptyState
          title="No projects recorded"
          body="When work happens on this home, its record starts here — what was done, by whom, with what."
        />
      )}
      {state.status === 'ready' && (
        <ul className="rows panel panel--flush" style={{ display: 'block' }}>
          {state.value.map(project => (
            <li key={project.projectRef}>
              <Link className="row" href={`/home/${homeId}/projects/${project.projectRef}`}>
                <span className="row__glyph"><IconProjects /></span>
                <span className="row__body">
                  <span className="row__title">{project.title}</span>
                  <span className="row__sub">{project.trade} · {project.photoCount} photos · {project.documentCount} documents</span>
                </span>
                <span className="row__end">
                  <span className={STATUS_PILL[project.status]}>{STATUS_LABEL[project.status]}</span>
                  <span className="mono">{project.performedOn}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {mode === 'remote' ? null : (
      <details className="panel">
        <summary style={{ fontWeight: 650, cursor: 'pointer' }}>{mode === 'synthetic' ? 'Record a project (demo)' : 'Record a project'}</summary>
        {mode === 'synthetic' ? (
          <p className="mono" style={{ margin: '0.5rem 0 0' }}>
            Added to this session&rsquo;s memory only — a refresh clears it. Nothing uploads.
          </p>
        ) : null}
        <form onSubmit={add} style={{ maxWidth: '30rem' }}>
          <div className="field">
            <label htmlFor="p-title">What was done?</label>
            <input id="p-title" type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Water heater replacement" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-trade">Trade</label>
            <input id="p-trade" type="text" value={form.trade}
              onChange={e => setForm(f => ({ ...f, trade: e.target.value }))}
              placeholder="Plumbing" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-on">Date performed</label>
            <input id="p-on" type="date" required value={form.performedOn}
              onChange={e => setForm(f => ({ ...f, performedOn: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="p-who">Who did the work?</label>
            <input id="p-who" type="text" value={form.contractor}
              onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))}
              placeholder="Company or person" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-summary">Notes</label>
            <textarea id="p-summary" value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Model, capacity, anything a future owner would want to know." />
          </div>
          {failed && (
            <p role="alert" style={{ color: 'var(--brick)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
              The demo could not record that. Try again.
            </p>
          )}
          <div style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Recording…' : mode === 'synthetic' ? 'Add to the record (demo)' : 'Add to the record'}
            </button>
          </div>
        </form>
      </details>
      )}
    </div>
  )
}
