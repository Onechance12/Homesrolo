'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useRef, useState } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { commandRefForAttempt } from '../../../../lib/port/command-ref.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconProjects } from '../../../../components/icons.tsx'
import { STATUS_LABEL, STATUS_PILL } from '../../../../components/projectStatus.ts'
import type { ProjectCategory, ProjectStatus } from '../../../../lib/port/types.ts'
import { ROOFING_INTENT_LABEL, roofingIntent } from '../../../../lib/roofing-intent.ts'

type RecordMode = 'planned' | 'active' | 'past'

const MODES: readonly {
  value: RecordMode
  eyebrow: string
  title: string
  body: string
}[] = [
  {
    value: 'planned',
    eyebrow: 'Plan',
    title: 'Something you are considering',
    body: 'Keep research, questions, and proposals together before you decide.',
  },
  {
    value: 'active',
    eyebrow: 'Track',
    title: 'Work happening now',
    body: 'Give an active repair, upgrade, or maintenance visit one clear home.',
  },
  {
    value: 'past',
    eyebrow: 'Remember',
    title: 'Work already completed',
    body: 'Backfill the history so the next owner—or future you—can find it.',
  },
]

const CATEGORIES: readonly { value: ProjectCategory; label: string }[] = [
  { value: 'roofing', label: 'Roof' },
  { value: 'interior', label: 'Interior / remodel' },
  { value: 'hvac', label: 'Heating & cooling' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'exterior', label: 'Exterior / gutters' },
  { value: 'landscaping', label: 'Yard / landscaping' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'pest', label: 'Pest control' },
  { value: 'pool', label: 'Pool' },
  { value: 'new_construction', label: 'New construction' },
  { value: 'other', label: 'Something else' },
]

const ROOF_TITLE = {
  repair: 'Roof repair',
  replacement: 'Roof replacement',
  inspection: 'Roof inspection',
  storm_damage: 'Storm damage roof review',
  not_sure: 'Roofing project',
} as const

const STATUS_FOR_MODE: Readonly<Record<RecordMode, ProjectStatus>> = {
  planned: 'planned',
  active: 'in_progress',
  past: 'completed',
}

