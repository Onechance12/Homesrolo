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

```
  Homesrolo                         Jobrolo
  ---------                         -------
  homeowner identity                contractor tenants
  consent and acceptance            jobs, documents, photos
  education-only assistant          authorization to disclose
        |                                  |
        |  signed, versioned request       |
        |  "what may this homeowner see    |
        |   for this exact share?"         |
        +--------------->------------------+
                    answer or refusal
```

No shared database. No replication. No background synchronization. No
Homesrolo write path into Jobrolo records. Homesrolo asks a narrow question and
receives a narrow answer, or a refusal.

## Identity

Homeowner identity lives only in Homesrolo. Jobrolo receives an opaque
`homeownerRef` and never a phone number, email, or name. Homesrolo receives an
opaque `shareId` and `issuerRef` and never a tenant name, project id, customer
record, or storage path.

## Naming

Public product surfaces say **Ask Homesrolo** and **Ask Jobrolo**. The bare word
"Rolo" is not established as a public product name: it is crowded in software,
including by an existing AI assistant in an adjacent category, and the coined
compounds are the distinctive marks. Internal identifiers in either codebase are
not public branding and are out of scope for this rule.

## V1 sharing scope

Work records only: inspection photos, roof measurements, scope of work,
completion records, warranty documents, and job timeline events.

Excluded by type, enumerated in `src/contracts/homeowner-share.v1.ts` and
asserted by tests: insurance policies, policy declarations, carrier
communications, claim-strategy material, claim files, internal notes, margin and
cost detail, contractor memory, Thresher results, agent analysis, and any broad
project access.

## Property identity

**V1 does not introduce a global property reference.** A share is scoped by an
exact Jobrolo-issued share id. Homesrolo does not match on address, parcel,
geohash, or owner name, and never merges two shares into one property record.
Cross-share property linking is a later RFC requiring separate review, because a
wrong match would cross-contaminate two households' records.
