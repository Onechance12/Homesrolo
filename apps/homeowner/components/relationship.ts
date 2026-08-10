import type { RelationshipLabel } from '../lib/port/types.ts'

/**
 * homeowner-runtime.v1 relationship labels, rendered as plain provenance.
 * Deliberately unglamorous: "claimed" is not "verified", and the label a
 * membership actually carries is the label a person sees.
 */
export const RELATIONSHIP_COPY: Record<RelationshipLabel, string> = {
  claimed_unverified: 'Claimed — not verified',
  verified_controller: 'Verified controller',
  invited_participant: 'Invited participant',
}
