/**
 * Homesrolo Academy credentials, V1 contract.
 *
 * BBB accreditation is bought. Angi placement is bought. Whatever those badges
 * once signalled, a homeowner now correctly reads them as "this company spent
 * money", which is worth nothing as a signal about the work.
 *
 * A credential here is *earned*: coursework, an assessment, and a standing
 * conduct condition, with an expiry so it stays a statement about the present.
 * Two structural rules make that real rather than aspirational:
 *
 *   1. A credential cannot be purchased. There is no price field, no
 *      sponsorship field, and no path from payment to award. Enrolment fees may
 *      exist to run the programme, but paying one buys a seat, never a pass.
 *
 *   2. A credential cannot buy placement. Ordering reads name and slug only, so
 *      completing coursework never moves a company up a list. Otherwise the
 *      Academy becomes a paid ranking product wearing an educational hat, which
 *      is precisely the thing this is meant to replace.
 *
 * What a credential is NOT, stated in the model because it will be misread
 * otherwise: it is not a licence, not a substitute for one, not a guarantee of
 * workmanship, and not an endorsement.
 */

import { z } from 'zod'

export const CREDENTIAL_CONTRACT_VERSION = 'academy-credential.v1' as const

/**
 * The curriculum. Chosen for the failure modes that actually harm homeowners
 * and sink contractors, rather than for what is easy to teach.
 */
export const ACADEMY_COURSES = Object.freeze([
  {
    id: 'ethics-consumer-protection',
    title: 'Ethics and consumer protection',
    hours: 6,
    renewalYears: 2,
    why: 'Deductible handling, high-pressure closes, door-knocking rules, and honest scope representation. '
      + 'Most contractors who get into trouble here did not set out to; they copied a practice from someone else.',
    covers: Object.freeze([
      'Why absorbing, rebating, or concealing a deductible is treated as fraud in many states',
      'Contract cancellation rights and cooling-off periods',
      'Representing scope, materials, and timelines accurately in writing',
      'High-pressure and door-to-door sales rules after a storm',
    ]),
  },
  {
    id: 'claim-boundaries',
    title: 'Insurance claim boundaries for contractors',
    hours: 5,
    renewalYears: 2,
    why: 'Where the line sits between documenting your own work and negotiating a claim, which is licensed '
      + 'activity in most states. This is the single most common way a good roofing company acquires a '
      + 'regulatory problem.',
    covers: Object.freeze([
      'What public adjusting is, and why it requires a licence',
      'Documenting work performed without advising on coverage or settlement',
      'Why "we handle the insurance for you" is a dangerous sentence',
      'Referring a homeowner to a licensed professional without steering for value',
    ]),
  },
  {
    id: 'money-management',
    title: 'Money management and cash flow',
    hours: 8,
    renewalYears: 3,
    why: 'Most contractors who fail are profitable on paper. Deposit discipline, job costing, and retainage '
      + 'are what turn a busy year into a solvent one.',
    covers: Object.freeze([
      'Job costing that separates gross margin from net',
      'Deposit, draw, and retainage schedules that keep a job funded',
      'Reading a cash-flow forecast and spotting a squeeze early',
      'Reserving for warranty callbacks and tax',
    ]),
  },
  {
    id: 'estimating-scope',
    title: 'Estimating and scope documentation',
    hours: 6,
    renewalYears: 3,
    why: 'A disputed job is usually a documentation problem wearing a quality complaint. Line items, '
      + 'quantities, and photographs settle arguments before they start.',
    covers: Object.freeze([
      'Building an estimate from line items, quantities, and unit prices',
      'Documenting existing conditions before work begins',
      'Change orders that survive a disagreement',
      'Measuring and stating quantities consistently',
    ]),
  },
  {
    id: 'warranty-handover',
    title: 'Warranty, documentation, and handover',
    hours: 4,
    renewalYears: 3,
    why: 'The details a homeowner needs five years later are the ones nobody writes down on the last day of '
      + 'a job. This is also what makes a released project record worth releasing.',
    covers: Object.freeze([
      'What a workmanship warranty should say and for how long',
      'Registering manufacturer warranties correctly',
      'Assembling a handover pack a future owner can actually use',
      'Handling a callback without losing the customer',
    ]),
  },
  {
    id: 'communication-scheduling',
    title: 'Communication and scheduling',
    hours: 4,
    renewalYears: 3,
    why: 'Across review data generally, schedule and communication complaints outnumber workmanship '
      + 'complaints. They are also the cheapest to fix.',
    covers: Object.freeze([
      'Setting and resetting expectations when weather moves a job',
      'Who calls the homeowner, and when',
      'De-escalating a complaint before it becomes a review',
      'Written confirmation habits that prevent disputes',
    ]),
  },
] as const)

