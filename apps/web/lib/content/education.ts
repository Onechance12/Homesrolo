/**
 * Educational copy, exported as data so it can be audited.
 *
 * Every string here is passed through the repository's constitutional response
 * auditor in `lib/directory/tests/directory.test.ts`. Copy that would cross a
 * boundary fails the build rather than reaching a homeowner, which is the only
 * way a rule about wording survives contact with marketing.
 *
 * The line, restated: explain how something works in general, never tell a
 * specific person what to do about their own matter.
 */

/** Shown on every educational surface. Mirrors REQUIRED_DISCLOSURES. */
export const CONSTITUTION_DISCLOSURES: readonly string[] = Object.freeze([
  'Homesrolo is not an insurance company, not a public insurance adjuster, and not a law firm.',
  'Homesrolo explains how things work. It does not advise you on your own claim, your policy, or your settlement.',
  'For advice about your claim, talk to a licensed public insurance adjuster or an attorney.',
])

export const LISTING_NOT_ENDORSEMENT =
  'A listing is information, not an endorsement or a recommendation. Homesrolo does not rank companies by '
  + 'payment and does not tell you which company to choose.'

export type EducationalSection = {
  readonly heading: string
  readonly body: readonly string[]
}

/** /services/roofing — a general guide, not advice about anyone's own roof. */
export const ROOFING_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'What a roof replacement usually involves',
    body: Object.freeze([
      'A replacement generally means removing the existing covering down to the deck, repairing any damaged '
        + 'sheathing, then rebuilding the assembly: underlayment, flashing at every penetration and wall, drip '
        + 'edge, the covering itself, and ridge ventilation.',
      'Most of the cost sits in labour and tear-off rather than the shingle. That is why two quotes for the same '
        + 'house can differ substantially while both describe real work.',
    ]),
  },
  {
    heading: 'How estimates are typically structured',
    body: Object.freeze([
      'Restoration estimates are usually built from line items: a quantity, a unit, and a unit price, plus '
        + 'overhead and profit. Roofing quantities are measured in squares, where one square is one hundred '
        + 'square feet.',
      'Two documents describing the same roof can differ because they assume different amounts of tear-off, '
        + 'different flashing work, or different ventilation. Comparing line items rather than totals is what '
        + 'makes the difference visible.',
    ]),
  },
  {
    heading: 'Terms that appear on roofing paperwork',
    body: Object.freeze([
      'Replacement cost value is what it would cost to replace property with new material of like kind and '
        + 'quality. Actual cash value is that amount minus depreciation. Recoverable depreciation is the portion '
        + 'some carriers release after work is completed and documented.',
      'A deductible is the amount a policyholder is responsible for. Any offer to absorb, rebate, or hide it is '
        + 'treated as fraud in many states and is a warning sign about the company making the offer.',
      'Appraisal is a process some policies provide for resolving a dispute about the amount of a loss. Whether '
        + 'it applies to any particular situation is a question for the carrier or a licensed professional.',
    ]),
  },
  {
    heading: 'What tends to be worth recording',
    body: Object.freeze([
      'Dated photographs before and after, the material brand and product line, the underlayment type, the '
        + 'ventilation installed, who performed the work, and both the workmanship and manufacturer warranty '
        + 'documents.',
      'These are the details that are hard to reconstruct years later and that a future owner, inspector, or '
        + 'insurer will ask about. Accurate documentation is what holds up.',
    ]),
  },
])

/** /how-it-works — the Home Project Passport explained. */
export const HOW_IT_WORKS_STEPS: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Work happens, and a record exists',
    body: Object.freeze([
      'A company completes real work on a home and records what was done: materials, dates, who performed it, '
        + 'warranty documents, and photographs.',
    ]),
  },
  {
    heading: 'The homeowner decides what to release',
    body: Object.freeze([
      'Nothing becomes public because work happened. A homeowner reviews the record and releases the parts they '
        + 'choose. An unreleased record stays private, and its existence is not published either.',
    ]),
  },
  {
    heading: 'The released record becomes a passport entry',
    body: Object.freeze([
      'A released project carries its own provenance: what was done, by whom, with which materials, and when. '
        + 'That is what makes it evidence rather than a claim.',
    ]),
  },
  {
    heading: 'The passport outlives the job and the owner',
    body: Object.freeze([
      'The home keeps its record. Access changes over time and is always controlled, but the underlying history '
        + 'of the property is durable rather than scattered across companies that may no longer exist.',
    ]),
  },
])

