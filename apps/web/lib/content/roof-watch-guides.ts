/**
 * Roof Watch guides. Claims about insurance, law, safety, products, weather, or
 * roof performance need a source below and must stay within the education-only
 * boundary in the Homesrolo constitution.
 */
export type RoofWatchSource = {
  readonly label: string
  readonly href: string
  readonly publisher: string
}

export type RoofWatchGuide = {
  readonly slug: string
  readonly title: string
  readonly metaTitle: string
  readonly description: string
  readonly eyebrow: string
  readonly datePublished: string
  readonly dateModified: string
  readonly sections: readonly { heading: string; body: readonly string[] }[]
  readonly sources: readonly RoofWatchSource[]
}

export const ROOF_WATCH_GUIDES: readonly RoofWatchGuide[] = [
  {
    slug: 'hail-first-72-hours',
    title: 'Hail just hit your neighborhood. Here is what to do next.',
    metaTitle: 'What to do after hail hits your home',
    description: 'A practical North Texas checklist for staying safe, documenting damage, contacting your insurer, and dealing with contractors after hail.',
    eyebrow: 'Storm checklist',
    datePublished: '2026-08-20',
    dateModified: '2026-08-20',
    sections: [
      { heading: 'Start on the ground', body: [
        'Wait until the storm has passed and keep people and pets away from broken glass, fallen limbs, loose materials, and downed lines. Do not climb onto a wet or damaged roof. If water is entering the house, protect the area only when it is safe to do so and keep receipts for temporary repairs.',
        'From the ground, photograph the conditions around the house: hail next to a ruler or another object of known size, damaged screens, dented gutters or downspouts, fallen branches, and visible exterior damage. Photograph the wider scene as well as close details. Keep the original files and note the time and location; do not rely on an automatic timestamp as the only record.',
      ]},
      { heading: 'Contact the insurer promptly when damage is possible', body: [
        'If your home is damaged or you reasonably suspect damage, review the policy and contact the insurance company promptly. The Texas Department of Insurance tells homeowners to file as soon as possible after hail or wind damage. Policy duties and deadlines vary, so a contractor inspection should not delay notice to the insurer.',
        'Give the insurer the facts you can observe and ask what documentation and temporary repairs it requires. A roof inspection may add useful photos and condition notes, but the contractor does not decide coverage or claim value.',
      ]},
      { heading: 'Read before you sign', body: [
        'Storms bring both established local contractors and companies that are new to the area. Get business information and references, compare more than one written bid when conditions allow, and do not sign a document with blank spaces. Do not pay the full job price before the work is complete.',
        'Read any inspection authorization or contingency agreement before signing it. Confirm whether it is only permission to inspect or a contract that commits you to future work. A legitimate emergency can require quick action; the paperwork should still say exactly what you are authorizing.',
      ]},
      { heading: 'What a Texas roofer can—and cannot—do on your claim', body: [
        'Texas does not allow a roofer or contractor who may do the repair work to act as the homeowner’s public insurance adjuster on that claim. A contractor also cannot waive, rebate, or absorb the insurance deductible. Be cautious when someone offers to file or negotiate the claim for you, promises a particular insurance result, or says the deductible can disappear.',
        'Roof Watch documents visible roof condition. It does not file claims, negotiate coverage, or represent homeowners to insurers. Questions about a claim belong with the insurer, a licensed public adjuster, or an attorney as appropriate.',
      ]},
      { heading: 'A prior report gives you a useful comparison', body: [
        'Dated roof photos from before a storm may help the professionals involved compare earlier condition with what is visible now. They do not prove the cause of damage or guarantee coverage. Their value is that everyone can discuss the same locations and the same record.',
        'Roof Watch is designed to create that kind of annual written record. Text ROOF WATCH, your city, and your ZIP to (817) 886-2418 to check current availability and receive the program limits before scheduling.',
      ]},
    ],
    sources: [
      { label: 'What to do after hail or windstorms', href: 'https://www.tdi.texas.gov/tips/after-hail-or-windstorms.html', publisher: 'Texas Department of Insurance' },
      { label: 'Steps to getting your home insurance claim paid', href: 'https://www.tdi.texas.gov/tips/getting-your-insurance-claim-paid.html', publisher: 'Texas Department of Insurance' },
      { label: 'Roofing and insurance: Know the law', href: 'https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html', publisher: 'Texas Department of Insurance' },
    ],
  },
  {
    slug: 'roof-inspection-report',
    title: 'What a useful roof inspection report should include',
    metaTitle: 'What a roof inspection report should include',
    description: 'A homeowner-focused checklist for roof inspection reports: identifiable findings, useful photos, access limits, priorities, and a copy you can keep.',
    eyebrow: 'Reading the report',
    datePublished: '2026-08-20',
    dateModified: '2026-08-20',
    sections: [
      { heading: 'An inspection should leave you with more than a verdict', body: [
        '“Looks fine” and “you need a roof” are conclusions, not reports. A useful inspection leaves a homeowner with enough detail to find the area again, understand what was observed, and ask a second professional about the same condition.',
        'The report does not need to be long. It needs to be specific. A short document with clear locations, photographs, access notes, and sensible next steps is more useful than pages of generic roof language.',
      ]},
      { heading: 'The basic identifying information', body: [
        'Look for the inspection date, the property or roof section inspected, and the name and company of the person who performed the work. The report should identify the visible roof-covering material and note any information about age that came from a label, permit, invoice, or homeowner record rather than visual guesswork.',
        'Weather, roof height, slope, surface condition, and access can limit an inspection. Those limits should be written down. If a section was viewed from the ground, a ladder, a drone, or not viewed at all, the report should say so.',
      ]},
      { heading: 'Findings should be easy to locate', body: [
        'Each finding should name the slope or roof feature and include a useful photograph when conditions allow. Notes should separate what was observed from what is recommended. “Split pipe boot at rear bathroom vent; evaluate for replacement” is more useful than “roof needs repairs.”',
        'A good report also records ordinary condition. Clear photos of sound flashing, intact slopes, and completed maintenance create a baseline for the next visit instead of making the file a collection of problems only.',
      ]},
      { heading: 'Priorities need plain language', body: [
        'The report should distinguish active leaks or safety concerns from maintenance, monitor items, and areas that appear serviceable. It should not turn every observation into the same level of emergency. If invasive testing, engineering, mold evaluation, or another specialist is needed, that limit belongs in the recommendation.',
        'For non-emergency work, a written report gives you a common scope to use when comparing bids. Ask each contractor to explain any different diagnosis instead of comparing price alone.',
      ]},
      { heading: 'Get the complete copy', body: [
        'Before the visit, ask what you will receive and whether photographs are included. Keep the completed report with roof proposals, permits, invoices, product details, and warranties. That collection becomes the roof history; the inspection is one part of it.',
        'A Roof Watch visit is intended to provide written findings to the homeowner. Text ROOF WATCH, your city, and your ZIP to (817) 886-2418 to check current availability and review the program limits before scheduling.',
      ]},
    ],
    sources: [
      { label: 'Insurance and your roof: maintenance and claim basics', href: 'https://www.tdi.texas.gov/tips/replacing-your-roof.html', publisher: 'Texas Department of Insurance' },
      { label: 'Steps to getting your home insurance claim paid', href: 'https://www.tdi.texas.gov/tips/getting-your-insurance-claim-paid.html', publisher: 'Texas Department of Insurance' },
    ],
  },
  {
    slug: 'texas-heat-roof',
    title: 'How North Texas heat ages an asphalt-shingle roof',
    metaTitle: 'How Texas heat ages an asphalt roof',
    description: 'How heat, UV exposure, daily temperature changes, and attic ventilation affect asphalt roofs—and what a yearly inspection should document.',
    eyebrow: 'Heat and ventilation',
    datePublished: '2026-08-20',
    dateModified: '2026-08-20',
    sections: [
      { heading: 'Heat damage is gradual', body: [
        'A hailstorm can change a roof in minutes. Heat and sunlight work more slowly. Asphalt shingles warm during the day and cool at night, while ultraviolet exposure ages the surface over time. The result can include brittleness, cracking, distortion, and loss of protective granules, depending on the product, installation, ventilation, and exposure.',
        'That does not mean every hot roof is failing. The useful question is whether the material and roof details are changing faster than expected, and whether a repairable condition is contributing to the wear.',
      ]},
      { heading: 'Compare slopes instead of assuming they age alike', body: [
        'Roof orientation, pitch, shade, nearby trees, reflected heat, wind exposure, and ventilation can produce different conditions on the same house. One slope may show more wear than another, but there is no universal rule that a particular direction always fails first.',
        'A yearly report should identify each slope and photograph representative areas. That makes uneven wear visible and keeps a street-side glance from standing in for a complete inspection.',
      ]},
      { heading: 'Check the details around the shingles', body: [
        'Sealants, exposed fasteners, flashings, and rubber components around plumbing vents can deteriorate before the main roof covering reaches the end of its service life. These small parts deserve their own photographs and condition notes.',
        'Attic ventilation matters too. Excess heat and moisture in an attic can contribute to premature aging of shingles and roof sheathing. An exterior roof visit cannot always diagnose the whole ventilation system, so signs of concern may require an attic inspection or another qualified evaluation.',
      ]},
      { heading: 'A warranty label is not a service-life prediction', body: [
        'Shingle warranties differ in coverage, exclusions, transfer rules, installation requirements, and ventilation requirements. The number used to describe a product is not a promise that every roof will last that many years in every condition. Keep the exact product and warranty document with the home record.',
        'Maintenance does not stop normal aging, but it can catch debris, drainage issues, open sealant, damaged accessories, and other conditions before they create a larger problem. Roof Watch offers an annual documented check at participating North Texas addresses. Text your city and ZIP to (817) 886-2418 to confirm availability.',
      ]},
    ],
    sources: [
      { label: 'How hot does a roof get in summer?', href: 'https://www.gaf.com/en-us/blog/your-home/how-hot-does-a-roof-get-in-the-summer-5113cf68-42c0-48d7-84ca-412e590de318', publisher: 'GAF' },
      { label: 'Why proper roof and attic ventilation matters', href: 'https://www.owenscorning.com/en-us/roofing/blog/why-proper-roof-and-attic-ventilation-is-important-for-your-home', publisher: 'Owens Corning' },
      { label: 'Insurance and your roof: maintenance checklist', href: 'https://www.tdi.texas.gov/tips/replacing-your-roof.html', publisher: 'Texas Department of Insurance' },
    ],
  },
  {
    slug: 'selling-documented-home',
    title: 'Selling your house? The roof file is worth more than the staging.',
    metaTitle: 'Selling a home with roof documentation',
    description: 'Buyers negotiate against uncertainty. A dated, photographed roof history removes the biggest one. How documented homes handle the inspection period, and how to start a file before you list.',
    eyebrow: 'Sell smarter',
    sections: [
      { heading: 'Every buyer is really buying one thing: certainty', body: [
        'Run the standard version of the movie. Your house goes under contract. The buyer’s inspector spends three hours in it and produces a report with photos, arrows, and that one line about the roof: “recommend evaluation by a licensed roofing contractor.” Now there’s a repair addendum, two contractors with two opinions, a nervous buyer, and a week of your life.',
        'Almost all of that friction is uncertainty, not damage. Nobody in the deal actually knows what that roof has been through, so everyone prices the mystery. And mystery always prices against the seller.',
      ]},
      { heading: 'What the same moment looks like with a file', body: [
        'Same house, same inspector, same line about the roof. Except this seller opens their Homesrolo account and shares the file: last year’s inspection with photos, the two small repairs that came out of it, the year-over-year condition notes. Dated. Attributed. Boring, in the best possible way.',
        'The buyer’s agent reads it in five minutes. The scary line item becomes a known quantity. Maybe there’s still a repair to negotiate, but it’s one repair, priced off evidence, instead of a mystery priced off fear.',
      ]},
      { heading: 'Agents already know this', body: [
        'Ask any agent which listings are easiest to defend through the inspection period and you’ll hear the same thing: the ones with paperwork. A documented roof doesn’t just protect price. It shortens the negotiation, keeps deals from wobbling, and makes the listing itself different: “this home comes with its records” is a sentence most sellers simply cannot say.',
        'If your agent set you up with Homesrolo at closing, you’ve been building this file all along. If not, forward them this page. They’ll want it for their next ten clients, not just you.',
      ]},
      { heading: 'Starting a file before you list', body: [
        'A file started the year you sell is thinner than one started the year you bought, but it still beats no file. One Roof Watch inspection now gives you a professional baseline with photos, any small items get fixed free within the written limits, and the report is yours to hand across the table. Free, by text: ROOF WATCH to (817) 886-2418. The staging makes the photos prettier. The file makes the deal calmer.',
      ]},
    ],
  },
] as const
