# Homesrolo

The homeowner side of the Jobrolo network: a durable record of a home and an
education-first assistant that helps homeowners understand maintenance and
work history without acting as a contractor CRM, public adjuster, insurer, or
claim advocate.

**Status: Phase 0.5.** Contracts, architecture policy, and a statically
exported public web experience. There is still no account system, database,
API route, upload, property resolver, live assistant, share transport, payment,
analytics, or production connection to Jobrolo. Every company and project on
the site is synthetic.

## Contents

| Path | Purpose |
| --- | --- |
| docs/HOME_FILE_RFC.md | Home identity, control, visibility, transfer, retention, and permitted-use decisions |
| docs/ARCHITECTURE_BOUNDARY.md | Boundaries across Homesrolo, Jobrolo, Claim Network, and Thresher |
| docs/CONSTITUTION.md | Education-never-advocacy rules |
| docs/THREAT_MODEL.md | Privacy, security, deletion, failure, and launch gates |
| docs/RECEIPT_WIRE_SPEC.md | Exact Jobrolo-aligned Phase 0 wire |
| docs/PUBLIC_DIRECTORY_RFC.md | Neutrality, fact-level provenance, corrections, and external-source limits |
| docs/PLATFORM_STRATEGY.md | Endgame, aggregation constraints, revenue shape, sequence, risks |
| docs/LEGAL_POSTURE.md | Seeding sources, unclaimed profiles, Section 230, and the AI-agent boundary |
| src/contracts/homeowner-share.v1.ts | Strict inert cross-repository share contract |
| src/contracts/home-file.v1.ts | Code-owned inert home-file policy decisions |
| src/contracts/home-file-record.v1.ts | Draft home/company/work-record schema and visibility resolution |
| src/contracts/company-link.v1.ts | Draft Jobrolo-to-Homesrolo company claim binding (proposal for Codex) |
| src/constitution/ | Pure request and response boundary checks |
| apps/web/lib/directory/ | Public profile contract, draft project-linked reviews, draft Academy credentials, draft claiming, draft corrections and disputes, projection allowlist, neutral ordering, synthetic fixtures |
| apps/web/app/ | Statically exported public site |
| scripts/public-web-guard.mjs | Fails the build on any Phase 0.5 prohibition |

## The public layer

The wedge is the **Home Project Passport**: a homeowner releases a record of
real work, and that release is the only thing that can substantiate a company's
project proof. The public directory is downstream of it, and is deliberately not
a general review site.

- Verification is **five independent facts** — business identity, licence and
  jurisdiction, insurance, project proof, review provenance — each with a
  status, a source, and the date it was checked. There is no overall verified
  badge and no field that could carry one.
- Ordering is by name and reads nothing else, including verification, so
  placement cannot be bought.
- Outside providers are linked and attributed, never scraped or restated. V1
  accepts synthetic `example.com` links only.
- **Reviews, credentials, and claiming are DRAFT demonstrations and prove
  nothing.** A review's project reference is a format-checked string: nothing
  verifies a signed homeowner release, checks a current-state ledger, or binds
  an author, and there is no account system. No review is presented as
  verified-project proof, and a test fails the build if any string says
  otherwise. The Academy has no enrolment, assessment, or issuing authority, and
  no claiming system exists. `REVIEW_PROOF_STATUS`,
  `CREDENTIAL_ISSUANCE_STATUS`, and `CLAIM_VERIFICATION_STATUS` record every
  missing check as `false` and are asserted in CI.
- Intended designs, none enforced: no aggregate star rating; removed reviews stay
  visible with a reason; credentials earned rather than bought, expiring, and
  never affecting ordering; claiming confirms control and never a fact.
- The public layer cannot reach the private ones: importing the share,
  home-file, home-file-record, or company-link contracts fails the guard.
- **A company claims its page through Jobrolo**, and content authored there
  arrives as `company_self_reported` — the envelope is structurally incapable of
  carrying a verification fact or a confirmed status.
- **An assistant may propose a change; a person approves it.** AI never writes a
  fact and never promotes anything to confirmed. Section 230 protects
  third-party content, not the platform's own, so AI-generated statements about
  a real company are the platform speaking. See `docs/LEGAL_POSTURE.md` §3.

## Core decisions

- A home file is a durable logical record, not a shared folder or a promise to
  retain every raw byte forever.
- The uploader and the verified controller are separate.
- Home-file membership and contribution existence are not visibility.
- A new owner does not inherit prior content access.
- Property matching never fuzzy auto-merges; merges are reviewed and
  reversible.
- V1 forbids insurance underwriting/pricing, lending, purchase, tenant,
  employment, and adverse-action use.
- Jobrolo’s reviewed Phase 0 contract is the wire anchor; Homesrolo reproduces
  its literal vectors rather than inventing another receipt protocol.
- Phase 0 authorizes no delivery.

## Development

Requires Node 22.6 or newer.

    npm install
    npm --prefix apps/web install
    npm run verify

`verify` runs the contract typecheck, the constitution and contract tests, the
public directory model tests, the static production web build, and the Phase 0.5
prohibition guard.

To preview the site locally:

    npm --prefix apps/web run dev      # http://localhost:3000

Or serve the built static export exactly as CI produces it:

    npm run web:build
    npx serve apps/web/out

## Legal status

Nothing in this repository is legal advice or a compliance certification, and
no document here should be read as clearance for any feature.

Qualified counsel review is a launch gate. It is required before real homeowner
or company data is used, and again for any material change: identity and
control verification, retention and deletion, corrections and takedown,
publication of data about a real business, external-provider integration, and
any assistant that generates text about a third party. Prior review of an
operating model is not treated as blanket product clearance.

This repository does not request, store, or reference privileged attorney
information, and does not identify individuals in connection with legal review.
