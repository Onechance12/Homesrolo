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

/** /services/roofing: plain-language roofing basics for homeowners. */
export const ROOFING_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'What gets replaced',
    body: Object.freeze([
      'On a full replacement, the crew removes the old roof covering and checks the wood deck underneath. Damaged sheets are replaced before the new underlayment, edge metal, flashing, vents, pipe boots, shingles, and ridge material go on.',
      'The shingles are only one part of the price. Tear-off, labor, roof height, pitch, access, flashing, ventilation, and wood repair can change the total by thousands of dollars.',
    ]),
  },
  {
    heading: 'How roofers measure the job',
    body: Object.freeze([
      'Roofers measure roofs in squares. One square equals 100 square feet of roof surface. The measurement should account for every slope, hip, valley, overhang, and waste factor.',
      'Ask for the number of squares and the measurement report. If two estimates use different quantities, find out why before comparing the totals.',
    ]),
  },
  {
    heading: 'Repair or replace is a condition question',
    body: Object.freeze([
      'Age by itself does not decide whether a roof needs replacement. The location and extent of the problem, earlier repairs, deck condition, remaining matching material, and the cost of a durable repair all matter.',
      'A useful inspection separates observed conditions from conclusions. It identifies the slope or detail involved, shows photographs, explains whether the problem is isolated or repeated, and states what can and cannot be seen without removing material.',
    ]),
  },
  {
    heading: 'What a normal replacement day looks like',
    body: Object.freeze([
      'The property needs room for material delivery, a trailer or dumpster, crew vehicles, and safe access around the house. Roofing creates vibration, falling debris, noise, and thousands of nails, so attic belongings, wall hangings, vehicles, pets, gates, landscaping, and exterior equipment need a plan before tear-off starts.',
      'The homeowner record should show who is supervising the crew, how unexpected wood damage is approved, how the house is protected if weather interrupts the work, and who performs the final cleanup and magnetic nail sweep.',
    ]),
  },
  {
    heading: 'Insurance words that show up on roof paperwork',
    body: Object.freeze([
      'Replacement cost value is the estimated cost to replace damaged property with new material of similar kind and quality. Actual cash value subtracts depreciation. Some policies release recoverable depreciation after the work is finished and documented.',
      'The deductible is the policyholder’s share of the loss. In Texas, a contractor cannot waive, absorb, rebate, or hide it.',
      'Some policies include appraisal as a way to resolve a disagreement over the amount of a loss. The carrier, a licensed public insurance adjuster, or an attorney can answer questions about a particular policy or claim.',
    ]),
  },
  {
    heading: 'What to save when the job is done',
    body: Object.freeze([
      'Keep the signed contract, measurement, permit record, final invoice, proof of payment, product names, color, warranty documents, and photographs from before, during, and after construction.',
      'Write down any deck repairs, ventilation changes, and flashing work. Those details are easy to lose and hard to recreate when the home is sold or the roof needs service years later.',
    ]),
  },
])

/** /services/roofing/cost: how to compare roofing prices. */
export const ROOFING_COST_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Start with the roof measurement',
    body: Object.freeze([
      'The square footage of the house is not the square footage of the roof. Pitch, overhangs, attached garages, hips, valleys, and waste all add material and labor.',
      'A useful estimate states the number of roofing squares and identifies where the measurement came from. Without that number, two prices are difficult to compare.',
    ]),
  },
  {
    heading: 'Why Dallas prices vary so much',
    body: Object.freeze([
      'A one-story shingle roof with easy access is a different job from a steep two-story roof with dormers, several valleys, metal sections, and damaged decking. Both may sit on houses with the same floor area.',
      'Material, height, pitch, access, tear-off layers, wood repair, flashing, ventilation, permits, disposal, and warranty coverage all affect the final price.',
    ]),
  },
  {
    heading: 'What an itemized quote should show',
    body: Object.freeze([
      'Look for tear-off, deck inspection, the price per replacement sheet, underlayment, leak barrier where specified, drip edge, starter, field shingles or panels, hip and ridge material, flashing, pipe boots, ventilation, disposal, permits, and cleanup.',
      'The quote should name the manufacturer and exact product line. Architectural shingle and lifetime roof are broad labels. They do not identify the product being installed.',
    ]),
  },
  {
    heading: 'Compare the same rows',
    body: Object.freeze([
      'Put each bid into the same list and mark every item included, excluded, allowance, or not stated. A lower price may be a good deal. It may also leave out ventilation, new flashing, or the cost of damaged decking.',
      'Save the original bid, signed contract, measurement, product sheets, change orders, invoices, permits, photographs, and warranties in the same home file.',
    ]),
  },
  {
    heading: 'Find the blank checks in the estimate',
    body: Object.freeze([
      'Allowance, as needed, code upgrade, and additional charge are not automatically bad terms, but each one leaves part of the final price open. The proposal should explain the unit price, who documents the need, and who approves the change before that work begins.',
      'Decking is the common example. A bid that includes a price per sheet and a photograph-and-approval process gives the homeowner a way to manage a hidden condition. A bid that only says wood extra does not.',
    ]),
  },
  {
    heading: 'Price and payment schedule are separate decisions',
    body: Object.freeze([
      'Two proposals with the same total can create very different risk. One may tie payments to material delivery, completed work, permit closeout, and warranty delivery. Another may require most of the money before the roof is finished.',
      'The signed agreement should state the deposit, progress payment, final-payment trigger, accepted payment method, financing terms if any, and what must be delivered before the project is considered complete.',
    ]),
  },
])

