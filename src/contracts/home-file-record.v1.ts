/**
 * home-file-record.v1 — DRAFT schema. No database, no runtime, no storage.
 *
 * Implements the decisions in docs/HOME_FILE_RFC.md as types and validators so
 * they exist before any table does. Three entities and one edge:
 *
 *      HomeRef  <--- WorkRecord ---> CompanyRef
 *                        |
 *                  Contribution(s)
 *
 * The edge is the interesting part and the dangerous part. One job belongs to
 * both a home and a company, so "this company's projects" and "this home's
 * projects" are the same rows with a different filter — and a filter is one bug
 * away from showing one household another household's home. Which is why
 * visibility is never computed from membership: see `resolveVisibility`.
 *
 * Nothing here authorizes anything. Phase 0 resolves every access to denied.
 */

import { z } from 'zod'

export const HOME_FILE_RECORD_VERSION = 'home-file-record.v1-draft' as const

export const HOME_FILE_RECORD_STATUS = Object.freeze({
  storageImplemented: false,
  accountsImplemented: false,
  controllerVerificationImplemented: false,
  propertyResolverImplemented: false,
  presentableAsOperational: false,
} as const)

const OPAQUE = '[A-Za-z0-9_-]{43}'
const opaqueId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_${OPAQUE}$`))
const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(v => new Date(v).toISOString() === v, 'must be a real canonical UTC instant')

/**
 * A regex accepts 2026-02-30 and 2026-13-01. Round-tripping through Date is
 * what makes a date real, and a timeline built on impossible dates orders
 * itself incorrectly in ways nothing downstream can detect.
 */
export function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const calendarDate = z.string().refine(isRealCalendarDate, 'must be a real calendar date')

/** Start-of-day UTC, so a date and an instant are comparable. */
const dayStartMs = (date: string) => Date.parse(`${date}T00:00:00.000Z`)
const instantMs = (value: string) => Date.parse(value)

// --- classification -----------------------------------------------------------

/**
 * Person data and property data are stored and deleted differently. A property
 * fact is durable; a person fact is deletable on request. Getting this wrong is
 * unfixable later, because you cannot separate them retroactively once they
 * share a row (HOME_FILE_RFC §7).
 */
export const CONTENT_CLASSES = Object.freeze([
  'property_fact',
  'person_identifier',
  'person_contact',
  'controller_org_data',
  'restricted_work_product',
  'released_projection',
  'audit_tombstone',
] as const)

export type ContentClass = (typeof CONTENT_CLASSES)[number]

/** Classes that may never appear in this lane at all (HOME_FILE_RFC §8). */
export const PROHIBITED_CLASSES = Object.freeze([
  'insurance_claim_material',
  'carrier_communication',
  'claim_strategy',
])

export const RETENTION_CLASSES = Object.freeze([
  'durable_property_record',
  'deletable_on_request',
  'retain_while_controller_active',
  'legal_hold',
] as const)

export type RetentionClass = (typeof RETENTION_CLASSES)[number]

/**
 * Person data must never be classified as durable. Enforced in
 * `parseContribution` rather than left to reviewer discipline, because this is
 * the single pairing that makes deletion rights impossible to honour later.
 */
const PERSON_CLASSES: readonly ContentClass[] = ['person_identifier', 'person_contact']

// --- contribution -------------------------------------------------------------

export const contributionSchema = z.object({
  recordVersion: z.literal(HOME_FILE_RECORD_VERSION),
  contributionRef: opaqueId('hcon'),
  homeRef: opaqueId('hhom'),
  /**
   * Who clicked upload. NOT authority (HOME_FILE_RFC §3): an employee may
   * submit work product their employer controls.
   */
  submittingActorRef: opaqueId('hactor'),
  /** Who currently decides what happens to it. Server-derived, never claimed. */
  verifiedControllerRef: opaqueId('hctl'),
  contentClass: z.enum(CONTENT_CLASSES),
  retentionClass: z.enum(RETENTION_CLASSES),
  /** Immutable digest of the exact payload version. */
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payloadVersion: z.number().int().min(1),
  createdAt: utcInstant,
  /** Set when superseded by a newer version, never mutated in place. */
  supersededBy: opaqueId('hcon').optional(),
  /** Set when the payload was deleted; the tombstone stays. */
  tombstonedAt: utcInstant.optional(),
  /** Optional link to the job this came from. */
  workRecordRef: opaqueId('hwrk').optional(),
}).strict()

export type Contribution = z.infer<typeof contributionSchema>

export function parseContribution(input: unknown): Contribution {
  const contribution = contributionSchema.parse(input)

  if (PERSON_CLASSES.includes(contribution.contentClass)
    && contribution.retentionClass === 'durable_property_record') {
    throw new Error('Person data may not be classified as a durable property record')
  }
  if (contribution.tombstonedAt && contribution.retentionClass === 'legal_hold') {
    throw new Error('Content under legal hold may not be tombstoned')
  }
  if (contribution.supersededBy === contribution.contributionRef) {
    throw new Error('A contribution may not supersede itself')
  }
  if (contribution.tombstonedAt
    && instantMs(contribution.tombstonedAt) < instantMs(contribution.createdAt)) {
    throw new Error('A contribution may not be tombstoned before it was created')
  }
  return contribution
}

// --- the edge -----------------------------------------------------------------

export const WORK_RECORD_STATES = Object.freeze([
  'recorded',
  'release_proposed',
  'released',
  'release_revoked',
] as const)

export type WorkRecordState = (typeof WORK_RECORD_STATES)[number]

/**
 * One job, seen by both sides. The release state is what turns a private edge
 * into something a company may point at publicly — and only the homeowner's
 * controller may move it there.
 */
export const workRecordSchema = z.object({
  recordVersion: z.literal(HOME_FILE_RECORD_VERSION),
  workRecordRef: opaqueId('hwrk'),
  homeRef: opaqueId('hhom'),
  companyRef: opaqueId('hcmp'),
  performedOn: calendarDate,
  state: z.enum(WORK_RECORD_STATES),
  /** Required once released or revoked; names who moved it and when. */
  releasedByControllerRef: opaqueId('hctl').optional(),
  releasedAt: utcInstant.optional(),
  revokedAt: utcInstant.optional(),
}).strict()

export type WorkRecord = z.infer<typeof workRecordSchema>

/** Optional fields that only a released record may carry. */
const RELEASE_FIELDS = ['releasedByControllerRef', 'releasedAt'] as const
/** Optional fields that only a revoked record may carry. */
const REVOCATION_FIELDS = ['revokedAt'] as const

export function parseWorkRecord(input: unknown): WorkRecord {
  const record = workRecordSchema.parse(input)

  // Every optional field is checked against the state, in both directions.
  //
  // Requiring fields when the state needs them is the obvious half. The half
  // that is usually missed is forbidding them when it does not: a `recorded`
  // record carrying `releasedAt` is a record that was released and then walked
  // backwards, or a partially-applied write. Either way the state and the
  // evidence disagree, and any reader that trusts one over the other is
  // guessing. A record whose state says private while its fields say published
  // is precisely the bug that shows one household's work to the public.
  const present = (fields: readonly (keyof WorkRecord)[]) =>
    fields.filter(field => record[field] !== undefined)

  switch (record.state) {
    case 'recorded':
    case 'release_proposed': {
      const stray = present([...RELEASE_FIELDS, ...REVOCATION_FIELDS])
      if (stray.length > 0) {
        throw new Error(
          `A ${record.state} work record may not carry release or revocation fields: ${stray.join(', ')}`,
        )
      }
      break
    }
    case 'released': {
      const missing = RELEASE_FIELDS.filter(field => record[field] === undefined)
      if (missing.length > 0) {
        throw new Error(`A release must record who released it and when: missing ${missing.join(', ')}`)
      }
      const stray = present(REVOCATION_FIELDS)
      if (stray.length > 0) {
        throw new Error(`A released work record may not carry revocation fields: ${stray.join(', ')}`)
      }
      break
    }
    case 'release_revoked': {
      const missing = [...RELEASE_FIELDS, ...REVOCATION_FIELDS]
        .filter(field => record[field] === undefined)
      if (missing.length > 0) {
        throw new Error(
          `A revoked release must record the release it withdraws and when: missing ${missing.join(', ')}`,
        )
      }
      break
    }
  }

  // A release cannot predate the work it releases, and a revocation cannot
  // predate the release it withdraws. Both are impossible timelines that a
  // shape check happily accepts.
  if (record.releasedAt && instantMs(record.releasedAt) < dayStartMs(record.performedOn)) {
    throw new Error('A release may not predate the work it releases')
  }
  if (record.revokedAt && record.releasedAt
    && instantMs(record.revokedAt) < instantMs(record.releasedAt)) {
    throw new Error('A revocation may not predate the release it withdraws')
  }
  return record
}

// --- visibility ---------------------------------------------------------------

export type VisibilityBasis = 'verified_controller' | 'exact_active_share'

export type VisibilityDecision =
  | { readonly visible: false; readonly reason: string }

/**
 * Exactly two candidate doors, and Phase 0 opens neither.
 *
 * The return type cannot express `visible: true`, so granting access is a
 * reviewable type change rather than a runtime slip — the same device the share
 * contract uses for delivery.
 *
 * Note the arguments this deliberately does NOT take: no address, no parcel, no
 * occupancy, no home-file membership, no company membership. None of those is
 * authority (HOME_FILE_RFC §4), so none of them is even available to the
 * function that would misuse them.
 */
export function resolveVisibility(input: {
  readonly contribution: Contribution
  readonly viewerControllerRef?: string
  readonly activeShareBinding?: { readonly contributionRef: string; readonly live: boolean }
}): VisibilityDecision {
  const bases: VisibilityBasis[] = []

  if (input.viewerControllerRef
    && input.viewerControllerRef === input.contribution.verifiedControllerRef) {
    bases.push('verified_controller')
  }
  if (input.activeShareBinding?.live
    && input.activeShareBinding.contributionRef === input.contribution.contributionRef) {
    bases.push('exact_active_share')
  }

  if (bases.length === 0) {
    return { visible: false, reason: 'no_candidate_basis' }
  }
  // Even a matched basis is only a candidate. A runtime service must re-derive
  // it from authoritative state immediately before release, and Phase 0 has no
  // authoritative state to derive from.
  return { visible: false, reason: 'phase0_no_authoritative_state' }
}

export const HOME_FILE_STRUCTURAL_WARNING =
  'These are shape checks over candidate bases. They verify no identity, consult no ledger, and grant no '
  + 'access. Home-file membership, occupancy, an address match, and the existence of a contribution are never '
  + 'authority.'
