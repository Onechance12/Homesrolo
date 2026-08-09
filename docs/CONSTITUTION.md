# The Homesrolo constitution: education, never advocacy

> **This document is an engineering design record, not legal advice and not a
> compliance certification.** It states how the product is built to stay inside
> boundaries that we believe exist.
>
> **Attorney review has been obtained.** See "Legal review record" below. The
> record is incomplete, and completing it matters: a compliance document whose
> provenance is unrecorded cannot later be shown to a regulator as evidence of
> anything.

## The line

Homesrolo speaks to homeowners, who are consumers, about a regulated subject:
insurance claims on their own home.

**Education is explaining how something works, in general.**
**Advocacy is telling a specific person what to do about their own matter.**

Homesrolo does the first and never the second.

| Allowed | Refused |
|---|---|
| "Replacement cost value is what it costs to replace with like kind and quality." | "Your policy covers a full replacement here." |
| "Appraisal is a process some policies provide for resolving a dispute about the amount of loss." | "You should demand appraisal." |
| "Estimates are usually built from line items, quantities, and unit prices." | "That offer is low." |
| "A deductible is the amount the policyholder is responsible for." | "We can get your deductible waived." |
| "Here are the photos in your home record." | "Here is the letter to send your carrier." |

## Why the line sits there

**Public adjusting is a licensed activity.** In Texas, acting on behalf of an
insured in negotiating or effecting the settlement of a claim, or advertising to
do so, requires a public insurance adjuster license under Texas Insurance Code
chapter 4102. The Supreme Court of Texas upheld that licensing scheme against a
First Amendment challenge in *Stonewater Roofing, Ltd. Co. v. Texas Department
of Insurance* (2024). Software that tells a homeowner their settlement is
inadequate and what move to make is doing that activity, and "an AI said it" is
not a defense.

**Interpreting a policy and advising on remedies is the practice of law.** Texas
Government Code section 81.101 defines the practice of law to include advising
on rights under an instrument and preparing an instrument affecting legal rights.

**Some conduct is prohibited regardless of licensing.** Waiving, absorbing, or
rebating an insurance deductible is treated as fraud in many states. Coaching a
homeowner to overstate damage is insurance fraud. Guaranteeing an outcome, or
steering a consumer to a paid-for professional without disclosure, is a
deceptive practice under Federal Trade Commission Act section 5.

Official sources:

- Texas Insurance Code ch. 4102, Public Insurance Adjusters: https://statutes.capitol.texas.gov/Docs/IN/htm/IN.4102.htm
- Texas Government Code § 81.101, definition of the practice of law: https://statutes.capitol.texas.gov/Docs/GV/htm/GV.81.htm
- Texas Department of Insurance, public adjuster licensing: https://www.tdi.texas.gov/licensing/agent/public-adjusters.html
- Federal Trade Commission Act § 5, unfair or deceptive acts: https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act
- Fair Credit Reporting Act, 15 U.S.C. § 1681 (relevant if home records ever influence insurance or credit decisions): https://www.ftc.gov/legal-library/browse/statutes/fair-credit-reporting-act

## Legal review record

Chance reports that these documents have been reviewed by an attorney. What
that review covered is not yet written down here, and it should be, because the
value of a review is the record of it.

| | |
|---|---|
| Reviewing attorney and firm | not recorded |
| Date of review | not recorded |
| Commit or document version reviewed | not recorded |
| States covered | not recorded |
| Findings, and whether any remain unresolved | not recorded |

Three things the review does **not** settle, whatever it covered:

1. **It reviewed documents, not a product.** No homeowner-facing surface exists
   yet. When one does, what it actually says to a homeowner is the thing that
   needs reviewing, and this document is only the specification it was built
   from.
2. **It is state-specific.** Public adjusting and unauthorized-practice rules
   vary. Review in Texas is not review in the next state, and expanding is a
   new review, not a copy.
3. **It is time-bound.** *Stonewater* was decided in 2024 and the licensing
   scheme it upheld can be amended. A review is a snapshot, and the sources
   below are the things to re-check on a schedule.

## The eleven refusal categories

Defined in code at `src/constitution/categories.ts` and enforced by
`src/constitution/detector.ts`:

