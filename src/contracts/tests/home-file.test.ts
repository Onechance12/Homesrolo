import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  HOME_FILE_CONTRIBUTION_CONTROL,
  HOME_FILE_IDENTITY_POLICY,
  HOME_FILE_NON_AUTHORITY_FACTS,
  HOME_FILE_PHASE0_RUNTIME_ENABLED,
  HOME_FILE_RETENTION_POLICY,
  HOME_FILE_TRANSFER_POLICY,
  HOME_FILE_V1_PROHIBITED_DECISION_USES,
  HOME_FILE_VISIBILITY_BASES,
  HOME_FILE_VISIBILITY_RULE,
  homeFilePhase0AccessDecision,
} from '../home-file.v1.ts'

assert.equal(HOME_FILE_PHASE0_RUNTIME_ENABLED, false)
assert.deepEqual(HOME_FILE_VISIBILITY_BASES, [
  'verified_controller',
  'explicit_active_share',
])
assert.deepEqual(homeFilePhase0AccessDecision(), {
  authorized: false,
  reason: 'phase0_no_home_file_runtime',
})

for (const fact of [
  'typed_address',
  'current_occupancy',
  'claimed_ownership',
  'new_property_owner',
  'uploader_identity_alone',
  'home_file_membership',
  'contribution_existence',
  'expired_share',
  'revoked_share',
]) {
  assert.equal(HOME_FILE_NON_AUTHORITY_FACTS.includes(
    fact as (typeof HOME_FILE_NON_AUTHORITY_FACTS)[number],
  ), true, `${fact} must never become access authority`)
}

assert.equal(HOME_FILE_CONTRIBUTION_CONTROL.submittingActorIsNotAutomaticallyController, true)
assert.equal(HOME_FILE_CONTRIBUTION_CONTROL.homeownerDoesNotAutomaticallyReceiveThirdPartyContent, true)
assert.equal(HOME_FILE_CONTRIBUTION_CONTROL.contributionExistenceIsDefaultDeny, true)

assert.equal(HOME_FILE_IDENTITY_POLICY.addressIsCanonicalId, false)
assert.equal(HOME_FILE_IDENTITY_POLICY.parcelIsCanonicalId, false)
assert.equal(HOME_FILE_IDENTITY_POLICY.fuzzyAutoMergeAllowed, false)
assert.equal(HOME_FILE_IDENTITY_POLICY.mergeMustBeReversible, true)
assert.equal(HOME_FILE_IDENTITY_POLICY.splitMustRestorePriorMembership, true)

assert.equal(HOME_FILE_TRANSFER_POLICY.propertyTransferAutomaticallyTransfersContributionAccess, false)
assert.equal(HOME_FILE_TRANSFER_POLICY.newOwnerInheritsPriorOwnerPersonalData, false)
assert.equal(HOME_FILE_TRANSFER_POLICY.newOwnerInheritsContractorWorkProduct, false)
assert.equal(HOME_FILE_TRANSFER_POLICY.priorOwnerRetainsPropertyWideAccess, false)

for (const use of [
  'insurance_underwriting',
  'insurance_pricing',
  'credit_or_lending',
  'property_purchase_eligibility',
  'tenant_screening',
  'automated_adverse_action',
]) {
  assert.equal(HOME_FILE_V1_PROHIBITED_DECISION_USES.includes(
    use as (typeof HOME_FILE_V1_PROHIBITED_DECISION_USES)[number],
  ), true, `${use} must stay outside V1`)
}

assert.equal(HOME_FILE_RETENTION_POLICY.durableLogicalHomeIdentity, true)
assert.equal(HOME_FILE_RETENTION_POLICY.retainEveryRawPayloadForever, false)
assert.equal(HOME_FILE_RETENTION_POLICY.deletedPayloadMayBeReconstructedFromAudit, false)
assert.match(HOME_FILE_VISIBILITY_RULE, /exact active share/)
assert.match(HOME_FILE_VISIBILITY_RULE, /Phase 0 authorizes no access/)

const rfc = readFileSync(path.resolve(process.cwd(), 'docs/HOME_FILE_RFC.md'), 'utf8')
for (const requiredStatement of [
  'durable logical record',
  'uploader is not automatically the controller',
  'existence metadata is protected',
  'does not inherit',
  'fuzzy auto-merge',
  'underwriting',
  'Phase 0',
]) {
  assert.match(rfc, new RegExp(requiredStatement, 'i'))
}

console.log('home-file Phase 0 policy contracts passed')