/** /services/roofing/materials: common steep-slope choices in North Texas. */
export const ROOFING_MATERIALS_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Architectural asphalt shingles',
    body: Object.freeze([
      'Architectural asphalt shingles are common on North Texas homes. Contractors know how to install them, replacement pieces are widely available, and manufacturers offer many colors and product levels.',
      'Products sold as impact resistant do not all perform the same way. Check the exact product against independent hail testing and save the product name with the home record.',
    ]),
  },
  {
    heading: 'Metal roofing',
    body: Object.freeze([
      'Standing-seam panels, exposed-fastener panels, and formed metal shingles are different systems. Seams, fasteners, panel thickness, coatings, maintenance, appearance, and price vary from one system to another.',
      'Hail can dent metal. A dent is an appearance issue unless the impact also affects seams, fasteners, coatings, penetrations, or the roof’s ability to shed water.',
    ]),
  },
  {
    heading: 'Tile, slate, and composite products',
    body: Object.freeze([
      'Concrete tile, clay tile, and natural slate weigh more than asphalt shingles. A change to one of these materials may require a structural review and an installer who regularly works with that system.',
      'Composite slate and shake products vary by manufacturer. Check the product approval, test results, fire rating, installation instructions, and warranty before treating two products as equivalent.',
    ]),
  },
  {
    heading: 'The parts you cannot see from the street',
    body: Object.freeze([
      'Decking, underlayment, flashing, starter, drip edge, vents, pipe boots, and wall transitions handle much of the water and heat management. A roof can use a good shingle and still have poor details underneath it.',
      'During-construction photographs are valuable because these parts disappear once the roof covering is installed.',
    ]),
  },
  {
    heading: 'Impact resistant is a test result, not a damage guarantee',
    body: Object.freeze([
      'UL 2218 classifies products from Class 1 through Class 4 after a controlled steel-ball impact test. That rating can help identify products designed for better impact resistance, but it does not mean a roof is hail proof or predict what one storm will do to one house.',
      'IBHS publishes a separate hail-impact performance rating for asphalt shingles. When hail performance matters, record the exact manufacturer, product line, color, rating source, and installation date instead of saving only the words Class 4.',
    ]),
  },
  {
    heading: 'Choose for repairability and proof, not only day-one appearance',
    body: Object.freeze([
      'Ask how a future repair is made, whether matching pieces are normally available, who in the market services the system, and whether another trade can work around solar panels, gutters, skylights, or mechanical equipment without creating a warranty problem.',
      'Warranty length is not the same as coverage. Product-defect, workmanship, wind, hail, algae, labor, tear-off, disposal, transfer, registration, and maintenance terms can all be different. Save the actual warranty document and registration confirmation, not a brochure headline.',
    ]),
  },
])

