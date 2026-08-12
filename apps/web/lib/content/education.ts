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

/** /services/roofing/cost — a transparent way to read prices, not a quote. */
export const ROOFING_COST_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Start with roof area, not house area',
    body: Object.freeze([
      'Roofing is commonly measured in squares. One square is one hundred square feet of roof surface. A home’s floor area is not its roof area: pitch, overhangs, attached garages, hips, valleys, and waste all change the quantity.',
      'A price that does not state the measured roof area leaves no reliable way to compare it with another price. The useful starting line is the number of squares and the measurement report or diagram behind that number.',
    ]),
  },
  {
    heading: 'Why Dallas prices cover such a wide range',
    body: Object.freeze([
      'Published Dallas cost data spans a wide range because the word roof describes very different assemblies. Material, pitch, height, access, tear-off layers, decking repairs, flashing, ventilation, permits, disposal, and warranty terms can each move the total.',
      'A simple one-story architectural-shingle roof and a steep two-story roof with dormers, valleys, metal sections, and extensive decking replacement are not comparable projects even when the houses have similar floor area.',
    ]),
  },
  {
    heading: 'The line items that make a quote readable',
    body: Object.freeze([
      'A useful scope identifies tear-off, deck inspection and the unit price for replacement sheets, underlayment, ice or water membrane where specified, drip edge, starter, field shingles or panels, hip and ridge material, flashing, pipe boots, ventilation, disposal, permits, and cleanup.',
      'It also identifies the exact manufacturer and product line. Phrases such as architectural shingle or lifetime roof describe categories or marketing terms, not a complete material specification.',
    ]),
  },
  {
    heading: 'A practical comparison method',
    body: Object.freeze([
      'Put competing bids into the same rows before comparing totals. Mark an item as included, excluded, allowance, or not stated. A lower total can reflect a real efficiency, but it can also reflect missing ventilation, reused flashing, an undefined shingle, or no price for damaged decking.',
      'Record the proposal, measurement, product data, change orders, final invoice, photographs, permit information, and warranties together. That record explains the price long after the sales conversation is forgotten.',
    ]),
  },
])

/** /services/roofing/materials — common steep-slope choices for North Texas. */
export const ROOFING_MATERIALS_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Architectural asphalt shingles',
    body: Object.freeze([
      'Architectural asphalt shingles are the common baseline for steep-slope residential roofs. They are widely available, familiar to installers, and offered in many product tiers. The exact product, fastening pattern, underlayment, flashing, and ventilation matter as much as the broad material name.',
      'Impact-resistant labeling is not one uniform level of real-world performance. Independent hail testing can separate products that carry similar marketing language, and the product name needs to be recorded for any later comparison.',
    ]),
  },
  {
    heading: 'Standing-seam and formed metal',
    body: Object.freeze([
      'Residential metal roofing includes standing-seam panels, exposed-fastener panels, and formed metal shingles. These systems differ in seams, fasteners, coatings, details, maintenance, and price, so metal roof is not a complete specification.',
      'Hail may leave visible dents in metal without creating the same damage mode seen in asphalt shingles. Appearance, water shedding, panel thickness, coating, and the details at penetrations are separate questions.',
    ]),
  },
  {
    heading: 'Tile, slate, and synthetic products',
    body: Object.freeze([
      'Concrete or clay tile and natural slate are heavier than asphalt systems and can require confirmation that the structure is suitable for the load. They also require installers and repair methods familiar with the specific system.',
      'Synthetic slate, shake, and composite products vary widely by manufacturer. Product approvals, impact testing, fire classification, installation instructions, and warranty exclusions are more useful than the category name alone.',
    ]),
  },
  {
    heading: 'The assembly below the visible material',
    body: Object.freeze([
      'The roof covering is only the visible layer. Decking condition, underlayment, flashing, starter, edge metal, ventilation, penetrations, and transitions determine how the assembly handles water and heat.',
      'The durable home record therefore stores both the covering and the hidden assembly: exact products, installation date, photographs before the covering went down, and warranty documents.',
    ]),
  },
])

/** /services/roofing/choose-a-contractor — neutral due-diligence education. */
export const ROOFING_CONTRACTOR_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Verify identity before comparing promises',
    body: Object.freeze([
      'A company name, physical address, responsible person, and consistent contact information establish who is making the proposal. Texas does not use one statewide government roofing licence as a universal quality screen, while local contractor registration and permit rules can still apply.',
      'Trade-association credentials and manufacturer designations can add information, but they are not substitutes for confirming identity, insurance, references, and the local permit path.',
    ]),
  },
  {
    heading: 'Ask for evidence that can be checked',
    body: Object.freeze([
      'Useful evidence includes a current certificate of insurance that can be confirmed with the issuer, recent local references, a written scope, exact products, a payment schedule, workmanship terms, manufacturer warranty requirements, and the name of the party responsible for permits.',
      'A review score describes past reviewers. It does not prove current insurance, the crew assigned to a home, the material that will arrive, or the scope in a particular contract. Those facts need their own sources and dates.',
    ]),
  },
  {
    heading: 'Read the contract as a construction record',
    body: Object.freeze([
      'A readable agreement identifies the roof area, tear-off, deck-repair price, each material system, flashing and ventilation work, cleanup, permit responsibility, start or scheduling terms, payment milestones, change-order process, warranties, and cancellation terms.',
      'Verbal upgrades and assurances are difficult to verify later. When a detail matters, its value comes from being written into the scope and preserved with the final project record.',
    ]),
  },
  {
    heading: 'Texas insurance boundaries matter',
    body: Object.freeze([
      'Texas prohibits a contractor from acting as a public insurance adjuster on a claim when the contractor may also perform the work. Texas also prohibits waiving, absorbing, rebating, or hiding an insurance deductible.',
      'A contractor can explain its own repair scope and price. Advice or representation about policy coverage, claim value, or settlement belongs to the insurer, a licensed public insurance adjuster, or an attorney, depending on the question.',
    ]),
  },
])