export type AcademyCourseId = (typeof ACADEMY_COURSES)[number]['id']

export const ACADEMY_COURSE_IDS: readonly AcademyCourseId[] =
  Object.freeze(ACADEMY_COURSES.map(course => course.id))

/**
 * How a credential is obtained. Every step is something the company does; none
 * of them is something the company buys.
 */
export const HOW_A_CREDENTIAL_IS_EARNED: readonly string[] = Object.freeze([
  'Complete the coursework. Hours are tracked per module, not self-attested.',
  'Pass a written assessment. A resit is allowed; a purchase is not.',
  'Agree to the conduct standard the course teaches, in writing.',
  'Keep it current. Every credential expires and must be re-earned, because a course taken in 2026 says '
    + 'nothing about conduct in 2031.',
  'Maintain standing. A credential can be suspended or withdrawn on a substantiated conduct finding, and '
    + 'the withdrawal is shown rather than quietly deleted.',
])

export const CREDENTIAL_STATES = Object.freeze([
  'earned',
  'expired',
  'suspended_pending_review',
  'withdrawn',
] as const)

export type CredentialState = (typeof CREDENTIAL_STATES)[number]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const academyCredentialSchema = z.object({
  contractVersion: z.literal(CREDENTIAL_CONTRACT_VERSION),
  credentialId: z.string().regex(SLUG),
  companySlug: z.string().regex(SLUG),
  courseId: z.enum(ACADEMY_COURSE_IDS as unknown as [AcademyCourseId, ...AcademyCourseId[]]),
  state: z.enum(CREDENTIAL_STATES),
  /** Date the assessment was passed. Not the date a fee was paid. */
  earnedOn: z.string().regex(ISO_DATE),
  expiresOn: z.string().regex(ISO_DATE),
  /** Hours actually completed, so a credential shows its own weight. */
  hoursCompleted: z.number().int().min(1).max(200),
  assessmentScore: z.number().int().min(0).max(100),
  /** Required whenever standing is anything other than earned. */
  stateReason: z.string().min(12).max(300).optional(),
  isSynthetic: z.literal(true),
}).strict()

export type AcademyCredential = z.infer<typeof academyCredentialSchema>

/** The passing mark. Public, fixed, and the same for everyone. */
export const ASSESSMENT_PASS_MARK = 80

export function parseAcademyCredential(input: unknown): AcademyCredential {
  const credential = academyCredentialSchema.parse(input)

  if (credential.expiresOn <= credential.earnedOn) {
    throw new Error('A credential must expire after it was earned')
  }
  if (credential.state === 'earned' && credential.assessmentScore < ASSESSMENT_PASS_MARK) {
    throw new Error(`A credential cannot be held with an assessment below ${ASSESSMENT_PASS_MARK}`)
  }
  if (credential.state !== 'earned' && !credential.stateReason) {
    throw new Error('A credential that is not in good standing must say why')
  }
  return credential
}

/** Expiry beats stored state, exactly as it does for a verification fact. */
export function effectiveCredentialState(credential: AcademyCredential, today: string): CredentialState {
  if (credential.state === 'earned' && credential.expiresOn < today) return 'expired'
  return credential.state
}

export function findCourse(courseId: AcademyCourseId) {
  return ACADEMY_COURSES.find(course => course.id === courseId)
}

/**
 * Stated on every surface that shows a credential. A credential says what was
 * studied and passed. It does not say the work will be good, and it is not a
 * licence.
 */
export const CREDENTIAL_LIMITS: readonly string[] = Object.freeze([
  'A credential records completed coursework and a passed assessment. It is not a licence and does not '
    + 'replace one; licensing is issued by a state or local authority, not by Homesrolo.',
  'It is not a guarantee of workmanship, a warranty, or an endorsement, and it does not predict how any '
    + 'particular job will go.',
  'It cannot be bought. Enrolment fees pay for running the programme; they never purchase a pass, and no '
    + 'payment of any kind can award, restore, or extend a credential.',
  'It does not affect a company’s position in any list on Homesrolo. Ordering reads name only.',
  'It expires. A credential that has lapsed is shown as lapsed rather than quietly removed.',
])

/**
 * The commercial rules, exported so tests can pin them. If any of these ever
 * becomes false, the Academy has turned into the thing it was built to replace.
 */
export const ACADEMY_COMMERCIAL_RULES = Object.freeze({
  credentialIsPurchasable: false,
  paymentCanAwardCredential: false,
  paymentCanRestoreCredential: false,
  credentialAffectsOrdering: false,
  credentialAffectsVerificationFacts: false,
  sponsorshipCanCreateCourse: false,
  assessmentPassMarkIsUniform: true,
} as const)
