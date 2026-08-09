# Platform strategy: what Homesrolo is actually building

Status: **strategy, not commitment.** Nothing here is built. This exists so the
next five decisions are made against a destination rather than one at a time.

## 1. The endgame, in one sentence

**Homesrolo is the system of record for a home, and chat is how you use it.**

The test of whether it worked: when a house sells, the passport goes with it,
and the buyer's first question is "let me see the Homesrolo file" — the way a
used-car buyer asks for the Carfax before they ask the seller anything.

Everything else is a path to that.

## 2. Three assets, ranked by how hard they are to copy

**1. Released project records.** Work that actually happened, published by the
homeowner who owned the record, with materials, dates, and warranty attached.
Google cannot buy this. Angi cannot scrape it. It only exists because both
sides of a job are in the system. This is the moat.

**2. The home file.** Inventory, appliances, serial numbers, insurance
documents, maintenance history, service relationships, large purchases. Low
glamour, enormous switching cost. Nobody rebuilds five years of their house's
history to move platforms.

**3. The graph.** Which pro did what work, at which home, verified by whom.
This is what eventually powers discovery, pricing intelligence, and the
transaction product — and it is a byproduct of the first two, not a thing to
build directly.

**The directory is none of these.** It is acquisition: SEO surface, a reason to
show up, and a credible answer to "who should I call". It is not the business.
Confusing the storefront for the business is how you end up as Angi.

## 3. The aggregation constraint, honestly

You want a hub of Google, Bing, Yelp, BBB, and Angi. Here is what is actually
available, because this determines the design:

| Source | Reality |
| --- | --- |
| **Yelp Fusion** | 3 reviews max, 24-hour cache limit, attribution required, **blending their rating with other sources into an aggregate is expressly prohibited**, and the terms prohibit using the API **to build a competing business directory** |
| **Google Places** | Limited reviews per place, attribution required, caching restrictions; no blended-score product |
| **BBB** | No open public API. Ratings are licensed, and scraping violates their terms |
| **Angi** | No public review API. Scraping violates their terms |
| **Bing** | Not a review corpus of its own — it surfaces other providers' content. There is nothing to connect to |

Three consequences, and I would rather say them now than after a build:

**A unified Homesrolo score is off the table.** Not "hard" — contractually
prohibited by at least one source and misleading regardless. Averaging a Google
4.6 (312 reviews, all time, unverified) with a Yelp 3.9 (11 reviews, filtered
by an algorithm nobody understands) produces a number that means nothing.

**The Yelp competing-directory clause is a real legal question**, not a
formality. Homesrolo is a business directory. Whether their API can be used by
one at all needs counsel before any integration work — that is a cheap question
to ask and an expensive one to skip.

**So the hub is side-by-side, never blended.** Each source appears as its own
panel: its score, its count, its date, its logo, its link, fetched live and not
stored. Exactly the fact-level discipline already built for verification — same
principle, new surface.

And this is the better product anyway. "Here is what every platform says, side
by side, unblended, plus the one thing only we have: reviews attached to work
that provably happened." A meta-score would have been a worse, less honest
version of that.

## 4. The revenue problem, created on purpose

Paid placement is banned. Lead sales are banned. Those are the two ways
directories make money, and both are closed by design. So revenue has to come
from somewhere else, and it is worth choosing now because it changes what gets
built:

1. **Homeowner subscription.** Home file, documents, inventory, reminders.
   Modest per-seat revenue, very high retention. Proves the core loop.
2. **Contractor SaaS.** Already Jobrolo's business. Homesrolo makes Jobrolo more
   valuable, which is a real return even if Homesrolo bills nothing.
3. **Academy tuition.** Legitimate under the rules: a fee buys a seat, never a
   pass. Small revenue, large trust dividend, and it is the marketing.
4. **The transaction.** A passport at closing — disclosure support, buyer
   confidence, agent tooling. Highest value per event, latest to arrive, and the
   most regulated.

My read: **1 funds the loop, 2 justifies the build, 4 is where the company
becomes valuable.** 3 is the brand. Do not chase 4 early; it depends entirely on
having real released records, which depends on 1 and 2 working.

## 5. Chat-first, and the line it must not cross

Chat is the right interface. A homeowner will not maintain a structured
database of their house, but they will answer "what did you just get done?" and
send a photo of a receipt.

The assistant's job description, which is also its legal boundary:

> **It is a librarian, not an advisor.**

It retrieves, organizes, files, reminds, and summarizes *what is in the record*.
It does not interpret what the record means for a regulated decision.

| Assistant may | Assistant may not |
| --- | --- |
| "Your roof was replaced in May 2026, 30-year architectural shingle." | "Your roof damage should be covered." |
| "Here is your declarations page." | "Your policy means the carrier owes you this." |
| "Your water heater is 11 years old; typical service life is 8–12." | "You should file a claim." |
| "Three companies did work here. Here are the records." | "Use this contractor." |
| "You saved this estimate on 3 March." | "That estimate is too low." |

The existing constitution already draws this line and already tests it. The new
pressure is that a home file full of insurance documents makes crossing it
*useful*, which is exactly when boundaries fail. The response auditor has to run
on assistant output at runtime, not just on static copy in CI.

## 6. Sequence

**Phase 1 — the home file, chat-first.** Accounts, home identity, chat intake,
documents, inventory, maintenance timeline. No public writes, no sharing yet.
This is the product; everything before it was the storefront.

**Phase 2 — connected sources and a grounded assistant.** Side-by-side external
review panels on company profiles, live and attributed. Assistant grounded in
the homeowner's own file only, with the auditor on every response.

**Phase 3 — service relationships.** The recurring pros: lawn, pool, cleaning,
pest, HVAC. This is what turns the home file from a filing cabinet into
something opened weekly. It is also where the first released records come from
at volume, because small recurring jobs vastly outnumber roof replacements.

**Phase 4 — the transaction.** Passport transfer at sale, disclosure support,
new-owner onboarding. Requires the FCRA question answered first.

Per-company chat sits at Phase 3 or later. It sounds small and is not: the
moment Homesrolo routes a homeowner to a specific company and money moves, it is
steering, and steering is regulated in the claim context. It needs its own
review.

## 7. The four risks that could actually break this

1. **FCRA at sale.** A permanent per-property history consulted in a purchase
   decision looks like a consumer report. This is already flagged in
   `HOME_FILE_RFC.md` §5 and it gates Phase 4 entirely.
2. **The Yelp competing-directory clause**, above. Ask before building.
3. **Assistant drift.** A chat with your insurance documents in scope will be
   asked coverage questions daily. The auditor must run at runtime and refusals
   must be useful, or the product is either unhelpful or unlicensed.
4. **Empty-network cold start.** Reviews require released projects; released
   projects require contractors on Jobrolo *and* homeowners on Homesrolo. Phase 3
   is the answer — recurring services create volume that roofing never will —
   but the first six months look sparse and that has to be survivable.

## 8. Next three slices

1. **Corrections and disputes.** Still the blocker. Reviews and verification
   facts both dead-end into it, and it is far cheaper before real companies
   exist.
2. **Home file schema and chat intake contract.** The Phase 1 core: home
   identity, contribution, controller, classification, retention class — as
   typed contracts with tests, the same way everything else here was built,
   before any database exists.
3. **External source panel contract.** Typed, per-source, display-only, with
   no-blend and no-store enforced by the model rather than by policy — so the
   integration cannot be built wrong later.

Counsel questions to bundle: the Yelp clause, FCRA at sale, and whether
"credential" carries unwanted meaning in the trades.
