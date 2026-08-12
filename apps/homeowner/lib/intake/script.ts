/**
 * The guided-intake script: every question Homesrolo asks when a home file is
 * opened, in order, with its validation. SCRIPTED AND DETERMINISTIC — there is
 * no model, no inference, and no invented default anywhere in this flow. A
 * skipped question records `unknown`, never a guess, because the file's whole
 * value is that nothing in it is made up.
 *
 * The vocabulary matches the server command contract
 * (createHomeWorkspaceInputSchema: displayLabel, privateLocationLabel). The
 * systems inventory is a Phase-2 DRAFT — the server has no systems contract
 * yet, and the draft says so rather than pretending to save.
 */

export type SystemKind =
  | 'roof'
  | 'heating'
  | 'cooling'
  | 'water_heater'
  | 'gutters'
  | 'foundation'

export const SYSTEM_ORDER: readonly SystemKind[] = Object.freeze([
  'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation',
])

export const SYSTEM_LABEL: Record<SystemKind, string> = {
  roof: 'the roof',
  heating: 'heating (furnace or boiler)',
  cooling: 'cooling (AC or heat pump)',
  water_heater: 'the water heater',
  gutters: 'gutters',
  foundation: 'the foundation',
}

/** What a year answer preserves: the number and how sure the person was. */
export interface ApproximateYear {
  readonly value: number
  readonly precision: 'exact' | 'approximate'
}

export type HomeTypeAnswer = 'house' | 'townhouse' | 'condo' | 'other'

/** One system's draft entry. `present: 'unknown'` is an honest answer. */
export interface SystemDraftEntry {
  readonly kind: SystemKind
  readonly present: 'yes' | 'no' | 'unknown'
  /** Install or last-replacement year, when known. Null means not recorded. */
  readonly year: ApproximateYear | null
}

/**
 * The typed draft the intake produces. Everything in it is the homeowner's own
 * recollection, and the draft says so in its one source field. It carries NO
 * principal, ownership, role, or authority field — who may attach this draft
 * to an account is entirely the server's decision at submission time.
 */
export interface IntakeDraft {
  readonly draftVersion: 'homeowner-intake.v1-draft'
  /** Server command vocabulary (createHomeWorkspaceInputSchema). */
  readonly home: {
    readonly displayLabel: string
    readonly privateLocationLabel: string
  }
  /** Phase-2 facts draft: no server column exists for these yet. */
  readonly profile: {
    readonly homeType: HomeTypeAnswer | 'unknown'
    readonly yearBuilt: ApproximateYear | null
  }
  readonly systems: readonly SystemDraftEntry[]
  /** The only source this flow can produce. */
  readonly source: 'homeowner_recollection'
}

/** Bounds for any year answer. The current year is injected for determinism. */
export const EARLIEST_YEAR = 1800

export interface YearValidation {
  readonly ok: boolean
  readonly error?: string
}

export function validateYear(raw: number, currentYear: number): YearValidation {
  if (!Number.isInteger(raw)) return { ok: false, error: 'A year is a whole number.' }
  if (raw < EARLIEST_YEAR) return { ok: false, error: `That seems too early — years start at ${EARLIEST_YEAR}.` }
  if (raw > currentYear) return { ok: false, error: 'That year has not happened yet.' }
  return { ok: true }
}

export function validateLabel(raw: string, max: number): YearValidation {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, error: 'This one needs an answer — a short name is fine.' }
  if (trimmed.length > max) return { ok: false, error: `Keep it under ${max} characters.` }
  return { ok: true }
}
