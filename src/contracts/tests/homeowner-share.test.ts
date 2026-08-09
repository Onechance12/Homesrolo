import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson, sha256Hex, utf8ByteLength } from '../canonical.ts'
import * as contract from '../homeowner-share.v1.ts'
import {
  HOMEOWNER_VISIBILITY_RULE,
  ALLOWED_MEDIA_TYPES,
  EMPTY_LEDGER,
  EXCLUDED_SOURCE_KINDS,
  EXTERNAL_REFUSAL_MESSAGE,
  HOMEOWNER_SHARE_AUDIENCE,
  HOMEOWNER_SHARE_CONTRACT_VERSION,
  HOMEOWNER_SHARE_ISSUER,
  HOMEOWNER_SHARE_PURPOSE,
  KNOWN_PROJECTION_KINDS,
  LAUNCH_APPROVED_PROJECTION_KINDS,
  POISON_FIELD_NAMES,
  PROJECTION_SOURCE,
  RECEIPT_WIRE_RECONCILIATION,
  SHARE_LIMITS,
  SUPERSEDED_REPLAY_KEYS,
  STRUCTURAL_VALIDATION_WARNING,
  WIRE_GOLDEN,
  appendReceipt,
  bindAuthorities,
  canonicalManifest,
  evaluateDelivery,
  externalRefusal,
  isOpaqueId,
  ledgerState,
  manifestDigest,
  parseShareManifest,
  parseSignedReceipt,
  receiptReplayKey,
  receiptSigningInput,
  type Ledger,
  type ManifestArtifact,
  type ReceiptCore,
  type ShareManifest,
  type SignedReceipt,
} from '../homeowner-share.v1.ts'

// --- fixtures ----------------------------------------------------------------

const NOW = new Date('2026-08-10T12:00:00.000Z')
const ISSUED = '2026-08-08T12:00:00.000Z'
const EXPIRES = '2026-08-15T12:00:00.000Z'

const body = (fill: string) => fill.repeat(43).slice(0, 43)
const PROJ = `hproj_${body('a')}`
const SHARE = `hshr_${body('s')}`
const RECIPIENT = `hrcp_${body('r')}`
const NONCE = `hnce_${body('n')}`
const AUTH_ID = `hrec_${body('u')}`
const CONSENT_ID = `hrec_${body('c')}`
const REVOKE_ID = `hrec_${body('v')}`
const SIGNATURE = Buffer.alloc(64, 7).toString('base64url')

function artifact(overrides: Partial<ManifestArtifact> = {}): ManifestArtifact {
  return {
    artifactRef: PROJ,
    byteLength: 1024,
    mediaType: 'application/json',
    projectionKind: 'work_status_summary',
    projectionVersion: 1,
    sha256: 'a'.repeat(64),
    source: PROJECTION_SOURCE,
    ...overrides,
  }
}

function manifest(overrides: Partial<ShareManifest> = {}): ShareManifest {
  return {
    artifacts: [artifact()],
    audience: HOMEOWNER_SHARE_AUDIENCE,
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    expiresAt: EXPIRES,
    generation: 1,
    issuedAt: ISSUED,
    issuer: HOMEOWNER_SHARE_ISSUER,
    nonce: NONCE,
    purpose: HOMEOWNER_SHARE_PURPOSE,
    recipientRef: RECIPIENT,
    shareId: SHARE,
    ...overrides,
  }
}

const DIGEST = manifestDigest(manifest())

function receipt(overrides: Partial<ReceiptCore> = {}): ReceiptCore {
  return {
    algorithm: 'ed25519',
    audience: HOMEOWNER_SHARE_AUDIENCE,
    contractVersion: HOMEOWNER_SHARE_CONTRACT_VERSION,
    expiresAt: EXPIRES,
    generation: 1,
    issuedAt: ISSUED,
    issuer: HOMEOWNER_SHARE_ISSUER,
    keyId: 'jobrolo-share-2026a',
    manifestDigest: DIGEST,
    policyVersion: 'homeowner-disclosure.v1',
    purpose: HOMEOWNER_SHARE_PURPOSE,
    receiptId: AUTH_ID,
    receiptType: 'authorization',
    recipientRef: RECIPIENT,
    shareId: SHARE,
    ...overrides,
  }
}

const authorization = receipt()
const consent = receipt({ receiptId: CONSENT_ID, receiptType: 'consent', keyId: 'homesrolo-consent-2026a' })

const signed = (core: ReceiptCore): SignedReceipt => ({ receipt: core, signature: SIGNATURE })

