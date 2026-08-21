import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  answer, back, canonicalDraft, draftFrom, editFromReview, finishOptionalLater,
  initialIntake, isComplete, skip,
  type IntakeState,
} from '../intake/machine.ts'
import { SYSTEM_ORDER } from '../intake/script.ts'
import { commandRefForAttempt } from '../port/command-ref.ts'
import { createRemotePort } from '../port/remote.ts'
import type { TransportRequest } from '../port/transport.ts'

/**
 * The guided intake is deterministic script, not model: the same answers must
 * always produce the same state and byte-identical canonical output, a skipped
 * question must record `unknown` rather than a guess, and the draft must carry
 * no authority the browser could invent.
 */

const YEAR = 2026

/** Walk the whole script with a fixed set of answers. */
function completeRun(): IntakeState {
  let state = initialIntake(YEAR)
  state = answer(state, { kind: 'text', value: '  The Birch House  ' })
  state = answer(state, { kind: 'text', value: 'Sample Metro — North' })
  state = answer(state, { kind: 'choice', value: 'house' })
  state = answer(state, { kind: 'year', value: 1987, approximate: true })
  // roof: yes, ~2019 · heating: yes, skip year · cooling: not sure ·
  // water heater: yes, 2024 exact · gutters: no · foundation: not sure
  state = answer(state, { kind: 'choice', value: 'yes' })
  state = answer(state, { kind: 'year', value: 2019, approximate: true })
  state = answer(state, { kind: 'choice', value: 'yes' })
  state = skip(state)
  state = answer(state, { kind: 'choice', value: 'unknown' })
  state = answer(state, { kind: 'choice', value: 'yes' })
  state = answer(state, { kind: 'year', value: 2024, approximate: false })
  state = answer(state, { kind: 'choice', value: 'no' })
  state = answer(state, { kind: 'choice', value: 'unknown' })
  return state
}

test('the full script reaches review with a complete, trimmed, typed draft', () => {
  const state = completeRun()
  assert.equal(state.step.kind, 'review')
  assert.ok(isComplete(state))
  const draft = draftFrom(state)
  assert.equal(draft.home.displayLabel, 'The Birch House', 'labels are trimmed')
  assert.equal(draft.home.privateLocationLabel, 'Sample Metro — North')
  assert.deepEqual(draft.profile.yearBuilt, { value: 1987, precision: 'approximate' },
    'a guess is preserved as a guess, not upgraded to a fact')
  assert.equal(draft.systems.length, SYSTEM_ORDER.length, 'every system got an answer')
  assert.equal(draft.source, 'homeowner_recollection')
  assert.equal(draft.draftVersion, 'homeowner-intake.v1-draft')
})

test('skip records unknown, never an invented default', () => {
  const state = completeRun()
  const draft = draftFrom(state)
  const heating = draft.systems.find(s => s.kind === 'heating')
  assert.deepEqual(heating, { kind: 'heating', present: 'yes', year: null },
    'a skipped year is null, not a guessed year')
  const cooling = draft.systems.find(s => s.kind === 'cooling')
  assert.deepEqual(cooling, { kind: 'cooling', present: 'unknown', year: null },
    '"not sure" is an honest recorded answer')
  // Nothing anywhere in the draft is a value the person did not give.
  const text = canonicalDraft(draft)
  assert.ok(!text.includes('null,"value"'), 'no half-filled year objects')
})

test('optional setup can finish after the two required labels without inventing details', () => {
  let state = initialIntake(YEAR)
  state = answer(state, { kind: 'text', value: 'Oak Street' })

  const tooEarly = finishOptionalLater(state)
  assert.equal(tooEarly.step.kind, 'location_label')
  assert.match(tooEarly.error ?? '', /name and general location/i)

  state = answer(state, { kind: 'text', value: 'Frisco, Texas' })
  state = finishOptionalLater(state)
  assert.ok(isComplete(state), 'two required labels are enough to reach review')

  const draft = draftFrom(state)
  assert.equal(draft.profile.homeType, 'unknown')
  assert.equal(draft.profile.yearBuilt, null)
  assert.equal(draft.systems.length, SYSTEM_ORDER.length)
  assert.ok(draft.systems.every(system => system.present === 'unknown' && system.year === null),
    'optional answers become explicit unknowns, never defaults')
})

