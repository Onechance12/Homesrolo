# Homesrolo

Homesrolo is the homeowner side of the Jobrolo network and the home’s private
Home Record: one durable record for the people, projects, photos, documents,
equipment, care, and history connected to a home. Roofing is the first deep
education and search vertical, not the product boundary. Homesrolo does not act
as a contractor CRM, public adjuster, insurer, claim advocate, or seller of home
services.

**Status: Phase 1 whole-home foundation.** The separate homeowner app has
passwordless email authentication, opaque server sessions, a private Supabase
persistence boundary, and private home workspaces. Its mobile-first setup now
asks only for a familiar home name and general area before allowing the
homeowner to finish; home type, approximate year, and the six-system snapshot
are optional and may remain explicitly unknown. The authenticated UI presents a
whole-home dashboard, a project center for planned, in-progress, and historical
work, and a Home Library organized around photos and checkups, insurance,
projects, inventory, warranties, taxes and sale records, maintenance, and
service history. Those library areas describe the information architecture;
only records actually returned by the private runtime are shown.

The native iOS/Android client now lives in `apps/mobile`. It is an Expo Router
application—not a WebView—and uses the same Homesrolo API through an explicit
native bearer-session contract. Its first end-to-end slice includes six-digit
code sign-in, home selection, Home/Care/Rolo/Work/People navigation, real work
records, Rolo drafts that require homeowner approval, private photo/document/
warranty capture, and authenticated photo viewing. Browser clients continue to
use the HttpOnly cookie contract. See `docs/NATIVE_APP_ARCHITECTURE.md`.

The preferred sign-in experience is a six-digit email code entered in the
same browser where the homeowner started. It is implemented behind the
default-off `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED` release gate. Until both
Supabase email templates, production SMTP, expiry, and a real delivery smoke
test are complete, the runtime continues to advertise the legacy email-link
flow instead. Activation also requires the independent server-only
`HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET`. See
`docs/HOMEOWNER_EMAIL_CODE_SIGNIN.md` for the exact cutover and rollback order.

The generic project route can create private records for roofing, exterior,
interior/remodeling, electrical, plumbing, HVAC, landscaping, appliances, pest
control, pools, new construction, and other home work. It supports work being
considered, work underway, and completed history. It does not hire, schedule,
approve, pay, rank, or recommend a professional. Migration `202608210002` must
be applied before the generic project command is used in a configured runtime.
The existing roofing-specific entry path remains available so public roofing
guides can carry a homeowner’s stated intent into the broader project center.

Inside a roofing project, a homeowner can record multiple proposal labels,
link an original proposal PDF when uploads are safely enabled, and mark what
each document says about measurement, materials, valleys, flashing,
penetrations, ventilation, warranties, payment terms, and exclusions. Missing
rows remain “not reviewed”; Homesrolo records no price score, ranking, or
contractor recommendation. The proposal comparison has its own default-off
`HOMESROLO_PROJECT_QUOTES_ENABLED` release gate, and migration `202608210001`
must be applied and verified before that gate is enabled.

The authenticated shell now includes Rolo, a private conversational organizer
at `POST /api/v1/homes/{homeRef}/assistant`. Rolo receives a bounded home index,
uses the stateless OpenAI Responses API, and can prepare one typed work-record
draft. It cannot write, share, hire, purchase, or contact anyone. The homeowner
must review and approve the draft, after which the browser uses the existing
receipt-backed project/update APIs. The app keeps recent conversation in the
browser session; OpenAI response storage is disabled.

Public home research remains a separate, stricter path at
`POST /api/v1/homes/{homeRef}/research`. With explicit consent, it can send one
street address, a bounded question, and limited recent context to OpenAI,
search public sources, and return cited proposed facts. It never silently
researches or saves a fact. Both paths fail closed unless the server has
`HOMESROLO_AI_ENABLED=true` plus a server-only `OPENAI_API_KEY`. See
`docs/HOME_RESEARCH.md` for the public-research privacy and source boundaries.

