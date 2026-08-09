/**
 * Neutral ordering.
 *
 * Placement in this directory is not for sale, and the way to make that true
 * rather than merely promised is to give the sort function nothing it could
 * sell. It reads exactly two fields — `displayName` and `slug` — and both are
 * stable identity. There is no rating input, no recency input, no engagement
 * input, and no verification input.
 *
 * Verification is excluded on purpose. If confirming a license moved a company
 * up the page, then verification would become a paid ranking product the moment
 * checking a license costs money. Facts inform the reader; they do not order
 * the list.
 */

import { type PublicProfile } from './public-profile.v1.ts'

/** Fields the ordering is permitted to read. Asserted by tests. */
export const NEUTRAL_ORDERING_INPUTS = Object.freeze(['displayName', 'slug'] as const)

export const NEUTRAL_ORDERING_STATEMENT =
  'Listings are ordered by name. Order is not influenced by payment, sponsorship, advertising, ' +
  'verification status, review counts, or any relationship with Homesrolo.'

/**
 * Codepoint comparison rather than `localeCompare`, so the order is identical
 * on every machine and in every locale. A directory whose order depends on the
 * server's ICU build is not deterministic in any useful sense.
 */
function compareCodepoints(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function neutralOrder<T extends Pick<PublicProfile, 'displayName' | 'slug'>>(
  profiles: readonly T[],
): T[] {
  return [...profiles].sort((left, right) => {
    const byName = compareCodepoints(left.displayName.toLowerCase(), right.displayName.toLowerCase())
    if (byName !== 0) return byName
    // Slug breaks exact-name ties, so the result is a total order and never
    // depends on the order the caller happened to pass in.
    return compareCodepoints(left.slug, right.slug)
  })
}
