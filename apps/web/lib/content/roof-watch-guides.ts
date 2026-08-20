/**
 * Roof Watch guides. Editorial rules: scenes and characters are illustrative
 * and framed as such, never presented as real customers or real events. No
 * statistics we cannot source. No storm dates we cannot verify. The voice is
 * a local blogger who knows roofs, not a brochure.
 */
export type RoofWatchGuide = {
  readonly slug: string
  readonly title: string
  readonly metaTitle: string
  readonly description: string
  readonly eyebrow: string
  readonly sections: readonly { heading: string; body: readonly string[] }[]
}

export const ROOF_WATCH_GUIDES: readonly RoofWatchGuide[] = [
  {
    slug: 'hail-first-72-hours',
    title: 'Hail just hit your neighborhood. Here’s your first 72 hours.',
    metaTitle: 'Hail damage: what to do in the first 72 hours',
    description: 'A North Texas homeowner’s playbook for the three days after a hailstorm: what to photograph, who’s about to knock, what not to sign, and when to call your insurance company.',
    eyebrow: 'Storm playbook',
    sections: [
      { heading: 'The quietest sound in Texas is the minute after hail stops', body: [
        'Picture the standard version of this. It’s a spring evening, the sky’s been threatening all day, and then the roof spends ten minutes sounding like a drum line warming up. Then silence. Then, within about forty-eight hours, more ladders on your street than you’ve seen in five years.',
        'What you do before those ladders show up matters more than anything you’ll sign after. So here’s the seventy-two-hour playbook, in order.',
      ]},
      { heading: 'Hours 0 to 12: document everything, climb nothing', body: [
        'Stay off the roof. Wet shingles after a storm are a slip hazard, and you don’t need to be up there anyway. The evidence you can reach is on the ground.',
        'Walk the yard with your phone. Photograph hailstones next to anything with a known size, a coin, a tape measure, a doorknob. Photograph dents in gutters and downspouts. Window screens with tears. The soft aluminum fins on your AC unit. Splash marks on the fence. Granules piled at the bottom of downspouts like coffee grounds. Every one of these is dated evidence, and your phone stamps the date for you.',
        'None of it proves your roof is damaged. All of it proves a real storm hit your real house, and that stack of little proofs is worth a lot when someone later suggests the damage came from somewhere else.',
      ]},
      { heading: 'Day 1 to 2: the knock', body: [
        'Someone will knock. Count on it. And to be fair, some of the people knocking are excellent local companies doing exactly what they should be doing after a storm.',
        'Here’s how you tell them apart. The good ones hand you a card, offer a free look, and leave a written report with photos whether or not you hire them. The other kind wants a signature on day one, usually on something called a contingency agreement, sometimes before they’ve been on the roof at all. A contingency can lock you to one company before you know what’s wrong or what it’s worth. You wouldn’t sign that for a kitchen remodel. Don’t sign it for a roof you haven’t seen evidence about.',
        'A sentence worth memorizing: “Leave the report, and I’ll call you.” A company that objects to that sentence has told you something useful.',
      ]},
      { heading: 'Day 2 to 3: look before you file', body: [
        'Do not call your insurance company as a reflex. A claim, once filed, goes on your record even if it pays out nothing, and a claim filed blind is a claim you can’t steer.',
        'Get a real inspection first, from someone willing to put findings in writing with photos. If the roof took genuine damage, now your claim opens with evidence attached. If it didn’t, you just avoided burning a claim on a roof that only needed two shingles and a bead of sealant.',
      ]},
      { heading: 'The unfair advantage: knowing what your roof looked like before', body: [
        'Every argument after a hailstorm is really one question wearing different outfits: was that damage there before? Homeowners who can answer with dated photos from a prior inspection win that argument quickly and quietly. Homeowners who can’t are stuck negotiating from memory.',
        'That’s the entire reason Roof Watch exists. A free inspection every year, photographed and filed in your own account, means the day the sky opens up, you already own the before picture. Text ROOF WATCH to (817) 886-2418 and the next storm meets a documented roof.',
      ]},
    ],
  },
  {
    slug: 'roof-inspection-report',
    title: 'What a roof inspection report should actually include',
    metaTitle: 'What a roof inspection report should include',
    description: 'A real roof inspection produces a document, not a verdict. Here’s what belongs in it, what its absence tells you, and why the homeowner should be the one holding it.',
    eyebrow: 'Homeowner education',
    sections: [
      { heading: '“Yeah, it’s got some wear” is not an inspection', body: [
        'Here’s a scene that plays out in driveways everywhere. Someone spends eleven minutes on a roof, comes down, squints thoughtfully, and delivers a verdict: it’s fine, or it’s shot. No photos. Nothing written. Just vibes and a business card.',
        'That’s not an inspection. That’s an opinion with a ladder. An inspection produces a document, and the document is the whole point, because the document is what you can compare, question, and keep. Here’s what a real one includes.',
      ]},
      { heading: 'The non-negotiables', body: [
        'A date, and the name of the actual human who walked the roof. Findings you can locate: not “some damaged shingles” but which slope, near what, with a photo of each one. The roof’s materials and rough age, because a ten-year-old architectural shingle and a twenty-five-year-old three-tab are different patients. Condition notes per section of roof, since the west slope and the north slope are living different lives. And a clear split between fix-now items, watch items, and fine-leave-it-alone items.',
        'One more, and it’s the one most people never think to ask about: who keeps the report? If the answer is “the company, but call us anytime,” your roof’s history just became someone’s sales asset. The report should be yours. Full copy, photos included, no strings.',
      ]},
      { heading: 'What the missing pieces tell you', body: [
        'No photos usually means no findings, or none they want examined too closely. No written report means nothing they’re willing to stand behind later. A verdict of “totaled” delivered without documentation, especially in the same breath as a signature request, is a sales tactic with a clipboard.',
        'And urgency is its own red flag. Roofs fail slowly. Prices don’t expire at sundown. Anyone whose offer can’t survive you sleeping on it is telling you what the offer is really worth.',
      ]},
      { heading: 'The report is the product', body: [
        'This is the part Roof Watch is built around. Every yearly inspection produces exactly the document described above, photos and all, and it files into your own Homesrolo account, not into a company’s call list. Year over year, that stack of reports becomes something rare: a roof with a documented history, owned by the person who owns the roof.',
        'Free, every year, in writing. Text ROOF WATCH to (817) 886-2418.',
      ]},
    ],
  },
  {
    slug: 'texas-heat-roof',
    title: 'How Texas heat kills a roof (slowly, and from the west)',
    metaTitle: 'How Texas heat ages your roof',
    description: 'Hail gets the headlines, but the Texas sun does more roof damage per year than any single storm. What heat actually does to shingles, and what to check before every summer.',
    eyebrow: 'Know your roof',
    sections: [
      { heading: 'The storm gets the blame. The sun does the work.', body: [
        'Everybody fears hail, and fair enough. But ask anyone who’s spent years around North Texas roofs what does the steadiest damage and you’ll hear about the other thing: the eight months a year your shingles spend getting cooked.',
        'A shingle roof in a Texas summer isn’t resting. It’s expanding all afternoon and contracting all night, every single day. That flexing works fasteners loose, opens seams, and fatigues the shingle itself. The sun’s UV meanwhile is baking the oils out of the asphalt, turning shingles from flexible to brittle, one summer at a time.',
      ]},
      { heading: 'Why the west slope always goes first', body: [
        'Roofs don’t age evenly. The slope facing west takes the afternoon sun at full strength, at the hottest hour, all summer long. It’s not unusual for a west slope to look years older than the north slope on the same house. Which is why a real inspection reads every slope separately, and why a glance from the street tells you almost nothing: the street usually can’t see the slope that’s in trouble.',
      ]},
      { heading: 'The small parts fail first', body: [
        'Long before shingles fail, the accessories go. Sealant beads dry into chalk and crack. The rubber boots around plumbing vents split, which is one of the most common leak sources on any Texas roof. Exposed nail heads back out a little more with every expansion cycle until one day water finds them. None of these cost much to fix. All of them cost real money to discover through a ceiling.',
        'And under it all, ventilation: an attic that can’t breathe superheats, and cooks the roof from below at the same time the sun cooks it from above.',
      ]},
      { heading: 'What “30-year shingles” means in Texas years', body: [
        'The rating on a shingle bundle is a lab number, not a promise, and Texas is not the lab. Heat, UV, hail, and wind all bill against that number early. The honest version: a roof’s real lifespan here is decided less by the number on the wrapper and more by whether anyone catches the small failures while they’re small.',
        'Which is a maintenance habit, not a purchase. One qualified look every year, written down, with the little stuff fixed on the spot. That’s Roof Watch, it’s free, and your roof’s file belongs to you. Text ROOF WATCH to (817) 886-2418 before the next summer gets here.',
      ]},
    ],
  },
] as const
