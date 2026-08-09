# Public directory RFC

**Status: Phase 0.5 foundation. Contracts, fixtures, and a static site only.**
No account, database, upload, API route, ingestion, ranking engine, or payment
exists. Every company, project, credential, and link shipped today is synthetic.

Not legal advice. The neutrality and terminology rules here are engineering
constraints intended to keep a later, reviewed launch possible.

## 1. Why this layer exists

The wedge is the **Home Project Passport**: a homeowner explicitly releases a
record of real work — what was done, by whom, which materials, what is
warranted, which photos are approved. That release is the only thing that can
later substantiate a company's project proof, because it is the one claim a
company cannot make about itself.

Everything the public layer is allowed to become follows from that. Company
profiles, project-linked reviews, discovery, guides, and inspiration are all
downstream of released records. None of them is a reason to build a general
review site, and this document exists to keep that distinction from eroding one
feature at a time.

## 2. Neutrality

**Ordering is by name and reads nothing else.** `lib/directory/ordering.ts`
takes `displayName` and `slug`. It has no rating input, no recency input, no
engagement input, and — deliberately — **no verification input**.

Excluding verification is the non-obvious part. If confirming a licence moved a
company up the page, verification would become a paid ranking product the moment
checking a licence costs money. Facts inform the reader; they do not order the
list. A test shuffles the fixture list, injects `sponsorshipTier`, `rankBoost`,
and `placementFee`, strips all verification, and asserts the order never moves.

**Paid placement is prohibited in V1.** No payment, sponsorship, or advertising
relationship may create, upgrade, accelerate, or reorder anything. If sponsored
placement ever exists it must be visibly labelled and kept outside neutral
ordering, and it may never touch a verification fact.

**Homesrolo does not recommend a company.** A listing is information, not an
endorsement. There is no "best", no "top rated", no editor's pick, and no lead
sale.

## 3. Fact-level provenance

There is no overall `verified` boolean, and `parsePublicProfile` has no field
that could carry one. Verification is five independent dimensions:

| Dimension | Question |
| --- | --- |
| `business_identity` | Does a registered entity matching this name exist? |
| `license_jurisdiction` | Which licence, issued by whom, covering what and where? |
| `insurance` | What cover was evidenced, by which certificate, through what period? |
| `project_proof` | Has a homeowner released a project naming this company? **No check exists, so this stays `not_checked` on every fixture.** |
| `review_provenance` | Where does any review come from, and is it tied to a released project? **No check exists.** |

Every fact carries a `status`, a `source`, a `checkedAt` date, an optional
`asOf` for when the underlying record speaks to, and an `expiresAt` for anything
that lapses. A status with no source and no date is a rumour with a badge on it,
and the display layer refuses to render one: a test asserts all three appear for
every fact on every fixture.

**Expiry beats stored status.** `effectiveStatus` returns `expired` once
`expiresAt` has passed, whatever the record says, so a lapsed certificate cannot
keep presenting itself as confirmed.

**Silence is not neutral.** A company with no insurance fact at all reads as
fine unless the absence is stated, so a complete profile carries an explicit
fact for every dimension, including `not_checked`.

## 4. Terminology

Words that will be used consistently, because the difference between them is the
entire product:

- **Confirmed** — Homesrolo checked a named source on a named date. It is a
  statement about that source at that time, never a general endorsement.
- **Self-reported** — the company said so. A legitimate source, never displayed
  as confirmation, always labelled.
- **Not checked** — Homesrolo has not looked. Stated explicitly rather than
  omitted.
- **Expired** — there was evidence and its own period has ended.
- **Released** — *intended* to mean a homeowner chose to publish a project
  record, verified by signature. Only a homeowner would be able to release. **No
  release or verification flow exists**, so today the word describes a fixture
  marker and nothing more.
- **Claimed profile** *(not built)* — a company asserting control of a listing.
  Claiming will never by itself confirm any fact.

Avoided entirely: "verified company", "trusted pro", "certified", "approved",
"vetted", "top rated", "guaranteed". Each implies a general judgement the data
cannot support.

## 5. External sources and their terms

