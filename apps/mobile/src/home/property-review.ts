import type { HomeRecordAddress, HomePropertySnapshot, PropertyFacts } from '../api/model.ts'
import type { HomesroloApi } from '../api/contract.ts'
import { parsePropertyFacts } from '../api/property.ts'

export const PROPERTY_NUMBERS = [
  ['squareFeet', 'Home size (sq ft)'], ['yearBuilt', 'Year built'],
  ['lotSquareFeet', 'Lot size (sq ft)'], ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'], ['rooms', 'Total rooms'], ['garageSpaces', 'Garage spaces'],
] as const
export type PropertyDraft = Record<keyof PropertyFacts, string>
export interface ReviewedPropertyDetails { readonly facts: PropertyFacts; readonly receipt: string | null }
export type PropertyReviewSelection =
  | { readonly kind: 'none' | 'pending' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'reviewed'; readonly value: ReviewedPropertyDetails }

export function emptyPropertyFacts(): PropertyFacts {
  return { squareFeet: null, yearBuilt: null, lotSquareFeet: null, bedrooms: null, bathrooms: null,
    rooms: null, garageSpaces: null, centralHeat: null, centralAir: null, subdivision: null }
}
export function propertyDraft(facts: PropertyFacts = emptyPropertyFacts()): PropertyDraft {
  return Object.fromEntries(Object.entries(facts).map(([key, value]) => [key,
    value === null ? '' : typeof value === 'boolean' ? value ? 'yes' : 'no' : String(value),
  ])) as PropertyDraft
}
export function reviewPropertyDraft(draft: PropertyDraft, receipt: string | null): PropertyReviewSelection {
  const facts = emptyPropertyFacts()
  for (const [key, label] of PROPERTY_NUMBERS) {
    const value = draft[key].trim()
    if (value && !/^\d+(?:\.\d+)?$/.test(value)) return { kind: 'invalid', message: `${label}: enter a number or leave it unknown.` }
    facts[key] = value ? Number(value) : null
  }
  for (const key of ['centralHeat', 'centralAir'] as const) {
    if (!['', 'yes', 'no'].includes(draft[key])) return { kind: 'invalid', message: 'Choose Yes, No, or Unknown for heating and air.' }
    facts[key] = draft[key] === '' ? null : draft[key] === 'yes'
  }
  facts.subdivision = draft.subdivision.trim() || null
  try {
    const reviewed = parsePropertyFacts(facts)
    return receipt === null && Object.values(reviewed).every(value => value === null)
      ? { kind: 'none' } : { kind: 'reviewed', value: { facts: reviewed, receipt } }
  } catch {
    return { kind: 'invalid', message: 'Check these details. Use whole numbers for size, year, rooms, bedrooms, and garage spaces; bathrooms can use quarter steps (such as 2.5). Leave anything uncertain unknown.' }
  }
}

/** Ephemeral request identity. No address, receipt, or draft goes to browser storage. */
export class PropertyLookupDraftGate {
  readonly #scope: string
  #generation = 0
  constructor(principalRef: string, address: HomeRecordAddress) {
    this.#scope = JSON.stringify([principalRef, address.line1, address.line2, address.city, address.regionCode, address.postalCode, address.countryCode])
  }
  begin(): { readonly scope: string; readonly generation: number } {
    return { scope: this.#scope, generation: ++this.#generation }
  }
  current(ticket: { readonly scope: string; readonly generation: number }): boolean {
    return ticket.scope === this.#scope && ticket.generation === this.#generation
  }
  discard(): void { this.#generation += 1 }
}

/** Creates only a missing initial snapshot; the server rejects overwrites. */
export function initialPropertySnapshotAttempt(homeRef: string, address: HomeRecordAddress, review: ReviewedPropertyDetails) {
  const reviewed = { address: { ...address }, facts: { ...review.facts }, receipt: review.receipt }
  let commandRef: string | null = null
  let pending: Promise<HomePropertySnapshot> | null = null
  let completed: HomePropertySnapshot | null = null
  return {
    run(api: HomesroloApi): Promise<HomePropertySnapshot> {
      if (completed) return Promise.resolve(completed)
      if (pending) return pending
      pending = (async () => {
        if (!api.saveHomeProperty) throw new Error('property_save_unavailable')
        commandRef ??= await api.newCommandRef()
        const saved = await api.saveHomeProperty(homeRef, { commandRef, ...reviewed })
        completed = saved
        return saved
      })().finally(() => { pending = null })
      return pending
    },
  }
}
