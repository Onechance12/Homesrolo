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
import type { RoofingNeed, RoofingTiming } from '../../../../lib/port/types.ts'
import { ROOFING_INTENT_LABEL, roofingIntent } from '../../../../lib/roofing-intent.ts'

const NEEDS: readonly { value: RoofingNeed; label: string }[] = [
  { value: 'repair', label: 'Repair a leak or damage' },
  { value: 'replacement', label: 'Replace the roof' },
  { value: 'inspection', label: 'Get the roof checked' },
  { value: 'storm_damage', label: 'Review storm damage' },
  { value: 'not_sure', label: 'I am not sure yet' },
]

const TIMING: readonly { value: RoofingTiming; label: string }[] = [
  { value: 'urgent', label: 'As soon as possible' },
  { value: 'within_30_days', label: 'Within 30 days' },
  { value: 'researching', label: 'I am researching' },
  { value: 'not_sure', label: 'I am not sure yet' },
]

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
  const [need, setNeed] = useState<RoofingNeed>(() => carriedIntent ?? 'not_sure')
  const [timing, setTiming] = useState<RoofingTiming>('not_sure')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const attemptRef = useRef<string | null>(null)

  function changeNeed(value: RoofingNeed) {
    attemptRef.current = null
    setNeed(value)
  }

  function changeTiming(value: RoofingTiming) {
    attemptRef.current = null
    setTiming(value)
  }

  function changeNotes(value: string) {
    attemptRef.current = null
    setNotes(value)
  }

  async function startProject(event: React.FormEvent) {
    event.preventDefault()
    const commandRef = commandRefForAttempt(attemptRef.current)
    attemptRef.current = commandRef
    setBusy(true)
    setFailed(null)
    const result = await port.startRoofingProject(homeId, { commandRef, need, timing, notes })
    setBusy(false)
    if (!result.ok) {
      setFailed(result.error)
      return
    }
    router.push(`/home/${homeId}/projects/${result.value.projectRef}`)
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <p className="mono">Your home · roofing</p>
        <h1>Roof projects</h1>
        <p>Start here, keep the decisions here, and build the permanent record as the work moves.</p>
      </div>

      <section className="panel roof-start" aria-labelledby="start-roof-project">
        <div className="panel__head">
          <div>
            <p className="mono">New request</p>
            <h2 id="start-roof-project">What does the roof need?</h2>
          </div>
        </div>
        <form onSubmit={startProject} className="roof-start__form">
          {carriedIntent && carriedIntent !== 'not_sure' ? (
            <div className="notice" role="status">
              We carried over <strong>{ROOFING_INTENT_LABEL[carriedIntent]}</strong> from the roofing guide.
              You can change it below before anything is saved.
            </div>
          ) : null}
          <fieldset>
            <legend>Choose the closest answer</legend>
            <div className="choice-grid">
              {NEEDS.map(option => (
                <label className="choice-card" key={option.value}>
                  <input
                    type="radio"
                    name="roof-need"
                    value={option.value}
                    checked={need === option.value}
                    onChange={() => changeNeed(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="roof-timing">When do you want to move?</label>
            <select
              id="roof-timing"
              value={timing}
              onChange={event => changeTiming(event.target.value as RoofingTiming)}
            >
              {TIMING.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="roof-notes">Anything we should know?</label>
            <textarea
              id="roof-notes"
              value={notes}
              maxLength={1500}
              onChange={event => changeNotes(event.target.value)}
              placeholder="Leak location, storm date, roof age, access notes, or questions."
            />
            <span className="field__hint">Optional. This release saves these notes with the private roof project.</span>
          </div>

          {failed && (
            <p role="alert" className="form-error">
              {failed === 'not_signed_in'
                ? 'Your sign-in expired. Sign in again before starting the project.'
                : 'The project was not started. Check the form and try again.'}
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Starting your roof file…' : 'Start my roof project'}
          </button>
          <p className="form-note">
            This creates a private project in your home file. It does not hire a contractor or approve work.
          </p>
          {mode === 'synthetic' ? (
            <p className="mono">Demo only. A refresh clears the request.</p>
          ) : null}
        </form>
      </section>

      <section aria-labelledby="saved-projects">
        <div className="panel__head"><h2 id="saved-projects">Your project record</h2></div>
        {state.status === 'loading' && <div className="panel"><Skeleton lines={4} label="Loading projects" /></div>}
        {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
        {state.status === 'empty' && (
          <EmptyState
            title="No roof project yet"
            body="Use the short form above. Your first request becomes the start of this home's roofing record."
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
                    <span className="mono">{project.performedOn}</span>
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
