'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useMemo, useRef, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { commandRefForAttempt } from '../../../../lib/port/command-ref.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconPlus } from '../../../../components/icons.tsx'
import {
  PROJECT_CATEGORY_LABEL, PROJECT_CATEGORY_OPTIONS, STATUS_LABEL, STATUS_PILL,
  WORK_KIND_LABEL, WORK_KIND_OPTIONS,
} from '../../../../components/projectStatus.ts'
import type {
  DocumentSummary, HomeownerWorkKind, ProjectCategory, ProjectStatus,
} from '../../../../lib/port/types.ts'
import { ROOFING_INTENT_LABEL, roofingIntent } from '../../../../lib/roofing-intent.ts'

type RecordMode = 'planned' | 'active' | 'past'
type WorkView = 'all' | 'open' | 'care' | 'complete'
type WorkSort = 'recent' | 'work_date' | 'title'

const MODES: readonly {
  value: RecordMode
  title: string
}[] = [
  {
    value: 'planned',
    title: 'Planned',
  },
  {
    value: 'active',
    title: 'Happening now',
  },
  {
    value: 'past',
    title: 'Already done',
  },
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
  const { state: session } = useSession()
  const assistantEnabled = session.kind === 'signed_in' && session.capabilities.homeAssistant
  const port = usePort()
  const { state, retry } = usePortCall(() => port.listProjects(homeId), value => value.length === 0)
  const recordsReadable = mode === 'synthetic'
    || (session.kind === 'signed_in' && session.capabilities.uploads)
  const documents = usePortCall<readonly DocumentSummary[]>(() => recordsReadable
    ? port.listDocuments(homeId)
    : Promise.resolve({ ok: true as const, value: [] }))
  const [recordMode, setRecordMode] = useState<RecordMode | null>(() => carriedIntent ? 'planned' : null)
  const [workKind, setWorkKind] = useState<HomeownerWorkKind>('project')
  const [category, setCategory] = useState<ProjectCategory | null>(() => carriedIntent ? 'roofing' : null)
  const [title, setTitle] = useState(() => carriedIntent ? ROOF_TITLE[carriedIntent] : '')
  const [occurredOn, setOccurredOn] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [workView, setWorkView] = useState<WorkView>('all')
  const [workQuery, setWorkQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<HomeownerWorkKind | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<ProjectCategory | 'all'>('all')
  const [sort, setSort] = useState<WorkSort>('recent')
  const attemptRef = useRef<string | null>(null)

  const artifactCounts = useMemo(() => {
    const counts = new Map<string, { photos: number; files: number }>()
    if (documents.state.status !== 'ready') return null
    for (const record of documents.state.value) {
      if (!record.projectRef) continue
      const current = counts.get(record.projectRef) ?? { photos: 0, files: 0 }
      if (record.kind === 'photo_set') current.photos += 1
      else current.files += 1
      counts.set(record.projectRef, current)
    }
    return counts
  }, [documents.state])

  const visibleWork = useMemo(() => {
    if (state.status !== 'ready') return []
    const needle = workQuery.trim().toLocaleLowerCase()
    const filtered = state.value.filter(project => !project.archived).filter(project => {
      if (workView === 'open' && !['planned', 'in_progress'].includes(project.status)) return false
      if (workView === 'care' && !['issue', 'repair', 'service'].includes(project.workKind)) return false
      if (workView === 'complete' && project.status !== 'completed') return false
      if (kindFilter !== 'all' && project.workKind !== kindFilter) return false
      if (categoryFilter !== 'all' && project.category !== categoryFilter) return false
      if (!needle) return true
      return [
        project.title,
        project.trade,
        project.professionalLabel,
        PROJECT_CATEGORY_LABEL[project.category],
        WORK_KIND_LABEL[project.workKind],
        STATUS_LABEL[project.status],
      ].join(' ').toLocaleLowerCase().includes(needle)
    })
    if (sort === 'recent') return filtered
    return [...filtered].sort((left, right) => {
      if (sort === 'title') return left.title.localeCompare(right.title)
      if (!left.performedOn && !right.performedOn) return 0
      if (!left.performedOn) return 1
      if (!right.performedOn) return -1
      return right.performedOn.localeCompare(left.performedOn)
    })
  }, [categoryFilter, kindFilter, sort, state, workQuery, workView])

  const filtersActive = workView !== 'all' || Boolean(workQuery.trim())
    || kindFilter !== 'all' || categoryFilter !== 'all' || sort !== 'recent'

  function clearWorkFilters() {
    setWorkView('all')
    setWorkQuery('')
    setKindFilter('all')
    setCategoryFilter('all')
    setSort('recent')
  }

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
      workKind,
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
      <div className="project-list-head">
        <div>
          <p className="mono">Plans, service &amp; repairs</p>
          <h1>Plans</h1>
          <p>Everything you are trying to fix, improve, maintain, or finish—active work first, history underneath.</p>
        </div>
        <div className="project-list-head__actions">
          {assistantEnabled ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.dispatchEvent(new CustomEvent('homesrolo:open-assistant', { detail: { homeId } }))}
            >
              Start with Rolo
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--quiet"
            aria-expanded={recordMode !== null}
            aria-controls="add-work"
            onClick={() => recordMode === null ? chooseMode('planned') : setRecordMode(null)}
          >
            <IconPlus /> {recordMode === null ? 'Add without Rolo' : 'Close form'}
          </button>
        </div>
      </div>

      {recordMode ? (
        <section id="add-work" className="panel project-composer" aria-labelledby="project-details-title">
          <div className="panel__head">
            <div>
              <p className="mono">Manual entry</p>
              <h2 id="project-details-title">What needs to happen?</h2>
            </div>
          </div>

          {carriedIntent && category === 'roofing' ? (
            <div className="notice" role="status">
              We carried over <strong>{ROOFING_INTENT_LABEL[carriedIntent]}</strong> from the roofing guide.
              Nothing is sent to a contractor unless you choose that later.
            </div>
          ) : null}

          <form onSubmit={createProject} className="project-composer__form">
            <fieldset className="project-stage-picker">
              <legend>Where is it now?</legend>
              <div>
                {MODES.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={recordMode === option.value}
                    onClick={() => chooseMode(option.value)}
                  >
                    {option.title}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="project-composer__primary">
              <label className="field" style={{ marginTop: 0 }}>
                <span>What kind of work is this?</span>
                <select
                  value={workKind}
                  onChange={event => {
                    resetAttempt()
                    setWorkKind(event.target.value as HomeownerWorkKind)
                  }}
                >
                  {WORK_KIND_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginTop: 0 }}>
                <span>Part of the home</span>
                <select
                  value={category ?? ''}
                  required
                  onChange={event => {
                    resetAttempt()
                    setCategory(event.target.value as ProjectCategory)
                  }}
                >
                  <option value="">Choose an area</option>
                  {PROJECT_CATEGORY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginTop: 0 }}>
                <span>What is it?</span>
                <input
                  id="project-title"
                  value={title}
                  maxLength={120}
                  required
                  onChange={event => {
                    resetAttempt()
                    setTitle(event.target.value)
                  }}
                  placeholder="Kitchen remodel, AC service, fence repair…"
                />
              </label>
            </div>

            <details className="project-more">
              <summary>Add date or notes</summary>
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
                <label htmlFor="project-summary">Notes (optional)</label>
                <textarea
                  id="project-summary"
                  value={summary}
                  maxLength={2000}
                  onChange={event => {
                    resetAttempt()
                    setSummary(event.target.value)
                  }}
                  placeholder="Who is involved, what changed, model numbers, questions, or what to do next."
                />
              </div>
            </details>

            {failed ? (
              <p role="alert" className="form-error">
                {failed === 'not_signed_in'
                  ? 'Your sign-in expired. Sign in again before saving.'
                  : failed === 'conflict'
                    ? 'This record changed during a retry. Review it and save again.'
                    : 'The work record was not saved. Check the details and try again.'}
              </p>
            ) : null}

            <div className="project-composer__actions">
              <button type="submit" className="btn btn--primary" disabled={busy || !category || !title.trim()}>
                {busy ? 'Saving…' : 'Create this plan'}
              </button>
              <span className="form-note">Private by default. This creates the workspace; it does not hire or notify anyone.</span>
            </div>
            {mode === 'synthetic' ? <p className="mono">Demo only. A refresh clears the record.</p> : null}
          </form>
        </section>
      ) : null}

      <section aria-labelledby="saved-projects">
        <div className="panel__head">
          <div>
            <p className="mono">What is happening</p>
            <h2 id="saved-projects">Plans &amp; history</h2>
          </div>
        </div>
        <div className="work-index panel" aria-label="Find saved work">
          <label className="work-index__search">
            <span className="sr-only">Search saved work</span>
            <input
              type="search"
              value={workQuery}
              onChange={event => setWorkQuery(event.target.value)}
              placeholder="Search work, people, or home area"
              autoComplete="off"
            />
          </label>
          <div className="work-index__views" role="group" aria-label="Quick work filters">
            {([
              ['all', 'Everything'],
              ['open', 'Active'],
              ['care', 'Service & repairs'],
              ['complete', 'Finished'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={workView === value} onClick={() => setWorkView(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="work-index__selects">
            <label>
              <span>Kind</span>
              <select value={kindFilter} onChange={event => setKindFilter(event.target.value as HomeownerWorkKind | 'all')}>
                <option value="all">All kinds</option>
                {WORK_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Area</span>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as ProjectCategory | 'all')}>
                <option value="all">All areas</option>
                {PROJECT_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sort} onChange={event => setSort(event.target.value as WorkSort)}>
                <option value="recent">Recently updated</option>
                <option value="work_date">Work date</option>
                <option value="title">A–Z</option>
              </select>
            </label>
          </div>
          <div className="work-index__result" aria-live="polite">
            <span>{state.status === 'ready' ? `${visibleWork.length} of ${state.value.filter(project => !project.archived).length} records` : 'Opening work…'}</span>
            {filtersActive ? <button type="button" onClick={clearWorkFilters}>Clear filters</button> : null}
          </div>
        </div>
        {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading projects" /></div>}
        {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
        {recordsReadable && documents.state.status === 'error' ? (
          <div className="notice" role="status">
            Photo and file counts could not be loaded, so they are left unknown. <button type="button" onClick={documents.retry}>Try again</button>
          </div>
        ) : null}
        {state.status === 'empty' && (
          <EmptyState
            title="Nothing in motion yet"
            body="Tell Rolo what needs fixing, what you want to plan, what service you need, or what old work belongs in the history."
          />
        )}
        {state.status === 'ready' && visibleWork.length === 0 && state.value.length > 0 ? (
          <EmptyState
            title="Nothing matches this view"
            body="Try another area or kind, or clear the filters to see the whole home history."
          />
        ) : null}
        {state.status === 'ready' && visibleWork.length > 0 && (
          <ul className="work-card-grid">
            {visibleWork.map(project => {
              const counts = project.isSynthetic
                ? { photos: project.photoCount, files: project.documentCount }
                : artifactCounts?.get(project.projectRef)
                  ?? (artifactCounts ? { photos: 0, files: 0 } : null)
              return (
              <li key={project.projectRef}>
                <Link className="work-card" href={`/home/${homeId}/projects/${project.projectRef}`}>
                  <span className="work-card__topline">
                    <span>{PROJECT_CATEGORY_LABEL[project.category]}</span>
                    <span className={STATUS_PILL[project.status]}>{STATUS_LABEL[project.status]}</span>
                  </span>
                  <strong>{project.title}</strong>
                  <span className="work-card__kind">{WORK_KIND_LABEL[project.workKind]} · {project.trade}</span>
                  {project.professionalLabel ? <span className="work-card__person">With {project.professionalLabel}</span> : null}
                  <span className="work-card__meta">
                    <span>{project.performedOn ?? 'Date not recorded'}</span>
                    {counts ? (
                      <span>{counts.photos} {counts.photos === 1 ? 'photo' : 'photos'} · {counts.files} {counts.files === 1 ? 'file' : 'files'}</span>
                    ) : <span>Evidence count unavailable</span>}
                  </span>
                </Link>
              </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