test('review edits preserve every other answer and return directly to review', () => {
  let state = completeRun()
  const before = draftFrom(state)

  state = editFromReview(state, { kind: 'display_label' })
  assert.equal(state.step.kind, 'display_label')
  assert.equal(state.editingFromReview, true)
  state = answer(state, { kind: 'text', value: 'The Oak House' })
  assert.ok(isComplete(state), 'an edited answer returns directly to review')
  const edited = draftFrom(state)
  assert.equal(edited.home.displayLabel, 'The Oak House')
  assert.equal(edited.home.privateLocationLabel, before.home.privateLocationLabel)
  assert.deepEqual(edited.profile, before.profile)
  assert.deepEqual(edited.systems, before.systems)

  state = editFromReview(state, { kind: 'home_type' })
  state = back(state)
  assert.ok(isComplete(state), 'back cancels an edit without replaying setup')
  assert.equal(draftFrom(state).profile.homeType, before.profile.homeType)
})

test('validation rejects without corrupting or advancing the conversation', () => {
  let state = initialIntake(YEAR)
  const before = state

  state = answer(state, { kind: 'text', value: '   ' })
  assert.equal(state.step.kind, 'display_label', 'an empty label does not advance')
  assert.ok(state.error, 'the error is spoken')
  assert.deepEqual(state.transcript, before.transcript, 'a rejected answer joins no transcript')

  state = answer(state, { kind: 'text', value: 'x'.repeat(81) })
  assert.equal(state.step.kind, 'display_label', 'an oversized label does not advance')

  // Years: future, ancient, and fractional all reject at the machine.
  const year = completePartial()
  for (const bad of [YEAR + 1, 1500, 1987.5]) {
    const next = answer(year, { kind: 'year', value: bad, approximate: false })
    assert.equal(next.step.kind, 'year_built', `${bad} must not advance`)
    assert.ok(next.error)
  }
  // The machine cannot be skipped where an answer is required.
  const stuck = skip(initialIntake(YEAR))
  assert.equal(stuck.step.kind, 'display_label')
  assert.ok(stuck.error)
})

function completePartial(): IntakeState {
  let state = initialIntake(YEAR)
  state = answer(state, { kind: 'text', value: 'A' })
  state = answer(state, { kind: 'text', value: 'B' })
  state = answer(state, { kind: 'choice', value: 'house' })
  return state
}

test('back rewinds one question and drops its answer', () => {
  let state = completePartial()
  assert.equal(state.step.kind, 'year_built')
  state = back(state)
  assert.equal(state.step.kind, 'home_type')
  assert.equal(state.homeType, null, 'the rewound answer is gone, not silently kept')
  state = answer(state, { kind: 'choice', value: 'condo' })
  assert.equal(state.homeType, 'condo')
  // Back from the very first question is a no-op, not a crash.
  const start = initialIntake(YEAR)
  assert.equal(back(start).step.kind, 'display_label')
})

test('the canonical payload is deterministic, byte for byte', () => {
  const a = canonicalDraft(draftFrom(completeRun()))
  const b = canonicalDraft(draftFrom(completeRun()))
  assert.equal(a, b, 'same answers, same bytes')
  const parsed = JSON.parse(a) as Record<string, unknown>
  assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort(),
    'top-level keys are sorted')
  assert.ok(a.includes('"precision":"approximate"'), 'uncertainty survives serialization')
})

test('the draft carries no principal, ownership, or authority field', () => {
  // Keys, not substrings: "homeowner_recollection" legitimately contains the
  // letters o-w-n-e-r. What must not exist is a FIELD that names authority.
  const draft = draftFrom(completeRun())
  const keys: string[] = []
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collect); return }
    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) { keys.push(key); collect(child) }
    }
  }
  collect(draft)
  for (const key of keys) {
    assert.doesNotMatch(key,
      /principal|owner|role|member|authoriz|grant|provider|storage|session|email|command|token/i,
      `draft field "${key}" names authority the browser must never supply`)
  }
  // And no value smuggles a ref-shaped identity in.
  const flat = canonicalDraft(draft)
  for (const refPrefix of ['hprn_', 'hmbr_', 'hcmd_', 'hobj_', 'hacct_']) {
    assert.ok(!flat.includes(refPrefix), `no ${refPrefix} ref may originate in the browser`)
  }
})