/** /how-we-verify — what a fact means and what it does not. */
export const VERIFY_PRINCIPLES: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Facts, never one badge',
    body: Object.freeze([
      'Homesrolo publishes no overall verified badge. Business identity, licence and jurisdiction, insurance, '
        + 'project proof, and review provenance are checked and displayed separately, because a company can be '
        + 'solid on one and silent on another.',
      'Every fact states its status, where it came from, and when it was checked. A status with no source and no '
        + 'date is a rumour with a badge on it.',
    ]),
  },
  {
    heading: 'Checked when, not checked forever',
    body: Object.freeze([
      'Insurance lapses and licences expire. A fact carries the date Homesrolo looked and, where the underlying '
        + 'record has its own period, the date that record speaks to. Once an expiry passes, the fact displays as '
        + 'expired regardless of what it said before.',
    ]),
  },
  {
    heading: 'Self-reported is a real source, labelled as one',
    body: Object.freeze([
      'Some facts come from the company. That is legitimate and is never displayed as confirmation. The source '
        + 'label distinguishes what a registry showed from what a business told us.',
    ]),
  },
  {
    heading: 'Verification is never for sale',
    body: Object.freeze([
      'No payment, sponsorship, or advertising relationship can create, upgrade, or accelerate a fact. Listings '
        + 'are ordered by name, and the ordering never reads verification status, so checking a credential cannot '
        + 'move a company up the page. If sponsored placement ever exists, it will be labelled and kept out of '
        + 'neutral ordering.',
    ]),
  },
  {
    heading: 'What Homesrolo does not do',
    body: Object.freeze([
      'Homesrolo does not copy or republish content from other review sites. Where a company links to an outside '
        + 'profile, the link is attributed and the content stays on the source.',
      'Homesrolo does not recommend individual companies, does not sell leads, and does not accept payment to '
        + 'influence what a listing says.',
    ]),
  },
])

/** /professionals and /companies/[slug] — how to read a listing. */
export const READING_A_LISTING: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'How to read these listings',
    body: Object.freeze([
      'Read the facts, not an overall impression. Each dimension is independent, and a gap in one is not a '
        + 'verdict on the rest.',
      'Check the dates. A confirmed fact from last year is a statement about last year.',
      'Licensing rules differ by state and by trade. What a licence covers where you live is a question for the '
        + 'issuing authority.',
    ]),
  },
])

/** /ideas — inspiration boards, described without pretending they exist. */
export const IDEAS_INTRO: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Inspiration grounded in real work',
    body: Object.freeze([
      'Most inspiration collections show a photograph with no idea what it cost, what material it used, or '
        + 'whether it lasted. A released project entry carries the material, the date, and the work performed, so '
        + 'a saved idea can be traced to something real.',
      'Boards are not built. When they are, the intent is to assemble them only from projects a homeowner chose '
        + 'to release, and never from images collected from other sites.',
    ]),
  },
])

/** /for-professionals — what a company gets, stated without promises. */
export const FOR_PROFESSIONALS: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Your work becomes a record you do not own alone',
    body: Object.freeze([
      'When a homeowner releases a project, the record carries who performed the work. It stays attached to the '
        + 'home rather than living only in your files, and it remains after a job closes.',
    ]),
  },
  {
    heading: 'Proof instead of adjectives',
    body: Object.freeze([
      'The intent is that a released project becomes a stronger statement than a marketing claim, because it '
        + 'names materials, dates, and the homeowner who chose to release it. Project proof is designed to be the '
        + 'one dimension a company cannot assert about itself. The release and checking flow is not built yet.',
    ]),
  },
  {
    heading: 'What Homesrolo will not sell you',
    body: Object.freeze([
      'No paid placement, no ranking boost, no purchased verification, and no leads. Ordering is by name and '
        + 'reads nothing else. If sponsored placement ever exists, it will be labelled and kept out of neutral '
        + 'ordering.',
    ]),
  },
])
