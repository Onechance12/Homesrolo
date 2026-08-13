import type { RoofingNeed } from './port/types.ts'

/**
 * The only public context Homesrolo carries into the private homeowner app.
 * These values choose an existing radio button; they carry no identity,
 * address, notes, authority, or instruction to create a project.
 */
export const ROOFING_INTENTS: readonly RoofingNeed[] = Object.freeze([
  'repair',
  'replacement',
  'inspection',
  'storm_damage',
  'not_sure',
])

export function roofingIntent(value: unknown): RoofingNeed | null {
  return typeof value === 'string' && (ROOFING_INTENTS as readonly string[]).includes(value)
    ? value as RoofingNeed
    : null
}

export function withRoofingIntent(pathname: string, intent: RoofingNeed | null): string {
  return intent ? `${pathname}?intent=${encodeURIComponent(intent)}` : pathname
}

export const ROOFING_INTENT_LABEL: Readonly<Record<RoofingNeed, string>> = Object.freeze({
  repair: 'Repair a leak or damage',
  replacement: 'Replace the roof',
  inspection: 'Get the roof checked',
  storm_damage: 'Review storm damage',
  not_sure: 'I am not sure yet',
})