test('an unfinished conversation yields no draft at all', () => {
  assert.throws(() => draftFrom(completePartial()), /not finished/)
})

test('the intake persists nothing: a refresh honestly starts over', () => {
  for (const rel of ['../intake/machine.ts', '../intake/script.ts', '../../app/homes/new/page.tsx']) {
    const content = readFileSync(path.join(import.meta.dirname, rel), 'utf8')
    assert.doesNotMatch(content, /localStorage|sessionStorage|indexedDB|document\.cookie/,
      `${rel} must not stash the draft; pretending to have saved is the one forbidden move`)
  }
  const page = readFileSync(path.join(import.meta.dirname, '../../app/homes/new/page.tsx'), 'utf8')
  assert.match(page, /refresh starts over/i, 'the screen says so out loud')
})

test('the create command POSTs only the strict home shell; intake uses its own route', async () => {
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    return { kind: 'reply', status: 201, body: { data: {
      homeRef: 'hhom_' + 'b'.repeat(43),
      displayLabel: 'The Birch House',
      privateLocationLabel: 'Sample Metro — North',
      relationshipLabel: 'claimed_unverified',
    } } }
  })
  const draft = draftFrom(completeRun())
  const commandRef = commandRefForAttempt(null)
  const result = await port.createHome({
    commandRef,
    alias: draft.home.displayLabel,
    locality: draft.home.privateLocationLabel,
    homeType: 'house',
    yearBuilt: draft.profile.yearBuilt?.value ?? null,
  })
  assert.ok(result.ok, 'a 201 with the exact server summary is the one success')

  assert.equal(requests.length, 1, 'one attempt, exactly one POST')
  const request = requests[0]
  assert.ok(request)
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/api/v1/homes')
  assert.deepEqual(request.body, {
    commandRef,
    displayLabel: 'The Birch House',
    privateLocationLabel: 'Sample Metro — North',
  }, 'exactly homeownerApiCreateHomeInputSchema: the shell plus the idempotency ref')

  // Not one recollected fact beyond the shell may ride the create command.
  // Systems/profile use the separate exact-home intake route; the server
  // derives requestedAt and all authority itself.
  const wire = JSON.stringify(request.body)
  for (const leaked of ['roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
    'homeType', 'yearBuilt', 'systems', 'profile', 'precision', 'approximate', '1987', '2019',
    'requestedAt', 'principal', 'source']) {
    assert.ok(!wire.includes(leaked), `"${leaked}" must never ride the create command`)
  }

  // A retry of this same attempt group reuses the same commandRef, so the
  // server can treat "try again" as the same command rather than a second home.
  assert.equal(commandRefForAttempt(commandRef), commandRef)
})

test('the page distinguishes full success from an intake-only partial retry', () => {
  const page = readFileSync(path.join(import.meta.dirname, '../../app/homes/new/page.tsx'), 'utf8')
  assert.match(page, /stored as <strong>your recollection<\/strong>/,
    'full success is source-labeled, not described as verified')
  assert.match(page, /The home is saved; its starting details still need saving/,
    'partial completion is visible')
  assert.match(page, /Retrying below sends only those details to this same home/,
    'the partial path explains its exact retry scope')
  assert.match(page, /createAttemptRef = useRef<string \| null>\(null\)/)
  assert.match(page, /intakeAttemptRef = useRef<string \| null>\(null\)/,
    'the two commands keep separate retry-stable refs')
  const retryStart = page.indexOf('async function retryIntake')
  const createStart = page.indexOf('async function create()', retryStart)
  const retryBody = page.slice(retryStart, createStart)
  assert.match(retryBody, /saveIntake\(homeRef, draftFrom\(state\)\)/)
  assert.doesNotMatch(retryBody, /createHome/,
    'retrying intake must never create a second home shell')
})
