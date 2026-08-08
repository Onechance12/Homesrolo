# Threat model, privacy, and failure behavior

Scope: the Homesrolo homeowner surface and the future `homeowner-share.v1` path
to Jobrolo. Written before implementation so the controls are requirements
rather than retrofits.

**Not a legal or security certification.** Requires qualified legal review and,
before any real homeowner data exists, an independent security review.

## Assets worth protecting

1. **Homeowner identity** (phone, name, address association). Consumer PII.
2. **A contractor tenant's records** exposed through a share. Another business's
   private data, disclosed only under explicit authorization.
3. **The consent ledger.** The record of who allowed what, and when it stopped.
4. **The boundary itself.** A Homesrolo that gives claim advice is a regulatory
   incident even with zero data loss.

## Threats and required controls

| # | Threat | Control |
|---|---|---|
| T1 | Prompt manipulation pushes the assistant into advocacy | Code-owned constitution, adversarial and hardening suites, response audit before display, constrained scope |
| T2 | Homeowner claims an address they do not own | Ownership is a claim, never self-asserted truth; access requires an authorization receipt issued by a contractor tenant |
| T3 | Recycled phone number inherits a prior homeowner's record | Durable account id behind the number; phone alone never unlocks a record; re-verification after dormancy |
| T4 | Revoked or expired access still readable | Both receipts rechecked at read time against the current ledger; manifest expiry, receipt expiry, and revocation each independently sufficient to refuse; nothing durable cached that cannot be re-verified |
| T5 | Replay of a captured receipt | Stable replay key over receipt identity; a byte-identical resubmission is an idempotent no-op, and the same identity with different bytes is a conflict that refuses **both** |
| T6 | Enumeration of share ids or recipient refs | Fixed-prefix 43-character opaque identifiers, validated by shape and refused if PII-shaped; every external failure collapses to one fixed string that names no cause; rate limits |
| T7 | Over-disclosure through a broad grant | An immutable manifest names exact projections; no folder, project, or membership-implies-access grant; 25-artifact and 100 MiB caps |
| T8 | Substitution of content behind an authorized reference | Per-projection SHA-256 and projection version pinned inside the manifest; the manifest digest is bound into both receipts, so changing one byte invalidates both authorities |
| T9 | Internal identifiers leak to the homeowner surface | Strict all-or-nothing parsing; storage paths, buckets, document ids, filenames, labels, URLs, notes, metadata, project ids, tenant names, and customer contacts are rejected **by name** and reject the whole manifest |
| T10 | Excluded material shared by mistake | Only `homeowner_release` projections are expressible; raw documents and database rows have no representation; excluded kinds enumerated by name and asserted by tests |
| T11 | Address or parcel matching merges two households | No property matching in V1; scoping is by exact issued share id only |
| T12 | Compromised Homesrolo pivots into Jobrolo | Read-only, purpose-limited path; no write path; Homesrolo holds only its own consent-signing key and never Jobrolo's; kill switch on the Jobrolo side |
| T13 | Forged authority from one compromised system | The two signing keys are independent and held by different systems; a Jobrolo compromise cannot manufacture consent and a Homesrolo compromise cannot manufacture authorization |
| T14 | Ledger rewritten to resurrect revoked access | Append-only; entries are never edited or removed; current state is a fold over the whole history and there is no receipt type that un-revokes |
| T15 | Structural validation mistaken for authorization | `STRUCTURAL_VALIDATION_WARNING` is carried on every decision and asserted in CI: shape checking verifies no signature against a trusted key and consults no live ledger |
| T16 | Payload or resource abuse | 25 artifacts, 25 MiB per artifact, 100 MiB aggregate, 64 KiB canonical manifest, 1–30 day lifetime, rate limits, bounded response shapes |
| T17 | Silent boundary erosion over time | Contracts asserted in CI; weakening a rule fails the build; the Phase 0 delivery decision cannot express success at the type level |

## Privacy and data inventory

**Homesrolo will hold** (none of it yet): homeowner account id (opaque, durable),
phone number (identity and delivery), display name (optional), consent records
(share id, status, timestamps), and audit events.

**Homesrolo will not hold**: contractor tenant records, insurance policies,
carrier communications, claim files, Thresher output, payment instruments, or
government identifiers.

**Crossing the boundary, Homesrolo sends** an opaque `recipientRef`, an opaque
`shareId`, and a consent receipt bound to a manifest digest. **It never sends**
the homeowner's phone number, email, name, or address.

