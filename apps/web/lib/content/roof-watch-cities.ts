/**
 * Roof Watch city pages. Each entry is written as distinct local copy with its
 * own voice, hook, and data-ownership pitch. If two cities ever start sounding
 * like the same page with the nouns swapped, rewrite one of them.
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
    lede: 'Somebody qualified on your Keller roof once a year, a written report with photos that lives in your own account, and the small stuff fixed free while they’re up there. That’s Roof Watch. It costs nothing and there’s no catch you have to squint to find.',
    local: [
      { heading: 'Those gorgeous Keller trees are eating your shingles', body: [
        'Nobody moves to Keller for treeless streets. The mature oaks are half the reason the neighborhoods feel the way they do. Your roof has a different opinion. Every branch that hangs over a shingle grinds granules off it in the wind, and every shaded slope stays damp long after the sun has dried out the rest of the street. Slow damage. Quiet damage. The kind you find out about from a ceiling stain two years later.',
        'A yearly walk catches it while it’s still boring: a scuffed patch here, a packed valley there, a limb that needs to come off before the next windstorm does it for you.',
      ]},
      { heading: 'When the hail comes to Tarrant County (it always comes)', body: [
        'You know the drill. Hail rolls through, and by Saturday there are three trucks you’ve never seen idling on your street and a stranger on your porch swearing your roof is totaled. Maybe it is! But you shouldn’t have to take his word for it.',
        'A Roof Watch home has receipts: dated photos of the roof from before the storm, sitting in your account. Real damage becomes easy to prove. Imaginary damage becomes easy to laugh off. Either way you’re the one holding the evidence, not the guy with the clipboard.',
      ]},
      { heading: 'Your roof’s file belongs to you, not to us', body: [
        'Every inspection lands in your own Homesrolo account. Not our marketing database. Yours. Cancel next year and the whole history stays with you, free to hand to your insurance company, your favorite roofer, or the family who buys your house someday. We run the program. You own the paper trail.',
      ]},
    ],
    faqTwist: { question: 'Do you cover all of Keller?', answer: 'All of it. Hidden Lakes, Marshall Ridge, the older streets off Keller Parkway, everything between. Just outside city limits? Text your address anyway. The honest answer costs you one text.' },
  },
  {
    slug: 'roanoke',
    name: 'Roanoke',
    county: 'Denton County',
    headline: 'Free yearly roof inspections in Roanoke, TX',
    lede: 'The Unique Dining Capital of Texas deserves better than mystery roofs. Roof Watch puts a real inspector on yours every year, free, and files the written report in an account that belongs to you. Small fixes included. Sales pitch not included.',
    local: [
      { heading: 'Roanoke grew up fast. Its roofs are all hitting puberty together.', body: [
        'Drive any Roanoke subdivision and you’re looking at streets full of roofs born within a few years of each other. Which means whole neighborhoods hit the awkward years at the same time: sealant drying out, a nail backing out here and there, flashing starting to wiggle where it meets the chimney. None of it dramatic. All of it cheap to fix right now and expensive to ignore.',
        'The first decade decides whether a shingle roof lives its full life. An annual inspection is how you make that decade count.',
      ]},
      { heading: 'Storm season doesn’t skip Denton County', body: [
        'The same spring supercells that make North Texas famous run right through here. When one does, the whole insurance conversation comes down to a single question: what did the roof look like before? Most homeowners have to shrug. A Roof Watch home pulls up last year’s report, with photos, and answers in thirty seconds.',
      ]},
      { heading: 'Whose data? Your data.', body: [
        'The report isn’t a teaser we dangle to sell you something. It’s a complete document in your own account: what the inspector saw, what got touched up, photos of all of it. Keep it forever. Take it anywhere. Show it to anybody. If we never earn another minute of your attention, you still keep every page.',
      ]},
    ],
    faqTwist: { question: 'My Roanoke house is nearly new. Worth inspecting?', answer: 'Best time to start, honestly. Year-one photos document the roof before Texas weather gets its first swing in. Every report after that compares against them, and warranty conversations get real simple when you can show exactly when something changed.' },
  },
  {
    slug: 'grapevine',
    name: 'Grapevine',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Grapevine, TX',
    lede: 'A town that takes this much care of its Main Street should have homes with paperwork to match. Roof Watch is a free annual roof inspection for Grapevine homes, with a written, photographed report you own and small repairs done free while we’re up there.',
    local: [
      { heading: 'No two Grapevine roofs are having the same day', body: [
        'Grapevine might have the widest spread of roof ages in the whole Metroplex. Homes near the historic district that have seen a few decades of Texas weather. Lake-side places catching wind off the water with nothing to slow it down. Newer builds toward the airport corridor still in their warranty years. Each one fails differently, and each one deserves to be looked at like itself, not like a generic roof.',
        'That’s the whole point of a yearly record. The older roof gets a retirement plan on your schedule instead of a storm’s. The newer roof gets its little defects caught while the warranty still cares.',
      ]},
      { heading: 'Wind off the lake is a roof’s least favorite neighbor', body: [
        'Open water means open wind. Grapevine roofs near the lake take gusts and wind-driven rain with less shelter than the average DFW subdivision, and the first casualties are always the small parts: ridge caps, sealant beads, the flashing around whatever pokes through the shingles. Twenty-dollar fixes. Until they’re four-figure ceiling repairs. Once a year, somebody qualified checks the small parts. Free.',
      ]},
      { heading: 'The report is yours. Especially the day you sell.', body: [
        'Here’s a Grapevine-specific superpower: houses here move. When yours does, a folder of dated, photographed roof reports in your own account beats a shrug and a “roof’s fine, I think” at the negotiating table every single time. Buyers relax around documentation. Their inspectors do too. And it’s your file to hand over, because it was never ours to keep.',
      ]},
    ],
    faqTwist: { question: 'We’re selling next year. Does Roof Watch still make sense?', answer: 'It might make the most sense of anybody. One inspection now gives you a documented baseline, any small stuff gets fixed free, and the report goes in the drawer for the listing. Cheapest curb appeal in Texas: proof.' },
  },
  {
    slug: 'southlake',
    name: 'Southlake',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Southlake, TX',
    lede: 'Southlake roofs are big, complicated, and expensive to be wrong about. Roof Watch puts a professional on yours once a year, free, and writes what they find into a report that belongs to you. Not to a roofing company. To you.',
    local: [
      { heading: 'Big roofs don’t fail big. They fail at the details.', body: [
        'Walk a Southlake street and count the rooflines: dormers, dead valleys, two chimneys, skylights, a turret somebody loved in 2009. Beautiful. Also: every single one of those features is a hole in the roof that a piece of metal and some sealant are holding shut. Roofs don’t leak in the middle of a big clean slope. They leak where things meet, and Southlake homes have more meeting points than a corporate calendar.',
        'A yearly inspection is somebody qualified checking every one of those points while they’re still ten-minute fixes.',
      ]},
      { heading: 'The math on a roof like yours', body: [
        'When a Southlake roof gets replaced, the invoice has a comma in it, and sometimes the comma has friends. Maintenance is how you push that day years down the road. Documentation is how you make sure that when hail does hit, the claim conversation starts from your dated photos instead of from zero. Roof Watch does both, and the annual cost stays zero.',
      ]},
      { heading: 'Your data stays yours, even here', body: [
        'Plenty of companies would love a list of Southlake homeowners to work through. That’s not this. Reports live in your account, they’re written for you, and they leave with you if you ever cancel. Show them to your insurer, your builder, any roofer you like. The program is free and the record is the product, and the record is yours.',
      ]},
    ],
    faqTwist: { question: 'Our roof is tile, metal, or some designer thing. Still covered?', answer: 'Still covered. The inspection matches the roof you actually have, and honestly, the fancier the material, the more the yearly record earns its keep. Specialty repairs live and die on documentation and material matching, and your file will have both.' },
  },
  {
    slug: 'flower-mound',
    name: 'Flower Mound',
    county: 'Denton County',
    headline: 'Free yearly roof inspections in Flower Mound, TX',
    lede: 'Flower Mound sits right in the lane where North Texas storms like to show off. Roof Watch is the free counterpunch: a professional inspection every year, photos and findings filed in an account you own, small repairs handled while we’re up there.',
    local: [
      { heading: 'Living in the storm lane', body: [
        'Ask anyone who’s spent a few springs here. When the sky turns that particular shade of green over Denton County, Flower Mound roofs are on the menu. Whole neighborhoods here have been reroofed off a single loud afternoon. You can’t move the house. What you can do is make sure that when the storm comes, your roof walks in with a file: dated photos, known condition, every prior fix on record. Proving damage beats describing it.',
      ]},
      { heading: 'Between storms, the sun does the slow work', body: [
        'The dramatic stuff gets the headlines, but most Flower Mound roof problems are boring: west-facing slopes cooking all summer, sealant turning to chalk, a vent boot cracking around year eight. Nobody notices because nobody looks. That’s the entire fix. Once a year, somebody looks, writes it down, and handles the small stuff on the spot. Free.',
      ]},
      { heading: 'Your file, your leverage', body: [
        'HOA wants to know the roof’s condition? Insurance adjuster asking about maintenance? Future buyer’s inspector getting nosy? You answer all three the same way: with documents from your own account. That’s the quiet power move of Roof Watch. It turns every roof conversation you’ll ever have into one where you brought the paperwork and they didn’t.',
      ]},
    ],
    faqTwist: { question: 'Will you handle my insurance claim for me?', answer: 'No, and be suspicious of a free program that says yes. Roof Watch is maintenance and documentation. What it hands you is the strongest thing a claim can have: a dated photo history from before the storm. What you do with it, and with whom, stays one hundred percent your call.' },
  },
  {
    slug: 'fort-worth',
    name: 'Fort Worth',
    county: 'Tarrant County',
    headline: 'Free yearly roof inspections in Fort Worth, TX',
    lede: 'From Fairmount bungalows to brand-new builds up by Alliance, Fort Worth roofs cover a hundred years of ways to spring a leak. Roof Watch covers all of them: a free professional inspection every year, written up and photographed, saved in an account that’s yours.',
    local: [
      { heading: 'A century of roofs, one bad habit', body: [
        'Fort Worth doesn’t have a housing stock. It has ten of them. Craftsman bungalows in Fairmount with more roofing history than some counties. Mid-century ranches near the TCU area with their long low slopes. Subdivisions sprinting north toward Alliance that smell like fresh lumber. They age differently and they fail differently, but they share the one bad habit every roof has: staying quiet about it until the fix has a comma in it.',
        'The cure is embarrassingly simple. Somebody qualified looks once a year and writes down what they see. That’s it. That’s the program.',
      ]},
      { heading: 'This town has seen some storm-chaser energy', body: [
        'Fort Worth gets the hardest post-hail sales blitz in Texas. The yard signs sprout overnight like mushrooms. Some of those companies are excellent. Some are a guy with a magnetic truck door and a dream. A Roof Watch home doesn’t have to guess, because it isn’t starting from “take my word for it.” It’s starting from last year’s photos, in your account, of your actual roof. Driveway diagnoses don’t survive contact with documentation.',
      ]},
      { heading: 'Big-city roof work comes with big-city paperwork', body: [
        'Larger repairs in Fort Worth can cross into permit territory, and the difference between a smooth permitted job and a headache is usually documentation somebody should’ve had from the start. Your file is that documentation: written scopes, photos, dates, all of it yours, none of it locked up in some contractor’s filing cabinet. When it’s time for bids, you hand every company the same clean history and let them compete on the actual work.',
      ]},
    ],
    faqTwist: { question: 'Fort Worth is huge. Am I actually in your area?', answer: 'Probably, and there’s a fast way to find out: text your zip code. The program runs across Fort Worth and its neighborhoods alongside Keller, Roanoke, Grapevine, Southlake, and Flower Mound, and you’ll get a straight yes or no the same day. No “let me connect you with a specialist.” Just the answer.' },
  },
] as const