function liveLedger(): Ledger {
  const first = appendReceipt(EMPTY_LEDGER, signed(authorization))
  assert.equal(first.outcome, 'appended')
  const second = appendReceipt(first.ledger, signed(consent))
  assert.equal(second.outcome, 'appended')
  return second.ledger
}

function expectRejected(input: unknown, because: string): readonly string[] {
  const result = parseShareManifest(input)
  assert.equal(result.ok, false, `expected rejection: ${because}`)
  return result.ok ? [] : result.errors
}

// =============================================================================
// Cross-repo golden vectors
// =============================================================================

test('the Jobrolo golden manifest parses strictly here', () => {
  const parsed = parseShareManifest(JSON.parse(WIRE_GOLDEN.manifestJson))
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.errors.join('; '))
})

test('canonical encoding reproduces the Jobrolo golden manifest byte for byte', () => {
  const parsed = parseShareManifest(JSON.parse(WIRE_GOLDEN.manifestJson))
  assert.ok(parsed.ok)
  assert.equal(canonicalManifest(parsed.value), WIRE_GOLDEN.manifestJson)
  assert.equal(utf8ByteLength(WIRE_GOLDEN.manifestJson), 692)
})

test('the manifest digest reproduces the Jobrolo golden digest', () => {
  const parsed = parseShareManifest(JSON.parse(WIRE_GOLDEN.manifestJson))
  assert.ok(parsed.ok)
  assert.equal(manifestDigest(parsed.value), WIRE_GOLDEN.manifestDigest)
  assert.equal(sha256Hex(WIRE_GOLDEN.manifestJson), WIRE_GOLDEN.manifestDigest)
})

test('canonicalization is insertion-order independent', () => {
  const original = JSON.parse(WIRE_GOLDEN.manifestJson) as Record<string, unknown>
  const reversed: Record<string, unknown> = {}
  for (const key of Object.keys(original).reverse()) reversed[key] = original[key]
  assert.equal(canonicalJson(reversed), WIRE_GOLDEN.manifestJson)
})

test('the golden receipts parse under this contract', () => {
  for (const core of [WIRE_GOLDEN.authorization, WIRE_GOLDEN.consent, WIRE_GOLDEN.revocation]) {
    const parsed = parseSignedReceipt({ receipt: core, signature: SIGNATURE })
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.errors.join('; '))
  }
})

test('the golden receipts bind to the golden manifest', () => {
  const parsed = parseShareManifest(JSON.parse(WIRE_GOLDEN.manifestJson))
  assert.ok(parsed.ok)
  const result = bindAuthorities(parsed.value, WIRE_GOLDEN.authorization, WIRE_GOLDEN.consent)
  assert.equal(result.bound, true, result.bound ? '' : result.errors.join('; '))
})

test('the golden replay keys are reproduced exactly', () => {
  // These are the values the other side must reproduce. They are produced by
  // the functions in this file, so the published spec and the implementation
  // cannot drift apart.
  assert.equal(receiptReplayKey(WIRE_GOLDEN.authorization), WIRE_GOLDEN.authorizationReplayKey)
  assert.equal(receiptReplayKey(WIRE_GOLDEN.consent), WIRE_GOLDEN.consentReplayKey)
  assert.equal(receiptReplayKey(WIRE_GOLDEN.revocation), WIRE_GOLDEN.revocationReplayKey)
})

test('the golden signing inputs are reproduced exactly', () => {
  assert.equal(sha256Hex(receiptSigningInput(WIRE_GOLDEN.authorization)), WIRE_GOLDEN.authorizationSigningInputDigest)
  assert.equal(sha256Hex(receiptSigningInput(WIRE_GOLDEN.consent)), WIRE_GOLDEN.consentSigningInputDigest)
  assert.equal(sha256Hex(receiptSigningInput(WIRE_GOLDEN.revocation)), WIRE_GOLDEN.revocationSigningInputDigest)
})

test('the signing input covers algorithm, key, and every receipt field', () => {
  const base = WIRE_GOLDEN.authorization
  const input = receiptSigningInput(base)
  assert.ok(input.includes(base.algorithm), 'algorithm must be inside the signed region')
  assert.ok(input.includes(base.keyId), 'keyId must be inside the signed region')
  // Changing any receipt field changes the signed bytes.
  for (const [field, value] of [
    ['keyId', 'other-key-2026a'],
    ['policyVersion', 'homeowner-disclosure.v2'],
    ['issuedAt', '2026-08-08T12:00:01.000Z'],
    ['manifestDigest', 'b'.repeat(64)],
  ] as const) {
    assert.notEqual(receiptSigningInput({ ...base, [field]: value } as ReceiptCore), input, `${field} must be signed`)
  }
})

