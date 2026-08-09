# Threat Model, Privacy, and Failure Behavior

Scope: Homesrolo Phase 0, the future home file, and the future
homeowner-share.v1 path. No live system or homeowner data exists here.

Chance states that an attorney familiar with the operations has reviewed how
the business can work. This repository does not request, publish, or require
privileged attorney details. The design records are still not legal advice or
a product-wide compliance certification. A specific future data use can need
additional review even when the underlying business model was reviewed.

## Assets

1. Homeowner identity and account recovery.
2. The mapping between a person and a home.
3. Contribution payloads, their existence, and controller identity.
4. Jobrolo contractor records released through an exact share.
5. Authorization, consent, revocation, correction, merge/split, and deletion
   receipts.
6. Signing keys and authoritative current-state ledgers.
7. The education-not-advocacy boundary.

## Threats and required controls

| Threat | Required control |
| --- | --- |
| False property match exposes another household | Opaque home ID; no address/parcel/fuzzy auto-merge; reviewed reversible merge and split receipts |
| Claimed ownership becomes access | Identity/ownership claims are evidence only; current controller or exact active share required |
| New owner inherits prior content | Property transfer creates no content grant; fresh identity and authority review |
| Existence metadata leaks sensitive activity | No recipient-wide catalog; existence and count are default deny |
| Uploader grants rights they do not hold | Separate submitting actor from verified controller; server-derived current rights basis |
| Broad or mutable grant | Exact immutable manifest and release projections, pinned by digest/version; no project/folder/latest grant |
| Cross-tenant confused deputy | Derive tenant, actor, source, and project on Jobrolo; derive user and consent on Homesrolo; recheck before serialization |
| Receipt forgery or key downgrade | Independent Ed25519 keys, canonical encodings, trusted key registry, rotation, minimum versions, emergency revoke |
| Replay or same-ID mutation | Stable replay identity plus full canonical-byte comparison; global receipt-ID uniqueness; conflict quarantine |
| Revoked/expired authority serves stale bytes | Current authoritative ledger checks before and after bounded storage read; equality at expiry is expired |
| Raw record or metadata leakage | Strict projection serializers; no filenames, URLs, paths, free text, contacts, claim data, costs, notes, memory, or provider output |
| Deletion is falsely described as erasure | Classification-specific deletion/retention; explicit payload vs audit tombstone truth; backup/legal-hold SLA |
| “Permanent” becomes indefinite personal-data storage | Durable logical identity, not forever raw bytes; data inventory and deletion policy before launch |
| Home history is furnished for decisions without proper regime | V1 forbids underwriting, pricing, lending, purchase, tenant, employment, and adverse-action uses |
| Assistant drifts into claim advice | Constitution classifier, response audit, education-only alternatives, no Claim Network/Thresher data |
| Partial outage serves cached authority | Fail closed; no stale authorization fallback or partial-manifest success |
| Resource exhaustion | Count/byte/time caps before allocation, bounded reads, concurrency and rate limits |
| Phase 0 accidentally activates | Empty projection allowlist, delivery result literal false, no route/DB/env/import wiring |

## Receipt truth

The Phase 0 module validates shape, canonical bytes, binding, and chronology.
It does not verify a signature against a trusted key or query an authoritative
revocation ledger. Structural compatibility must never authorize delivery.

A future ledger needs:

- globally unique receipt identity within the protocol domain;
- byte-identical replay as idempotent;
- same identity/different bytes as a durable conflict/quarantine condition,
  not “first one wins”;
- append-only revocation events bound to exact target receipt and manifest;
- no un-revoke transition; and
- online current-state checks in both services.

The present contract intentionally contains no live ledger implementation.

## Privacy inventory

Future design must inventory, field by field:

- account/contact/identity-proof data;
- home identity aliases and provenance;
- contributions, source/controller rights, and content classifications;
- manifests and three receipt families;
- access, denial, revocation, correction, merge/split, and deletion events;
- logs, metrics, traces, support tools, incident copies, backups, indexes, and
  exports; and
- every processor, region, encryption boundary, role, retention period, and
  deletion path.

Opaque or pseudonymous identifiers can still be personal data when reasonably
linkable. Audit fields must be minimized and may not reconstruct deleted
payloads.

## Consent, revocation, and deletion

- Consent is affirmative, exact-manifest, purpose-bound, and expiring.
- Silence, login, link possession, home ownership, or earlier consent is not
  current consent.
- Either side may revoke its own authority through an immutable revocation
  event.
- Revocation stops future access but cannot claw back a legitimate prior
  download, screenshot, export, or forward.
- Account deletion removes or de-identifies personal data under the reviewed
  policy and revokes consent; it does not delete another company’s Jobrolo
  source record.
- A minimal audit tombstone may remain only under a documented retention/legal
  basis and may not restore the payload.

## External failures

Externally, absent, inaccessible, expired, revoked, malformed, and unknown
shares should collapse where distinguishing them would enumerate people,
homes, or records. Internally, authorized audit lanes retain bounded reason
codes without payloads or unnecessary personal fields.

There is no partial success. One invalid artifact or receipt rejects the whole
operation.

## Launch gates

Before any real homeowner:

1. Merge and publish one reviewed wire contract in both repositories.
2. Add trusted signature verification, independent keys, rotation, and
   authoritative ledgers.
3. Design property identity, controller proof, merge/split, transfer,
   correction, deletion, retention, and incident response.
4. Approve at least one exact projection policy and adversarial serializer.
5. Build a synthetic two-service test covering tamper, replay conflict,
   cross-tenant, expiry, revocation races, caps, deletion, and key rotation.
6. Perform privacy, security, and legal review of the exact launch data flow,
   copy, jurisdictions, and permitted uses.
7. Run a kill-switch canary with synthetic data before any private pilot.