export default function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: Promise<{ intent?: string | string[] }>
}) {
  const { homeId } = use(params)
  const query = use(searchParams)
  const carriedIntent = roofingIntent(Array.isArray(query.intent) ? null : query.intent)
  const router = useRouter()
  const mode = usePortMode()
  const port = usePort()
  const { state, retry } = usePortCall(() => port.listProjects(homeId), value => value.length === 0)
  const [recordMode, setRecordMode] = useState<RecordMode | null>(() => carriedIntent ? 'planned' : null)
  const [category, setCategory] = useState<ProjectCategory | null>(() => carriedIntent ? 'roofing' : null)
  const [title, setTitle] = useState(() => carriedIntent ? ROOF_TITLE[carriedIntent] : '')
  const [occurredOn, setOccurredOn] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const attemptRef = useRef<string | null>(null)

  function resetAttempt() {
    attemptRef.current = null
    setFailed(null)
  }

  function chooseMode(value: RecordMode) {
    resetAttempt()
    setRecordMode(value)
    if (value !== 'past') setOccurredOn('')
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    if (!recordMode || !category) return
    const commandRef = commandRefForAttempt(attemptRef.current)
    attemptRef.current = commandRef
    setBusy(true)
    setFailed(null)
    const result = await port.createProject(homeId, {
      commandRef,
      title,
      category,
      status: STATUS_FOR_MODE[recordMode],
      ...(recordMode === 'past' && occurredOn ? { occurredOn } : {}),
      summary,
    })
    setBusy(false)
    if (!result.ok) {
      setFailed(result.error)
      return
    }
    retry()
    router.push(`/home/${homeId}/projects/${result.value.projectRef}`)
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.25rem' }}>
      <div className="pagehead">
        <p className="mono">Your home Rolodex</p>
        <h1>Projects, repairs, and upgrades</h1>
        <p>
          Record anything that changes or maintains the home—from a filter service to a remodel.
          Roofing is one chapter, not the whole file.
        </p>
      </div>

      <section aria-labelledby="project-record-actions">
        <div className="panel__head">
          <div>
            <p className="mono">Add to the history</p>
            <h2 id="project-record-actions">What are you recording?</h2>
          </div>
        </div>
        <div className="project-action-grid">
          {MODES.map(option => (
            <button
              key={option.value}
              type="button"
              className="project-action"
              aria-pressed={recordMode === option.value}
              onClick={() => chooseMode(option.value)}
            >
              <span className="mono">{option.eyebrow}</span>
              <strong>{option.title}</strong>
              <span>{option.body}</span>
            </button>
          ))}
        </div>
      </section>

      {recordMode ? (
        <section className="panel project-form" aria-labelledby="project-details-title">
          <div className="panel__head">
            <div>
              <p className="mono">Private home record</p>
              <h2 id="project-details-title">
                {recordMode === 'past' ? 'Add the work you remember' : 'Give this work a clear name'}
              </h2>
            </div>
            <button type="button" className="btn btn--quiet" onClick={() => setRecordMode(null)}>
              Close
            </button>
          </div>

          {carriedIntent && category === 'roofing' ? (
            <div className="notice" role="status">
              We carried over <strong>{ROOFING_INTENT_LABEL[carriedIntent]}</strong> from the roofing guide.
              Nothing is sent to a contractor unless you choose that later.
            </div>
          ) : null}

          <form onSubmit={createProject} className="roof-start__form">
            <fieldset>
              <legend>Part of the home</legend>
              <div className="project-category-grid">
                {CATEGORIES.map(option => (
                  <label className="choice-card" key={option.value}>
                    <input
                      type="radio"
                      name="project-category"
                      value={option.value}
                      checked={category === option.value}
                      onChange={() => {
                        resetAttempt()
                        setCategory(option.value)
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="project-title">Project name</label>
              <input
                id="project-title"
                value={title}
                maxLength={120}
                required
                onChange={event => {
                  resetAttempt()
                  setTitle(event.target.value)
                }}
                placeholder="Kitchen remodel, spring AC service, fence repair…"
              />
            </div>

            {recordMode === 'past' ? (
              <div className="field">
                <label htmlFor="project-date">Exact completion date (optional)</label>
                <input
                  id="project-date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={occurredOn}
                  onChange={event => {
                    resetAttempt()
                    setOccurredOn(event.target.value)
                  }}
                />
                <span className="field__hint">Leave this blank unless you can support the exact day. Put a known month, season, or year in the notes instead.</span>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="project-summary">What do you know so far?</label>
              <textarea
                id="project-summary"
                value={summary}
                maxLength={2000}
                onChange={event => {
                  resetAttempt()
                  setSummary(event.target.value)
                }}
                placeholder="Who did the work, what changed, questions, model numbers, or what to check next."
              />
              <span className="field__hint">Optional. Facts can be added as you find them.</span>
            </div>

            {failed ? (
              <p role="alert" className="form-error">
                {failed === 'not_signed_in'
                  ? 'Your sign-in expired. Sign in again before saving.'
                  : failed === 'conflict'
                    ? 'This record changed during a retry. Review it and save again.'
                    : 'The project was not saved. Check the details and try again.'}
              </p>
            ) : null}

            <button type="submit" className="btn btn--primary btn--block" disabled={busy || !category || !title.trim()}>
              {busy ? 'Saving to the home…' : recordMode === 'past' ? 'Add to home history' : 'Create project record'}
            </button>
            <p className="form-note">
              This creates a private record. It does not hire, schedule, approve, or pay a professional.
            </p>
            {mode === 'synthetic' ? <p className="mono">Demo only. A refresh clears the record.</p> : null}
          </form>
        </section>
      ) : null}

      <section aria-labelledby="saved-projects">
        <div className="panel__head">
          <div>
            <p className="mono">One history</p>
            <h2 id="saved-projects">Work on this home</h2>
          </div>
        </div>
        {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading projects" /></div>}
        {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
        {state.status === 'empty' && (
          <EmptyState
            title="No work recorded yet"
            body="Add something completed, underway, or still being considered. The home history can start anywhere."
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
                    <span className="row__sub">{project.trade}</span>
                  </span>
                  <span className="row__end">
                    <span className={STATUS_PILL[project.status]}>{STATUS_LABEL[project.status]}</span>
                    <span className="mono">{project.performedOn ?? 'Date not recorded'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
