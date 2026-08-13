'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useRef, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { HouseMark } from '../../../components/icons.tsx'
import { UnauthorizedState } from '../../../components/states.tsx'
import {
  answer, back, choicesFor, draftFrom, initialIntake, isComplete, skip, skippable,
  type IntakeState,
} from '../../../lib/intake/machine.ts'
import { SYSTEM_LABEL, SYSTEM_ORDER, type IntakeDraft } from '../../../lib/intake/script.ts'
import { commandRefForAttempt } from '../../../lib/port/command-ref.ts'
import { roofingIntent, withRoofingIntent } from '../../../lib/roofing-intent.ts'

/**
 * Opening a home's file is a conversation, not a form. The script is
 * deterministic (lib/intake) — no model, no invented defaults — and everything
 * it records is marked as the homeowner's own recollection.
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

function ReviewCard({ draft }: { draft: IntakeDraft }) {
  return (
    <div className="jobdoc" style={{ marginTop: '1rem' }}>
      <p className="jobdoc__serial">
        <span>Home file draft</span>
        <span aria-hidden="true">recollection · unconfirmed</span>
      </p>
      <dl className="jobdoc__rows">
        <div><dt>Name</dt><dd>{draft.home.displayLabel}</dd></div>
        <div><dt>Area</dt><dd>{draft.home.privateLocationLabel}</dd></div>
        <div><dt>Type</dt><dd>{draft.profile.homeType === 'unknown' ? 'Not recorded' : draft.profile.homeType}</dd></div>
        <div>
          <dt>Built</dt>
          <dd>
            {draft.profile.yearBuilt
              ? `${draft.profile.yearBuilt.precision === 'approximate' ? '~' : ''}${draft.profile.yearBuilt.value}`
              : 'Not recorded'}
          </dd>
        </div>
        {draft.systems.map(system => (
          <div key={system.kind}>
            <dt>{SYSTEM_LABEL[system.kind]}</dt>
            <dd>
              {system.present === 'no' && 'None'}
              {system.present === 'unknown' && 'Not sure'}
              {system.present === 'yes' && (system.year
                ? `${system.year.precision === 'approximate' ? '~' : ''}${system.year.value}`
                : 'Yes — year not recorded')}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mono" style={{ marginTop: '0.8rem' }}>
        Source: your recollection. A contractor can confirm the big items later.
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
  const endRef = useRef<HTMLDivElement>(null)
  // One commandRef per submission attempt group: retries of the SAME draft
  // reuse it (idempotency-stable), an edited draft mints a fresh one.
  const createAttemptRef = useRef<string | null>(null)
  const intakeAttemptRef = useRef<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [state.transcript.length])

  useEffect(() => {
    // Any change to the conversation ends the current attempt group.
    if (!isComplete(state)) {
      createAttemptRef.current = null
      intakeAttemptRef.current = null
    }
  }, [state])

  const step = state.step
  const choices = choicesFor(step)
  const complete = isComplete(state)

  function give(input: Parameters<typeof answer>[1]) {
    setState(current => answer(current, input))
    setText('')
    setYearText('')
    setApproximate(false)
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
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card gate__card--wide">
          {session.kind === 'signed_out' ? (
            <UnauthorizedState signInHref={withRoofingIntent('/signin', intent)} />
          ) : (
            <>
              <Link href={withRoofingIntent('/homes', intent)} className="backlink">← Back to your homes</Link>
              <p className="mono" style={{ marginBottom: '0.4rem' }}>New home file · guided</p>
              <h1 style={{ fontSize: '1.4rem' }}>Tell us about the home.</h1>
              <p className="mono" style={{ marginTop: '0.35rem' }}>
                Scripted questions, your words. Nothing is guessed, and a refresh starts over.
              </p>

              <div className="intake" aria-live="polite">
                {state.transcript.map((line, index) => (
                  <p
                    key={index}
                    className={line.speaker === 'homesrolo' ? 'intake__ask' : 'intake__say'}
                  >
                    {line.text}
                  </p>
                ))}
                <div ref={endRef} />
              </div>

              {state.error && (
                <p role="alert" className="intake__error">{state.error}</p>
              )}

              {!complete && (
                <div className="intake__controls">
                  {step.kind === 'display_label' || step.kind === 'location_label' ? (
                    <form
                      className="intake__row"
                      onSubmit={event => { event.preventDefault(); give({ kind: 'text', value: text }) }}
                    >
                      <label className="sr-only" htmlFor="intake-text">Your answer</label>
                      <input
                        id="intake-text"
                        type="text"
                        value={text}
                        onChange={event => setText(event.target.value)}
                        placeholder="Type your answer…"
                        autoComplete="off"
                      />
                      <button type="submit" className="btn btn--primary">Answer</button>
                    </form>
                  ) : null}

                  {choices.length > 0 ? (
                    <div className="intake__chips" role="group" aria-label="Answer options">
                      {choices.map(choice => (
                        <button
                          key={choice.value}
                          type="button"
                          className="btn btn--quiet"
                          onClick={() => give({ kind: 'choice', value: choice.value })}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {(step.kind === 'year_built' || step.kind === 'system_year') ? (
                    <form
                      className="intake__row"
                      onSubmit={event => {
                        event.preventDefault()
                        const value = Number(yearText)
                        give({ kind: 'year', value, approximate })
                      }}
                    >
                      <label className="sr-only" htmlFor="intake-year">Year</label>
                      <input
                        id="intake-year"
                        type="number"
                        inputMode="numeric"
                        value={yearText}
                        onChange={event => setYearText(event.target.value)}
                        placeholder="e.g. 2019"
                      />
                      <label className="intake__approx">
                        <input
                          type="checkbox"
                          checked={approximate}
                          onChange={event => setApproximate(event.target.checked)}
                        />
                        Just a guess
                      </label>
                      <button type="submit" className="btn btn--primary">Answer</button>
                    </form>
                  ) : null}

                  <div className="intake__meta">
                    {step.kind !== 'display_label' && (
                      <button type="button" className="btn btn--quiet" onClick={() => setState(back)}>
                        ← Back
                      </button>
                    )}
                    {skippable(step) && (
                      <button type="button" className="btn btn--quiet" onClick={() => setState(skip)}>
                        Not sure — skip
                      </button>
                    )}
                    <span className="mono">
                      {step.kind.startsWith('system')
                        ? `System ${SYSTEM_ORDER.indexOf((step as { system: (typeof SYSTEM_ORDER)[number] }).system) + 1} of ${SYSTEM_ORDER.length}`
                        : 'The basics'}
                    </span>
                  </div>
                </div>
              )}

              {complete && (
                <>
                  <ReviewCard draft={draftFrom(state)} />
                  {submit.kind === 'created' ? (
                    <div className="state" role="status" style={{ marginTop: '1rem' }}>
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
                    <div className="state" role="alert" style={{ marginTop: '1rem' }}>
                      <h3>The home is saved; its starting details still need saving</h3>
                      <p>
                        The server stored the home shell, but did not confirm the
                        profile and systems ({submit.error}). The draft is still here.
                        Retrying below sends only those details to this same home.
                      </p>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => retryIntake(submit.homeRef)}
                        >
                          Retry the starting details
                        </button>
                        <button type="button" className="btn btn--quiet" onClick={() => setState(back)}>
                          Change an answer
                        </button>
                      </div>
                    </div>
                  ) : submit.kind === 'signed_out' ? (
                    <div style={{ marginTop: '1rem' }} role="alert">
                      <p className="intake__error">
                        The server says you are signed out, so nothing was saved.
                        Your draft stays on this screen.
                      </p>
                      <UnauthorizedState signInHref={withRoofingIntent('/signin', intent)} />
                    </div>
                  ) : (
                    <>
                      {submit.kind === 'unavailable' && (
                        <div className="state" role="alert" style={{ marginTop: '1rem' }}>
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
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
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
                        <button type="button" className="btn btn--quiet" onClick={() => setState(back)}>
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
            </>
          )}
        </div>
      </main>
    </div>
  )
}
