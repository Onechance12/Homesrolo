import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  answer, back, canonicalDraft, draftFrom, initialIntake, isComplete, skip,
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

test('submission is two exact commands: the shell, then the recollection on that home', async () => {
  const HOME = 'hhom_' + 'b'.repeat(43)
  const requests: TransportRequest[] = []
  const port = createRemotePort(async request => {
    requests.push(request)
    if (request.path === '/api/v1/homes') {
      return { kind: 'reply', status: 201, body: { data: {
        homeRef: HOME,
        displayLabel: 'The Birch House',
        privateLocationLabel: 'Sample Metro — North',
        relationshipLabel: 'claimed_unverified',
      } } }
    }
    return { kind: 'reply', status: 201, body: { data: {
      homeRef: HOME,
      homeType: 'house',
      yearBuilt: { value: 1987, precision: 'approximate' },
      source: 'homeowner_recollection',
      systems: [
        { kind: 'roof', present: 'yes', installedOrReplacedYear: { value: 2019, precision: 'approximate' } },
        { kind: 'heating', present: 'yes', installedOrReplacedYear: null },
        { kind: 'cooling', present: 'unknown', installedOrReplacedYear: null },
        { kind: 'water_heater', present: 'yes', installedOrReplacedYear: { value: 2024, precision: 'exact' } },
        { kind: 'gutters', present: 'no', installedOrReplacedYear: null },
        { kind: 'foundation', present: 'unknown', installedOrReplacedYear: null },
      ],
      updatedAt: '2026-08-11T16:00:00.000Z',
    } } }
  })
  const draft = draftFrom(completeRun())

  // Command one: the shell. Its own attempt-group ref.
  const createRef = commandRefForAttempt(null)
  const created = await port.createHome({
    commandRef: createRef,
    alias: draft.home.displayLabel,
    locality: draft.home.privateLocationLabel,
    homeType: 'house',
    yearBuilt: draft.profile.yearBuilt?.value ?? null,
  })
  assert.ok(created.ok, 'the create command succeeds on a verified 201')
  if (!created.ok) return

  // Command two: the recollection, against EXACTLY the returned homeRef,
  // under a SEPARATE retry-stable ref.
  const intakeRef = commandRefForAttempt(null)
  assert.notEqual(intakeRef, createRef, 'the intake never reuses the create commandRef')
  const recorded = await port.recordIntake({
    commandRef: intakeRef,
    homeRef: created.value.homeRef,
    homeType: draft.profile.homeType,
    yearBuilt: draft.profile.yearBuilt,
    systems: draft.systems.map(system => ({
      kind: system.kind,
      present: system.present,
      installedOrReplacedYear: system.year,
    })),
  })
  assert.ok(recorded.ok, 'the recollection lands on the exact created home')

  assert.equal(requests.length, 2, 'exactly two commands, in order')
  const [createRequest, intakeRequest] = requests
  assert.ok(createRequest && intakeRequest)
  assert.equal(createRequest.path, '/api/v1/homes')
  assert.deepEqual(createRequest.body, {
    commandRef: createRef,
    displayLabel: 'The Birch House',
    privateLocationLabel: 'Sample Metro — North',
  }, 'the create command carries the shell plus its idempotency ref, nothing else')
  assert.equal(intakeRequest.path, `/api/v1/homes/${HOME}/intake`)
  assert.deepEqual(intakeRequest.body, {
    commandRef: intakeRef,
    homeType: 'house',
    yearBuilt: { value: 1987, precision: 'approximate' },
    systems: [
      { kind: 'roof', present: 'yes', installedOrReplacedYear: { value: 2019, precision: 'approximate' } },
      { kind: 'heating', present: 'yes', installedOrReplacedYear: null },
      { kind: 'cooling', present: 'unknown', installedOrReplacedYear: null },
      { kind: 'water_heater', present: 'yes', installedOrReplacedYear: { value: 2024, precision: 'exact' } },
      { kind: 'gutters', present: 'no', installedOrReplacedYear: null },
      { kind: 'foundation', present: 'unknown', installedOrReplacedYear: null },
    ],
  }, 'every uncertainty in the draft survives the wire exactly as answered')

  // No systems fact rides the create command; no authority rides either.
  const createWire = JSON.stringify(createRequest.body)
  for (const leaked of ['roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
    'homeType', 'yearBuilt', 'systems', 'profile', 'precision', 'approximate', '1987', '2019',
    'requestedAt', 'principal', 'source']) {
    assert.ok(!createWire.includes(leaked), `"${leaked}" must never ride the create command`)
  }
  const intakeWire = JSON.stringify(intakeRequest.body)
  for (const leaked of ['principal', 'controller', 'member', 'role', 'source', 'requestedAt',
    'revision', 'provider', 'verif', 'grant', 'homeRef']) {
    assert.ok(!intakeWire.includes(leaked), `"${leaked}" must never ride the intake command`)
  }

  // Each ref is retry-stable within its own attempt group.
  assert.equal(commandRefForAttempt(createRef), createRef)
  assert.equal(commandRefForAttempt(intakeRef), intakeRef)
})

test('the screen keeps recollection honest: partial saves say so, retries are intake-only', () => {
  const page = readFileSync(path.join(import.meta.dirname, '../../app/homes/new/page.tsx'), 'utf8')
  assert.match(page, /your\s+recollection/i,
    'the success panel names the record as the homeowner’s recollection')
  assert.match(page, /not verified property\s+history/,
    'recollection is kept clearly distinct from verified property history')
  assert.match(page, /were <strong>not<\/strong>\s*\{' '\}\s*recorded|were <strong>not<\/strong> recorded/,
    'the partial panel says the answers were not recorded')
  assert.match(page, /never opens a second one/,
    'the partial panel promises the retry cannot create a second home')
  assert.match(page, /recordIntakeFor\(submit\.homeRef\)/,
    'the retry button retries intake only, against the preserved exact homeRef')
  assert.match(page, /createAttemptRef/, 'the create command holds its own attempt ref')
  assert.match(page, /intakeAttemptRef/, 'the intake command holds its own attempt ref')
  assert.doesNotMatch(page, /commandRefForAttempt\(createAttemptRef\.current\)[\s\S]*?recordIntake\(/,
    'guard: recordIntake must not be fed the create attempt ref')
})
