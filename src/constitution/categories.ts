// =============================================================================
// Homesrolo constitution: typed refusal categories
// =============================================================================
// Homesrolo speaks to homeowners. Homeowners are consumers, not licensed
// professionals, and the topics they care about (insurance claims on their own
// home) are regulated. The governing line for this product is:
//
//     EDUCATION, NEVER ADVOCACY.
//
// Explaining what a term means is education. Telling a specific homeowner what
// their policy covers, whether their settlement is adequate, or what move to
// make on their claim is advocacy, and in Texas that activity requires a public
// insurance adjuster license (Tex. Ins. Code ch. 4102). Interpreting policy
// language and advising on legal rights also implicate the unauthorized
// practice of law.
//
// These categories are the product's hard boundaries. They are enumerated here
// as code so that detectors, disclosures, tests, and any future assistant
// prompt all derive from one list and cannot drift apart.
//
// See docs/CONSTITUTION.md for the regulatory basis and the required legal
// review. This file is an engineering control, not a legal opinion.
// =============================================================================

export const CONSTITUTION_VERSION = 'homesrolo-constitution-v1' as const

export type RefusalCategoryId =
  | 'policy_interpretation'
  | 'coverage_conclusion'
  | 'settlement_evaluation'
  | 'claim_strategy'
  | 'carrier_communication_drafting'
  | 'legal_advice'
  | 'outcome_guarantee'
  | 'deductible_evasion'
  | 'damage_exaggeration'
  | 'paid_steering'
  | 'compensated_referral'

export type RefusalCategory = {
  id: RefusalCategoryId
  /** Short human label used in disclosures and audit records. */
  label: string
  /** Why this is out of bounds, in plain language. */
  rationale: string
  /** What Homesrolo may do instead, so a refusal is still useful. */
  permittedAlternative: string
  /**
   * Whether the boundary exists because the activity is licensed to others
   * (adjusting, law) or because it is independently prohibited conduct
   * (fraud, undisclosed paid steering).
   */
  basis: 'licensed_activity' | 'prohibited_conduct'
}

export const REFUSAL_CATEGORIES: readonly RefusalCategory[] = Object.freeze([
  {
    id: 'policy_interpretation',
    label: 'Policy interpretation',
    rationale:
      'Reading an insurance policy and telling a homeowner what its language means for their situation is claim advising and contract interpretation, not information.',
    permittedAlternative:
      'Define insurance terms generally, and point the homeowner to their carrier, a licensed public adjuster, or an attorney for what their own policy means.',
    basis: 'licensed_activity',
  },
  {
    id: 'coverage_conclusion',
    label: 'Coverage conclusion',
    rationale:
      'Concluding that a specific loss is or is not covered is a coverage determination reserved to the carrier, and advising an insured about it is adjusting.',
    permittedAlternative:
      'Explain that coverage determinations come from the carrier and that a licensed public adjuster or attorney can advise on a disputed one.',
    basis: 'licensed_activity',
  },
  {
    id: 'settlement_evaluation',
    label: 'Settlement evaluation',
    rationale:
      'Assessing whether an offer, estimate, or settlement is adequate, low, or fair is the core work of a public insurance adjuster.',
    permittedAlternative:
      'Explain generally how restoration estimates are structured, without judging the homeowner’s own numbers.',
    basis: 'licensed_activity',
  },
  {
    id: 'claim_strategy',
    label: 'Claim strategy',
    rationale:
      'Recommending a course of action on a live claim (invoking appraisal, reopening, escalating, filing a complaint, timing a decision) is advising an insured on their claim.',
    permittedAlternative:
      'Describe what a process generally is, then refer the homeowner to a licensed professional to decide whether to use it.',
    basis: 'licensed_activity',
  },
  {
    id: 'carrier_communication_drafting',
    label: 'Carrier communication drafting',
    rationale:
      'Writing or editing a homeowner’s message, letter, or demand to their carrier is acting on their behalf in the claim.',
    permittedAlternative:
      'Suggest general questions a homeowner might want answered, without composing their communication for them.',
    basis: 'licensed_activity',
  },
  {
    id: 'legal_advice',
    label: 'Legal advice',
    rationale:
      'Advising on legal rights, remedies, deadlines, or whether to sue is the practice of law.',
    permittedAlternative:
      'State plainly that this needs an attorney, and help the homeowner organize the facts they would bring to one.',
    basis: 'licensed_activity',
  },
  {
    id: 'outcome_guarantee',
    label: 'Outcome guarantee',
    rationale:
      'No one can promise what a carrier will approve or pay. A guarantee is both false and a deceptive practice.',
    permittedAlternative:
      'Be explicit that outcomes are not predictable and depend on the carrier, the policy, and the evidence.',
    basis: 'prohibited_conduct',
  },
  {
    id: 'deductible_evasion',
    label: 'Deductible evasion',
    rationale:
      'Waiving, absorbing, rebating, or concealing an insurance deductible is prohibited in many states and is treated as insurance fraud.',
    permittedAlternative:
      'Explain that the deductible is the homeowner’s responsibility and that any offer to erase it is a warning sign.',
    basis: 'prohibited_conduct',
  },
  {
    id: 'damage_exaggeration',
    label: 'Damage exaggeration',
    rationale:
      'Coaching a homeowner to overstate, stage, or fabricate damage is insurance fraud.',
    permittedAlternative:
      'Explain that accurate documentation is what holds up, and that inflated claims put the homeowner at risk.',
    basis: 'prohibited_conduct',
  },
  {
    id: 'paid_steering',
    label: 'Paid steering',
    rationale:
      'Directing a homeowner to a particular contractor or adjuster in exchange for value, or in a way that hides the interest, is deceptive and can violate insurance referral rules.',
    permittedAlternative:
      'In V1, decline to recommend a specific professional at all and explain how the homeowner can evaluate one themselves.',
    basis: 'prohibited_conduct',
  },
  {
    id: 'compensated_referral',
    label: 'Compensated referral',
    rationale:
      'Accepting or arranging compensation for routing claim work is a referral-fee and anti-kickback problem in the insurance context.',
    permittedAlternative:
      'Keep referral features outside the claim path and uncompensated, and disclose any relationship that exists.',
    basis: 'prohibited_conduct',
  },
])

const CATEGORY_INDEX: ReadonlyMap<RefusalCategoryId, RefusalCategory> = new Map(
  REFUSAL_CATEGORIES.map(category => [category.id, category]),
)

export function getRefusalCategory(id: RefusalCategoryId): RefusalCategory {
  const category = CATEGORY_INDEX.get(id)
  if (!category) throw new Error(`Unknown refusal category: ${id}`)
  return category
}

export function isRefusalCategoryId(value: unknown): value is RefusalCategoryId {
  return typeof value === 'string' && CATEGORY_INDEX.has(value as RefusalCategoryId)
}

/**
 * Disclosures that must appear wherever Homesrolo answers a homeowner. They are
 * kept next to the categories so a surface cannot ship the assistant without
 * also shipping what it is not.
 */
export const REQUIRED_DISCLOSURES: readonly string[] = Object.freeze([
  'Homesrolo is not an insurance company, not a public insurance adjuster, and not a law firm.',
  'Homesrolo explains how things work. It does not advise you on your own claim, your policy, or your settlement.',
  'For advice about your claim, talk to a licensed public insurance adjuster or an attorney.',
])