Private PDF/JPEG/PNG storage remains separately gated. A signed-in development
lane now supports a bounded private bucket without routing bytes through
Netlify, but public signup remains off and malware scanning is explicitly
deferred. Its permanent quota accounting and rollout steps are documented in
`docs/HOMEOWNER_DEV_PRIVATE_UPLOADS.md`. The Home Library shows an honest unavailable
state when that capability is off; it does not simulate an upload. Controller
verification, invitations, public sharing, payments, analytics, and automatic
professional routing remain outside this release.

A separate seasonal-photo workspace is implemented without opening that generic
uploader. A homeowner records the date, a home area, and a repeatable spot name
such as “hall ceiling by vent,” then adds one JPEG or PNG. The server decodes
the image and stores only fresh, resized private JPEG derivatives; it never
stores the submitted filename or raw input and strips embedded location and
device metadata. Saved views can be compared by the same area and spot, but
Homesrolo does not diagnose damage or claim that a condition changed. The workspace
has its own `HOMESROLO_PHOTO_CHECKUPS_ENABLED` gate and requires
migration `202608210003`. It has hard storage, request, and egress ceilings for
the existing free infrastructure, per-photo deletion, and no path to Jobrolo.
See `docs/HOMEOWNER_PHOTO_CHECKUPS.md` before enabling it.

With explicit consent, a homeowner may send one minimized roofing request to a
private Jobrolo review item assigned only to Chance. Files stay in Homesrolo
unless the separate, default-off attachment gate is enabled after the
receiver’s malware scanner is verified. It does not create a Jobrolo user,
lead, customer, or project, and it does not send the request to a contractor.
Chance decides whether and where to distribute it.

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
| docs/HOMEOWNER_PHASE1_RUNTIME.md | Implemented homeowner runtime, capability gates, migrations, and remaining launch work |
| docs/HOMEOWNER_EMAIL_CODE_SIGNIN.md | Same-browser six-digit email-code architecture, production cutover, and rollback |
| docs/HOMEOWNER_PHOTO_CHECKUPS.md | Default-off private seasonal-photo beta, privacy boundary, hard caps, and release checklist |
| docs/HOME_RESEARCH.md | Default-off OpenAI public-source research boundary, consent, citations, privacy, and operations |
| docs/HOME_RECORD_HANDOFF.md | Default-off exact-share Jobrolo → Homesrolo handoff architecture, configuration, canary, rollback, and export runbook |
| docs/NATIVE_APP_ARCHITECTURE.md | Native iOS/Android client, authentication, storage, navigation, and release boundaries |
| src/contracts/homeowner-share.v1.ts | Strict inert cross-repository share contract |
| src/contracts/home-file.v1.ts | Code-owned inert home-file policy decisions |
| src/contracts/home-file-record.v1.ts | Draft home/company/work-record schema and visibility resolution |
| src/contracts/company-link.v1.ts | Draft Jobrolo-to-Homesrolo company claim binding (proposal for Codex) |
| src/homeowner/homeowner-project-quotes.v1.ts | Private, revision-safe roof-proposal scope records; no price judgment or Jobrolo authority |
| src/homeowner/homeowner-checkup-photos.v1.ts | Private, sanitized, repeatable home-checkup photo contract; no diagnosis or generic-file authority |
| src/constitution/ | Pure request and response boundary checks |
| apps/web/lib/directory/ | Public profile contract, draft project-linked reviews, draft Academy credentials, draft claiming, draft corrections and disputes, projection allowlist, neutral ordering, synthetic fixtures |
| apps/web/app/ | Statically exported public site |
| scripts/public-web-guard.mjs | Fails the build on any Phase 0.5 prohibition |

## The public layer

The wedge is the **Home Record**: a homeowner releases a record of
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

The native app owns a separate dependency graph:

    npm --prefix apps/mobile ci
    npm --prefix apps/mobile start

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
