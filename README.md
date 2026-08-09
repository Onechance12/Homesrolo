# Homesrolo

The homeowner side of the Jobrolo network: a durable record of a home and an
education-first assistant that helps homeowners understand maintenance and
work history without acting as a contractor CRM, public adjuster, insurer, or
claim advocate.

**Status: Phase 0.** This repository contains pure contracts, tests, and
architecture policy only. There is no website, account system, database,
upload route, property resolver, live assistant, share transport, or
production connection to Jobrolo.

## Phase 0 contents

| Path | Purpose |
| --- | --- |
| docs/HOME_FILE_RFC.md | Home identity, control, visibility, transfer, retention, and permitted-use decisions |
| docs/ARCHITECTURE_BOUNDARY.md | Boundaries across Homesrolo, Jobrolo, Claim Network, and Thresher |
| docs/CONSTITUTION.md | Education-never-advocacy rules |
| docs/THREAT_MODEL.md | Privacy, security, deletion, failure, and launch gates |
| docs/RECEIPT_WIRE_SPEC.md | Exact Jobrolo-aligned Phase 0 wire |
| src/contracts/homeowner-share.v1.ts | Strict inert cross-repository share contract |
| src/contracts/home-file.v1.ts | Code-owned inert home-file policy decisions |
| src/constitution/ | Pure request and response boundary checks |

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
    npm run verify

verify runs TypeScript and all contract/adversarial tests.

## Legal status

Chance states that an attorney familiar with the operations has reviewed how
the business can work. The documents here do not request or disclose privileged
attorney information and are not legal advice or blanket compliance
certification. The exact future identity, retention, furnishing, and launch
data flows still require review before real homeowner data is used.
