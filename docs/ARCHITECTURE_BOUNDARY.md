# Architecture Boundary

Status: **Phase 0 contracts and policy only.**

## Systems

### Jobrolo

The contractor operating system and source of record for contractor tenants,
jobs, work records, documents, photos, measurements, and the contractor-side
authority to disclose an exact homeowner release.

### Claim Network

A separate Jobrolo collaboration boundary for explicitly invited independent
professionals. Its case rooms, participants, grants, contributions, and
receipts do not flow into Homesrolo and confer no homeowner authority.

### Thresher

An internal, provider-neutral Jobrolo claims-workflow capability. Homesrolo
does not call it, receive its output, use its identity, or expose it publicly.
No tenant or customer name is Thresher’s identity.

### Homesrolo

The homeowner product. It owns homeowner identity, independent consent,
homeowner education boundaries, and—after a later implementation review—the
home-file record described in HOME_FILE_RFC.md.

Homesrolo is not a contractor CRM, public adjuster, claim advocate, insurer,
consumer-reporting product, or public version of an internal Jobrolo tool.

## Two separate layers

### Home file

The home file is Homesrolo’s future logical record for a physical home. It
separates identity, contribution control, payload retention, and visibility.
It is not a shared folder. Membership and existence do not create access.

### Jobrolo homeowner share

homeowner-share.v1 is one exact Jobrolo-to-Homesrolo disclosure protocol:

1. Jobrolo creates a strict manifest of immutable recipient-specific
   homeowner_release projections.
2. A Jobrolo owner/admin authorization receipt binds the exact manifest digest.
3. Homesrolo records independent consent bound to that same digest.
4. Either service can later append a revocation receipt for its own authority.
5. A future read must verify signatures, trusted keys, current ledger state,
   expiry, exact bytes, and authorization again immediately before release.

The protocol does not establish home ownership, property identity, a broad
project grant, or home-file membership.

## Normative cross-repository wire

The Jobrolo Phase 0 contract is the protocol anchor. Homesrolo reproduces its
literal canonical manifest, signing payloads, and replay keys. The current
Homesrolo implementation is intentionally the same contract, not a competing
translation.

The exact receipt families are:

| Receipt | Issuer → audience | ID |
| --- | --- | --- |
| authorization | Jobrolo → Homesrolo | hauth_ + 43 opaque characters |
| consent | Homesrolo → Jobrolo | hcons_ + 43 opaque characters |
| revocation | either side, for its own authority | hrev_ + 43 opaque characters |

Manifests use hshr_, hrcp_, hproj_, and hnce_ opaque references.
Authorization actor references use hactor_. There is no generic hrec_
receipt envelope in this version.

Every receipt carries a nested signing proof with:

- algorithm: Ed25519;
- a code-owned ASCII key ID; and
- a canonical 64-byte base64url signature.

The signing payload includes algorithm and key ID and excludes only the
signature bytes. Replay identity is stable from receipt version, issuer, and
the receipt’s immutable ID; a different full receipt under the same replay
identity is a conflict.

src/contracts/tests/homeowner-share.test.ts holds the literal normative
vectors. Until both repositories publish reviewed branches and a later
transport implements trusted verification, cross-repository exchange remains
unbuilt.

## Projection boundary

Only immutable homeowner_release projections are expressible. Raw Jobrolo
documents, rows, storage objects, labels, filenames, URLs, customer/contact
fields, addresses, claim/policy material, internal costs, notes, memory,
Claim Network evidence, and Thresher/AI output are outside the wire.

The draft projection discriminators are not a launch allowlist. The
launch-approved set is frozen empty. Phase 0 delivery always returns
authorized:false.

Caps are:

- 25 artifacts;
- 25 MiB per artifact;
- 100 MiB aggregate;
- 64 KiB canonical manifest; and
- one to 30 days.

## Identity and storage separation

- No shared database, session, tenant, user ID, storage key, or private signing
  key.
- Homesrolo sends no homeowner name, phone, email, or address in this wire.
- Jobrolo sends no tenant/project/document identity in this wire.
- A recipient reference is not enough to enumerate shares.
- A share ID is not authority.
- An address or parcel is not a canonical home ID.
- Home-file merge/split policy is separate and may never widen a share.

## Visibility

There are two candidate visibility bases: current verified contribution
controller, or an exact active share. Runtime authorization must derive and
recheck either basis from authoritative state. Home ownership, occupancy,
address match, upload action, home-file membership, and contribution existence
do not create visibility.

Tests protect the current contract surface, but an export-name scan is not a
complete authorization system. Any future route, job, storage read, search
index, or UI must independently enforce the same boundary.

## Dependency direction

Homesrolo may depend on its own policy and its copied wire contract. It must not
import Jobrolo application code at runtime. Future interoperability should use
a versioned independently published contract package or exact fixtures, not a
cross-repository source import.

Claim Network and Thresher never depend on Homesrolo.