Homesrolo **links and attributes. It does not scrape, mirror, cache, or
restate.** No content from BBB, Google, Angi, Pinterest, or any other provider
is copied into this repository or into a page. Ratings and review text stay on
the source, which is a terms-of-service boundary and an accuracy one at once: a
copied rating is stale the moment it is copied, and a rating quoted out of its
own context misrepresents the organisation that produced it.

Outbound links carry `rel="nofollow noopener noreferrer external"`, an
attribution line, and no implication of partnership.

**V1 accepts synthetic links only.** The schema rejects any URL that is not
`https` on `example.com` or a subdomain, so a real provider URL cannot be added
by editorial discretion. Real links require permission or a licensed API plus an
attribution review, and lifting that restriction is a deliberate schema change
with a test to update.

## 6. Corrections and disputes

A record about a business can be wrong, and a directory with no route to fix it
is a liability to everyone listed in it. This is a launch requirement, not a
later addition:

1. A company can contest any individual fact, not the profile as a whole.
2. A contested fact displays as contested while it is reviewed. It is not
   silently removed, because disappearance is itself a signal.
3. The outcome becomes a fact like any other, with its own status, source, and
   date.
4. Corrections are never conditioned on payment, on claiming a profile, or on
   any commercial relationship.
5. The dispute history is retained so a pattern of contested facts is visible to
   whoever operates the directory.

## 7. Regulated professionals are a separate lane

Public adjusters and other licensed claim professionals **cannot** be mixed into
ordinary contractor listings, ordinary ordering, or any compensated steering.
Routing a homeowner toward a claim professional touches the licensing and
anti-steering rules in `CONSTITUTION.md`, and that lane needs its own review
before it exists at all. Nothing in this RFC authorises it.

## 8. Isolation from the private layers

This layer shares no data path with either private layer, and the isolation is
enforced rather than described:

- **No import.** `scripts/public-web-guard.mjs` fails the build if anything
  under `apps/web` imports `homeowner-share.v1` or `home-file.v1`.
- **No private fields.** `PROHIBITED_PUBLIC_FIELDS` rejects addresses, parcels,
  coordinates, homeowner identity, contact details, claim and policy references,
  share identifiers, job identifiers, costs, margins, internal notes, and every
  commercial-placement field, by name, rejecting the whole profile.
- **Allowlisted output.** Pages render `toPublicProjection(profile)`, built from
  an explicit key list, so a field added to the model later does not reach the
  public surface by default.
- **No server.** The site is a static export with no API route, server action,
  middleware, database, or environment read. The guard fails the build if any
  appears.
- **The share contract stays inert.** Nothing here activates it, and its Phase 0
  delivery decision still authorises nothing.

A public profile therefore cannot expose a home file, an address, a claim
detail, or anything originating in a contractor's own system — not because the
page avoids printing it, but because it has no way to obtain it.

## 9. What V1 explicitly does not do

No underwriting, pricing, lending, purchase-eligibility, tenant-screening,
employment-screening, or automated adverse-action use. Those are prohibited in
`home-file.v1.ts` and repeated here because a public directory is exactly where
pressure to allow them arrives. A permanent per-property history consulted in
those decisions raises consumer-reporting questions that need their own counsel
review, as recorded in `HOME_FILE_RFC.md`.

No AI assistant, no search ranking or recommendation engine, no reviews, no lead
sales, no referrals, no payments, and no analytics or cookies.

## 10. Project-linked reviews (draft, not proof)

**Retraction.** An earlier draft of this section claimed that requiring a
project reference makes fabricated reviews "unrepresentable". That was wrong.
`releasedProjectRef` is a slug-shaped string. Nothing verifies a signed
homeowner release, nothing checks a current-state ledger, nothing binds the
author to the releasing homeowner, and there is no account system, so there is
no author to bind. The demo holds together because every fixture is
hand-written.

**What the field is:** a draft activation invariant. It fixes the shape early
and names the missing checks. `REVIEW_ACTIVATION_REQUIREMENTS` lists them and
`REVIEW_PROOF_STATUS` records that all of them are unbuilt; both are asserted by
tests and rendered on the page.

