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

/**
 * Opening a home's file is a conversation, not a form. The script is
 * deterministic (lib/intake) — no model, no invented defaults — and everything
 * it records is marked as the homeowner's own recollection.
 *
 * The draft lives in memory only. A refresh starts the conversation over,
 * because pretending to have saved something is the one thing this app never
 * does. Submission goes through the same data port as everything else: in the
 * demo it lands in the demo; against the real server it is honest about the
 * write route not existing yet.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; error: string }

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [state.transcript.length])

  const step = state.step
  const choices = choicesFor(step)
  const complete = isComplete(state)

  function give(input: Parameters<typeof answer>[1]) {
    setState(current => answer(current, input))
    setText('')
    setYearText('')
    setApproximate(false)
  }

  async function create() {
    if (!complete) return
    const draft = draftFrom(state)
    setSubmit({ kind: 'sending' })
    const result = await port.createHome({
      alias: draft.home.displayLabel,
      locality: draft.home.privateLocationLabel,
      homeType: draft.profile.homeType === 'unknown' ? 'other' : draft.profile.homeType,
      yearBuilt: draft.profile.yearBuilt?.value ?? null,
    })
    if (!result.ok) {
      setSubmit(result.error === 'unavailable'
        ? { kind: 'unavailable' }
        : { kind: 'failed', error: result.error })
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
                      The systems inventory stays in this draft until the server can store it.
                    </p>
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
