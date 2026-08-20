/**
 * Roof Watch city pages. Each entry is written as distinct local copy — not a
 * templated swap — because a city page only deserves to rank if it actually
 * says something about roofs in that city.
 */
export type RoofWatchCity = {
  readonly slug: string
  readonly name: string
  readonly county: string
  readonly headline: string
  readonly lede: string
  readonly local: readonly { heading: string; body: readonly string[] }[]
  readonly faqTwist: { readonly question: string; readonly answer: string }
}

export const ROOF_WATCH_CITIES: readonly RoofWatchCity[] = [
  {
    slug: 'keller',
    name: 'Keller',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Keller, TX',
    lede: 'Roof Watch enrolls Keller homes in a free annual roof inspection with a written condition report that belongs to you — plus small repairs included in writing. No contract, no sales pitch on your driveway.',
    local: [
      { heading: 'Keller roofs age in the shade', body: [
        'Keller’s established neighborhoods are one of its best features — and one of a roof’s quiet challenges. Mature trees drop limbs and grind granules off shingles wherever branches overhang, and shaded slopes hold moisture longer after North Texas storms. A yearly walk of the roof catches limb abrasion, lifted shingles, and debris-packed valleys while they are still maintenance items, not leaks.',
        'Tarrant County sits squarely in hail country. After a storm, Keller homeowners get door knocks within days. A Roof Watch home answers those knocks from a position of strength: a dated, photographed record of what the roof looked like before the storm, so real damage is provable and imagined damage is dismissible.',
      ]},
      { heading: 'What a Keller enrollment looks like', body: [
        'Text ROOF WATCH with your neighborhood — Hidden Lakes, Marshall Ridge, the older core off Keller Parkway, anywhere in the city — and a coordinator sets your inspection window. A vetted local roofer inspects, and the written findings land in your own Homesrolo account the same way every year, building a year-over-year history of the same roof.',
      ]},
    ],
    faqTwist: { question: 'Do you cover all of Keller?', answer: 'Yes — every Keller neighborhood, from newer builds to the established core. If your home is just outside city limits, text your address anyway; the service area covers surrounding North Texas neighborhoods.' },
  },
  {
    slug: 'roanoke',
    name: 'Roanoke',
    county: 'Denton County',
    headline: 'Free yearly roof inspections in Roanoke, TX',
    lede: 'Roof Watch gives Roanoke homeowners a free professional roof inspection every year, a written report you own in your own account, and small fixes included in writing — with zero obligation to hire anyone.',
    local: [
      { heading: 'Roanoke grew fast — its roofs are aging together', body: [
        'Much of Roanoke was built in the same growth waves, which means whole streets of roofs are hitting their first real maintenance years together. The first decade of a shingle roof is when small things — a popped nail, a dried sealant bead, a flashing gap at a chimney — decide whether it reaches its rated life. An annual inspection catches exactly those.',
        'Denton County takes the same spring hail corridors as the rest of North Texas. When a storm crosses the Unique Dining Capital of Texas, a Roof Watch home already has last year’s condition on file — dated and photographed — which turns any storm conversation, with a contractor or an insurer, into a comparison instead of a guess.',
      ]},
      { heading: 'What a Roanoke enrollment looks like', body: [
        'Text ROOF WATCH and your street or subdivision. A coordinator confirms the address, a vetted local roofer walks the roof on schedule, and the report is written into your own Homesrolo home file — yours to keep whether or not you ever spend a dollar with anyone.',
      ]},
    ],
    faqTwist: { question: 'My Roanoke house is nearly new — is an inspection worth it?', answer: 'A new roof is the best time to start the record. The first report documents the roof as-built — before weather, settling, or a hail season touches it — and every year after that is compared against it. Warranty conversations are far easier with a dated history.' },
  },
  {
    slug: 'grapevine',
    name: 'Grapevine',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Grapevine, TX',
    lede: 'From the historic district to the lake, Roof Watch enrolls Grapevine homes in a free annual inspection with a written, homeowner-owned condition report — and small repairs included in writing.',
    local: [
      { heading: 'Grapevine’s mix of old and new roofs', body: [
        'Grapevine carries a wider spread of roof ages than almost any city in the area — from homes near the historic Main Street district to lake-area properties to newer builds toward DFW’s corridor. Older roofs need honest condition tracking to plan their replacement on the homeowner’s schedule instead of a storm’s. Newer roofs need their small defects caught inside warranty windows. A yearly written record serves both.',
        'Lake-adjacent weather exposure and open approaches mean Grapevine roofs take wind-driven rain and hail with less shelter than inland neighborhoods. Sealant joints, ridge caps, and flashing take that abuse first — and they are exactly the small, cheap-to-fix items an annual inspection is designed to surface.',
      ]},
      { heading: 'What a Grapevine enrollment looks like', body: [
        'Text ROOF WATCH with your area of town. A vetted local roofer inspects each year, and the findings — photographs, condition notes, what was touched up — are written into your own Homesrolo account, building the roof’s documented history for as long as you own the home. That history transfers value the day you sell.',
      ]},
    ],
    faqTwist: { question: 'We are selling our Grapevine home next year — does Roof Watch help?', answer: 'A documented roof is a stronger roof at the closing table. Your reports are yours to share: hand a buyer the dated inspection history instead of a one-line “roof is fine” and watch the inspection-period negotiation get shorter.' },
  },
  {
    slug: 'southlake',
    name: 'Southlake',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Southlake, TX',
    lede: 'Southlake’s large custom roofs have more places to fail quietly. Roof Watch puts a professional on yours once a year, free, and writes what they find into a condition report that you own.',
    local: [
      { heading: 'Complex rooflines fail at the details', body: [
        'Southlake homes carry some of the most complex residential rooflines in North Texas — multiple ridge lines, dormers, dead valleys, chimneys, and skylights. Every one of those features is a penetration or a transition, and penetrations and transitions are where roofs actually leak. A large roof does not fail across its field; it fails at a flashing detail nobody has looked at in five years.',
        'On a high-value home, the difference between a maintained roof and a neglected one is measured in tens of thousands at replacement time — and in the insurance conversation after every hail season. A yearly professional walk, documented in writing, is the cheapest protection that kind of roof can have. Roof Watch makes it free.',
      ]},
      { heading: 'What a Southlake enrollment looks like', body: [
        'Text ROOF WATCH with your neighborhood. A vetted professional walks the full roof system annually — field, flashings, penetrations, gutters — and the written findings live in your own Homesrolo account. Small maintenance items are handled at no cost within the written limits; anything larger becomes a documented scope you can put in front of any company you choose.',
      ]},
    ],
    faqTwist: { question: 'Our Southlake roof is tile / metal / designer shingle — do you still inspect it?', answer: 'Yes. The inspection covers the roof system you actually have, and the report reflects its materials honestly. Specialty materials make the yearly record more valuable, not less — their repairs are exactly where documentation and material-matching matter most.' },
  },
  {
    slug: 'flower-mound',
    name: 'Flower Mound',
    county: 'Denton County',
    headline: 'Free yearly roof inspections in Flower Mound, TX',
    lede: 'Roof Watch enrolls Flower Mound homes in a free annual roof inspection with a written report in your own account — a running, homeowner-owned history of your roof, with small fixes included in writing.',
    local: [
      { heading: 'Denton County’s storm corridor, documented', body: [
        'Flower Mound sits in the path of the spring supercells that ride up the DFW corridor, and its rooftops show it: whole neighborhoods have been reroofed on insurance after single afternoons. In that environment, the most valuable thing a homeowner can own is a dated record of the roof’s condition before the storm — it is the difference between proving damage and arguing about it.',
        'Between storms, Flower Mound’s sun and wind do the slow damage: cooked sealant, lifted tabs on west-facing slopes, fasteners backing out of exhaust flashings. These are twenty-dollar problems that become four-figure ceiling repairs when nobody looks. Once a year, somebody qualified looks — free.',
      ]},
      { heading: 'What a Flower Mound enrollment looks like', body: [
        'Text ROOF WATCH and your subdivision. A vetted local roofer inspects annually; the photographed findings are written into your own Homesrolo home file. If your HOA asks about roof condition, or your insurer asks about maintenance, you answer with documents instead of memory.',
      ]},
    ],
    faqTwist: { question: 'Will you deal with my insurance company for me?', answer: 'Roof Watch is a maintenance and documentation program, not a claims service. What it gives you is leverage: a dated, photographed condition history that makes any claim conversation factual. What you do with it — and with whom — stays entirely your decision.' },
  },
  {
    slug: 'fort-worth',
    name: 'Fort Worth',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Fort Worth, TX',
    lede: 'From Fairmount bungalows to Alliance-area builds, Roof Watch gives Fort Worth homes a free professional roof inspection every year — written up, photographed, and saved in an account that belongs to you.',
    local: [
      { heading: 'A city this size holds every kind of roof', body: [
        'Fort Worth’s housing stock spans a century — historic district homes with layered roofing histories, mid-century ranches, and the fast-built subdivisions pushing north toward Alliance. Each ages differently, and each fails differently. What they share: an annual professional look, written down, catches the cheap problems before they become expensive ones.',
        'Fort Worth also draws the hardest storm-repair sales pressure in the region. When the hail hits and the yard signs sprout, a Roof Watch home holds a dated record of its roof’s pre-storm condition. That record — yours, in your account — is what separates a legitimate storm claim from a driveway diagnosis.',
      ]},
      { heading: 'What a Fort Worth enrollment looks like', body: [
        'Text ROOF WATCH and your part of town — northside, TCU area, far north, anywhere in the city. A vetted local roofer handles the annual inspection; the findings live in your own Homesrolo file. Larger repairs in Fort Worth can cross into permitted work — a written scope from your file is exactly what you want in hand before that conversation.',
      ]},
    ],
    faqTwist: { question: 'Does Roof Watch cover all of Fort Worth?', answer: 'The program serves Fort Worth and its neighborhoods alongside Keller, Roanoke, Grapevine, Southlake, and Flower Mound. Fort Worth is large — text your zip code and you will get a straight yes or no the same day.' },
  },
] as const
