'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useRef, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { HouseMark } from '../../../components/icons.tsx'
import { UnauthorizedState } from '../../../components/states.tsx'
import {
  answer, back, choicesFor, draftFrom, editFromReview, finishOptionalLater,
  initialIntake, isComplete, skip, skippable, type IntakeState, type StepId,
} from '../../../lib/intake/machine.ts'
import {
  SYSTEM_LABEL, SYSTEM_ORDER, type IntakeDraft, type SystemKind,
} from '../../../lib/intake/script.ts'
import { commandRefForAttempt } from '../../../lib/port/command-ref.ts'
import { roofingIntent, withRoofingIntent } from '../../../lib/roofing-intent.ts'

/**
 * Opening a home's file is a short, progressive setup. The underlying script
 * remains deterministic (lib/intake) — no model, no invented defaults — and
 * everything it records is marked as the homeowner's own recollection.
 *
 * The draft lives in memory until the remote path completes two exact
 * commands: create the private home shell, then attach the homeowner-recalled
 * profile and systems to the returned homeRef. Partial completion is shown
 * honestly and retries only the second command.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'saving_intake'; homeRef: string }
  | { kind: 'unavailable' }
  | { kind: 'signed_out' }
  | { kind: 'failed'; error: string }
  | { kind: 'partial'; homeRef: string; error: string }
  | { kind: 'created'; homeRef: string }

type EditableStep = Exclude<StepId, { kind: 'review' }>

const HOME_TYPE_LABEL: Record<IntakeDraft['profile']['homeType'], string> = {
  house: 'House',
  townhouse: 'Townhouse',
  condo: 'Condo',
  other: 'Other',
  unknown: 'Not recorded',
}

function systemDisplayName(system: SystemKind): string {
  const label = SYSTEM_LABEL[system]
  return label.startsWith('the ') ? label.slice(4) : label
}

function stageFor(step: StepId): { number: number; label: string; detail: string } {
  switch (step.kind) {
    case 'display_label': return { number: 1, label: 'Home basics', detail: '1 of 2' }
    case 'location_label': return { number: 1, label: 'Home basics', detail: '2 of 2' }
    case 'home_type': return { number: 2, label: 'Home details', detail: 'Optional' }
    case 'year_built': return { number: 2, label: 'Home details', detail: 'Optional' }
    case 'system_present': {
      const number = SYSTEM_ORDER.indexOf(step.system) + 1
      return { number: 3, label: 'Major systems', detail: `${number} of ${SYSTEM_ORDER.length}` }
    }
    case 'system_year': {
      const number = SYSTEM_ORDER.indexOf(step.system) + 1
      return { number: 3, label: 'Major systems', detail: `${number} of ${SYSTEM_ORDER.length}` }
    }
    case 'review': return { number: 4, label: 'Review', detail: 'Ready to open' }
  }
}

function questionFor(step: StepId): { title: string; helper: string } {
  switch (step.kind) {
    case 'display_label':
      return {
        title: 'What should we call this home?',
        helper: 'Use whatever you call it: Oak Street, Mom’s house, the lake place—anything familiar.',
      }
    case 'location_label':
      return {
        title: 'Where is the home?',
        helper: 'A city, town, or neighborhood is enough for now. Keep it general if you prefer.',
      }
    case 'home_type':
      return {
        title: 'What kind of home is it?',
        helper: 'This helps organize the file. Choose Other if none of these fit.',
      }
    case 'year_built':
      return {
        title: 'About when was it built?',
        helper: 'An estimate is useful. It is also completely fine not to know yet.',
      }
    case 'system_present':
      return {
        title: `Does it have ${SYSTEM_LABEL[step.system]}?`,
        helper: 'This only adds the item to your starting home snapshot. You can correct it later.',
      }
    case 'system_year':
      return {
        title: `When was ${SYSTEM_LABEL[step.system]} installed or replaced?`,
        helper: 'Use the last replacement year if you know it. An estimate is fine.',
      }
    case 'review':
      return {
        title: 'Review your starting home file',
        helper: 'Nothing below is treated as verified. Edit anything now or update it after the file opens.',
      }
  }
}

function choiceHint(step: StepId, value: string): string | null {
  if (step.kind === 'system_present') {
    if (value === 'yes') return 'Track it in this home file'
    if (value === 'no') return 'Record that it is not present'
    return 'Leave it unconfirmed for now'
  }
  return null
}

function ReviewCard({
  draft,
  onEdit,
  editable,
}: {
  draft: IntakeDraft
  onEdit: (step: EditableStep) => void
  editable: boolean
}) {
  return (
    <div className="jobdoc setup-review">
      <p className="jobdoc__serial">
        <span>Home file draft</span>
        <span aria-hidden="true">recollection · unconfirmed</span>
      </p>
      <dl className="jobdoc__rows">
        <div>
          <dt>Name</dt>
          <dd>
            <span>{draft.home.displayLabel}</span>
            {editable ? (
              <button type="button" onClick={() => onEdit({ kind: 'display_label' })}>
                Edit<span className="sr-only"> home name</span>
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>
            <span>{draft.home.privateLocationLabel}</span>
            {editable ? (
              <button type="button" onClick={() => onEdit({ kind: 'location_label' })}>
                Edit<span className="sr-only"> area</span>
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            <span>{HOME_TYPE_LABEL[draft.profile.homeType]}</span>
            {editable ? (
              <button type="button" onClick={() => onEdit({ kind: 'home_type' })}>
                Edit<span className="sr-only"> home type</span>
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Built</dt>
          <dd>
            <span>
              {draft.profile.yearBuilt
                ? `${draft.profile.yearBuilt.precision === 'approximate' ? '~' : ''}${draft.profile.yearBuilt.value}`
                : 'Not recorded'}
            </span>
            {editable ? (
              <button type="button" onClick={() => onEdit({ kind: 'year_built' })}>
                Edit<span className="sr-only"> year built</span>
              </button>
            ) : null}
          </dd>
        </div>
        {draft.systems.map(system => (
          <div key={system.kind}>
            <dt>{systemDisplayName(system.kind)}</dt>
            <dd>
              <span>
                {system.present === 'no' && 'None'}
                {system.present === 'unknown' && 'Not sure'}
                {system.present === 'yes' && (system.year
                  ? `${system.year.precision === 'approximate' ? '~' : ''}${system.year.value}`
                  : 'Yes — year not recorded')}
              </span>
              {editable ? (
                <button
                  type="button"
                  onClick={() => onEdit({ kind: 'system_present', system: system.kind })}
                >
                  Edit<span className="sr-only"> {systemDisplayName(system.kind)}</span>
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mono" style={{ marginTop: '0.8rem' }}>
        Source: what you told us. Update it anytime; professional records can confirm details later.
      </p>
    </div>
  )
}

export default function NewHomePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>
}) {
  const query = use(searchParams)
  const intent = roofingIntent(Array.isArray(query.intent) ? null : query.intent)
  const port = usePort()
  const mode = usePortMode()
  const { state: session } = useSession()
  const router = useRouter()

  // The current year bounds year answers; injected so the machine stays pure.
  const [state, setState] = useState<IntakeState>(() => initialIntake(new Date().getFullYear()))
  const [text, setText] = useState('')
  const [yearText, setYearText] = useState('')
  const [approximate, setApproximate] = useState(false)
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' })
  // One commandRef per submission attempt group: retries of the SAME draft
  // reuse it (idempotency-stable), an edited draft mints a fresh one.
  const createAttemptRef = useRef<string | null>(null)
  const intakeAttemptRef = useRef<string | null>(null)

  const step = state.step
  const choices = choicesFor(step)
  const complete = isComplete(state)
  const stage = stageFor(step)
  const question = questionFor(step)
  const canFinishOptional = state.displayLabel !== null
    && state.privateLocationLabel !== null
    && !complete
  const reviewEditable = submit.kind !== 'created'
    && submit.kind !== 'sending'
    && submit.kind !== 'saving_intake'
    && submit.kind !== 'partial'

  function give(input: Parameters<typeof answer>[1]) {
    const currentStep = state.step
    const editedSystem = state.editingFromReview && currentStep.kind === 'system_present'
      ? state.systems.find(system => system.kind === currentStep.system)
      : null
    setState(current => answer(current, input))
    setText('')
    if (editedSystem?.year && input.kind === 'choice' && input.value === 'yes') {
      setYearText(String(editedSystem.year.value))
      setApproximate(editedSystem.year.precision === 'approximate')
    } else {
      setYearText('')
      setApproximate(false)
    }
    // An edited draft is a new submission attempt, even when it is identical.
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  function goBack() {
    setState(current => back(current))
    setText('')
    setYearText('')
    setApproximate(false)
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  function finishLater() {
    setState(current => finishOptionalLater(current))
    setText('')
    setYearText('')
    setApproximate(false)
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  function skipOne() {
    setState(current => skip(current))
    setYearText('')
    setApproximate(false)
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  function editStep(target: EditableStep) {
    const draft = draftFrom(state)
    if (target.kind === 'display_label') setText(draft.home.displayLabel)
    else if (target.kind === 'location_label') setText(draft.home.privateLocationLabel)
    else setText('')

    if (target.kind === 'year_built' && draft.profile.yearBuilt) {
      setYearText(String(draft.profile.yearBuilt.value))
      setApproximate(draft.profile.yearBuilt.precision === 'approximate')
    } else {
      setYearText('')
      setApproximate(false)
    }
    setState(current => editFromReview(current, target))
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  async function saveIntake(homeRef: string, draft: IntakeDraft) {
    const commandRef = commandRefForAttempt(intakeAttemptRef.current)
    intakeAttemptRef.current = commandRef
    setSubmit({ kind: 'saving_intake', homeRef })
    const result = await port.recordInitialIntake(homeRef, {
      commandRef,
      homeType: draft.profile.homeType,
      yearBuilt: draft.profile.yearBuilt,
      systems: draft.systems.map(system => ({
        kind: system.kind,
        present: system.present,
        installedOrReplacedYear: system.year,
      })),
    })
    if (!result.ok) {
      setSubmit({ kind: 'partial', homeRef, error: result.error })
      return
    }
    setSubmit({ kind: 'created', homeRef })
  }

  async function retryIntake(homeRef: string) {
    if (!complete) return
    await saveIntake(homeRef, draftFrom(state))
  }

  async function create() {
    if (!complete) return
    const draft = draftFrom(state)
    const commandRef = commandRefForAttempt(createAttemptRef.current)
    createAttemptRef.current = commandRef
    setSubmit({ kind: 'sending' })
    const result = await port.createHome({
      commandRef,
      alias: draft.home.displayLabel,
      locality: draft.home.privateLocationLabel,
      // The remote create adapter omits these; saveIntake sends their typed
      // values only after the server returns the exact homeRef.
      homeType: draft.profile.homeType === 'unknown' ? 'other' : draft.profile.homeType,
      yearBuilt: draft.profile.yearBuilt?.value ?? null,
    })
    if (!result.ok) {
      if (result.error === 'not_signed_in') {
        setSubmit({ kind: 'signed_out' })
        return
      }
      setSubmit(result.error === 'unavailable'
        ? { kind: 'unavailable' }
        : { kind: 'failed', error: result.error })
      return
    }
    if (mode === 'remote') {
      await saveIntake(result.value.homeRef, draft)
      return
    }
    router.push(intent
      ? withRoofingIntent(`/home/${result.value.homeRef}/projects`, intent)
      : `/home/${result.value.homeRef}`)
  }

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main gate__main--setup">
        <div className="gate__card gate__card--setup">
          {session.kind === 'signed_out' ? (
            <UnauthorizedState signInHref={withRoofingIntent('/signin', intent)} />
          ) : (
            <>
              <Link href={withRoofingIntent('/homes', intent)} className="backlink">
                ← Your homes
              </Link>
              <header className="setup-head">
                <p className="setup-head__eyebrow">Private home file</p>
                <h1>Set up your home</h1>
                <p>
                  Start with a name and general area. That is enough to open the
                  file; details can be added or researched with your approval later.
                </p>
                <div className="setup-head__notes" aria-label="Setup details">
                  <span>About 1 minute</span>
                  <span>You control what is saved</span>
                </div>
              </header>

              <div className="setup-progress">
                <div className="setup-progress__label">
                  <span>Step {stage.number} of 4 · {stage.label}</span>
                  <span>{stage.detail}</span>
                </div>
                <progress max="4" value={stage.number} aria-label={`Step ${stage.number} of 4`} />
              </div>

              {!complete && (
                <section className="setup-panel" aria-labelledby="setup-question">
                  <div className="setup-panel__question" aria-live="polite">
                    <p className="setup-panel__status">
                      {stage.number === 1 ? 'Required to open the file' : 'Optional — skip any time'}
                    </p>
                    <h2 id="setup-question">{question.title}</h2>
                    <p>{question.helper}</p>
                  </div>

                  {state.error && (
                    <p role="alert" className="intake__error">{state.error}</p>
                  )}

                  <div className="setup-controls">
                  {step.kind === 'display_label' || step.kind === 'location_label' ? (
                    <form
                      className="setup-field"
                      onSubmit={event => { event.preventDefault(); give({ kind: 'text', value: text }) }}
                    >
                      <label htmlFor="intake-text">
                        {step.kind === 'display_label' ? 'Home name' : 'City, town, or neighborhood'}
                      </label>
                      <input
                        id="intake-text"
                        type="text"
                        value={text}
                        onChange={event => setText(event.target.value)}
                        placeholder={step.kind === 'display_label' ? 'e.g. Oak Street' : 'e.g. Frisco, Texas'}
                        autoComplete="off"
                      />
                      <button type="submit" className="btn btn--primary btn--block">Continue</button>
                    </form>
                  ) : null}

                  {choices.length > 0 ? (
                    <div className="setup-options" role="group" aria-label="Answer options">
                      {choices.map(choice => (
                        <button
                          key={choice.value}
                          type="button"
                          className="setup-option"
                          onClick={() => give({ kind: 'choice', value: choice.value })}
                        >
                          <span>{choice.label}</span>
                          {choiceHint(step, choice.value) ? <small>{choiceHint(step, choice.value)}</small> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {(step.kind === 'year_built' || step.kind === 'system_year') ? (
                    <form
                      className="setup-field"
                      onSubmit={event => {
                        event.preventDefault()
                        const value = Number(yearText)
                        give({ kind: 'year', value, approximate })
                      }}
                    >
                      <label htmlFor="intake-year">Year</label>
                      <input
                        id="intake-year"
                        type="number"
                        inputMode="numeric"
                        value={yearText}
                        onChange={event => setYearText(event.target.value)}
                        placeholder="e.g. 2019"
                      />
                      <label className="setup-check">
                        <input
                          type="checkbox"
                          checked={approximate}
                          onChange={event => setApproximate(event.target.checked)}
                        />
                        This is an estimate
                      </label>
                      <button type="submit" className="btn btn--primary btn--block">Save year</button>
                    </form>
                  ) : null}

                  <div className="setup-actions">
                    {step.kind !== 'display_label' && (
                      <button type="button" className="btn btn--quiet" onClick={goBack}>
                        {state.editingFromReview ? 'Cancel edit' : '← Back'}
                      </button>
                    )}
                    {skippable(step) && (
                      <button type="button" className="btn btn--quiet" onClick={skipOne}>
                        I don’t know
                      </button>
                    )}
                  </div>
                  {canFinishOptional && !state.editingFromReview ? (
                    <button type="button" className="setup-skip" onClick={finishLater}>
                      Skip optional details — add or research them later
                    </button>
                  ) : null}
                  </div>
                </section>
              )}

              {complete && (
                <>
                  <section className="setup-panel setup-panel--review" aria-labelledby="setup-review-title">
                    <div className="setup-panel__question">
                      <p className="setup-panel__status">Your starting snapshot</p>
                      <h2 id="setup-review-title">{question.title}</h2>
                      <p>{question.helper}</p>
                    </div>
                    <ReviewCard
                      draft={draftFrom(state)}
                      onEdit={editStep}
                      editable={reviewEditable}
                    />
                  </section>
                  {submit.kind === 'created' ? (
                    <div className="state setup-result" role="status">
                      <h3>Home file and starting history saved</h3>
                      <p>
                        The home shell and the profile and system answers above are
                        stored as <strong>your recollection</strong>. They are not a
                        contractor verification or legal proof of ownership.
                      </p>
                      <Link
                        className="btn btn--primary"
                        href={intent
                          ? withRoofingIntent(`/home/${submit.homeRef}/projects`, intent)
                          : `/home/${submit.homeRef}`}
                      >
                        {intent ? 'Continue to the roof project' : 'Open this home’s file'}
                      </Link>
                    </div>
                  ) : submit.kind === 'partial' ? (
                    <div className="state setup-result" role="alert">
                      <h3>The home is saved; its starting details still need saving</h3>
                      <p>
                        The server stored the home shell, but did not confirm the
                        profile and systems ({submit.error}). The draft is still here.
                        Retrying below sends only those details to this same home.
                      </p>
                      <div className="setup-submit">
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => retryIntake(submit.homeRef)}
                        >
                          Retry the starting details
                        </button>
                        <Link className="btn btn--quiet" href={`/home/${submit.homeRef}`}>
                          Open the saved home
                        </Link>
                      </div>
                    </div>
                  ) : submit.kind === 'signed_out' ? (
                    <div className="setup-result" role="alert">
                      <p className="intake__error">
                        The server says you are signed out, so nothing was saved.
                        Your draft stays on this screen.
                      </p>
                      <UnauthorizedState signInHref={withRoofingIntent('/signin', intent)} />
                    </div>
                  ) : (
                    <>
                      {submit.kind === 'unavailable' && (
                        <div className="state setup-result" role="alert">
                          <h3>Saving is not available yet</h3>
                          <p>
                            The server cannot store a home yet, so nothing was saved. Your
                            draft is shown above and stays on this screen — try again once
                            saving is live, or start over later. It was not stored anywhere.
                          </p>
                          <button type="button" className="btn btn--quiet" onClick={create}>Try again</button>
                        </div>
                      )}
                      {submit.kind === 'failed' && (
                        <p role="alert" className="intake__error">
                          That did not go through ({submit.error}). Nothing was saved — try again.
                        </p>
                      )}
                      <div className="setup-submit">
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={create}
                          disabled={submit.kind === 'sending' || submit.kind === 'saving_intake'}
                        >
                          {submit.kind === 'sending'
                            ? 'Opening the file…'
                            : submit.kind === 'saving_intake'
                              ? 'Saving the starting details…'
                              : 'Open this home’s file'}
                        </button>
                        <button type="button" className="btn btn--quiet" onClick={goBack}>
                          ← Change an answer
                        </button>
                      </div>
                      {mode === 'synthetic' ? (
                        <p className="mono" style={{ marginTop: '0.8rem' }}>
                          Demo: this file lives in memory and disappears on refresh.
                        </p>
                      ) : (
                        <p className="mono" style={{ marginTop: '0.8rem' }}>
                          Remote saving creates the private home first, then records
                          these answers as your recollection against that exact home.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              <p className="setup-privacy mono">
                Nothing is guessed. Until you open the file, this draft stays only
                on this screen; a refresh starts over.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
