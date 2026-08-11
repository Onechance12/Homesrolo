/**
 * The guided-intake state machine. Pure and deterministic: the same sequence
 * of answers always produces byte-identical state and a byte-identical
 * canonical draft. No clock is read (the current year is injected), nothing is
 * stored anywhere (a refresh honestly starts over — this is a conversation,
 * not a database), and no answer is ever invented on the user's behalf.
 *
 * The UI renders `currentStep`; every transition goes through `answer`,
 * `skip`, or `back`. All validation errors return the SAME state with an error
 * message, so a bad answer can never corrupt or advance the conversation.
 */

import {
  EARLIEST_YEAR, SYSTEM_LABEL, SYSTEM_ORDER,
  validateLabel, validateYear,
  type ApproximateYear, type HomeTypeAnswer, type IntakeDraft,
  type SystemDraftEntry, type SystemKind,
} from './script.ts'

export type StepId =
  | { readonly kind: 'display_label' }
  | { readonly kind: 'location_label' }
  | { readonly kind: 'home_type' }
  | { readonly kind: 'year_built' }
  | { readonly kind: 'system_present'; readonly system: SystemKind }
  | { readonly kind: 'system_year'; readonly system: SystemKind }
  | { readonly kind: 'review' }

/** A rendered line in the conversation transcript. */
export interface TranscriptLine {
  readonly speaker: 'homesrolo' | 'homeowner'
  readonly text: string
}

export interface IntakeState {
  readonly currentYear: number
  readonly step: StepId
  readonly transcript: readonly TranscriptLine[]
  readonly error: string | null
  readonly displayLabel: string | null
  readonly privateLocationLabel: string | null
  readonly homeType: HomeTypeAnswer | 'unknown' | null
  readonly yearBuilt: ApproximateYear | 'unknown' | null
  readonly systems: readonly SystemDraftEntry[]
}

export type IntakeInput =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'choice'; readonly value: string }
  | { readonly kind: 'year'; readonly value: number; readonly approximate: boolean }

// --- prompts -----------------------------------------------------------------

export function promptFor(step: StepId): string {
  switch (step.kind) {
    case 'display_label':
      return 'Let’s open this home’s file. What do you call the place? A nickname is perfect — “The Birch House”, “the cabin”, whatever you actually say.'
    case 'location_label':
      return 'Roughly where is it? A neighborhood or town is plenty — this stays private to your file.'
    case 'home_type':
      return 'What kind of home is it?'
    case 'year_built':
      return 'Do you know the year it was built? A rough guess is fine — just say so and it’s recorded as approximate.'
    case 'system_present':
      return `Now the big systems, so the file knows what to keep track of. Does the home have ${SYSTEM_LABEL[step.system]}?`
    case 'system_year':
      return `About when was ${SYSTEM_LABEL[step.system]} installed or last replaced? Approximate is fine — skip it if you have no idea.`
    case 'review':
      return 'Here’s the draft of the file so far. Everything is recorded as your recollection — it can be corrected any time, and later a contractor can confirm the big items.'
  }
}

/** Choice options per step, empty when the step takes free text or a year. */
export function choicesFor(step: StepId): readonly { value: string; label: string }[] {
  if (step.kind === 'home_type') {
    return [
      { value: 'house', label: 'House' },
      { value: 'townhouse', label: 'Townhouse' },
      { value: 'condo', label: 'Condo' },
      { value: 'other', label: 'Other' },
    ]
  }
  if (step.kind === 'system_present') {
    return [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'unknown', label: 'Not sure' },
    ]
  }
  return []
}

export function skippable(step: StepId): boolean {
  return step.kind === 'year_built' || step.kind === 'system_year'
}

// --- machine -----------------------------------------------------------------

