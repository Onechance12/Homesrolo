'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { HouseMark } from '../../../components/icons.tsx'
import { UnauthorizedState } from '../../../components/states.tsx'
import {
  answer, back, choicesFor, draftFrom, initialIntake, isComplete, skip, skippable,
  type IntakeState,
} from '../../../lib/intake/machine.ts'
import { SYSTEM_LABEL, SYSTEM_ORDER, type IntakeDraft } from '../../../lib/intake/script.ts'
import { commandRefForAttempt } from '../../../lib/port/command-ref.ts'

/**
 * Opening a home's file is a conversation, not a form. The script is
 * deterministic (lib/intake) — no model, no invented defaults — and everything
 * it records is marked as the homeowner's own recollection.
 *
 * The draft lives in memory only. A refresh starts the conversation over,
 * because pretending to have saved something is the one thing this app never
 * does. Submission goes through the same data port as everything else. In
 * remote mode it is two commands in sequence: the create command carries the
 * home SHELL (name + area), and only after a verified 201 returns one homeRef
 * does the intake command record the profile and systems answers — as the
 * homeowner's RECOLLECTION, kept distinct from verified property history. If
 * intake fails after create succeeded, the screen says exactly that, and the
 * only retry it offers is intake-only against that same homeRef.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'unavailable' }
  | { kind: 'signed_out' }
  | { kind: 'failed'; error: string }
  /** Remote: the shell was created; the intake command is in flight. */
  | { kind: 'recording'; homeRef: string }
  /**
   * Remote partial state: the shell exists under exactly this homeRef, the
   * recollection does not. The only retry offered from here is intake-only —
   * never a second create.
   */
  | { kind: 'shell_saved'; homeRef: string; problem: 'unavailable' | 'signed_out' | 'failed'; error?: string }
  /** Remote: shell and recollection both saved. */
  | { kind: 'saved'; homeRef: string }

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

export default function NewHomePage() {
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
  // One commandRef per command per submission attempt group: retries of the
  // SAME draft reuse each ref (idempotency-stable), an edited draft mints
  // fresh ones. The create and intake commands NEVER share a ref — they
  // dedupe independently on the server.
  const createAttemptRef = useRef<string | null>(null)
  const intakeAttemptRef = useRef<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [state.transcript.length])

  useEffect(() => {
    // Any change to the conversation ends both attempt groups.
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

  /**
   * Intake-only retry entry point: records the recollection against the exact
   * home the create command returned. It NEVER creates a home — a retry from
   * the shell_saved state can only ever land here.
   */
  async function recordIntakeFor(homeRef: string) {
    const draft = draftFrom(state)
    const commandRef = commandRefForAttempt(intakeAttemptRef.current)
    intakeAttemptRef.current = commandRef
    setSubmit({ kind: 'recording', homeRef })
    const recorded = await port.recordIntake({
      commandRef,
      homeRef,
      // Precision survives: an approximate year is sent as approximate.
      homeType: draft.profile.homeType,
      yearBuilt: draft.profile.yearBuilt,
      systems: draft.systems.map(system => ({
        kind: system.kind,
        present: system.present,
        installedOrReplacedYear: system.year,
      })),
    })
    if (!recorded.ok) {
      setSubmit({
        kind: 'shell_saved',
        homeRef,
        problem: recorded.error === 'unavailable' ? 'unavailable'
          : recorded.error === 'not_signed_in' ? 'signed_out'
            : 'failed',
        error: recorded.error,
      })
      return
    }
    setSubmit({ kind: 'saved', homeRef })
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
      // Rendered by the demo; in remote mode these ride the intake command,
      // never the create wire.
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
      // Shell first; only a verified 201's homeRef receives the recollection.
      await recordIntakeFor(result.value.homeRef)
      return
    }
    router.push(`/home/${result.value.homeRef}`)
  }

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card gate__card--wide">
          {session.kind === 'signed_out' ? <UnauthorizedState /> : (
            <>
              <Link href="/homes" className="backlink">← Back to your homes</Link>
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
                  {submit.kind === 'saved' ? (
                    <div className="state" role="status" style={{ marginTop: '1rem' }}>
                      <h3>Home file saved</h3>
                      <p>
                        The home shell and your answers — home type, year built, and
                        the six systems — were recorded as <strong>your
                        recollection</strong>. Recollection is not verified property
                        history: a contractor can confirm the big items later, and
                        the file keeps the two apart.
                      </p>
                      <Link className="btn btn--primary" href={`/home/${submit.homeRef}`}>
                        Open this home’s file
                      </Link>
                    </div>
                  ) : submit.kind === 'recording' ? (
                    <div className="state" role="status" style={{ marginTop: '1rem' }}>
                      <h3>Home file created — saving your answers…</h3>
                      <p>The shell is stored; your recollection is being recorded.</p>
                    </div>
                  ) : submit.kind === 'shell_saved' ? (
                    <div className="state" role="alert" style={{ marginTop: '1rem' }}>
                      <h3>The home file exists — your answers are not saved yet</h3>
                      <p>
                        The server stored the home shell (its name and area). The
                        profile and systems answers above were <strong>not</strong>{' '}
                        recorded{submit.problem === 'signed_out'
                          ? ' because the server says you are signed out. Sign in again, then retry.'
                          : submit.problem === 'unavailable'
                            ? ' because saving them is not available right now.'
                            : ` (${submit.error ?? 'error'}).`} They remain this
                        on-screen draft — retrying below saves the answers to the
                        same home file and never opens a second one.
                      </p>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                        <button type="button" className="btn btn--primary"
                          onClick={() => recordIntakeFor(submit.homeRef)}>
                          Retry saving the answers
                        </button>
                        <Link className="btn btn--quiet" href={`/home/${submit.homeRef}`}>
                          Open the file without them
                        </Link>
                      </div>
                    </div>
                  ) : submit.kind === 'signed_out' ? (
                    <div style={{ marginTop: '1rem' }} role="alert">
                      <p className="intake__error">
                        The server says you are signed out, so nothing was saved.
                        Your draft stays on this screen.
                      </p>
                      <UnauthorizedState />
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
                          disabled={submit.kind === 'sending'}
                        >
                          {submit.kind === 'sending' ? 'Opening the file…' : 'Open this home’s file'}
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
                          Saving opens the home’s file, then records these answers as
                          your recollection — kept clearly apart from verified property
                          history until a contractor confirms them.
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