test('this repository defines the receipt layer, and says so', () => {
  assert.equal(RECEIPT_WIRE_RECONCILIATION.manifest, 'reconciled_from_jobrolo')
  assert.equal(RECEIPT_WIRE_RECONCILIATION.receipts, 'defined_by_homesrolo')
})

test('the superseded replay keys are never produced', () => {
  // Tripwire. No derivation over the published fields reproduces these, and no
  // code in either repository emits them. If one ever appears, the two sides
  // have diverged and this fails.
  const produced = new Set([
    receiptReplayKey(WIRE_GOLDEN.authorization),
    receiptReplayKey(WIRE_GOLDEN.consent),
    receiptReplayKey(WIRE_GOLDEN.revocation),
    receiptReplayKey(authorization),
    receiptReplayKey(consent),
  ])
  for (const stale of SUPERSEDED_REPLAY_KEYS) {
    assert.equal(produced.has(stale), false, `superseded key ${stale.slice(0, 12)}… must never be produced`)
  }
  assert.equal(SUPERSEDED_REPLAY_KEYS.length, 3)
})

test('the local replay key is stable and identity-sensitive', () => {
  assert.equal(receiptReplayKey(authorization), receiptReplayKey({ ...authorization }))
  // keyId is not part of identity: re-signing the same act with a rotated key
  // is the same act.
  assert.equal(receiptReplayKey(authorization), receiptReplayKey({ ...authorization, keyId: 'rotated-key-2027a' }))
  // Everything in the identity changes it.
  assert.notEqual(receiptReplayKey(authorization), receiptReplayKey({ ...authorization, generation: 2 }))
  assert.notEqual(receiptReplayKey(authorization), receiptReplayKey(consent))
})

// =============================================================================
// Strict parsing: poison fields and all-or-nothing
// =============================================================================

test('every named prohibited field rejects the manifest that carries it', () => {
  for (const field of POISON_FIELD_NAMES) {
    const errors = expectRejected({ ...manifest(), [field]: 'anything' }, field)
    assert.ok(
      errors.some(error => error.includes(`prohibited field "${field}"`)),
      `manifest-level "${field}" must be refused by name, got: ${errors.join('; ')}`,
    )
  }
})

test('every named prohibited field rejects the artifact that carries it', () => {
  for (const field of POISON_FIELD_NAMES) {
    const errors = expectRejected(
      manifest({ artifacts: [{ ...artifact(), [field]: 'anything' } as ManifestArtifact] }),
      field,
    )
    assert.ok(
      errors.some(error => error.includes(`prohibited field "${field}"`)),
      `artifact-level "${field}" must be refused by name, got: ${errors.join('; ')}`,
    )
  }
})

test('the specific leaks Jobrolo called out are all refused', () => {
  const leaks: Record<string, unknown> = {
    customer: 'Jane Homeowner',
    address: '123 Main St',
    contact: '+15125550100',
    claimNumber: 'CLM-88213',
    url: 'https://storage.example.com/o/abc',
    filename: 'roof-front.jpg',
    title: 'Front elevation',
    notes: 'homeowner is difficult',
    metadata: { anything: true },
    projectId: 'proj_4821',
  }
  for (const [field, value] of Object.entries(leaks)) {
    expectRejected({ ...manifest(), [field]: value }, field)
    expectRejected(manifest({ artifacts: [{ ...artifact(), [field]: value } as ManifestArtifact] }), field)
  }
})

test('any unknown field rejects the whole manifest', () => {
  expectRejected({ ...manifest(), somethingNew: 1 }, 'unknown manifest field')
  expectRejected(manifest({ artifacts: [{ ...artifact(), somethingNew: 1 } as ManifestArtifact] }), 'unknown artifact field')
})

test('a missing field rejects the manifest', () => {
  const incomplete = manifest() as Record<string, unknown>
  for (const key of Object.keys(incomplete)) {
    const copy = { ...incomplete }
    delete copy[key]
    expectRejected(copy, `missing ${key}`)
  }
})

test('one bad artifact rejects the entire manifest, siblings included', () => {
  const good = artifact()
  const bad = artifact({ artifactRef: `hproj_${body('b')}`, source: 'raw_document' as never })
  const result = parseShareManifest(manifest({ artifacts: [good, bad] }))

  assert.equal(result.ok, false)
  // There is no partial-success shape to destructure: on failure the parser
  // returns errors and no value, so a caller cannot receive the good sibling.
  assert.equal('value' in result, false, 'a rejected manifest must not carry any artifacts through')
})

test('a rejected manifest never returns a filtered artifact list', () => {
  const many = [artifact(), artifact({ artifactRef: `hproj_${body('b')}`, projectionKind: 'unknown_kind' as never })]
  const result = parseShareManifest(manifest({ artifacts: many }))
  assert.equal(result.ok, false)
})