export function initialIntake(currentYear: number): IntakeState {
  const step: StepId = { kind: 'display_label' }
  return {
    currentYear,
    step,
    transcript: [{ speaker: 'homesrolo', text: promptFor(step) }],
    error: null,
    displayLabel: null,
    privateLocationLabel: null,
    homeType: null,
    yearBuilt: null,
    systems: [],
  }
}

function nextSystemStep(state: IntakeState, after: SystemKind | null): StepId {
  const index = after === null ? 0 : SYSTEM_ORDER.indexOf(after) + 1
  const next = SYSTEM_ORDER[index]
  if (next === undefined) return { kind: 'review' }
  return { kind: 'system_present', system: next }
}

function advance(state: IntakeState, said: string, patch: Partial<IntakeState>, step: StepId): IntakeState {
  return {
    ...state,
    ...patch,
    step,
    error: null,
    transcript: [
      ...state.transcript,
      { speaker: 'homeowner', text: said },
      { speaker: 'homesrolo', text: promptFor(step) },
    ],
  }
}

function reject(state: IntakeState, error: string): IntakeState {
  return { ...state, error }
}

export function answer(state: IntakeState, input: IntakeInput): IntakeState {
  const step = state.step
  switch (step.kind) {
    case 'display_label': {
      if (input.kind !== 'text') return reject(state, 'Type a name for the home.')
      const check = validateLabel(input.value, 80)
      if (!check.ok) return reject(state, check.error ?? 'Try a shorter name.')
      const value = input.value.trim()
      return advance(state, value, { displayLabel: value }, { kind: 'location_label' })
    }
    case 'location_label': {
      if (input.kind !== 'text') return reject(state, 'Type a neighborhood or town.')
      const check = validateLabel(input.value, 200)
      if (!check.ok) return reject(state, check.error ?? 'Try a shorter answer.')
      const value = input.value.trim()
      return advance(state, value, { privateLocationLabel: value }, { kind: 'home_type' })
    }
    case 'home_type': {
      if (input.kind !== 'choice' || !['house', 'townhouse', 'condo', 'other'].includes(input.value)) {
        return reject(state, 'Pick one of the options.')
      }
      const value = input.value as HomeTypeAnswer
      return advance(state, choicesFor(step).find(c => c.value === value)?.label ?? value,
        { homeType: value }, { kind: 'year_built' })
    }
    case 'year_built': {
      if (input.kind !== 'year') return reject(state, 'Enter a year, or skip.')
      const check = validateYear(input.value, state.currentYear)
      if (!check.ok) return reject(state, check.error ?? 'That year does not look right.')
      const year: ApproximateYear = {
        value: input.value,
        precision: input.approximate ? 'approximate' : 'exact',
      }
      const said = input.approximate ? `Around ${input.value}` : String(input.value)
      return advance(state, said, { yearBuilt: year }, nextSystemStep(state, null))
    }
    case 'system_present': {
      if (input.kind !== 'choice' || !['yes', 'no', 'unknown'].includes(input.value)) {
        return reject(state, 'Pick one of the options.')
      }
      const present = input.value as 'yes' | 'no' | 'unknown'
      const said = choicesFor(step).find(c => c.value === present)?.label ?? present
      if (present !== 'yes') {
        const entry: SystemDraftEntry = { kind: step.system, present, year: null }
        return advance(state, said, { systems: [...state.systems, entry] },
          nextSystemStep(state, step.system))
      }
      return advance(state, said, {}, { kind: 'system_year', system: step.system })
    }
    case 'system_year': {
      if (input.kind !== 'year') return reject(state, 'Enter a year, or skip.')
      const check = validateYear(input.value, state.currentYear)
      if (!check.ok) return reject(state, check.error ?? 'That year does not look right.')
      const entry: SystemDraftEntry = {
        kind: step.system,
        present: 'yes',
        year: { value: input.value, precision: input.approximate ? 'approximate' : 'exact' },
      }
      const said = input.approximate ? `Around ${input.value}` : String(input.value)
      return advance(state, said, { systems: [...state.systems, entry] },
        nextSystemStep(state, step.system))
    }
    case 'review':
      return reject(state, 'The conversation is finished — review the draft below.')
  }
}

