# Home File RFC

Status: **Phase 0 policy only. Not implemented.**

This RFC defines what Chance means by “the home needs a home” without turning
that idea into an unsafe permanent data dump. There is no database, account
system, property resolver, upload route, search index, share endpoint, or live
Jobrolo connection in this repository.

The governing sentence is:

> A home file is a durable logical record for one home. It is not a shared
> folder, and permanence does not mean retaining every raw byte forever.

## 1. The layers are different

Homesrolo needs four concepts that must never be collapsed:

1. **Home identity** — an opaque internal record representing one physical
   home.
2. **Contribution** — one controlled payload or projection associated with
   that home.
3. **Controller** — the person or organization currently authorized to decide
   what happens to that contribution.
4. **Visibility grant** — exact, time-bounded authority for another party to
   see an exact contribution or release projection.

The home file is the container underneath those records. The
Jobrolo-to-Homesrolo homeowner-share.v1 contract is one explicit disclosure
mechanism. It does not create property ownership, property-wide membership, or
blanket access to everything ever associated with a home.

## 2. What “permanent” means

The durable part is the logical home identity, provenance, merge/split history,
and the minimum audit needed to explain material events. Retention of payload
bytes is classification-specific.

- A raw photo, PDF, personal identifier, or revoked release may be deleted
  under the reviewed retention, deletion, security-response, or legal-hold
  policy.
- A minimal pseudonymous tombstone may remain when necessary to prove that an
  event happened, but it may not reconstruct deleted content.
- Backups, derived indexes, exports, incident copies, and legal holds need an
  explicit owner-reviewed schedule before launch.
- User-facing copy may never say “deleted” when only access was revoked, or
  “permanent” when a payload is still subject to deletion.

This preserves the valuable history of a home without making the false promise
that personal data or every uploaded byte is immortal.

## 3. Contribution control

The uploader is not automatically the controller. An employee may click
Upload while the contractor organization owns the work product; a homeowner
may upload a document that includes another party’s rights; an imported source
may have contractual restrictions.

Every future contribution therefore needs separate, server-derived fields for:

- submitting actor;
- verified controller;
- source and rights basis;
- purpose and content classification;
- exact immutable payload/projection version and digest;
- retention class;
- visibility state; and
- supersession/deletion/tombstone state.

Only a current verified controller or independently authorized delegate may
initiate disclosure. A filename, upload action, customer-visible flag, AI
classification, address, or presence in the home file is never authority.

## 4. Visibility: exactly two candidate doors

A contribution may become visible only because:

1. the viewer is its current verified controller; or
2. the viewer holds an exact active share whose independent authorization and
   consent remain valid.

Both are candidate bases, not client assertions. Runtime services must derive
and recheck them from authoritative state immediately before release.

Everything else is default deny. In particular:

- a homeowner does not automatically see a contractor’s photos or work
  product;
- a contractor does not automatically see homeowner uploads;
- a person who buys or occupies the home does not inherit prior access;
- a former owner does not retain property-wide access;
- a typed address, parcel match, geocode, or claimed ownership is not access;
- an expired or revoked share is not access; and
- existence metadata is protected. Revealing that a report, claim-related
  artifact, or inspection exists can itself be sensitive.

There is no browse or recipient-wide catalog. The share protocol names one
exact manifest; it cannot ask for “everything about this home.”

## 5. Property identity

A future home reference must be opaque and must not encode an address, parcel,
latitude/longitude, owner name, account number, or provider identifier.

Addresses, parcel identifiers, geocodes, utility evidence, and verified job
edges are versioned identity evidence with provenance. None is the canonical
home ID by itself.

Required invariants:

1. No fuzzy auto-merge.
2. No merge based only on normalized address, geocode proximity, parcel
   similarity, owner name, phone, or email.
3. Potential matches remain separate until reviewed.
4. A merge is an append-only event, not destructive row coalescing.
5. Every merge records the evidence, actor, reason, and prior membership.
6. A split is always possible and restores the pre-merge membership and access
   boundaries.