// =============================================================================
// Projections only
// =============================================================================

test('only homeowner_release projections may be shared', () => {
  assert.equal(PROJECTION_SOURCE, 'homeowner_release')
  expectRejected(manifest({ artifacts: [artifact({ source: 'raw_document' as never })] }), 'raw document')
  expectRejected(manifest({ artifacts: [artifact({ source: 'database_row' as never })] }), 'database row')
})

test('excluded source kinds are named and are never projection kinds', () => {
  for (const excluded of EXCLUDED_SOURCE_KINDS) {
    assert.equal(
      (KNOWN_PROJECTION_KINDS as readonly string[]).includes(excluded),
      false,
      `${excluded} must never be expressible as a projection kind`,
    )
    expectRejected(manifest({ artifacts: [artifact({ projectionKind: excluded as never })] }), excluded)
  }
  for (const named of ['insurance_policy', 'carrier_communication', 'claim_strategy_material', 'internal_note', 'margin_or_cost_detail', 'contractor_memory', 'thresher_result', 'agent_analysis', 'broad_project_access']) {
    assert.ok(
      (EXCLUDED_SOURCE_KINDS as readonly string[]).includes(named),
      `${named} must be named in the exclusion list, not merely omitted`,
    )
  }
})

test('unknown projection kinds and media types are refused', () => {
  expectRejected(manifest({ artifacts: [artifact({ projectionKind: 'anything' as never })] }), 'projection kind')
  expectRejected(manifest({ artifacts: [artifact({ mediaType: 'text/html' as never })] }), 'media type')
  for (const mediaType of ALLOWED_MEDIA_TYPES) {
    const parsed = parseShareManifest(manifest({ artifacts: [artifact({ mediaType })] }))
    assert.equal(parsed.ok, true, `${mediaType} should be accepted`)
  }
})

// =============================================================================
// Caps
// =============================================================================

test('the caps are exactly the values Jobrolo specified', () => {
  assert.equal(SHARE_LIMITS.maxArtifacts, 25)
  assert.equal(SHARE_LIMITS.maxArtifactBytes, 25 * 1024 * 1024)
  assert.equal(SHARE_LIMITS.maxAggregateBytes, 100 * 1024 * 1024)
  assert.equal(SHARE_LIMITS.maxCanonicalManifestBytes, 64 * 1024)
  assert.equal(SHARE_LIMITS.minLifetimeDays, 1)
  assert.equal(SHARE_LIMITS.maxLifetimeDays, 30)
})

function manyArtifacts(count: number, byteLength = 1024): ManifestArtifact[] {
  return Array.from({ length: count }, (_unused, index) =>
    artifact({ artifactRef: `hproj_${body('a').slice(0, 40)}${String(index).padStart(3, '0')}`, byteLength }),
  )
}

test('the artifact count cap is enforced at the boundary', () => {
  const atCap = parseShareManifest(manifest({ artifacts: manyArtifacts(SHARE_LIMITS.maxArtifacts) }))
  assert.equal(atCap.ok, true, atCap.ok ? '' : atCap.errors.join('; '))
  expectRejected(manifest({ artifacts: manyArtifacts(SHARE_LIMITS.maxArtifacts + 1) }), 'artifact cap')
  expectRejected(manifest({ artifacts: [] }), 'empty artifact list')
})

test('per-artifact and aggregate size caps are enforced', () => {
  expectRejected(
    manifest({ artifacts: [artifact({ byteLength: SHARE_LIMITS.maxArtifactBytes + 1 })] }),
    'per-artifact cap',
  )
  expectRejected(manifest({ artifacts: [artifact({ byteLength: 0 })] }), 'zero-length artifact')
  // Five at the per-artifact cap is 125 MiB, over the 100 MiB aggregate.
  expectRejected(manifest({ artifacts: manyArtifacts(5, SHARE_LIMITS.maxArtifactBytes) }), 'aggregate cap')
})

test('the canonical manifest byte cap is a redundant outer bound, and stays one', () => {
  // The largest manifest the shape can express is 25 artifacts of fixed-width
  // fields. Asserting it lands well inside the byte cap documents WHY no test
  // can drive the cap: any manifest big enough to breach it is already refused
  // by the artifact count cap.
  const largest = manifest({ artifacts: manyArtifacts(SHARE_LIMITS.maxArtifacts) })
  const size = utf8ByteLength(canonicalManifest(largest))
  assert.ok(size < SHARE_LIMITS.maxCanonicalManifestBytes, `largest expressible manifest is ${size} bytes`)
})