/** Skip records an honest `unknown`, never a guessed value. */
export function skip(state: IntakeState): IntakeState {
  const step = state.step
  if (step.kind === 'year_built') {
    return advance(state, 'Not sure', { yearBuilt: 'unknown' }, nextSystemStep(state, null))
  }
  if (step.kind === 'system_year') {
    // The system exists; its year is honestly unrecorded.
    const entry: SystemDraftEntry = { kind: step.system, present: 'yes', year: null }
    return advance(state, 'Not sure', { systems: [...state.systems, entry] },
      nextSystemStep(state, step.system))
  }
  return reject(state, 'This one needs an answer.')
}

/** One step back, restoring the previous question and dropping its answer. */
export function back(state: IntakeState): IntakeState {
  const step = state.step
  switch (step.kind) {
    case 'display_label':
      return state
    case 'location_label':
      return rewind(state, { kind: 'display_label' }, { displayLabel: null })
    case 'home_type':
      return rewind(state, { kind: 'location_label' }, { privateLocationLabel: null })
    case 'year_built':
      return rewind(state, { kind: 'home_type' }, { homeType: null })
    case 'system_present': {
      const index = SYSTEM_ORDER.indexOf(step.system)
      if (index === 0) {
        return rewind(state, { kind: 'year_built' }, { yearBuilt: null })
      }
      const previous = SYSTEM_ORDER[index - 1] as SystemKind
      return rewind(state, { kind: 'system_present', system: previous },
        { systems: state.systems.filter(s => s.kind !== previous) })
    }
    case 'system_year':
      return rewind(state, { kind: 'system_present', system: step.system }, {})
    case 'review': {
      const last = SYSTEM_ORDER[SYSTEM_ORDER.length - 1] as SystemKind
      return rewind(state, { kind: 'system_present', system: last },
        { systems: state.systems.filter(s => s.kind !== last) })
    }
  }
}

function rewind(state: IntakeState, step: StepId, patch: Partial<IntakeState>): IntakeState {
  return {
    ...state,
    ...patch,
    step,
    error: null,
    transcript: [...state.transcript, { speaker: 'homesrolo', text: promptFor(step) }],
  }
}

// --- the draft ---------------------------------------------------------------

export function isComplete(state: IntakeState): boolean {
  return state.step.kind === 'review'
    && state.displayLabel !== null
    && state.privateLocationLabel !== null
    && state.homeType !== null
    && state.yearBuilt !== null
    && state.systems.length === SYSTEM_ORDER.length
}

export function draftFrom(state: IntakeState): IntakeDraft {
  if (!isComplete(state)) {
    throw new Error('The intake conversation is not finished; no draft exists yet')
  }
  return {
    draftVersion: 'homeowner-intake.v1-draft',
    home: {
      displayLabel: state.displayLabel as string,
      privateLocationLabel: state.privateLocationLabel as string,
    },
    profile: {
      homeType: state.homeType as IntakeDraft['profile']['homeType'],
      yearBuilt: state.yearBuilt === 'unknown' ? null : (state.yearBuilt as ApproximateYear),
    },
    systems: [...state.systems].sort(
      (a, b) => SYSTEM_ORDER.indexOf(a.kind) - SYSTEM_ORDER.indexOf(b.kind),
    ),
    source: 'homeowner_recollection',
  }
}

/**
 * Canonical serialization: recursively key-sorted JSON, so the same draft is
 * always the same bytes — the property a future signed submission depends on.
 */
export function canonicalDraft(draft: IntakeDraft): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, child]) => [key, sortValue(child)]),
      )
    }
    return value
  }
  return JSON.stringify(sortValue(draft))
}

export { EARLIEST_YEAR }
