/**
 * Roof Watch city pages. Local details must describe observable roof conditions
 * or the actual service area. Do not add a city just to capture a query.
 */
export type RoofWatchCity = {
  readonly slug: string
  readonly name: string
  readonly county: string
  readonly headline: string
  readonly metaDescription: string
  readonly dateModified: string
  readonly cardSummary: string
  readonly lede: string
  readonly local: readonly { heading: string; body: readonly string[] }[]
  readonly faqTwist: { readonly question: string; readonly answer: string }
  readonly sources: readonly { readonly label: string; readonly publisher: string; readonly href: string }[]
}

export const ROOF_WATCH_CITIES: readonly RoofWatchCity[] = [
  {
    slug: 'keller',
    name: 'Keller',
    county: 'Tarrant County',
    headline: 'A free yearly roof check for Keller homeowners',
    metaDescription: 'Check Roof Watch availability in Keller, TX. The free annual visit records slopes, penetrations, and maintenance details, with photos when conditions allow.',
    dateModified: '2026-08-20',
    cardSummary: 'Established trees, shaded slopes, and storm-season changes are the focus in Keller.',
    lede: 'Keller has everything from newer subdivisions to established streets with mature trees. Roof Watch gives participating homeowners a yearly roof check, photographs the condition we can see, and puts the findings in writing. Text your city and ZIP to confirm that your address is in the current service area.',
    local: [
      { heading: 'Trees change what needs attention', body: [
        'On established Keller streets, branches can rub against shingles and leaves can collect in valleys or behind chimneys. Shaded sections may also stay damp longer after rain. Those are ordinary maintenance details, but they are easy to miss from the ground.',
        'The annual visit looks for branch contact, trapped debris, worn shingles, drainage problems, and openings around roof penetrations. Any finding is photographed so the next inspection has something concrete to compare against.',
      ]},
      { heading: 'A baseline is useful after rough weather', body: [
        'Wind and hail do not affect every house on a street the same way. Roof angle, material, tree cover, and prior condition all matter. A dated inspection report can show what was visible before and after a storm, without guessing at cause or insurance coverage.',
        'Roof Watch does not file or negotiate insurance claims. If a storm damages your home, follow your policy and contact your insurer promptly. The report is simply a record you can share with the professionals you choose.',
      ]},
      { heading: 'You receive the written findings', body: [
        'After a completed visit, the homeowner receives the report and available photos. Keep the copy with the rest of the home record and use it when comparing future work. Homesrolo does not require you to hire a particular contractor.',
      ]},
    ],
    faqTwist: { question: 'Is every Keller address covered?', answer: 'Availability is confirmed by address because the service area and schedule can change. Text KELLER and your ZIP to (817) 886-2418, and we will reply with current availability and the written program limits.' },
    sources: [
      { label: 'Maintaining residential roof systems', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofingguidelines/pdf?id=169193&k=2173279' },
      { label: 'What to do after hail or windstorms', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/tips/after-hail-or-windstorms.html' },
    ],
  },
  {
    slug: 'roanoke',
    name: 'Roanoke',
    county: 'Denton County',
    headline: 'Start a roof record early for a newer Roanoke home',
    metaDescription: 'Check Roof Watch availability in Roanoke, TX. The free annual visit creates a written roof baseline for future comparison, with photos when conditions allow.',
    dateModified: '2026-08-20',
    cardSummary: 'Early roof records can help Roanoke owners track small changes during warranty years.',
    lede: 'If your Roanoke home has a newer roof, an early baseline can record the material and visible condition before small changes become hard to date. Roof Watch offers a free yearly check at participating addresses, with findings provided in writing.',
    local: [
      { heading: 'Newer does not mean there is nothing to record', body: [
        'A young roof may be in good condition and still have a loose fastener, an exposed nail head, a sealant gap, or debris left in a valley. A first inspection creates a practical starting point instead of waiting for a leak or a sale to reconstruct the history.',
        'If a builder or manufacturer warranty applies, dated photos and a clear description of the location can make a future conversation more specific. The report does not decide warranty coverage; it gives the homeowner a better record of what was observed.',
      ]},
      { heading: 'North Texas weather gives you something to compare', body: [
        'After a spring storm or a long hot summer, the useful question is what changed. Annual photos let an inspector compare the same slopes, edges, flashing, and penetrations instead of relying on memory.',
        'That comparison can also show that a roof is holding up well. An inspection should document sound areas as clearly as the items that need attention.',
      ]},
      { heading: 'The report is not a sales commitment', body: [
        'You receive the written findings from a completed Roof Watch visit. You can keep them with the home, ask questions, and seek another opinion. Participation does not require a roof replacement or a future contract.',
      ]},
    ],
    faqTwist: { question: 'Is Roof Watch useful for a nearly new Roanoke home?', answer: 'It can be. An early report establishes the roof material and visible condition while builder or manufacturer warranty questions may still matter. It is a record of observations, not a warranty determination.' },
    sources: [
      { label: 'Maintaining residential roof systems', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofingguidelines/pdf?id=169193&k=2173279' },
    ],
  },
  {
    slug: 'grapevine',
    name: 'Grapevine',
    county: 'Tarrant County',
    headline: 'A written yearly roof check for Grapevine homes',
    metaDescription: 'Check Roof Watch availability in Grapevine, TX. The free annual visit records visible roof condition by area, with photos when conditions allow.',
    dateModified: '2026-08-20',
    cardSummary: 'Grapevine’s mix of roof ages calls for an inspection based on the house, not a script.',
    lede: 'Roof age and surroundings vary across Grapevine. A roof near mature trees may need a different maintenance conversation from one on a more open site, and a newer roof benefits from a different baseline than an older one. Roof Watch documents the roof that is actually there and gives the homeowner a written record of the visit.',
    local: [
      { heading: 'The house sets the inspection', body: [
        'On an older roof, the inspector may spend more time on previous repairs, flashing transitions, surface wear, and signs of repeated drainage. On a newer one, the useful work may be documenting the starting condition and checking details around vents, walls, and edges.',
        'Properties near mature trees may need extra attention at valleys and gutters. More open sites may show different wind exposure. The report should describe what was observed at that address, not force every roof into the same story.',
      ]},
      { heading: 'Small details are easier to handle when they are located', body: [
        '“Sealant needs attention” is vague. A useful report identifies the slope and roof feature, includes a photo, and separates maintenance from items that need a closer professional evaluation. That gives the homeowner a scope they can understand and discuss.',
        'Some minor maintenance may be included during a Roof Watch visit, within the written limits sent before scheduling. Anything outside those limits should be explained before work begins.',
      ]},
      { heading: 'Keep the report with the home', body: [
        'A sequence of dated reports can help with future bids, maintenance planning, and sale disclosures, but it does not guarantee an insurance or real-estate outcome. Its value is simpler: the next person does not have to start with a blank page.',
      ]},
    ],
    faqTwist: { question: 'Does Roof Watch make sense if I may sell my Grapevine home?', answer: 'A current inspection can give you a written snapshot to keep with the home record. It is not a certification or guarantee, but it can help you answer condition questions with dated observations instead of memory.' },
    sources: [
      { label: 'Maintaining residential roof systems', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofingguidelines/pdf?id=169193&k=2173279' },
    ],
  },
  {
    slug: 'southlake',
    name: 'Southlake',
    county: 'Tarrant County',
    headline: 'A careful yearly check for a complex Southlake roof',
    metaDescription: 'Check Roof Watch availability in Southlake, TX. The free annual visit documents roof slopes, transitions, penetrations, and visible maintenance needs.',
    dateModified: '2026-08-20',
    cardSummary: 'More rooflines and transitions mean more places where careful documentation matters.',
    lede: 'When a Southlake roof has multiple elevations or details such as dormers, chimneys, skylights, or wall transitions, each junction deserves a clear record. A yearly inspection is a practical way to check those areas, record visible changes, and identify maintenance before it becomes an interior problem.',
    local: [
      { heading: 'Complex roofs deserve a location-by-location report', body: [
        'Water usually finds the details: a valley that is not draining cleanly, flashing at a wall, a pipe boot, or sealant around a penetration. A large roof can have several of these conditions at once, and a short verdict from the driveway is not enough.',
        'The Roof Watch report identifies the area being discussed and pairs the note with a photo when conditions allow. That makes it possible to compare a later inspection or ask another professional about the same location.',
      ]},
      { heading: 'Materials and access change the visit', body: [
        'Tile, metal, slate-look products, and specialty shingles require material-specific care. Some surfaces or slopes may not be safe to walk. A responsible inspection should state access limits and use an appropriate observation method rather than treating every roof like standard asphalt shingles.',
        'If a repair needs a matching specialty product or trained installer, that belongs in the written recommendation. It should not be improvised during a maintenance visit.',
      ]},
      { heading: 'Documentation supports a better decision', body: [
        'The homeowner receives the completed report and can share it with an insurer, builder, consultant, or contractor of their choice. Roof Watch does not make coverage decisions or require the homeowner to award future work to the person who inspected the roof.',
      ]},
    ],
    faqTwist: { question: 'Can Roof Watch inspect tile, metal, or other specialty roofs?', answer: 'Tell us the roof material when you text. We will confirm whether an appropriate professional and inspection method are available for that address before scheduling.' },
    sources: [
      { label: 'Roofing materials', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofing-guidelines/roofing-materials' },
      { label: 'Protecting roofing workers', publisher: 'Occupational Safety and Health Administration', href: 'https://www.osha.gov/sites/default/files/publications/OSHA3755.pdf' },
    ],
  },
  {
    slug: 'flower-mound',
    name: 'Flower Mound',
    county: 'Denton County',
    headline: 'A yearly roof record for Flower Mound weather',
    metaDescription: 'Check Roof Watch availability in Flower Mound, TX. The free annual visit records drainage, debris, and roof condition, with photos when conditions allow.',
    dateModified: '2026-08-20',
    cardSummary: 'Tree cover, drainage, heat, wind, and hail all belong in Flower Mound roof records.',
    lede: 'Flower Mound roofs see North Texas heat, wind, hail, and plenty of tree debris. Roof Watch gives participating homeowners a consistent annual record: what was visible, where it was found, and what may need attention. The result is a report you can keep and compare over time.',
    local: [
      { heading: 'Storm evidence starts with safety and a clear record', body: [
        'After severe weather, stay off a wet or damaged roof. Ground-level photos of hail, gutters, screens, fallen limbs, and visible exterior damage can be useful. If you see or suspect damage, review your policy and contact your insurer promptly; an inspection should not delay required notice.',
        'A prior Roof Watch report may provide useful pre-storm context. It does not determine cause, coverage, or claim value. Those decisions belong to the insurer and the qualified professionals involved in the claim.',
      ]},
      { heading: 'The quieter maintenance still matters', body: [
        'Between storms, the inspection looks at drainage, debris, sealants, flashing, exposed fasteners, pipe boots, and visible shingle wear. Tree cover and roof orientation can make two slopes on the same house age differently, so the report treats them separately.',
        'When minor maintenance is available within the program limits, the finding and completed work are documented. Larger or uncertain conditions become a recommendation for further evaluation, not an automatic sales pitch.',
      ]},
      { heading: 'A record is useful only if the homeowner can use it', body: [
        'You receive the written findings and can share them with any professional you choose. Homesrolo provides education and documentation; it does not file claims or act as a public adjuster.',
      ]},
    ],
    faqTwist: { question: 'Will Roof Watch handle my insurance claim?', answer: 'No. Roof Watch documents visible roof condition and does not file, negotiate, or adjust insurance claims. If your home may be damaged, follow your policy and contact your insurer promptly.' },
    sources: [
      { label: 'Maintaining residential roof systems', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofingguidelines/pdf?id=169193&k=2173279' },
      { label: 'What to do after hail or windstorms', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/tips/after-hail-or-windstorms.html' },
    ],
  },
  {
    slug: 'fort-worth',
    name: 'Fort Worth',
    county: 'Tarrant County',
    headline: 'One Roof Watch program for many kinds of Fort Worth homes',
    metaDescription: 'Check Roof Watch availability in Fort Worth, TX. The free annual visit documents visible roof condition, maintenance items, and access limits.',
    dateModified: '2026-08-20',
    cardSummary: 'Fort Worth roof checks vary with the home, from older bungalows to newer construction.',
    lede: 'A Fairmount bungalow, a mid-century ranch, and a newer house near Alliance do not need the same roof checklist. Roof Watch starts with the roof system, age, access, and prior work at the address, then provides the homeowner with written findings from the yearly visit.',
    local: [
      { heading: 'Fort Worth has more than one kind of roof history', body: [
        'Older homes may have several layers of repair history, changed ventilation, or transitions added during renovations. Newer construction benefits from a clean baseline and early documentation of visible installation details. Low-slope sections, steep pitches, and mixed materials also change what can be safely inspected.',
        'The report should name those limits. If an area cannot be walked or seen clearly, that is documented instead of being turned into a confident guess.',
      ]},
      { heading: 'After hail, slow down before you sign', body: [
        'After hail, Fort Worth homeowners may hear from several contractors at once. Ask for business information, references, a written scope, and time to compare bids. Texas does not allow a contractor who may perform the work to act as the homeowner’s public adjuster, and a contractor cannot waive an insurance deductible.',
        'Roof Watch does not decide whether to file a claim or which company to hire. It gives you a dated condition record and a clearer set of questions to bring to those conversations.',
      ]},
      { heading: 'Ask about permits before larger repairs', body: [
        'Before larger repairs, ask who is responsible for permits and inspections, verify current requirements with the city, and put that responsibility in the contract.',
        'Keep permits, inspection results, product information, invoices, and warranties with the roof report. The useful history includes both what was observed and what was eventually done.',
      ]},
    ],
    faqTwist: { question: 'How do I know whether my Fort Worth address is covered?', answer: 'Text FORT WORTH and your ZIP to (817) 886-2418. We will confirm current availability by address and send the written program limits before an inspection is scheduled.' },
    sources: [
      { label: 'Protecting roofing workers', publisher: 'Occupational Safety and Health Administration', href: 'https://www.osha.gov/sites/default/files/publications/OSHA3755.pdf' },
      { label: 'Roofing and insurance: Know the law', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html' },
      { label: 'Residential permitting information', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information' },
    ],
  },
] as const