/** /services/roofing/choose-a-contractor: neutral contractor due diligence. */
export const ROOFING_CONTRACTOR_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Confirm who is giving you the bid',
    body: Object.freeze([
      'Match the company name on the proposal to a real business, physical address, responsible person, and working contact information. Texas does not issue one statewide government roofing license, although cities may require contractor registration and permits.',
      'Manufacturer certifications and trade-association credentials can add useful information. They do not replace insurance, references, a written scope, or local permit checks.',
    ]),
  },
  {
    heading: 'Check current documents',
    body: Object.freeze([
      'Ask for a current certificate of insurance and confirm it with the issuing agent. Ask for recent local references and examples of roofs similar to yours.',
      'Online reviews can reveal patterns, but they do not prove that insurance is current or that the same crew, material, and scope will be used on your home.',
    ]),
  },
  {
    heading: 'Read the scope before signing',
    body: Object.freeze([
      'The agreement should identify the roof area, tear-off, deck-repair price, exact materials, flashing, ventilation, cleanup, permit responsibility, payment schedule, change-order process, warranties, and cancellation terms.',
      'Put upgrades and promises in writing. A sales conversation is difficult to prove after the crew arrives or the job is finished.',
    ]),
  },
  {
    heading: 'Know the Texas insurance boundary',
    body: Object.freeze([
      'A Texas contractor cannot act as a public insurance adjuster on a claim when the contractor may also perform the work. A contractor also cannot waive, absorb, rebate, or hide an insurance deductible.',
      'The contractor can explain its repair scope and price. Questions about coverage, claim value, or settlement belong with the insurer, a licensed public insurance adjuster, or an attorney.',
    ]),
  },
  {
    heading: 'Find out who will actually install the roof',
    body: Object.freeze([
      'The salesperson, contracting company, project manager, crew leader, and installation crew may be different people or businesses. The agreement should identify the company responsible for the work and give the homeowner one accountable contact for schedule, protection, changes, and cleanup.',
      'Ask how the crew is supervised, how the company checks flashing and ventilation details, and what happens when the roof is left open or a problem is found. A polished sales presentation does not answer those field questions.',
    ]),
  },
  {
    heading: 'Closeout belongs in the agreement',
    body: Object.freeze([
      'Project completion should mean more than the crew leaving. Define the final walkthrough, debris and nail cleanup, permit or inspection record, corrected punch-list items, final invoice, lien releases when applicable, manufacturer registration, and workmanship warranty.',
      'Holding the final record together makes later service simpler. It also gives a future buyer, inspector, or roofer evidence of what was installed instead of a guess based on color and age.',
    ]),
  },
])

/** /services/roofing/dfw: regional roofing information. */
export const ROOFING_DFW_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'North Texas weather belongs in the roof plan',
    body: Object.freeze([
      'Dallas and Fort Worth have hot summers and recurring severe thunderstorms. NOAA’s regional climate summary notes that large hail, damaging wind, flooding, and tornadoes occur nearly every year somewhere in the metroplex.',
      'Ask about impact performance, wind installation details, attic ventilation, repairability, and the exact product being offered. A generic impact-resistant label does not answer those questions.',
    ]),
  },
  {
    heading: 'Check the city for the property',
    body: Object.freeze([
      'Dallas, Fort Worth, Arlington, Plano, Frisco, and neighboring cities set their own permit and contractor-registration rules. The city or jurisdiction for the property determines the process.',
      'The contract should name who handles the permit, which inspections apply, and what happens if tear-off reveals structural work.',
    ]),
  },
  {
    heading: 'Weather data and roof condition are different records',
    body: Object.freeze([
      'A weather report can show that hail or strong wind was observed near an area. It cannot determine the condition of one roof, the cause of a particular mark, or what an insurance policy covers.',
      'Keep dated photographs, inspection records, repair history, product information, and weather records together. Each source answers a different question.',
    ]),
  },
  {
    heading: 'Build a complete roof file',
    body: Object.freeze([
      'Save the measurement, signed contract, permit and inspection records, product delivery information, installation photographs, final invoice, proof of payment, manufacturer registration, and workmanship warranty.',
      'Add notes for deck repairs, ventilation changes, flashing work, and later service calls. That history helps the next contractor, buyer, inspector, or insurer understand the roof.',
    ]),
  },
  {
    heading: 'The first record after a storm is not a sales contract',
    body: Object.freeze([
      'Start with safe, dated observations from the ground and inside the house: water entry, displaced material, fallen limbs, damaged exterior items, and temporary protection. Keep receipts for emergency work and do not climb onto a wet or damaged roof.',
      'A storm date, weather report, contractor inspection, insurer inspection, repair scope, and policy decision are separate records. Keeping them separate prevents one source from being used to claim more than it proves.',
    ]),
  },
  {
    heading: 'A DFW project needs a weather plan before tear-off',
    body: Object.freeze([
      'The schedule should state who watches the forecast, how much roof can be opened at one time, what dry-in standard is used at the end of the day, and who responds if water enters before the project is complete.',
      'Material delivery, neighborhood access, gates, pets, pools, landscaping, solar equipment, and air-conditioning units also need a written plan. These are ordinary project details, but they are where avoidable disputes often begin.',
    ]),
  },
])

