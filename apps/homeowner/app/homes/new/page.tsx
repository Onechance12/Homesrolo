'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useRef, useState, type FormEvent } from 'react'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { HouseMark } from '../../../components/icons.tsx'
import { UnauthorizedState } from '../../../components/states.tsx'
import {
  answer, draftFrom, editFromReview, finishOptionalLater,
  initialIntake, isComplete, skip, type IntakeState,
} from '../../../lib/intake/machine.ts'
import {
  EARLIEST_YEAR, SYSTEM_LABEL, SYSTEM_ORDER, validateLabel, validateYear,
  type HomeTypeAnswer, type IntakeDraft, type SystemKind,
} from '../../../lib/intake/script.ts'
import { commandRefForAttempt } from '../../../lib/port/command-ref.ts'
import {
  homeownerEntryContext,
  homeownerEntryDestination,
  withHomeownerEntryContext,
} from '../../../lib/entry-context.ts'

/**
 * Opening a home's file is a short setup form. The underlying intake machine
 * remains deterministic (lib/intake) — no model, no invented defaults — and
 * everything it records is marked as the homeowner's own recollection.
 *
 * The draft lives in memory until the remote path completes two exact
 * commands: create the private home shell, then attach the private address and
 * homeowner-recalled profile/systems to the returned homeRef. Partial completion is shown
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

type SystemFormValue = {
  present: 'yes' | 'no' | 'unknown'
  year: string
  approximate: boolean
}

type SetupForm = {
  displayLabel: string
  addressLine1: string
  addressLine2: string
  city: string
  regionCode: string
  postalCode: string
  homeType: HomeTypeAnswer | 'unknown'
  yearBuilt: string
  yearBuiltApproximate: boolean
  systems: Record<SystemKind, SystemFormValue>
}

type SetupErrors = Record<string, string>

const HOME_TYPE_LABEL: Record<IntakeDraft['profile']['homeType'], string> = {
  house: 'House',
  townhouse: 'Townhouse',
  condo: 'Condo',
  other: 'Other',
  unknown: 'Not recorded',
}

function systemDisplayName(system: SystemKind): string {
  const label = SYSTEM_LABEL[system]
  const display = label.startsWith('the ') ? label.slice(4) : label
  return `${display.charAt(0).toUpperCase()}${display.slice(1)}`
}

function emptySetupForm(): SetupForm {
  return {
    displayLabel: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    regionCode: '',
    postalCode: '',
    homeType: 'unknown',
    yearBuilt: '',
    yearBuiltApproximate: false,
    systems: Object.fromEntries(SYSTEM_ORDER.map(kind => [kind, {
      present: 'unknown',
      year: '',
      approximate: false,
    }])) as Record<SystemKind, SystemFormValue>,
  }
}

function validateSetupForm(form: SetupForm, currentYear: number): SetupErrors {
  const errors: SetupErrors = {}
  const name = validateLabel(form.displayLabel, 80)
  if (!name.ok) errors.displayLabel = name.error ?? 'Add a short name for this home.'
  if (!form.addressLine1.trim()) errors.addressLine1 = 'Add the street address.'
  if (!form.city.trim()) errors.city = 'Add the city.'
  if (!/^[A-Za-z]{2}$/.test(form.regionCode.trim())) errors.regionCode = 'Use a two-letter state.'
  if (!/^\d{5}(?:-\d{4})?$/.test(form.postalCode.trim())) errors.postalCode = 'Use a five-digit ZIP code.'

  if (form.yearBuilt.trim()) {
    const result = validateYear(Number(form.yearBuilt), currentYear)
    if (!result.ok) errors.yearBuilt = result.error ?? 'Check the year built.'
  }
  for (const kind of SYSTEM_ORDER) {
    const system = form.systems[kind]
    if (system.present === 'yes' && system.year.trim()) {
      const result = validateYear(Number(system.year), currentYear)
      if (!result.ok) errors[`system-${kind}-year`] = result.error ?? 'Check this year.'
    }
  }
  return errors
}

function locationFromForm(form: SetupForm): string {
  return `${form.city.trim()}, ${form.regionCode.trim().toUpperCase()}`
}

function accepted(state: IntakeState): IntakeState {
  if (state.error) throw new Error(state.error)
  return state
}

/** Build the same canonical intake draft as the former question-by-question UI. */
function intakeStateFromForm(form: SetupForm, currentYear: number): IntakeState {
  let next = initialIntake(currentYear)
  next = accepted(answer(next, { kind: 'text', value: form.displayLabel }))
  next = accepted(answer(next, { kind: 'text', value: locationFromForm(form) }))
  next = accepted(finishOptionalLater(next))

  if (form.homeType !== 'unknown') {
    next = accepted(editFromReview(next, { kind: 'home_type' }))
    next = accepted(answer(next, { kind: 'choice', value: form.homeType }))
  }
  if (form.yearBuilt.trim()) {
    next = accepted(editFromReview(next, { kind: 'year_built' }))
    next = accepted(answer(next, {
      kind: 'year',
      value: Number(form.yearBuilt),
      approximate: form.yearBuiltApproximate,
    }))
  }
  for (const kind of SYSTEM_ORDER) {
    const system = form.systems[kind]
    if (system.present === 'unknown') continue
    next = accepted(editFromReview(next, { kind: 'system_present', system: kind }))
    next = accepted(answer(next, { kind: 'choice', value: system.present }))
    if (system.present === 'yes') {
      next = system.year.trim()
        ? accepted(answer(next, {
            kind: 'year',
            value: Number(system.year),
            approximate: system.approximate,
          }))
        : accepted(skip(next))
    }
  }
  if (!isComplete(next)) throw new Error('Review the home details and try again.')
  return next
}

