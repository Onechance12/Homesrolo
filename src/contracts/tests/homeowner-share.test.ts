import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALLOWED_ARTIFACT_KINDS,
  EXCLUDED_ARTIFACT_KINDS,
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  SHARE_LIMITS,
  evaluateShare,
  isAllowedArtifactKind,
  isRequestFresh,
  type HomeownerShareGrant,
  type SharedArtifactRef,
} from '../homeowner-share.v1.ts'

const NOW = new Date('2026-08-08T12:00:00.000Z')
const LATER = '2026-09-08T12:00:00.000Z'
const EARLIER = '2026-07-08T12:00:00.000Z'
const SHA = 'a'.repeat(64)

function artifact(overrides: Partial<SharedArtifactRef> = {}): SharedArtifactRef {
  return {
    artifactRef: 'art_9f2c4d7b1a3e',
    kind: 'inspection_photo',
    contentSha256: SHA,
    version: 1,
    expiresAt: LATER,
    capabilities: { read: true, download: false },
    ...overrides,
  }
}

function grant(overrides: Partial<HomeownerShareGrant> = {}): HomeownerShareGrant {
  return {
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    jobroloAuthorization: {
      status: 'active',
      shareId: 'shr_4b7e2a9c81df',
      issuerRef: 'iss_51ac9e3f7b20',
      issuedAt: EARLIER,
      expiresAt: LATER,
      revokedAt: null,
    },
    homeownerConsent: {
      status: 'accepted',
      homeownerRef: 'hmo_77d1c4be9a35',
      acceptedAt: EARLIER,
      withdrawnAt: null,
    },
    artifacts: [artifact()],
    ...overrides,
  }
}

// --- scope: work records only ------------------------------------------------

test('V1 shares work records only', () => {
  assert.deepEqual([...ALLOWED_ARTIFACT_KINDS], [
    'inspection_photo',
    'roof_measurement',
    'scope_of_work',
    'completion_record',
    'warranty_document',
    'job_timeline_event',
  ])
})

test('excluded kinds are never shareable', () => {
  for (const kind of EXCLUDED_ARTIFACT_KINDS) {
    assert.equal(isAllowedArtifactKind(kind), false, `${kind} must never be shareable in V1`)
  }
  for (const sensitive of ['insurance_policy', 'carrier_communication', 'claim_strategy_material', 'internal_note', 'margin_or_cost_detail', 'thresher_result', 'broad_project_access']) {
    assert.ok(
      (EXCLUDED_ARTIFACT_KINDS as readonly string[]).includes(sensitive),
      `${sensitive} must be named in the exclusion list, not merely omitted`,
    )
  }
})

