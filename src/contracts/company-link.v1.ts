/**
 * company-link.v1 — DRAFT PROPOSAL. Homesrolo <-> Jobrolo company binding.
 *
 * STATUS: this is a proposal for Codex to implement on the Jobrolo side.
 * Jobrolo remains normative for the wire, exactly as it is for
 * homeowner-share.v1. Homesrolo built ahead of the spec once already and paid
 * for it with a repair pass; this file exists to be agreed *before* either side
 * builds transport.
 *
 * THE PROBLEM
 * A company claims its Homesrolo page by proving it controls a Jobrolo tenant.
 * Two independent systems, neither trusting the other's assertion, needing a
 * signed, revocable, auditable link. That is homeowner-share.v1 with a
 * different payload, so this reuses the same protocol family rather than
 * inventing a third one: canonical JSON, Ed25519 signing payloads, replay
 * identity over (version, issuer, id), append-only revocation, and structural
 * validation that authorizes nothing.
 *
 * THE RULE THAT MATTERS MOST
 * Content that arrives over this link is ALWAYS `company_self_reported`. A
 * company uploading a photo or editing its description from Jobrolo has
 * asserted something about itself. It has not verified anything. The content
 * envelope below is structurally incapable of carrying a verification fact or a
 * confirmed status — see `companyLinkContentSchema` and its tests.
 */

import { z } from 'zod'
import { homeownerShareCanonicalJson, homeownerShareSha256 } from './homeowner-share.v1.ts'

export const COMPANY_LINK_ASSERTION_VERSION = 'company-link.assertion.v1-draft' as const
export const COMPANY_LINK_BINDING_VERSION = 'company-link.binding.v1-draft' as const
export const COMPANY_LINK_REVOCATION_VERSION = 'company-link.revocation.v1-draft' as const
export const COMPANY_LINK_CONTENT_VERSION = 'company-link.content.v1-draft' as const

/**
 * Nothing is built. Mirrors REVIEW_PROOF_STATUS: every flag stays false until
 * the corresponding check exists, and a test enforces it.
 */
export const COMPANY_LINK_STATUS = Object.freeze({
  jobroloSideImplemented: false,
  signatureVerifiedAgainstTrustedKey: false,
  currentStateLedgerChecked: false,
  transportImplemented: false,
  presentableAsVerifiedControl: false,
} as const)