test('share lifetime must fall between one and thirty days', () => {
  expectRejected(manifest({ expiresAt: '2026-08-08T18:00:00.000Z' }), 'shorter than one day')
  expectRejected(manifest({ expiresAt: '2026-09-30T12:00:00.000Z' }), 'longer than thirty days')
  expectRejected(manifest({ expiresAt: ISSUED }), 'zero lifetime')
  expectRejected(manifest({ expiresAt: '2026-08-01T12:00:00.000Z' }), 'negative lifetime')
  const exactlyThirty = parseShareManifest(manifest({ expiresAt: '2026-09-07T12:00:00.000Z' }))
  assert.equal(exactlyThirty.ok, true, exactlyThirty.ok ? '' : exactlyThirty.errors.join('; '))
})

// =============================================================================
// Opaque identifiers
// =============================================================================

test('identifiers must carry the right prefix and a full-width opaque body', () => {
  assert.equal(isOpaqueId(PROJ, 'projection'), true)
  assert.equal(isOpaqueId(SHARE, 'share'), true)
  assert.equal(isOpaqueId(RECIPIENT, 'recipient'), true)
  assert.equal(isOpaqueId(NONCE, 'nonce'), true)

  // Right shape, wrong kind.
  assert.equal(isOpaqueId(SHARE, 'recipient'), false)
  // Prefix present, body short.
  assert.equal(isOpaqueId(`hshr_${body('s').slice(0, 20)}`, 'share'), false)
  // No prefix.
  assert.equal(isOpaqueId(body('s'), 'share'), false)
})

test('PII-shaped and generic identifiers are refused', () => {
  for (const bad of ['123 Main St', '+15125550100', 'customer_4821', 'proj_1', 'jane@example.com', '', 'hshr_']) {
    assert.equal(isOpaqueId(bad, 'share'), false, `${bad} must not pass as a share id`)
  }
  // Correct prefix and width, but the body is a phone/policy-shaped digit run.
  const digitRun = `hshr_${'a'.repeat(30)}${'5'.repeat(13)}`
  assert.equal(digitRun.length, 5 + 43)
  assert.equal(isOpaqueId(digitRun, 'share'), false, 'a long digit run inside an id is PII-shaped')

  expectRejected(manifest({ shareId: 'shr_4b7e2a9c81df' }), 'legacy share id shape')
  expectRejected(manifest({ recipientRef: '+15125550100' }), 'phone as recipient ref')
  expectRejected(manifest({ artifacts: [artifact({ artifactRef: 'documents/roof-front.jpg' })] }), 'storage path')
})

// =============================================================================
// Canonical timestamps and digests
// =============================================================================

test('only canonical UTC millisecond instants are accepted', () => {
  for (const bad of [
    '2026-08-15T12:00:00Z',
    '2026-08-15T12:00:00.000+00:00',
    '2026-08-15T12:00:00.0000Z',
    '2026-08-15 12:00:00.000Z',
    '2026-02-30T12:00:00.000Z',
    1_786_000_000_000,
  ]) {
    expectRejected(manifest({ expiresAt: bad as never }), String(bad))
  }
})

test('digests must be lowercase hex', () => {
  expectRejected(manifest({ artifacts: [artifact({ sha256: 'A'.repeat(64) })] }), 'uppercase digest')
  expectRejected(manifest({ artifacts: [artifact({ sha256: 'a'.repeat(63) })] }), 'short digest')
  expectRejected(manifest({ artifacts: [artifact({ sha256: 'nope' })] }), 'malformed digest')
})

test('a duplicated artifact reference is refused', () => {
  expectRejected(manifest({ artifacts: [artifact(), artifact()] }), 'duplicate artifact ref')
})

// =============================================================================
// Receipts
// =============================================================================

test('a well-formed signed receipt parses', () => {
  const parsed = parseSignedReceipt(signed(authorization))
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.errors.join('; '))
})

test('signatures must be canonical 64-byte base64url', () => {
  for (const bad of [
    Buffer.alloc(32, 7).toString('base64url'),
    Buffer.alloc(64, 7).toString('base64'),
    `${SIGNATURE}=`,
    ` ${SIGNATURE}`,
    '',
  ]) {
    const parsed = parseSignedReceipt({ receipt: authorization, signature: bad })
    assert.equal(parsed.ok, false, `signature "${bad.slice(0, 12)}…" must be refused`)
  }
})

test('a receipt with an unknown or prohibited field is refused', () => {
  const parsed = parseSignedReceipt({ receipt: { ...authorization, customer: 'Jane' }, signature: SIGNATURE })
  assert.equal(parsed.ok, false)
  assert.ok(!parsed.ok && parsed.errors.some(error => error.includes('prohibited field "customer"')))
})