**Jobrolo's manifest carries** opaque projection references, projection kind and
version, media type, byte length, and content digest, plus the share's issuer,
audience, purpose, nonce, generation, and expiry. **It never carries** storage
paths, buckets, document ids, filenames, labels, URLs, titles, notes, metadata,
project ids, customer contacts, tenant names, claim or policy numbers, margins,
memories, or agent analysis — each of those is rejected by name, and one of them
anywhere rejects the entire manifest.

## Consent, revocation, deletion

**Consent** is explicit and per manifest. A homeowner accepts one exact set of
projections, identified by digest. Silence is not acceptance, and consent to one
manifest is not consent to the next generation of it.

**Revocation** is unilateral from either side, append-only, and terminal. A
contractor may withdraw the authorization; a homeowner may withdraw consent.
Neither needs the other's agreement, and there is no receipt type that restores
a revoked one. Current state is a fold over the whole ledger, so "is this still
authorized" is always answered from history rather than from a mutable flag.

**Revocation stops future access. It cannot claw back a copy already taken.**
If a homeowner downloaded, screenshotted, exported, or forwarded a projection
while the share was live, revoking the share does not reach that copy, and no
technical control in this contract can. The same is true in the other
direction. This has to be said in the homeowner-facing and contractor-facing
notices in exactly these terms, because "revoke" reads to most people as
"un-send", and a product that lets that misreading stand has misled both sides
about what they were agreeing to.

**Deletion** distinguishes three things that are easy to conflate:

- A homeowner may delete their Homesrolo account, identity, and consent records.
  That removes their access and their personal data from Homesrolo.
- It does **not** delete the contractor's own job records in Jobrolo. Those are
  the contractor's business records, kept for their own legal and warranty
  obligations. Deletion revokes access; it does not reach into another party's
  system.
- It does **not** delete the append-only receipt ledger. The record that consent
  was given and withdrawn is the evidence that the boundary was honored, and
  erasing it would destroy the only proof either party has. Ledger entries carry
  opaque identifiers only, so retaining them retains no personal data.

All three must be stated plainly in the privacy notice, because a homeowner who
believes "delete" erases the contractor's file has been misled.

## Audit

Append-only, with no in-place edit path: consent accepted or withdrawn,
authorization issued or revoked, every disclosure read (share id, homeowner ref,
artifact refs, outcome), every refusal with category, and every constitution
refusal with the framing devices detected. Audit records carry opaque
identifiers only.

## Failure behavior

Fail closed, without exception:

- Unknown contract version, unknown field, malformed payload, oversized payload:
  refuse the **whole** manifest. Never filter the bad items and return the rest,
  because a caller handed a shortened list cannot tell it was shortened.
- Missing, expired, or revoked receipt on either side: refuse.
- Manifest expired, or receipts not bound to the same manifest digest: refuse.
- Two receipts with the same identity and different bytes: refuse both, because
  one of them is not genuine and there is no way to tell which.
- Projection kind not launch-approved: refuse. In Phase 0 that set is empty.
- Jobrolo unreachable: refuse and say so. **Never serve stale cached records**,
  because the cache cannot know whether consent was withdrawn a minute ago.
- Constitution classifier uncertain: refuse and route to a licensed professional.

**Internally, every reason is recorded. Externally, they all collapse to one.**
The audit record keeps the specific cause; the caller is told only
`This request is not authorized.` A caller who can distinguish "no such share"
from "revoked" from "expired" can enumerate shares and learn the state of other
people's claims without ever being authorized, so the external refusal names no
cause and is byte-identical in every case.

An empty result is always a refusal, never an empty success, so a caller cannot
read "nothing came back" as "nothing was shared".

## Canary and rollback

Before any real homeowner:

1. Apply and verify migrations in a non-production environment.
2. Generate a dedicated Homesrolo consent-signing Ed25519 key, distinct from
   every other secret and never shared with Jobrolo. Publish only its public
   half, and agree a rotation and `keyId` scheme with Jobrolo first.
3. Reconcile the receipt layer with Jobrolo (see `RECEIPT_WIRE_RECONCILIATION`
   in `src/contracts/homeowner-share.v1.ts`) so both sides derive identical
   signing input and replay keys. **Until that is done, no receipt produced by
   one side is meaningful to the other.**
4. Run a synthetic homeowner canary end to end.
5. Prove that cross-share, cross-recipient, revoked, withdrawn, expired,
   replayed, conflicting, oversized, and malformed requests all fail closed, and
   that every one of them produces the identical external refusal.
6. Prove the full lifecycle: authorize, accept, read, revoke from each side,
   confirm access stops, confirm the ledger is complete and append-only.
7. Confirm no tenant-specific identity appears anywhere in Homesrolo.

**Rollback** is an environment kill switch on the Jobrolo side that stops issuing
and honoring shares. Homesrolo degrades to education only. It must never degrade
to serving cached records.