const OPAQUE = '[A-Za-z0-9_-]{43}'
const opaqueId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_${OPAQUE}$`))
const utcInstant = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(v => new Date(v).toISOString() === v, 'must be a real canonical UTC instant')

const signingProof = z.object({
  algorithm: z.literal('Ed25519'),
  keyId: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
}).strict()

/**
 * Jobrolo -> Homesrolo. "Tenant T controls business B, asserted by an owner or
 * admin at time X." Jobrolo is the only system that can make this statement,
 * because it is the only one that authenticated the tenant.
 */
export const companyLinkAssertionSchema = z.object({
  receiptVersion: z.literal(COMPANY_LINK_ASSERTION_VERSION),
  issuer: z.literal('jobrolo'),
  audience: z.literal('homesrolo'),
  purpose: z.literal('company_profile_control'),
  assertionId: opaqueId('hcla'),
  /** Opaque Jobrolo tenant reference. Never a tenant name. */
  tenantRef: opaqueId('htnt'),
  /** The Homesrolo public profile being claimed. */
  companyRef: opaqueId('hcmp'),
  assertedByRole: z.enum(['owner', 'admin']),
  assertedActorRef: opaqueId('hactor'),
  assertionPolicyVersion: z.literal('jobrolo-company-control.v1'),
  assertedAt: utcInstant,
  expiresAt: utcInstant,
  signing: signingProof,
}).strict()

/** Homesrolo -> Jobrolo. "Profile P is bound to tenant T." */
export const companyLinkBindingSchema = z.object({
  receiptVersion: z.literal(COMPANY_LINK_BINDING_VERSION),
  issuer: z.literal('homesrolo'),
  audience: z.literal('jobrolo'),
  purpose: z.literal('company_profile_control'),
  bindingId: opaqueId('hbnd'),
  companyRef: opaqueId('hcmp'),
  tenantRef: opaqueId('htnt'),
  /** Digest of the assertion this binding answers. */
  assertionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  boundAt: utcInstant,
  expiresAt: utcInstant,
  signing: signingProof,
}).strict()

export const companyLinkRevocationSchema = z.object({
  receiptVersion: z.literal(COMPANY_LINK_REVOCATION_VERSION),
  issuer: z.enum(['jobrolo', 'homesrolo']),
  audience: z.enum(['jobrolo', 'homesrolo']),
  purpose: z.literal('company_profile_control'),
  revocationId: opaqueId('hclr'),
  companyRef: opaqueId('hcmp'),
  revokedReceiptVersion: z.enum([COMPANY_LINK_ASSERTION_VERSION, COMPANY_LINK_BINDING_VERSION]),
  revokedReceiptRef: z.union([opaqueId('hcla'), opaqueId('hbnd')]),
  reasonCode: z.enum([
    'control_withdrawn',
    'tenant_closed',
    'disputed_control',
    'security_response',
  ]),
  revokedAt: utcInstant,
  signing: signingProof,
}).strict()

/**
 * Content authored in Jobrolo, flowing to the public profile.
 *
 * Note what this CANNOT express: there is no status field, no verification
 * dimension, no source field, and no confirmed flag. The receiving side stamps
 * every value as `company_self_reported`. A company cannot verify itself by
 * typing into its own admin panel, and the contract makes that unrepresentable
 * rather than relying on the receiver to remember.
 */
export const companyLinkContentSchema = z.object({
  envelopeVersion: z.literal(COMPANY_LINK_CONTENT_VERSION),
  companyRef: opaqueId('hcmp'),
  tenantRef: opaqueId('htnt'),
  submittedAt: utcInstant,
  /** Free-text the company wrote about itself. */
  summary: z.string().min(20).max(600).optional(),
  tradeCategories: z.array(z.string().regex(/^[a-z_]+$/)).max(6).optional(),
  serviceAreas: z.array(z.string().min(2).max(80)).max(12).optional(),
  /** Opaque refs to images the company uploaded through Jobrolo. */
  photoRefs: z.array(opaqueId('hphot')).max(24).optional(),
  /**
   * Present when an assistant drafted the change. The company must still
   * approve it in Jobrolo before it is submitted, and the flag is retained so
   * the provenance of the wording is visible.
   */
  draftedByAssistant: z.boolean(),
  approvedByRole: z.enum(['owner', 'admin']),
}).strict()

export type CompanyLinkAssertion = z.infer<typeof companyLinkAssertionSchema>
export type CompanyLinkBinding = z.infer<typeof companyLinkBindingSchema>
export type CompanyLinkRevocation = z.infer<typeof companyLinkRevocationSchema>
export type CompanyLinkContent = z.infer<typeof companyLinkContentSchema>

/** The only status content from this link may ever be given. */
export const LINKED_CONTENT_SOURCE = 'company_self_reported' as const

/**
 * Fields the content envelope must never gain. Enumerated so that adding one is
 * a visible deletion from this list rather than a quiet schema edit.
 */
export const CONTENT_MUST_NEVER_CARRY = Object.freeze([
  'verificationFacts', 'status', 'confirmed', 'source', 'licenseNumber',
  'insuranceCertificate', 'rating', 'reviews', 'credentials', 'rankBoost',
  'sponsorshipTier', 'placementFee',
])

/** Same derivation as homeowner-share: sha256 over [version, issuer, id]. */
export function companyLinkReplayKey(
  receipt: { receiptVersion: string; issuer: string } & Record<string, unknown>,
): string {
  const id = receipt.assertionId ?? receipt.bindingId ?? receipt.revocationId
  if (typeof id !== 'string') throw new Error('company-link receipt has no immutable id')
  return homeownerShareSha256([receipt.receiptVersion, receipt.issuer, id])
}

/** Same construction as homeowner-share: canonical JSON minus the signature. */
export function companyLinkSigningPayload(receipt: Record<string, unknown>): string {
  const signing = receipt['signing'] as Record<string, unknown> | undefined
  if (!signing) throw new Error('company-link receipt has no signing proof')
  const { signature: _dropped, ...rest } = signing
  return homeownerShareCanonicalJson({ ...receipt, signing: rest })
}

export type CompanyLinkDecision = {
  readonly authorized: false
  readonly reason: string
}

/**
 * Phase 0 is inert, exactly like the share contract. The type cannot express
 * success, so enabling company linking is a reviewable type change rather than
 * a configuration slip.
 */
export function companyLinkPhase0Decision(): CompanyLinkDecision {
  return {
    authorized: false,
    reason: 'phase0_company_link_not_implemented',
  }
}

export const COMPANY_LINK_STRUCTURAL_WARNING =
  'Structural validation proves shape only. It does not verify a signature against a trusted key, does not '
  + 'consult a current-state ledger, and does not prove that any tenant controls any business. No company '
  + 'profile may be shown as claimed on the strength of these checks alone.'