test('an excluded artifact inside a valid grant is dropped, not disclosed', () => {
  const decision = evaluateShare(
    grant({ artifacts: [artifact({ kind: 'insurance_policy' as never })] }),
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

// --- dual authority ----------------------------------------------------------

test('a fully active share with a valid artifact is disclosable', () => {
  const decision = evaluateShare(grant(), NOW)
  assert.equal(decision.disclosable, true)
  if (decision.disclosable) assert.equal(decision.artifacts.length, 1)
})

test('Jobrolo revocation alone kills the share', () => {
  const revoked = grant()
  const decision = evaluateShare(
    { ...revoked, jobroloAuthorization: { ...revoked.jobroloAuthorization, status: 'revoked' } },
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

test('homeowner withdrawal alone kills the share', () => {
  const withdrawn = grant()
  const decision = evaluateShare(
    { ...withdrawn, homeownerConsent: { ...withdrawn.homeownerConsent, status: 'withdrawn', withdrawnAt: EARLIER } },
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

test('consent that was never accepted is not permission', () => {
  const pending = grant()
  const decision = evaluateShare(
    { ...pending, homeownerConsent: { ...pending.homeownerConsent, status: 'pending', acceptedAt: null } },
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

test('an expired authorization is refused even while consent stands', () => {
  const expired = grant()
  const decision = evaluateShare(
    { ...expired, jobroloAuthorization: { ...expired.jobroloAuthorization, expiresAt: EARLIER } },
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

// --- fail closed -------------------------------------------------------------

test('unsupported contract versions are refused', () => {
  const decision = evaluateShare({ ...grant(), contractVersion: 'homeowner-share.v2' as never }, NOW)
  assert.equal(decision.disclosable, false)
})

test('non-opaque identifiers are refused', () => {
  const leaky = grant()
  assert.equal(
    evaluateShare({ ...leaky, jobroloAuthorization: { ...leaky.jobroloAuthorization, shareId: '123 Main St' } }, NOW).disclosable,
    false,
  )
  assert.equal(
    evaluateShare({ ...leaky, homeownerConsent: { ...leaky.homeownerConsent, homeownerRef: '+15125550100' } }, NOW).disclosable,
    false,
  )
})

test('an expired artifact is not disclosed', () => {
  const decision = evaluateShare(grant({ artifacts: [artifact({ expiresAt: EARLIER })] }), NOW)
  assert.equal(decision.disclosable, false)
})

test('an artifact without read capability is not disclosed', () => {
  const decision = evaluateShare(
    grant({ artifacts: [artifact({ capabilities: { read: false, download: true } })] }),
    NOW,
  )
  assert.equal(decision.disclosable, false)
})

test('a missing or malformed digest is refused', () => {
  assert.equal(evaluateShare(grant({ artifacts: [artifact({ contentSha256: 'nope' })] }), NOW).disclosable, false)
})

test('an empty artifact set is a refusal, not an empty success', () => {
  const decision = evaluateShare(grant({ artifacts: [] }), NOW)
  assert.equal(decision.disclosable, false)
  if (!decision.disclosable) assert.ok(decision.reasons.some(reason => /disclosable/.test(reason)))
})

test('artifact caps are enforced', () => {
  const tooMany = Array.from({ length: SHARE_LIMITS.maxArtifactsPerShare + 1 }, () => artifact())
  assert.equal(evaluateShare(grant({ artifacts: tooMany }), NOW).disclosable, false)
})

// --- replay / freshness ------------------------------------------------------

test('stale and future-dated requests are refused', () => {
  const now = Math.floor(NOW.getTime() / 1000)
  const base = {
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    shareId: 'shr_4b7e2a9c81df',
    homeownerRef: 'hmo_77d1c4be9a35',
    nonce: 'n_0f3a91c7',
    bodySha256: SHA,
  }
  assert.equal(isRequestFresh({ ...base, timestamp: now }, now), true)
  assert.equal(isRequestFresh({ ...base, timestamp: now - SHARE_LIMITS.maxRequestAgeSeconds - 1 }, now), false)
  assert.equal(isRequestFresh({ ...base, timestamp: now + SHARE_LIMITS.maxRequestAgeSeconds + 1 }, now), false)
  assert.equal(isRequestFresh({ ...base, timestamp: Number.NaN }, now), false)
})

test('transport limits are declared', () => {
  assert.ok(SHARE_LIMITS.maxPayloadBytes > 0 && SHARE_LIMITS.maxPayloadBytes <= 1024 * 1024)
  assert.ok(SHARE_LIMITS.nonceRetentionSeconds >= SHARE_LIMITS.maxRequestAgeSeconds,
    'nonce retention must outlast the accepted request window or replays slip through')
  assert.ok(SHARE_LIMITS.maxShareLifetimeDays <= 365)
})

// --- no global property identity in V1 ---------------------------------------

test('the contract carries no address, parcel, or geo identity', () => {
  const serialized = JSON.stringify(grant())
  assert.doesNotMatch(serialized, /address|street|parcel|geohash|latitude|longitude|zip/i,
    'V1 scopes by Jobrolo-issued share id only; address matching is a separate RFC')
})