1. **Policy interpretation** — reading the homeowner's policy and saying what it means for them
2. **Coverage conclusion** — concluding that a loss is or is not covered
3. **Settlement evaluation** — judging whether an offer or estimate is adequate
4. **Claim strategy** — recommending a move on a live claim
5. **Carrier communication drafting** — writing or editing their message to the carrier
6. **Legal advice** — rights, remedies, deadlines, whether to sue
7. **Outcome guarantee** — promising what a carrier will do
8. **Deductible evasion** — waiving, absorbing, rebating, or hiding a deductible
9. **Damage exaggeration** — coaching overstatement or fabrication
10. **Paid steering** — directing to a specific professional, undisclosed or for value
11. **Compensated referral** — taking or arranging payment for routing claim work

Each category carries a rationale and a **permitted alternative**, because a
refusal that leaves a homeowner with nothing sends them to a worse source. The
tests assert every category has one.

## Enforcement in code

- `classifyRequest(text)` returns the categories a homeowner's message asks
  Homesrolo to cross. Empty means answerable.
- `auditResponse(text)` returns the boundaries a candidate answer would cross.
  Empty means publishable under the constitution.

Design properties, all asserted by tests:

- **Framing never launders intent.** Roleplay, hypotheticals, quoting a
  neighbor, "asking for a friend", retractions, and authority-override attempts
  are recorded for audit and then ignored: the wrapper is stripped and the
  residual request is judged on its own terms, with the original also scanned.
- **Order independence.** Rules pair a topic signal with a trigger signal in one
  window, in any order, because people write "the offer was lowball" as readily
  as "is the offer fair".
- **Adjacent sentences are one window.** "My carrier made an offer. Is it fair?"
  is a single request wearing two sentences. Scoring each sentence alone finds a
  topic with no trigger, a trigger with no topic, and answers it. The window
  stops at two, so an unrelated topic five sentences back cannot combine with a
  later trigger.
- **Advice does not need the word "should".** The response auditor catches bare
  imperatives — "Invoke appraisal immediately.", "Take the offer; twelve
  thousand dollars is plenty." — because grammatical mood is not a boundary.
- **A refusal that names the boundary is not a violation of it.** "I cannot tell
  you that your policy covers this loss" contains the exact words of a coverage
  conclusion while asserting the opposite. The auditor recognizes a first-person
  epistemic refusal or a universal prohibition and does not flag what follows
  it. The guard is narrow: a bare "not" does not qualify, so "you should not
  accept that offer" is still caught — that is advocacy with a negative sign.
  Advocacy that *precedes* the hedge is also still caught.
- **All eleven categories are audited on both sides.** A request the classifier
  refuses and an answer the auditor would publish is a hole; the test suite pins
  a vector for every category in both directions.
- **Over-refusal is a failure too.** Definition and general-education requests
  must stay answerable. Every category carries a named safe-education vector
  that must not be refused, alongside its prohibited vector.
- **Mixed intent refuses.** A message that pairs a legitimate question with a
  prohibited one is refused on the prohibited half, and is not counted as
  educational.
- **Each turn is judged alone.** A benign opener cannot establish permission for
  a later prohibited turn.

## Required disclosures

Every surface where Homesrolo answers a homeowner must carry, visibly and not
buried in terms:

- Homesrolo is not an insurance company, not a public insurance adjuster, and
  not a law firm.
- Homesrolo explains how things work. It does not advise on your own claim,
  policy, or settlement.
- For advice about your claim, talk to a licensed public insurance adjuster or
  an attorney.

## Known limitations

- **Lexical detection is a floor, not a judge.** It catches the obvious and the
  adversarially obvious. A sufficiently novel phrasing can pass. It is one
  control among several and does not replace a constrained system prompt,
  narrow scope, or human review.
- **English only.** No coverage for other languages in this phase.
- **No semantic understanding.** The classifier does not know what a sentence
  means, only which signals co-occur.
- **Review covered the specification, not a live surface.** The permitted
  alternatives are wording *intentions*. The actual sentences a homeowner reads
  do not exist yet, and those are what a regulator would look at.
- **No live assistant exists yet.** These are contracts awaiting an
  implementation to constrain.