/** /services/roofing/dallas: City of Dallas-specific education. */
export const ROOFING_DALLAS_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'Dallas requires a roofing permit',
    body: Object.freeze([
      'The City of Dallas describes a roofing permit as the record that allows a residential or commercial roof to be installed, repaired, or replaced. Check the city’s current requirements and fees for the property before work begins.',
      'The proposal should say who will apply for the permit and which permit or inspection records will be given to the homeowner at closeout.',
    ]),
  },
  {
    heading: 'Make Dallas estimates comparable',
    body: Object.freeze([
      'Published Dallas prices cover a wide range because roof area, pitch, stories, access, materials, tear-off, wood repair, flashing, ventilation, permits, disposal, and warranty coverage vary by job.',
      'Compare the measurement and scope line by line. The lowest total is not meaningful when the bids describe different work.',
    ]),
  },
  {
    heading: 'Collect the closeout package',
    body: Object.freeze([
      'Keep the permit record, inspection or completion record, exact product names, installation photographs, final invoice, proof of payment, and both warranty documents.',
      'A complete closeout package answers the basic questions when the home is sold or the roof needs service later.',
    ]),
  },
  {
    heading: 'Check the permit record before final payment',
    body: Object.freeze([
      'The permit number should match the property and the work described. If an inspection or completion result applies, keep that result with the roof record instead of relying on a verbal statement that the permit was handled.',
      'A permit confirms a local government record and required inspection process. It is not a product warranty, contractor endorsement, or promise that every concealed detail is correct, so the installation photographs and warranties still matter.',
    ]),
  },
])

/** /services/roofing/fort-worth: City of Fort Worth-specific education. */
export const ROOFING_FORT_WORTH_GUIDE: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'The Fort Worth permit rule depends on the work',
    body: Object.freeze([
      'Fort Worth says shingle replacement alone does not require a permit. A permit is required when the work replaces decking, lathing, sheathing, rafters, or ridge boards.',
      'Because damaged wood may not be visible until tear-off, the contract should state the price per replacement sheet, who handles a permit if one becomes necessary, and how the change will be approved.',
    ]),
  },
  {
    heading: 'Ask about the whole roof system',
    body: Object.freeze([
      'Fort Worth’s published roofing guidance addresses underlayment, drip edge, crickets, and roof layers. The proposal should also account for manufacturer installation instructions for the selected product.',
      'A bid that only names the shingles leaves most of the roof assembly unexplained.',
    ]),
  },
  {
    heading: 'Photograph the work in stages',
    body: Object.freeze([
      'Before photographs show the starting condition. During photographs can capture deck repairs, underlayment, flashing, and ventilation before they are covered. After photographs show the completed roof and cleanup.',
      'Keep those images with the invoice, permit record, product information, and warranties.',
    ]),
  },
  {
    heading: 'Treat discovered decking as a documented change',
    body: Object.freeze([
      'The starting contract should state a unit price for deck replacement. When damaged wood is exposed, the useful record shows its location and condition, the quantity proposed for replacement, the homeowner approval, and the permit response before the work is covered.',
      'The final invoice and project photographs should agree on the quantity replaced. This turns a common hidden condition into a traceable project decision rather than a surprise line at the end.',
    ]),
  },
])

export type RoofingQuestion = {
  readonly question: string
  readonly answer: string
  readonly href?: string
  readonly source?: string
}

