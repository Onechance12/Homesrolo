# Legal posture: seeding, publishing, and AI on company pages

**Not legal advice. Written by an engineer, for counsel to correct.** Research
snapshot checked 2026-08-09. Every position here is a design constraint chosen
to keep a later, reviewed launch possible — not a conclusion that something is
permitted.

Counsel review is a launch gate for every section below.

## 1. Where seeded company data may come from

The **Posture** column is this product's own engineering stance, not a legal
conclusion. Every row is subject to counsel review before real data is used.

| Source | Product posture | Why, and what is unresolved |
| --- | --- | --- |
| **Self-serve** | **V1 default; lowest risk of the options** | The company submits its own information and it lands as `company_self_reported`, never as a confirmed fact. It reduces third-party exposure rather than eliminating it: a company can still submit content that infringes, misdescribes a competitor, or contains someone else's personal data, so intake terms, a takedown route, and content limits are still required. |
| **Public business registries** | **Not before review** | Secretary of State filings are public record, and facts as such are generally not copyrightable. Access terms vary by state and the two problems below are unresolved. |
| **Consented Jobrolo tenants** | **Not before explicit, recorded, revocable consent** | Publishing a customer's tenant as a public profile is a disclosure decision. Consent must be specific and withdrawable, not folded into a terms update. |
| **Licensed data providers** | **Not before a signed contract** | Terms govern, and cost is the trade for clarity. |
| **Scraping Google, Yelp, BBB, Angi, Pinterest** | **Not doing this** | Their published terms prohibit it. Whether scraping publicly reachable data is a *computer-crime* violation is a separate question with generally favourable case law, but contract-based exposure is unaffected by that. Yelp's terms additionally prohibit using their API to build a competing directory, which is what this is. |

Two problems with registry data that must be solved before ingesting any:

1. **Sole proprietors routinely register a home address.** "Public business
   data" is frequently a residential address belonging to a named person.
   Publishing it is a privacy decision, not a data-availability one. Any
   registry pipeline needs an address-classification step and a default of
   suppressing residential addresses.
2. **Registry data goes stale and is often wrong.** A dissolved entity, a
   renamed business, or a lapsed filing published as current is a false
   statement about a real company. Every registry-derived value must carry its
   source, its filing date, and the date Homesrolo read it — which the existing
   `VerificationFact` shape already requires.

## 2. Publishing a profile the business never asked for

Large directories operate this way, so the model is evidently workable at scale
with the right controls — that is an observation about industry practice, not a
conclusion that any particular implementation is lawful. The exposure is
**defamation on a false statement of fact**, and it is real. It is also
jurisdiction-specific, and this product has had no counsel review of unclaimed
publication. Design constraints that follow, all of which are prerequisites
rather than mitigations applied later:

- Publish **facts with a source and a date**, never conclusions, ratings we
  invented, or characterisations.
- **No opinion, no inference, no summary judgement** about a company anywhere on
  a profile.
- A **corrections and disputes route must exist before the first real unclaimed
  profile is published.** A published statement about a business with no way for
  that business to contest it is the definition of the liability.
- **Prompt takedown** on a substantiated complaint, with the removal shown
  rather than silently applied.
- Absence must be visible: `not_checked` is stated, never omitted, so a thin
  profile reads as thin rather than as damning.

## 3. Section 230, and why the AI agent is the sharpest edge here

Section 230 protects a platform from liability for **third-party** content. It
does not protect content the platform itself creates.

**AI-generated output is increasingly treated as the platform's own content.**
The question courts are working through is whether the developer "materially
contributes" to the output, and generative systems make the platform look like
the creator rather than the host. Notably, OpenAI has defended defamation claims
on traditional defamation grounds rather than invoking Section 230, which is a
strong signal about how much weight that shield carries here.

Applied to this product:

| Content | Whose speech | Shield |
| --- | --- | --- |
| A homeowner's review | Third party | Section 230 likely applies |
| A company's own submitted description | Third party | Section 230 likely applies |
| **An AI-generated statement about a real company** | **Homesrolo's** | **Likely none** |

So an agent that says "this company does great roofs", "seems unreliable", or
anything evaluative is **Homesrolo making a factual claim about a real business,
automatically, at scale, with no shield.** That is the highest-liability feature
discussed to date, and it is higher than reviews, seeding, or credentials.

## 4. The buildable version of a per-company agent

The constraint is the same one the constitution already applies to homeowners:
**librarian, not advisor.**

**Permitted**

- Retrieve and surface what the company itself submitted, with provenance.
- Answer "what services does this company list?" by quoting the listing.
- Say what is *not* recorded: "no insurance certificate has been checked."

**Prohibited**

- Any evaluation, comparison, ranking, recommendation, or prediction.
- Any inference beyond what the record literally states.
- Answering "is this company good / trustworthy / better than X."
- Generating profile text that is then published as fact.

**The update loop, stated as a rule:** the agent may *propose* a change; the
company *approves* it from Jobrolo; the approved value lands as
`company_self_reported`. **The agent never writes a fact directly, and never
promotes anything to `confirmed`.** That keeps authored words in the company's
mouth, which is both the honest position and the one Section 230 was written
for.

An agent operating on the homeowner side, over a homeowner's own home file, is a
different and much safer case — it is retrieval over the user's own data for
that user. It is still bound by `CONSTITUTION.md`.

## 5. What must be true before real company data is published

1. Corrections and disputes implemented, with a recorded operator and audit
   trail.
2. Address classification, with residential addresses suppressed by default.
3. Source, filing date, and read date on every externally-derived value.
4. A takedown path and a named human responsible for it.
5. Counsel review of: seeding source, unclaimed-profile notice, the agent's
   permitted-response envelope, and the terminology in
   `PUBLIC_DIRECTORY_RFC.md` §4 as it will actually appear on a page.
6. Written permission or a licence for any third-party provider content.

Until all six exist, V1 is **self-serve only**, and every profile in the
repository is synthetic. Nothing in this document should be read as clearance to
publish data about a real business.

## Sources consulted (2026-08-09)

- Congressional Research Service, *Section 230 Immunity and Generative Artificial Intelligence* — https://www.congress.gov/crs-product/LSB11097
- Harvard Law Review, *Beyond Section 230: Principles for AI Governance* — https://harvardlawreview.org/print/vol-138/beyond-section-230-principles-for-ai-governance/
- Yelp API Terms of Use — https://terms.yelp.com/developers/api_terms/20250113_en_us/
- Google Places API policies and attributions — https://developers.google.com/maps/documentation/places/web-service/policies
