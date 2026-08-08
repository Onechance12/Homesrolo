# Homesrolo

The homeowner side of the Jobrolo network. A homeowner's record of their own
home, and an assistant that explains how things work.

**Status: Phase 0.** This repository currently contains contracts, tests, and
architecture documents only. There is no website, no account system, no
database, no live assistant, no uploads, and no connection to Jobrolo.

## What this repository is for

Homesrolo gives a homeowner one place that is theirs: the work done on their
home, the photos and measurements behind it, and plain answers about how the
process works. Contractors keep their own system. Homeowners get their own.

Public surfaces say **Ask Homesrolo**.

## What Homesrolo is not

- Not a contractor CRM. Jobs, crews, scheduling, and estimating live in Jobrolo.
- Not a public adjuster. It explains; it never advises on a claim, a policy, or
  a settlement. See `docs/CONSTITUTION.md`.
- Not a consumer version of any internal Jobrolo claim capability.

## Phase 0 contents

| Path | Purpose |
|---|---|
| `docs/ARCHITECTURE_BOUNDARY.md` | Who does what across Jobrolo, Claim Network, Thresher, Homesrolo |
| `docs/CONSTITUTION.md` | The education-never-advocacy rule, its basis, and its limits |
| `docs/THREAT_MODEL.md` | Threats, privacy inventory, consent and deletion, failure behavior |
| `src/constitution/categories.ts` | The eleven refusal categories and required disclosures |
| `src/constitution/detector.ts` | Request classifier and response auditor, pure functions |
| `src/contracts/homeowner-share.v1.ts` | Draft sharing contract, types and validators only |

## Development

Requires Node 22.6 or newer. No runtime dependencies.

```bash
npm install
npm run verify   # typecheck + tests
```

## Legal status

The documents here are engineering design records, not legal advice and not a
compliance certification. **Qualified legal review is required before any
homeowner-facing surface ships.**