function ReviewCard({
  draft,
  address,
}: {
  draft: IntakeDraft
  address: SetupForm
}) {
  const recordedSystems = draft.systems.filter(system => system.present !== 'unknown')
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
          </dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>
            <span>{address.addressLine1.trim()}</span>
            {address.addressLine2.trim() ? <small>{address.addressLine2.trim()}</small> : null}
            <small>{locationFromForm(address)} {address.postalCode.trim()}</small>
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            <span>{HOME_TYPE_LABEL[draft.profile.homeType]}</span>
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
          </dd>
        </div>
        {recordedSystems.length === 0 ? (
          <div>
            <dt>Systems</dt>
            <dd><span>Not recorded</span></dd>
          </div>
        ) : recordedSystems.map(system => (
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
            </dd>
          </div>
        ))}
      </dl>
      <p className="mono" style={{ marginTop: '0.8rem' }}>
        Source: what you told us. Review these details before saving the starting snapshot.
      </p>
    </div>
  )
}

export default function NewHomePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[]; handoff?: string | string[] }>
}) {
  const query = use(searchParams)
  const context = homeownerEntryContext({ intent: query.intent, handoff: query.handoff })
  const { intent, handoff } = context
  const port = usePort()
  const mode = usePortMode()
  const { state: session } = useSession()
  const router = useRouter()

  // The current year bounds year answers; injected so the machine stays pure.
  const [state, setState] = useState<IntakeState>(() => initialIntake(new Date().getFullYear()))
  const [form, setForm] = useState<SetupForm>(emptySetupForm)
  const [formErrors, setFormErrors] = useState<SetupErrors>({})
  const [showOptional, setShowOptional] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' })
  // One commandRef per submission attempt group: retries of the SAME draft
  // reuse it (idempotency-stable), an edited draft mints a fresh one.
  const createAttemptRef = useRef<string | null>(null)
  const intakeAttemptRef = useRef<string | null>(null)

  const complete = isComplete(state)
  const reviewEditable = submit.kind !== 'created'
    && submit.kind !== 'sending'
    && submit.kind !== 'saving_intake'
    && submit.kind !== 'partial'

  function resetSubmissionAttempt() {
    createAttemptRef.current = null
    intakeAttemptRef.current = null
  }

  function updateSystem(kind: SystemKind, patch: Partial<SystemFormValue>) {
    setForm(current => ({
      ...current,
      systems: {
        ...current.systems,
        [kind]: { ...current.systems[kind], ...patch },
      },
    }))
  }

  function clearFormError(key: string) {
    setFormErrors(current => {
      if (!current[key] && !current.form) return current
      const next = { ...current }
      delete next[key]
      delete next.form
      return next
    })
  }

  function reviewSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateSetupForm(form, state.currentYear)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      const first = [
        ['displayLabel', 'home-display-label'],
        ['addressLine1', 'home-address-line-1'],
        ['city', 'home-address-city'],
        ['regionCode', 'home-address-region'],
        ['postalCode', 'home-address-postal'],
        ['yearBuilt', 'home-year-built'],
      ].find(([key]) => key && errors[key])?.[1]
        ?? Object.keys(errors)[0]?.replace(/^system-/, 'home-system-')
      if (first) requestAnimationFrame(() => document.getElementById(first)?.focus())
      return
    }
    try {
      setState(intakeStateFromForm(form, state.currentYear))
      setReviewing(true)
      setSubmit({ kind: 'idle' })
      resetSubmissionAttempt()
      requestAnimationFrame(() => document.getElementById('setup-review-title')?.focus())
    } catch (error) {
      setFormErrors({ form: error instanceof Error ? error.message : 'Review the home details and try again.' })
    }
  }

  function editSetup() {
    if (!reviewEditable) return
    setReviewing(false)
    setSubmit({ kind: 'idle' })
    resetSubmissionAttempt()
    requestAnimationFrame(() => document.getElementById('home-display-label')?.focus())
  }

  async function saveHomeRecord(homeRef: string, draft: IntakeDraft) {
    const commandRef = commandRefForAttempt(intakeAttemptRef.current)
    intakeAttemptRef.current = commandRef
    setSubmit({ kind: 'saving_intake', homeRef })
    const result = await port.updateHomeRecord(homeRef, {
      commandRef,
      expectedRevision: 1,
      address: {
        line1: form.addressLine1.trim(),
        line2: form.addressLine2.trim() || null,
        city: form.city.trim(),
        regionCode: form.regionCode.trim().toUpperCase(),
        postalCode: form.postalCode.trim(),
        countryCode: 'US',
      },
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
    await saveHomeRecord(homeRef, draftFrom(state))
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
      locality: locationFromForm(form),
      // The remote create adapter omits these; saveHomeRecord sends their typed
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
      await saveHomeRecord(result.value.homeRef, draft)
      return
    }
    router.push(homeownerEntryDestination(result.value.homeRef, context))
  }

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>homesrolo</span></span>
      <main id="main" tabIndex={-1} className="gate__main gate__main--setup">
        <div className="gate__card gate__card--setup">
          {session.kind === 'signed_out' ? (
            <UnauthorizedState signInHref={withHomeownerEntryContext('/signin', context)} />
          ) : (
            <>
              <Link href={withHomeownerEntryContext('/homes', context)} className="backlink">
                ← Your homes
              </Link>
              <header className="setup-head">
                <p className="setup-head__eyebrow">Private home file</p>
                <h1>Set up your home</h1>
                <p>
                  {handoff
                    ? 'Start with the property address. Once the Home Record is open, you can check the completion record against the right home.'
                    : 'Start with the property address so every project, photo, and document stays connected to the right home.'}
                </p>
                <div className="setup-head__notes" aria-label="Setup details">
                  <span>About 1 minute</span>
                  <span>You control what is saved</span>
                </div>
              </header>

              <div className="setup-progress">
                <div className="setup-progress__label">
                  <span>Step {reviewing ? 2 : 1} of 2</span>
                  <span>{reviewing ? 'Review and open' : 'Home setup'}</span>
                </div>
                <progress
                  max="2"
                  value={reviewing ? 2 : 1}
                  aria-label={`Step ${reviewing ? 2 : 1} of 2`}
                />
              </div>

              {!reviewing ? (
                <form onSubmit={reviewSetup} noValidate>
                  <section className="setup-panel" aria-labelledby="setup-basics-title">
                    <div className="setup-panel__question">
                      <p className="setup-panel__status">Required</p>
                      <h2 id="setup-basics-title">Home basics</h2>
                      <p>The exact address stays private inside your signed-in Home Record.</p>
                    </div>
                    <div className="cardgrid cardgrid--2">
                      <div className="field">
                        <label htmlFor="home-display-label">Home name (required)</label>
                        <input
                          id="home-display-label"
                          type="text"
                          value={form.displayLabel}
                          onChange={event => {
                            setForm(current => ({ ...current, displayLabel: event.target.value }))
                            clearFormError('displayLabel')
                          }}
                          placeholder="Oak Street or Mom’s house"
                          maxLength={80}
                          autoComplete="off"
                          aria-invalid={Boolean(formErrors.displayLabel)}
                          aria-describedby={formErrors.displayLabel ? 'home-display-label-error' : undefined}
                          required
                        />
                        <span className="field__hint">Use whatever you actually call the place.</span>
                        {formErrors.displayLabel ? (
                          <span id="home-display-label-error" className="form-error" role="alert">
                            {formErrors.displayLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="field">
                        <label htmlFor="home-address-line-1">Street address (required)</label>
                        <input
                          id="home-address-line-1"
                          type="text"
                          value={form.addressLine1}
                          onChange={event => {
                            setForm(current => ({ ...current, addressLine1: event.target.value }))
                            clearFormError('addressLine1')
                          }}
                          placeholder="123 Main Street"
                          maxLength={120}
                          autoComplete="address-line1"
                          aria-invalid={Boolean(formErrors.addressLine1)}
                          aria-describedby={formErrors.addressLine1 ? 'home-address-line-1-error' : undefined}
                          required
                        />
                        {formErrors.addressLine1 ? (
                          <span id="home-address-line-1-error" className="form-error" role="alert">
                            {formErrors.addressLine1}
                          </span>
                        ) : null}
                      </div>
                      <div className="field">
                        <label htmlFor="home-address-line-2">Unit, suite, or building</label>
                        <input id="home-address-line-2" type="text" value={form.addressLine2}
                          onChange={event => setForm(current => ({ ...current, addressLine2: event.target.value }))}
                          placeholder="Optional" maxLength={120} autoComplete="address-line2" />
                      </div>
                      <div className="field">
                        <label htmlFor="home-address-city">City (required)</label>
                        <input id="home-address-city" type="text" value={form.city}
                          onChange={event => {
                            setForm(current => ({ ...current, city: event.target.value }))
                            clearFormError('city')
                          }}
                          maxLength={80} autoComplete="address-level2" required
                          aria-invalid={Boolean(formErrors.city)}
                          aria-describedby={formErrors.city ? 'home-address-city-error' : undefined} />
                        {formErrors.city ? <span id="home-address-city-error" className="form-error" role="alert">{formErrors.city}</span> : null}
                      </div>
                      <div className="field">
                        <label htmlFor="home-address-region">State (required)</label>
                        <input id="home-address-region" type="text" value={form.regionCode}
                          onChange={event => {
                            setForm(current => ({ ...current, regionCode: event.target.value.toUpperCase() }))
                            clearFormError('regionCode')
                          }}
                          placeholder="TX" maxLength={2} autoCapitalize="characters"
                          autoComplete="address-level1" required
                          aria-invalid={Boolean(formErrors.regionCode)}
                          aria-describedby={formErrors.regionCode ? 'home-address-region-error' : undefined} />
                        {formErrors.regionCode ? <span id="home-address-region-error" className="form-error" role="alert">{formErrors.regionCode}</span> : null}
                      </div>
                      <div className="field">
                        <label htmlFor="home-address-postal">ZIP code (required)</label>
                        <input id="home-address-postal" type="text" inputMode="numeric"
                          value={form.postalCode}
                          onChange={event => {
                            setForm(current => ({ ...current, postalCode: event.target.value }))
                            clearFormError('postalCode')
                          }}
                          placeholder="75001" maxLength={10} autoComplete="postal-code" required
                          aria-invalid={Boolean(formErrors.postalCode)}
                          aria-describedby={formErrors.postalCode ? 'home-address-postal-error' : undefined} />
                        {formErrors.postalCode ? <span id="home-address-postal-error" className="form-error" role="alert">{formErrors.postalCode}</span> : null}
                      </div>
                    </div>
                  </section>

                  {showOptional ? (
                  <section className="setup-panel" aria-labelledby="setup-optional-title">
                    <div className="setup-panel__question">
                      <p className="setup-panel__status">Optional</p>
                      <h2 id="setup-optional-title">Details you already know</h2>
                      <p>
                        Leave anything as not sure. Projects and home checkups still work without these answers.
                      </p>
                    </div>
                    <div className="setup-controls">
                      <div className="cardgrid cardgrid--2">
                        <div className="field">
                          <label htmlFor="home-type">Home type</label>
                          <select
                            id="home-type"
                            value={form.homeType}
                            onChange={event => setForm(current => ({
                              ...current,
                              homeType: event.target.value as SetupForm['homeType'],
                            }))}
                          >
                            <option value="unknown">Not sure</option>
                            <option value="house">House</option>
                            <option value="townhouse">Townhouse</option>
                            <option value="condo">Condo</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="home-year-built">Year built</label>
                          <input
                            id="home-year-built"
                            type="number"
                            inputMode="numeric"
                            min={EARLIEST_YEAR}
                            max={state.currentYear}
                            value={form.yearBuilt}
                            onChange={event => {
                              const yearBuilt = event.target.value
                              setForm(current => ({
                                ...current,
                                yearBuilt,
                                yearBuiltApproximate: yearBuilt ? current.yearBuiltApproximate : false,
                              }))
                              clearFormError('yearBuilt')
                            }}
                            placeholder="Leave blank if unknown"
                            aria-invalid={Boolean(formErrors.yearBuilt)}
                            aria-describedby={formErrors.yearBuilt ? 'home-year-built-error' : undefined}
                          />
                          {form.yearBuilt ? (
                            <label className="setup-check">
                              <input
                                type="checkbox"
                                checked={form.yearBuiltApproximate}
                                onChange={event => setForm(current => ({
                                  ...current,
                                  yearBuiltApproximate: event.target.checked,
                                }))}
                              />
                              This is an estimate
                            </label>
                          ) : null}
                          {formErrors.yearBuilt ? (
                            <span id="home-year-built-error" className="form-error" role="alert">
                              {formErrors.yearBuilt}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="setup-panel__question">
                        <h3>Major systems</h3>
                        <p>Only record what you know today. “Not sure” is a complete answer.</p>
                      </div>
                      <div className="cardgrid cardgrid--2">
                        {SYSTEM_ORDER.map(kind => {
                          const system = form.systems[kind]
                          const errorKey = `system-${kind}-year`
                          const yearId = `home-system-${kind}-year`
                          return (
                            <div className="panel" key={kind}>
                              <div className="panel__head">
                                <h4>{systemDisplayName(kind)}</h4>
                              </div>
                              <div className="field">
                                <label htmlFor={`home-system-${kind}-status`}>Status</label>
                                <select
                                  id={`home-system-${kind}-status`}
                                  value={system.present}
                                  onChange={event => {
                                    const present = event.target.value as SystemFormValue['present']
                                    updateSystem(kind, present === 'yes'
                                      ? { present }
                                      : { present, year: '', approximate: false })
                                    clearFormError(errorKey)
                                  }}
                                >
                                  <option value="unknown">Not sure</option>
                                  <option value="yes">Present</option>
                                  <option value="no">Not present</option>
                                </select>
                              </div>
                              {system.present === 'yes' ? (
                                <div className="field">
                                  <label htmlFor={yearId}>Installed or replaced year</label>
                                  <input
                                    id={yearId}
                                    type="number"
                                    inputMode="numeric"
                                    min={EARLIEST_YEAR}
                                    max={state.currentYear}
                                    value={system.year}
                                    onChange={event => {
                                      const year = event.target.value
                                      updateSystem(kind, {
                                        year,
                                        approximate: year ? system.approximate : false,
                                      })
                                      clearFormError(errorKey)
                                    }}
                                    placeholder="Optional"
                                    aria-invalid={Boolean(formErrors[errorKey])}
                                    aria-describedby={formErrors[errorKey] ? `${yearId}-error` : undefined}
                                  />
                                  {system.year ? (
                                    <label className="setup-check">
                                      <input
                                        type="checkbox"
                                        checked={system.approximate}
                                        onChange={event => updateSystem(kind, { approximate: event.target.checked })}
                                      />
                                      This is an estimate
                                    </label>
                                  ) : null}
                                  {formErrors[errorKey] ? (
                                    <span id={`${yearId}-error`} className="form-error" role="alert">
                                      {formErrors[errorKey]}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                  ) : (
                    <section className="setup-panel" aria-labelledby="setup-optional-summary-title">
                      <div className="setup-panel__question">
                        <p className="setup-panel__status">Optional</p>
                        <h2 id="setup-optional-summary-title">Know a few home details?</h2>
                        <p>
                          You can record the home type, build year, or major systems now.
                          Leave them out if you are not sure.
                        </p>
                      </div>
                      <div className="setup-controls">
                        <button
                          type="button"
                          className="btn btn--quiet"
                          onClick={() => setShowOptional(true)}
                        >
                          Add optional details
                        </button>
                      </div>
                    </section>
                  )}

                  {formErrors.form ? (
                    <p role="alert" className="intake__error">{formErrors.form}</p>
                  ) : null}
                  <div className="setup-submit">
                    <button type="submit" className="btn btn--primary">Review home file</button>
                    <Link href={withHomeownerEntryContext('/homes', context)} className="btn btn--quiet">Cancel</Link>
                  </div>
                </form>
              ) : complete ? (
                <>
                  <section className="setup-panel setup-panel--review" aria-labelledby="setup-review-title">
                    <div className="setup-panel__question">
                      <p className="setup-panel__status">Your starting snapshot</p>
                      <h2 id="setup-review-title" tabIndex={-1}>Review your home file</h2>
                      <p>Nothing below is treated as verified. Check it before opening the file.</p>
                    </div>
                    <ReviewCard draft={draftFrom(state)} address={form} />
                  </section>
                  {submit.kind === 'created' ? (
                    <div className="state setup-result" role="status">
                      <h3>Home file and starting history saved</h3>
                      <p>
                        The property address, profile, and system answers above are
                        stored as <strong>your recollection</strong>. They are not a
                        contractor verification or legal proof of ownership.
                      </p>
                      <Link
                        className="btn btn--primary"
                        href={homeownerEntryDestination(submit.homeRef, context)}
                      >
                        {handoff
                          ? 'Check the completion record'
                          : intent ? 'Continue to the roof project' : 'Open this home’s file'}
                      </Link>
                    </div>
                  ) : submit.kind === 'partial' ? (
                    <div className="state setup-result" role="alert">
                      <h3>The home is saved; its starting details still need saving</h3>
                      <p>
                        The server stored the home shell, but did not confirm the
                        private address, profile, and systems ({submit.error}). The draft is still here.
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
                        <Link className="btn btn--quiet" href={homeownerEntryDestination(submit.homeRef, context)}>
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
                      <UnauthorizedState signInHref={withHomeownerEntryContext('/signin', context)} />
                    </div>
                  ) : (
                    <>
                      {submit.kind === 'unavailable' && (
                        <div className="state setup-result" role="alert">
                          <h3>The home could not be saved</h3>
                          <p>
                            Nothing was saved. Your draft is still shown above, so you can
                            try again without re-entering it. It was not stored anywhere.
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
                        {reviewEditable ? (
                          <button type="button" className="btn btn--quiet" onClick={editSetup}>
                            ← Edit details
                          </button>
                        ) : null}
                      </div>
                      {mode === 'synthetic' ? (
                        <p className="mono" style={{ marginTop: '0.8rem' }}>
                          Demo: this file lives in memory and disappears on refresh.
                        </p>
                      ) : (
                        <p className="mono" style={{ marginTop: '0.8rem' }}>
                          Remote saving creates the private home first, then records
                          the private address and these recollections against that exact home.
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : null}
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