**Hard rule: no review may be presented as verified-project proof until signed
release verification and an authoritative current-state check exist.** The UI
says "Sample — unverified", the chip is neutral rather than green, and a test
fails the build if any exported string describes a review as verified-project
proof.

The remaining design intent — all of it unbuilt, none of it enforced — is in
`REVIEW_POLICY_INTENT`, where every line is prefixed "Intended:" so it cannot be
misread as current behaviour:

- Reviews will require a signed, currently-live release naming the company,
  checked at submission and rechecked at display.
- No screening for happy customers before inviting feedback.
- Nobody can pay to add, remove, reorder, or soften a review. Ordering already
  reads company name only, so this half is true today.
- One company response per review, beside it, never editing or rescoring it.
- A removed review still appears, marked removed with a reason.
- Incentive, employment, and related-party relationships disclosed on the review.

**No aggregate star rating**, now or later. Reviews score five dimensions,
averaged per dimension with counts. One number hides which part went wrong and
is the figure every other platform sorts by, which is how review scores become
worth buying.

Design intent aims at the failure modes in the FTC rule on consumer reviews and
testimonials (16 CFR part 465). Intent is not compliance, and nothing here has
been reviewed by counsel.

## 11. Homesrolo Academy: earned credentials (design, not a programme)

**Nothing in the Academy exists.** There is no enrolment, course delivery,
assessment engine, issuing authority, identity check, or conduct process.
`CREDENTIAL_ISSUANCE_STATUS` records each of those as unbuilt and is asserted by
tests. Every credential in the repository is a synthetic fixture, and no
credential may be presented as earned until issuance exists.

The design below is the target. Paid accreditation tells a homeowner that a
company spent money. Two structural rules are intended to keep this from
becoming the same thing:

1. **A credential cannot be purchased.** There is no price, fee, tier, or
   sponsorship field in the schema. Enrolment fees may fund the programme; they
   buy a seat, never a pass. No payment can award, restore, or extend a
   credential.
2. **A credential cannot buy placement.** Ordering reads name and slug only. If
   completing coursework moved a company up a list, the Academy would be a paid
   ranking product wearing an educational hat.

A credential requires completed hours, a passed assessment at a uniform mark,
and a written conduct undertaking. It **expires** and must be re-earned, and it
is suspended or withdrawn on a substantiated conduct finding — shown, not
deleted. As with verification facts, expiry beats stored state.

The curriculum targets the failure modes that harm homeowners and sink
contractors: ethics and consumer protection, insurance claim boundaries, money
management, estimating and scope documentation, warranty and handover, and
communication. The claim-boundaries course exists because a contractor drifting
into unlicensed adjusting is the most common way a competent company acquires a
regulatory problem, and it teaches the same line `CONSTITUTION.md` draws.

**A credential is not a licence, not a substitute for one, not a guarantee of
workmanship, and not an endorsement.** That is stated in the model, on the
Academy page, and on every profile that shows one.

## 12. Claiming a profile (design, not a system)

**No claiming system exists.** Nobody checks a registry, a domain, or an
identity, and there is no dispute reviewer. `CLAIM_VERIFICATION_STATUS` records
this and is asserted by tests; a `controlEvidence` entry in a fixture is a label,
not evidence.

The intended design answers exactly one question: does this person control this
business? It answers nothing else.

Every other directory blurs this — you claim a listing and a badge appears —
which teaches homeowners that a claimed profile is a checked profile. Here,
claiming grants the ability to respond to reviews, submit evidence for checking,
correct factual details, contest a fact, and enrol in coursework. It confirms no
verification fact, removes no review, changes no position, creates no tier, and
requires no payment. A claimed profile with nothing verified looks exactly as
thin as an unclaimed one.

## 13. Next slice

In order: the corrections and disputes process in §6, since reviews and facts
both depend on it; a claiming flow that confirms control without confirming
facts; a licence-registry check with a recorded source and cadence; and counsel
review of the terminology in §4 and §11 as it will actually appear on a page,
including whether "credential" or "certificate" carries unwanted implications in
the trades. Reviews depend on released projects existing, which depends on the
private home file, which is not built.