test('a non-revocation receipt may not name a revocation target', () => {
  const parsed = parseSignedReceipt({
    receipt: { ...authorization, revokesReceiptId: CONSENT_ID },
    signature: SIGNATURE,
  })
  assert.equal(parsed.ok, false)
})

test('a revocation must name the receipt it withdraws', () => {
  const withoutTarget = parseSignedReceipt(signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation' })))
  assert.equal(withoutTarget.ok, false)

  const withTarget = parseSignedReceipt(
    signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation', revokesReceiptId: AUTH_ID })),
  )
  assert.equal(withTarget.ok, true, withTarget.ok ? '' : withTarget.errors.join('; '))
})

// =============================================================================
// Binding
// =============================================================================

test('a matching authorization and consent bind to their manifest', () => {
  const result = bindAuthorities(manifest(), authorization, consent)
  assert.equal(result.bound, true, result.bound ? '' : result.errors.join('; '))
})

test('a receipt bound to a different manifest does not authorize this one', () => {
  const other = bindAuthorities(manifest(), { ...authorization, manifestDigest: 'b'.repeat(64) }, consent)
  assert.equal(other.bound, false)
})

test('the two authorities must agree on every bound field', () => {
  for (const [field, value] of [
    ['expiresAt', '2026-08-14T12:00:00.000Z'],
    ['policyVersion', 'homeowner-disclosure.v2'],
    ['generation', 2],
    ['recipientRef', `hrcp_${body('q')}`],
    ['shareId', `hshr_${body('q')}`],
  ] as const) {
    const drifted = { ...consent, [field]: value } as ReceiptCore
    const result = bindAuthorities(manifest(), authorization, drifted)
    assert.equal(result.bound, false, `a disagreement on ${field} must break the binding`)
  }
})

test('receipt types cannot be swapped', () => {
  assert.equal(bindAuthorities(manifest(), consent, authorization).bound, false)
})

test('chronology is enforced in both directions', () => {
  const earlyConsent = { ...consent, issuedAt: '2026-08-07T12:00:00.000Z' }
  assert.equal(bindAuthorities(manifest(), authorization, earlyConsent).bound, false)

  const overlongAuth = { ...authorization, expiresAt: '2026-08-20T12:00:00.000Z' }
  const overlongConsent = { ...consent, expiresAt: '2026-08-20T12:00:00.000Z' }
  assert.equal(bindAuthorities(manifest(), overlongAuth, overlongConsent).bound, false)

  const earlyAuth = { ...authorization, issuedAt: '2026-08-07T12:00:00.000Z' }
  const earlyBoth = { ...consent, issuedAt: '2026-08-07T12:00:00.000Z' }
  assert.equal(bindAuthorities(manifest(), earlyAuth, earlyBoth).bound, false)
})

// =============================================================================
// Append-only ledger
// =============================================================================

test('the ledger is append-only and never mutated in place', () => {
  const before = EMPTY_LEDGER
  const result = appendReceipt(before, signed(authorization))
  assert.equal(result.outcome, 'appended')
  assert.equal(before.entries.length, 0, 'the input ledger must be untouched')
  assert.equal(result.ledger.entries.length, 1)
})

test('a byte-identical resubmission is an idempotent replay, not a new act', () => {
  const first = appendReceipt(EMPTY_LEDGER, signed(authorization))
  assert.equal(first.outcome, 'appended')
  const again = appendReceipt(first.ledger, signed(authorization))
  assert.equal(again.outcome, 'exact_replay')
  assert.equal(again.ledger.entries.length, 1, 'a replay must not grow the ledger')
})

test('the same identity with different bytes is a conflict, and both are refused', () => {
  const first = appendReceipt(EMPTY_LEDGER, signed(authorization))
  assert.equal(first.outcome, 'appended')
  // Same identity fields, different signed bytes: one of these is not genuine.
  const forged = appendReceipt(first.ledger, signed({ ...authorization, keyId: 'attacker-key-2026a' }))
  assert.equal(forged.outcome, 'conflict')
  assert.equal(forged.ledger.entries.length, 1)

  const resigned = appendReceipt(first.ledger, { receipt: authorization, signature: Buffer.alloc(64, 9).toString('base64url') })
  assert.equal(resigned.outcome, 'conflict')
})

test('a revocation must bind structurally to a receipt this ledger has seen', () => {
  const ledger = liveLedger()

  const unknownTarget = appendReceipt(
    ledger,
    signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation', revokesReceiptId: `hrec_${body('z')}` })),
  )
  assert.equal(unknownTarget.outcome, 'rejected')

  const wrongShare = appendReceipt(
    ledger,
    signed(receipt({
      receiptId: REVOKE_ID,
      receiptType: 'revocation',
      revokesReceiptId: AUTH_ID,
      shareId: `hshr_${body('q')}`,
    })),
  )
  assert.equal(wrongShare.outcome, 'rejected')

  const wrongDigest = appendReceipt(
    ledger,
    signed(receipt({
      receiptId: REVOKE_ID,
      receiptType: 'revocation',
      revokesReceiptId: AUTH_ID,
      manifestDigest: 'b'.repeat(64),
    })),
  )
  assert.equal(wrongDigest.outcome, 'rejected')
})

test('revocation is terminal and nothing can restore access', () => {
  const ledger = liveLedger()
  const before = ledgerState(ledger, SHARE, DIGEST, NOW)
  assert.equal(before.authorizationActive, true)
  assert.equal(before.consentActive, true)

  const revoked = appendReceipt(
    ledger,
    signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation', revokesReceiptId: AUTH_ID })),
  )
  assert.equal(revoked.outcome, 'appended')

  const after = ledgerState(revoked.ledger, SHARE, DIGEST, NOW)
  assert.equal(after.authorizationActive, false, 'a revoked authorization is dead')
  assert.equal(after.consentActive, true, 'the other authority is unaffected')
  assert.ok(after.revokedReceiptIds.includes(AUTH_ID))

  // There is no receipt type that un-revokes, and re-appending the original
  // authorization is an exact replay that changes nothing.
  const attempt = appendReceipt(revoked.ledger, signed(authorization))
  assert.equal(attempt.outcome, 'exact_replay')
  assert.equal(ledgerState(attempt.ledger, SHARE, DIGEST, NOW).authorizationActive, false)
})

test('either side alone can end the disclosure', () => {
  const ledger = liveLedger()
  const homeownerWithdraws = appendReceipt(
    ledger,
    signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation', revokesReceiptId: CONSENT_ID })),
  )
  assert.equal(homeownerWithdraws.outcome, 'appended')
  const state = ledgerState(homeownerWithdraws.ledger, SHARE, DIGEST, NOW)
  assert.equal(state.consentActive, false)
})

test('an expired receipt is not live, with or without a revocation', () => {
  const ledger = liveLedger()
  const afterExpiry = new Date('2026-08-16T12:00:00.000Z')
  const state = ledgerState(ledger, SHARE, DIGEST, afterExpiry)
  assert.equal(state.authorizationActive, false)
  assert.equal(state.consentActive, false)
})

test('a receipt for a different manifest does not make this one live', () => {
  const ledger = liveLedger()
  const state = ledgerState(ledger, SHARE, 'b'.repeat(64), NOW)
  assert.equal(state.authorizationActive, false)
  assert.equal(state.consentActive, false)
})

// =============================================================================
// Phase 0 inertness
// =============================================================================

test('the launch-approved projection set is frozen empty', () => {
  assert.deepEqual([...LAUNCH_APPROVED_PROJECTION_KINDS], [])
  assert.ok(Object.isFrozen(LAUNCH_APPROVED_PROJECTION_KINDS))
  assert.ok(KNOWN_PROJECTION_KINDS.length > 0, 'kinds are expressible but none is approved')
})

test('a fully valid, live, bound share still authorizes nothing in Phase 0', () => {
  const decision = evaluateDelivery(
    { manifest: manifest(), authorization, consent, ledger: liveLedger() },
    NOW,
  )
  assert.equal(decision.authorized, false)
  assert.ok(
    decision.reasons.some(reason => reason.includes('phase 0')),
    'the Phase 0 refusal must be explicit, not incidental',
  )
  assert.ok(
    decision.reasons.some(reason => reason.includes('not launch-approved')),
    'the empty launch-approved set must also refuse on its own',
  )
})

test('every delivery decision carries the structural-validation warning', () => {
  const decision = evaluateDelivery({ manifest: manifest(), authorization, consent, ledger: liveLedger() }, NOW)
  assert.equal(decision.warning, STRUCTURAL_VALIDATION_WARNING)
  assert.match(decision.warning, /does not verify any signature/)
  assert.match(decision.warning, /does not consult the current revocation ledger/)
})

test('external refusals do not distinguish absent from revoked from expired', () => {
  const live = { manifest: manifest(), authorization, consent, ledger: liveLedger() }
  const absent = { ...live, ledger: EMPTY_LEDGER }
  const revoked = {
    ...live,
    ledger: (() => {
      const result = appendReceipt(
        liveLedger(),
        signed(receipt({ receiptId: REVOKE_ID, receiptType: 'revocation', revokesReceiptId: AUTH_ID })),
      )
      return result.ledger
    })(),
  }

  // Internally the reasons differ, which is what the audit record needs.
  const absentReasons = evaluateDelivery(absent, NOW).reasons
  const revokedReasons = evaluateDelivery(revoked, NOW).reasons
  assert.notDeepEqual(absentReasons, evaluateDelivery(live, NOW).reasons)
  assert.ok(revokedReasons.length > 0)

  // Externally they are indistinguishable, so shares cannot be enumerated.
  assert.deepEqual(externalRefusal(), { error: EXTERNAL_REFUSAL_MESSAGE })
  assert.doesNotMatch(EXTERNAL_REFUSAL_MESSAGE, /revoked|expired|not found|unknown|consent/i)
})

// =============================================================================
// Visibility: a homeowner sees what was shared, and nothing else
// =============================================================================

test('the contract exposes no way to enumerate what a homeowner has', () => {
  // "Show me everything for this homeowner" must not be expressible. If someone
  // adds a listing entry point later, this fails rather than passing review
  // unnoticed.
  const enumerating = /^(list|search|browse|find|get|fetch|load|query|index|catalog|all|enumerate)/i
  const callables = Object.entries(contract).filter(([, value]) => typeof value === 'function')
  assert.ok(callables.length > 5, 'the export scan must actually be reaching the functions')
  for (const [name] of callables) {
    assert.doesNotMatch(
      name,
      enumerating,
      `"${name}" reads as an enumerating entry point; the manifest is the whole view`,
    )
  }
  assert.match(HOMEOWNER_VISIBILITY_RULE, /exactly what was shared/)
})

test('two shares to the same homeowner stay isolated', () => {
  // Same recipient, two separate shares. Receipts for one must not make the
  // other live, or a second share becomes a key to the first.
  const otherShareId = `hshr_${body('q')}`
  const otherManifest = manifest({ shareId: otherShareId, nonce: `hnce_${body('q')}` })
  const otherDigest = manifestDigest(otherManifest)
  assert.notEqual(otherDigest, DIGEST)

  const ledger = liveLedger() // holds live receipts for SHARE only

  const state = ledgerState(ledger, otherShareId, otherDigest, NOW)
  assert.equal(state.authorizationActive, false, 'a receipt for one share must not authorize another')
  assert.equal(state.consentActive, false)

  const decision = evaluateDelivery(
    { manifest: otherManifest, authorization, consent, ledger },
    NOW,
  )
  assert.equal(decision.authorized, false)
  assert.ok(decision.reasons.some(reason => reason.includes('no live authorization')))
})

test('a share is scoped by its own manifest, never by the recipient', () => {
  // Swapping only the manifest, while keeping the same recipient and a ledger
  // full of that recipient's live receipts, must not disclose anything.
  const ledger = liveLedger()
  const sameRecipientDifferentContent = manifest({
    nonce: `hnce_${body('q')}`,
    artifacts: [artifact({ artifactRef: `hproj_${body('q')}`, projectionKind: 'warranty_summary' })],
  })
  assert.equal(sameRecipientDifferentContent.recipientRef, RECIPIENT)
  assert.notEqual(manifestDigest(sameRecipientDifferentContent), DIGEST)

  const state = ledgerState(ledger, SHARE, manifestDigest(sameRecipientDifferentContent), NOW)
  assert.equal(state.authorizationActive, false, 'consent to one manifest is not consent to another')
  assert.equal(state.consentActive, false)
})

// =============================================================================
// Preserved boundaries
// =============================================================================

test('the contract carries no address, parcel, or geo identity', () => {
  const serialized = JSON.stringify({ manifest: manifest(), authorization, consent })
  assert.doesNotMatch(
    serialized,
    /address|street|parcel|geohash|latitude|longitude|zip/i,
    'V1 scopes by Jobrolo-issued share id only; property matching is a separate RFC',
  )
})

test('no HCN, JobNimbus, or Thresher identity appears in the contract', () => {
  const serialized = JSON.stringify({
    manifest: manifest(),
    authorization,
    consent,
    kinds: KNOWN_PROJECTION_KINDS,
    excluded: EXCLUDED_SOURCE_KINDS,
  })
  for (const forbidden of ['home claim network', 'hcn', 'jobnimbus', 'titan', 'wave pa']) {
    assert.doesNotMatch(serialized.toLowerCase(), new RegExp(forbidden), `${forbidden} must not appear`)
  }
  // Thresher appears once, as a named exclusion, and never as a projection kind.
  assert.ok((EXCLUDED_SOURCE_KINDS as readonly string[]).includes('thresher_result'))
  assert.equal((KNOWN_PROJECTION_KINDS as readonly string[]).includes('thresher_result'), false)
})