/** /services/roofing/dfw — regional roofing context that is actually local. */
export const ROOFING_DFW_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'North Texas weather changes the material conversation',
    body: Object.freeze([
      'Dallas–Fort Worth has hot summers and recurring severe thunderstorms. Large hail, damaging wind, flooding, and tornadoes occur in the region, although no single property experiences every event. Roofing choices therefore involve impact performance, wind details, heat, ventilation, and repairability rather than color alone.',
      'A label such as impact resistant is a starting point. The exact product and independent test result provide more information than the label by itself.',
    ]),
  },
  {
    heading: 'There is no single DFW permit rule',
    body: Object.freeze([
      'Dallas, Fort Worth, Arlington, Plano, Frisco, and the other cities in the metroplex administer their own permit and contractor-registration rules. The rule attached to the property address controls; a practice that is normal in one city may not be the process in the next.',
      'Permit responsibility, required inspections, and any work that triggers structural review belong in the written scope before construction begins.',
    ]),
  },
  {
    heading: 'A storm date is not a roof diagnosis',
    body: Object.freeze([
      'A weather report can establish that hail or wind was observed near an area. It cannot establish the condition of one roof, what caused a mark, or what a policy covers. Those are separate evidence questions.',
      'Dated property photographs, inspection records, repair history, product information, and weather records become more useful when preserved together without turning one source into a conclusion it cannot support.',
    ]),
  },
  {
    heading: 'The DFW roof file that remains useful',
    body: Object.freeze([
      'Keep the measurement, signed scope, permit and inspection record, product delivery information, installation photographs, final invoice, proof of payment, manufacturer registration, and workmanship warranty.',
      'Also record deck repairs, ventilation changes, flashing details, and any later service visit. Those details help a future contractor, buyer, inspector, or insurer understand what actually exists on the home.',
    ]),
  },
])

/** /services/roofing/dallas — City of Dallas-specific education. */
export const ROOFING_DALLAS_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Dallas treats roof replacement as permitted work',
    body: Object.freeze([
      'The City of Dallas describes a roofing permit as the record that allows installation, repair, or replacement of a residential or commercial roof. Current requirements and fees belong to the city record for the property, not to a generic metroplex rule.',
      'A proposal is clearer when it names who will apply, how the permit will be documented, and which inspection or closeout record will be delivered to the homeowner.',
    ]),
  },
  {
    heading: 'Price comparisons need a Dallas-ready scope',
    body: Object.freeze([
      'Published Dallas price ranges are broad. Roof area, pitch, stories, access, material, tear-off, deck repair, flashing, ventilation, permits, disposal, and warranty coverage explain much of that spread.',
      'Comparing the same scope rows is more reliable than comparing totals from proposals that describe different work.',
    ]),
  },
  {
    heading: 'Keep the closeout evidence',
    body: Object.freeze([
      'The useful final file includes the permit record, inspection or completion evidence, exact product, installation photographs, final invoice, proof of payment, and both warranty documents.',
      'That file is the answer when a later buyer, contractor, inspector, or insurer asks when the roof changed and what was installed.',
    ]),
  },
])

/** /services/roofing/fort-worth — City of Fort Worth-specific education. */
export const ROOFING_FORT_WORTH_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Fort Worth separates shingle work from structural roof work',
    body: Object.freeze([
      'Fort Worth states that shingle replacement alone does not require a permit, while replacement of decking, lathing, sheathing, rafters, or ridge boards does. A project can therefore cross the permit line after tear-off reveals damaged decking.',
      'The written scope benefits from naming who handles that change, what each replacement sheet costs, and how any required permit will be documented.',
    ]),
  },
  {
    heading: 'Local roof details are not generic',
    body: Object.freeze([
      'Fort Worth’s published roofing information addresses underlayment, drip edge, crickets, roof layers, and other assembly details. Those requirements and the manufacturer instructions need to be reconciled for the actual roof system.',
      'A proposal that lists only shingles leaves the hidden assembly unresolved.',
    ]),
  },
  {
    heading: 'Preserve the before, during, and after record',
    body: Object.freeze([
      'Before photographs show the starting condition. During photographs can show deck repairs, underlayment, flashing, and ventilation before they are covered. After photographs, invoices, permit records, and warranties show how the project closed.',
      'Stored together, those records remain useful long after a text thread or sales conversation disappears.',
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