7. A wrong match is treated as a potential disclosure incident.

Unit/sub-addresses, subdivisions, parcel combinations, rural routes, address
renames, new construction, and shared structures need explicit test fixtures
before a resolver can ship.

## 6. Home sale, occupancy, and succession

A verified new owner receives a new account-to-home relationship. They do not
inherit:

- a prior owner’s personal information;
- prior owner uploads;
- contractor work product;
- historical share receipts; or
- property-wide search rights.

They begin with contributions they control and exact releases newly shared with
them. If Homesrolo later offers a transferable property-fact product, that is a
new, separately versioned policy with its own provenance, correction, notice,
and legal review.

A prior owner keeps only contributions they still control or exact grants that
remain active. Prior occupancy alone is never continuing authority.

## 7. Person data and property data

Separating person and property records is necessary, but it does not magically
make property-linked data non-personal. A roof history, address, parcel, loss
event, photo, or repair record can still be reasonably linkable to a household.

Future storage must classify at least:

- account/person identifiers;
- sensitive contact and identity evidence;
- controller/uploader organization data;
- property facts;
- restricted work product;
- insurance/claim material prohibited from this lane;
- released homeowner projections; and
- minimal audit/tombstone data.

Deletion and correction operate on the classification and authority, not on an
assumption that “property fact” means unregulated public data.

## 8. V1 use restriction

V1 is for homeowner maintenance, warranty service, and the homeowner’s own
recordkeeping. It must not furnish or score home-file data for:

- insurance underwriting or pricing;
- lending or credit;
- buyer or property-purchase eligibility;
- tenant screening;
- employment screening;
- automated adverse action; or
- a public address-history lookup.

Those uses can raise materially different consumer-reporting, privacy,
accuracy, dispute, permissible-purpose, and notice obligations. Chance has
stated that an attorney has reviewed the operating model. This repository does
not request or store privileged attorney details. Before any furnishing or
decision-use feature, counsel should review that exact data flow and intended
jurisdictions; prior operational review is not treated as blanket product
certification.

## 9. Relationship to Jobrolo sharing

Jobrolo remains the source and authorization authority for its contractor
records. It creates only recipient/share/purpose-specific homeowner_release
projections. Homesrolo owns independent consent.

The two services do not share sessions, tenants, users, databases, storage
paths, or private signing keys. Passing structural parsing proves only shape
and binding. A future read must additionally verify trusted signatures, query
both authoritative current-state/revocation stores, recheck immutable bytes,
and fail closed after any storage read and before serialization.

Claim Network and Thresher remain separate Jobrolo boundaries and provide no
home-file authority.

## 10. Phase 0 decisions

The following are frozen for this phase:

- logical home identity may be durable; raw payload retention is not forever;
- uploader and controller are separate;
- third-party contributions are not homeowner-visible by default;
- contribution existence is not disclosed without authority;
- new owners inherit no prior content access;
- former owners keep no property-wide access;
- fuzzy auto-merge is forbidden and every merge is reversible;
- insurer/buyer/lender/tenant/employment decision uses are forbidden in V1;
- the Jobrolo share wire is the cross-repository protocol anchor; and
- no runtime is enabled.

The code-owned policy lives in src/contracts/home-file.v1.ts, and its Phase 0
decision always returns authorized:false.

## 11. Required work before implementation

1. Owner and counsel approve the identity, controller, retention, correction,
   transfer, and permitted-use policy.
2. A threat-modeled property resolver is designed with merge/split receipts.
3. Each launch contribution/projection kind receives an exact content and
   metadata allowlist plus hostile fixtures.
4. Homesrolo identity proof and co-owner/tenant/trust/business roles are
   designed.
5. Storage, encryption, deletion SLAs, backups, legal holds, and support
   procedures are specified.
6. Trusted signature verification, key rotation, global receipt-ID conflict
   quarantine, and authoritative revocation ledgers are implemented.
7. Synthetic cross-repository lifecycle tests pass before any real data.
