/**
 * Home-file policy only. Phase 0 has no database, route, upload, identity,
 * property-resolution, or disclosure runtime.
 *
 * "Permanent home file" means a durable logical home identity and append-only
 * provenance for material events. It does not promise that every raw byte,
 * personal identifier, or revoked payload is retained forever.
 */
export const HOME_FILE_POLICY_VERSION = 'home-file.policy.v1' as const
export const HOME_FILE_PHASE0_RUNTIME_ENABLED = false as const

/**
 * Product visibility has exactly two candidate bases. Neither is sufficient
 * by itself at runtime: controller authority and share state must still be
 * derived and rechecked by the owning service.
 */
export const HOME_FILE_VISIBILITY_BASES = Object.freeze([
  'verified_controller',
  'explicit_active_share',
] as const)

export type HomeFileVisibilityBasis = (typeof HOME_FILE_VISIBILITY_BASES)[number]

/**
 * These facts never create visibility. Existence metadata is protected too:
 * revealing that a contractor uploaded a report can disclose just as much as
 * revealing its title.
 */
export const HOME_FILE_NON_AUTHORITY_FACTS = Object.freeze([
  'typed_address',
  'normalized_address',
  'nearby_geocode',
  'parcel_similarity',
  'current_occupancy',
  'claimed_ownership',
  'new_property_owner',
  'prior_property_owner',
  'uploader_identity_alone',
  'home_file_membership',
  'contribution_existence',
  'expired_share',
  'revoked_share',
] as const)

/**
 * A person clicking Upload is not necessarily the legal or business rights
 * holder. A contribution therefore records a verified controller separately
 * from the submitting actor. Only the controller (or an independently
 * authorized delegate) may initiate a disclosure.
 */
export const HOME_FILE_CONTRIBUTION_CONTROL = Object.freeze({
  submittingActorIsNotAutomaticallyController: true,
  controllerMustBeVerified: true,
  controllerAuthorityMustBeCurrentAtDisclosure: true,
  homeownerDoesNotAutomaticallyReceiveThirdPartyContent: true,
  contributionExistenceIsDefaultDeny: true,
} as const)

/**
 * Property identity is internal and opaque. Addresses and parcel identifiers
 * are versioned evidence/aliases with provenance, never the canonical home id.
 * Potential matches remain separate until a reviewed, reversible merge event.
 */
export const HOME_FILE_IDENTITY_POLICY = Object.freeze({
  canonicalIdIsOpaque: true,
  addressIsCanonicalId: false,
  parcelIsCanonicalId: false,
  fuzzyAutoMergeAllowed: false,
  humanReviewRequiredForMerge: true,
  mergeMustBeReversible: true,
  splitMustRestorePriorMembership: true,
} as const)

/**
 * A sale or occupancy change never transfers access to prior contributions.
 * A newly verified owner starts with their own contributions and may receive
 * exact, separately authorized shares. Former owners retain only content they
 * still control or were separately granted; they do not retain access merely
 * because they once occupied the home.
 */
export const HOME_FILE_TRANSFER_POLICY = Object.freeze({
  propertyTransferAutomaticallyTransfersContributionAccess: false,
  newOwnerInheritsPriorOwnerPersonalData: false,
  newOwnerInheritsContractorWorkProduct: false,
  priorOwnerRetainsPropertyWideAccess: false,
  freshIdentityAndAuthorityReviewRequired: true,
} as const)

/**
 * V1 is a homeowner maintenance/recordkeeping product, not a consumer-report
 * furnishing system. These uses remain prohibited until separately designed,
 * reviewed by qualified counsel, and implemented under a new policy/version.
 */
export const HOME_FILE_V1_PROHIBITED_DECISION_USES = Object.freeze([
  'insurance_underwriting',
  'insurance_pricing',
  'credit_or_lending',
  'property_purchase_eligibility',
  'tenant_screening',
  'employment_screening',
  'automated_adverse_action',
  'public_address_lookup',
] as const)

/**
 * Retention is classification-specific. Personal identity and payload bytes
 * follow reviewed deletion/retention/legal-hold rules. The durable layer keeps
 * only the minimum pseudonymous provenance needed to explain what happened and
 * must not be usable to reconstruct deleted content.
 */
export const HOME_FILE_RETENTION_POLICY = Object.freeze({
  durableLogicalHomeIdentity: true,
  retainEveryRawPayloadForever: false,
  personalDataIsDeletableWhenRequired: true,
  deletedPayloadMayBeReconstructedFromAudit: false,
  legalHoldRequiresExplicitRecordedBasis: true,
  retentionScheduleRequiredBeforeLaunch: true,
} as const)

export const HOME_FILE_VISIBILITY_RULE =
  'A contribution is visible only to its verified controller or through an exact active share. ' +
  'Home-file membership, property ownership, occupancy, an address match, and contribution existence ' +
  'do not create access. Phase 0 authorizes no access.'

export function homeFilePhase0AccessDecision() {
  return {
    authorized: false as const,
    reason: 'phase0_no_home_file_runtime' as const,
  }
}
