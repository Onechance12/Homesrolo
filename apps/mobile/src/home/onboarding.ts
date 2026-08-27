import type { HomeRecordAddress } from '../api/model.ts'
import { reviewedHomeRecordAddress } from '../api/home-record.ts'

export interface NewHomeAddressDraft {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly regionCode: string
  readonly postalCode: string
}

export interface ReviewedNewHomeAddress {
  readonly address: HomeRecordAddress
  /** A concise private label for home cards. The exact address remains in `address`. */
  readonly privateLocationLabel: string
}

export type NewHomeAddressReview =
  | { readonly ok: true; readonly value: ReviewedNewHomeAddress }
  | { readonly ok: false; readonly message: string }

export const EMPTY_NEW_HOME_ADDRESS: NewHomeAddressDraft = Object.freeze({
  line1: '', line2: '', city: '', regionCode: '', postalCode: '',
})

function locationLabel(address: HomeRecordAddress): string {
  const full = `${address.line1}${address.line2 ? `, ${address.line2}` : ''} · ${address.city}, ${address.regionCode} ${address.postalCode}`
  if (full.length <= 200) return full
  const compact = `${address.line1} · ${address.city}, ${address.regionCode}`
  return compact.length <= 200
    ? compact
    : `${address.city}, ${address.regionCode} ${address.postalCode}`
}

/**
 * Reviews explicit fields only. It never tries to split or infer an address from
 * a single line, so apartment names and multi-word cities remain homeowner-owned facts.
 */
export function reviewNewHomeAddress(draft: NewHomeAddressDraft): NewHomeAddressReview {
  if (!draft.line1.trim()) return { ok: false, message: 'Add the street address.' }
  if (!draft.city.trim()) return { ok: false, message: 'Add the city.' }
  if (!/^[A-Za-z]{2}$/.test(draft.regionCode.trim())) {
    return { ok: false, message: 'Use the two-letter state abbreviation.' }
  }
  if (!/^\d{5}(?:-\d{4})?$/.test(draft.postalCode.trim())) {
    return { ok: false, message: 'Use a five-digit ZIP code.' }
  }
  const address = reviewedHomeRecordAddress({
    line1: draft.line1,
    line2: draft.line2.trim() ? draft.line2 : null,
    city: draft.city,
    regionCode: draft.regionCode,
    postalCode: draft.postalCode,
    countryCode: 'US',
  })
  if (!address) return { ok: false, message: 'Check the address and try again.' }
  return { ok: true, value: { address, privateLocationLabel: locationLabel(address) } }
}

export function sameHomeRecordAddress(
  left: HomeRecordAddress | null,
  right: HomeRecordAddress,
): boolean {
  return left !== null
    && left.line1 === right.line1
    && left.line2 === right.line2
    && left.city === right.city
    && left.regionCode === right.regionCode
    && left.postalCode === right.postalCode
    && left.countryCode === right.countryCode
}