/** Short answers are easy for homeowners and search tools to quote accurately. */
export const ROOFING_QUICK_ANSWERS: readonly RoofingQuestion[] = Object.freeze([
  {
    question: 'How much does a roof replacement cost in Dallas?',
    answer: 'Angi’s Dallas data, updated in August 2026, reports an average of $10,054 and a typical range of $5,960 to $14,203. Roof size, material, pitch, access, tear-off, wood repair, flashing, ventilation, permits, and warranty coverage can move a real bid outside that range.',
    href: 'https://www.angi.com/articles/how-much-does-roof-replacement-cost/tx/dallas',
    source: 'Angi Dallas cost guide',
  },
  {
    question: 'Does Texas require a roofing contractor license?',
    answer: 'Texas does not issue one statewide government roofing license. Local registration and permit rules may still apply, and voluntary manufacturer or trade-association certifications are separate from government licensing.',
    href: 'https://www.rcat.net/',
    source: 'Roofing Contractors Association of Texas',
  },
  {
    question: 'Does a roof replacement need a permit in DFW?',
    answer: 'It depends on the city. Dallas treats roof installation, repair, and replacement as permitted work. Fort Worth does not require a permit for shingle replacement alone, but it does when decking or roof-structure material is replaced.',
    href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information',
    source: 'City of Fort Worth',
  },
  {
    question: 'What should a roofing estimate include?',
    answer: 'A clear estimate states the measured roof area, tear-off, wood-repair price, exact materials, flashing, ventilation, disposal, cleanup, permit responsibility, payment schedule, change-order process, and warranties.',
  },
  {
    question: 'Can a Texas roofer negotiate an insurance claim?',
    answer: 'A contractor may explain its repair scope and price. Texas does not allow a contractor to act as a public insurance adjuster on a claim when the contractor may also perform the work.',
    href: 'https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html',
    source: 'Texas Department of Insurance',
  },
  {
    question: 'Does a Class 4 shingle mean the roof is hail proof?',
    answer: 'No. Class 4 is the highest classification in the UL 2218 controlled impact test. It identifies a tested level of impact resistance, but it does not guarantee that the shingle or roof will avoid damage in a real hailstorm.',
    href: 'https://ibhs.org/roof-101/',
    source: 'Insurance Institute for Business & Home Safety',
  },
  {
    question: 'What roof documents matter when selling a house?',
    answer: 'Keep the installation date, signed contract, final invoice, permit and inspection record, exact product and color, before-and-after photographs, deck-repair history, proof of payment, and transferable manufacturer and workmanship warranties.',
  },
  {
    question: 'Can a weather report prove that one roof has hail damage?',
    answer: 'No. A weather report can document conditions observed near an area and time. It does not inspect one property, identify the cause of one mark, determine the repair scope, or interpret what an insurance policy covers.',
  },
  {
    question: 'What is the difference between a material warranty and a workmanship warranty?',
    answer: 'A material warranty generally addresses qualifying product defects under the manufacturer terms. A workmanship warranty comes from the installer and addresses covered installation errors. Terms, exclusions, registration, transfer, labor, and duration can differ, so keep both actual documents.',
  },
])

export const ABOUT_HOMESROLO: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'The idea behind Homesrolo',
    body: Object.freeze([
      'A house can go through several owners and dozens of projects, but its records are usually scattered across inboxes, filing cabinets, contractors, and insurance files. Homesrolo gives the property one organized history that can stay with it.',
      'The homeowner controls the private file. Public company information and educational guides are kept separate from private home records.',
    ]),
  },
  {
    heading: 'Why roofing comes first',
    body: Object.freeze([
      'Roofing combines a large purchase, technical construction details, local permit rules, severe-weather exposure, warranties, and sometimes an insurance claim. Homeowners are often asked to make decisions before they know which questions to ask.',
      'Homesrolo starts by making those questions, sources, and records easier to understand. The same approach can later extend to other major home systems.',
    ]),
  },
  {
    heading: 'How the directory is meant to work',
    body: Object.freeze([
      'A useful company listing shows separate facts with a source and date. Business identity, insurance, local registration, project history, and review provenance should not collapse into one badge.',
      'Payment cannot change a company’s facts or position in neutral results. Real public listings will not open until their data and correction process are ready.',
    ]),
  },
])

export const EDITORIAL_STANDARDS: readonly EducationalSection[] = Object.freeze([
  {
    heading: 'How a guide is researched',
    body: Object.freeze([
      'We start with government agencies, local permit authorities, building-science organizations, trade groups, and manufacturer documents. Market-price sources are named and dated because their methods and results differ.',
      'The source list appears on the same page as the guide. Legal and permit statements link to the issuing authority whenever a usable public source is available.',
    ]),
  },
  {
    heading: 'What we do with estimates and opinions',
    body: Object.freeze([
      'Published cost figures are benchmarks, not bids for a particular home. We identify the publisher and date and explain the scope variables that can change the number.',
      'Homesrolo does not turn a manufacturer claim, trade credential, star rating, or weather report into a broader conclusion than the source supports.',
    ]),
  },
  {
    heading: 'How pages are updated',
    body: Object.freeze([
      'Each roofing guide shows the date of its latest substantive update. Dates are not changed just to make an old page look new.',
      'Permit rules, pricing, products, and warranties can change. Source links remain visible so a reader can check the current record.',
    ]),
  },
  {
    heading: 'Commercial separation',
    body: Object.freeze([
      'No contractor, manufacturer, insurer, or advertiser paid to be cited in these guides. A citation identifies a source; it is not an endorsement.',
      'If Homesrolo later offers sponsored placement, it will be labeled and kept out of neutral company ordering and verification facts.',
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
