# Architecture boundary

Four systems, four jobs. This file is the agreed line between them. It is the
document to check before adding anything to Homesrolo.

## Systems

### Jobrolo
The contractor operating system and the system of record for contractor work.
Owns tenants, jobs, documents, photos, measurements, and the authorization to
disclose any of it. Every record is tenant-scoped.

### Claim Network (inside Jobrolo)
A provider-neutral collaboration boundary that lets a Jobrolo host share exact,
version-pinned evidence with an independent public adjuster or impartial
appraiser inside case-scoped rooms. Its V1 lanes are `public_adjuster`,
`contractor_partner`, and `independent_appraiser`. **Homeowner is not one of
them**, and Homesrolo does not enter these rooms.

### Thresher (inside Jobrolo)
The internal, provider-neutral claim specialist. It runs for owner and admin
users only, in a read-only workflow, and per Jobrolo's own Claim Network V1
rules it is not exposed to external participants.

Two rules follow, and they are not negotiable in Homesrolo:

- **Thresher is internal to Jobrolo.** Homesrolo never calls it, never receives
  its output, and never presents anything as a claim analysis.
- **No tenant is Thresher's identity.** Thresher is a provider-neutral product
  capability. No customer, deployment, or partner name appears in Homesrolo as
  Thresher's identity or as a source of its authority.

### Homesrolo
The homeowner surface. Owns homeowner identity, the homeowner's acceptance and
continuing consent, and an education-only assistant. It holds no contractor
tenant data of its own and performs no claim work.

## What Homesrolo must never become

- **A second contractor CRM.** No jobs, crews, scheduling, estimating, or
  production. If a feature would help a contractor run work, it belongs in
  Jobrolo.
- **A shadow public adjuster.** No claim advice, no settlement evaluation, no
  advocacy. See `CONSTITUTION.md`.
- **A public version of Thresher.** No claim analysis surfaced to consumers,
  under any name.

## Data direction

Nothing is fetched by asking a question. Disclosure is described up front by an
immutable **manifest** and unlocked by two independently signed **receipts**.

```
  Jobrolo                                        Homesrolo
  -------                                        ---------
  contractor tenants                             homeowner identity
  jobs, documents, photos                        acceptance and consent
  builds homeowner_release projections           education-only assistant

  1. manifest         immutable, names the exact projections for one share,
                      each pinned by SHA-256, with its own expiry
                          |
                          v
  2. authorization    Ed25519, signed by Jobrolo's key, binds to the
     receipt          manifest digest
                          |
                          v
  3. consent receipt  Ed25519, signed by Homesrolo's own independent key,
                      binds to the SAME manifest digest
                          |
                          v
  4. revocation       append-only, either side, terminal
     receipts
```

Both receipts must be live and bound to the same manifest digest at read time.
Either alone is nothing. Absence of a signal is never permission.

No shared database. No replication. No background synchronization. No Homesrolo
write path into Jobrolo records.

## Identity

Homeowner identity lives only in Homesrolo. Jobrolo never receives a phone
number, email, or name; the homeowner appears in the contract only as an opaque
`recipientRef`. Homesrolo receives an opaque `shareId` and `recipientRef` and
never a tenant name, project id, customer record, filename, or storage path.

Every identifier is a fixed prefix plus 43 base64url characters (`hshr_`,
`hrcp_`, `hproj_`, `hnce_`, `hrec_`). Identifier shapes that could carry meaning
are rejected, so an id can never become a side channel for an address, a phone
number, or a claim number.

**The signing keys are independent.** Jobrolo signs authorizations with its key;
Homesrolo signs consent with its own. Neither side holds the other's key, so
neither can manufacture the other's authority, and compromising one system does
not produce a complete disclosure.

## Naming

Public product surfaces say **Ask Homesrolo** and **Ask Jobrolo**. The bare word
"Rolo" is not established as a public product name: it is crowded in software,
including by an existing AI assistant in an adjacent category, and the coined
compounds are the distinctive marks. Internal identifiers in either codebase are
not public branding and are out of scope for this rule.

## V1 sharing scope

**Projections, never records.** What crosses the boundary is a
`homeowner_release` projection: a summary built for one recipient, one share,
and one purpose. A raw document, a database row, or a storage object has no
representation in the contract at all and fails strict parsing.

Excluded by name in `src/contracts/homeowner-share.v1.ts` and asserted by tests:
raw documents, database rows, storage objects, insurance policies, policy
declarations, carrier communications, claim-strategy material, claim files,
internal notes, margin and cost detail, contractor memory, Thresher results,
agent analysis, and any broad project access. Field names that would leak an
address, contact, claim number, URL, filename, label, note, metadata blob, or
project id are rejected by name, and one bad field rejects the **entire**
manifest rather than filtering the offending item out.

**Phase 0 is inert.** The launch-approved projection set is frozen empty and the
delivery decision's type cannot express success: `authorized` is the literal
`false`. Making this contract deliver anything is a reviewable type change, not
a configuration flip.

Caps: 25 artifacts, 25 MiB per artifact, 100 MiB aggregate, 64 KiB canonical
manifest, and a share lifetime between 1 and 30 days.

## Cross-repo reconciliation status

Two independently written implementations agree only where something proves they
agree. `WIRE_GOLDEN` in `src/contracts/homeowner-share.v1.ts` holds the values
Jobrolo published as normative, and CI checks Homesrolo against them.

**Manifest layer: reconciled.** Jobrolo's golden manifest parses strictly here,
re-canonicalizes to identical bytes (692 of them), and digests to Jobrolo's
published `manifestDigest`. Asserted in CI. This pins the canonical form —
recursively sorted keys, `JSON.stringify` primitives, UTF-8, lowercase hex
SHA-256 — and the identifier shapes.

**Receipt layer: defined here.** Jobrolo's brief supplied three expected
replay-key values without the derivation that produces them. An exhaustive
search over every subset, ordering, separator, prefix, and receipt-type spelling
of the eleven published identity fields — 6,408,192 candidates — reproduced none
of them. Jobrolo's repository was then checked directly and contains **no
homeowner-share implementation at all**: no branch, no pull request, and no
occurrence of `homeowner_release`, `homeowner-share`, `hproj_`, `hshr_`,
`hrcp_`, `replayKey`, or `manifestDigest` on main.

There was no implementation to be compatible with, so waiting for the derivation
could not terminate. Homesrolo therefore **defines** this layer, and Jobrolo
implements against it. The specification is `docs/RECEIPT_WIRE_SPEC.md`; every
value in it is produced by `homeowner-share.v1.ts` and asserted in CI, so the
document and the code cannot drift.

The three original values are kept in `SUPERSEDED_REPLAY_KEYS` as a tripwire,
with a test asserting this implementation never produces them. If a Jobrolo
implementation ever emits one, the two sides have diverged.

Until a Jobrolo implementation reproduces the vectors in the spec, **cross-repo
receipt exchange is unbuilt**, and nothing in this repo should be read as
claiming otherwise.

## Property identity

**V1 does not introduce a global property reference.** A share is scoped by an
exact Jobrolo-issued share id. Homesrolo does not match on address, parcel,
geohash, or owner name, and never merges two shares into one property record.
Cross-share property linking is a later RFC requiring separate review, because a
wrong match would cross-contaminate two households' records.
