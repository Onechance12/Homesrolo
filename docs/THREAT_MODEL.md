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
| T1 | Prompt manipulation pushes the assistant into advocacy | Code-owned constitution, adversarial suite, response audit before display, constrained scope |
| T2 | Homeowner claims an address they do not own | Ownership is a claim, never self-asserted truth; access requires an authorization issued by a contractor tenant with a real job at that property |
| T3 | Recycled phone number inherits a prior homeowner's record | Durable account id behind the number; phone alone never unlocks a record; re-verification after dormancy |
| T4 | Revoked or expired access still readable | Both authorities rechecked at read time; nothing durable cached that cannot be re-verified; artifact expiry independent of share expiry |
| T5 | Replay of a captured signed request | Timestamp window plus single-use nonce retained longer than the window; body digest bound into the signature |
| T6 | Enumeration of share ids or homeowner refs | Opaque high-entropy identifiers, validated by shape; uniform refusals that do not distinguish "not found" from "not permitted"; rate limits |
| T7 | Over-disclosure through a broad grant | Exact pinned artifacts only; no folder, project, or membership-implies-access grant; artifact cap |
| T8 | Substitution of content behind an authorized reference | Content SHA-256 and version pinned at authorization; digest mismatch fails closed |
| T9 | Internal identifiers leak to the homeowner surface | Opaque refs only; no storage paths, buckets, document ids, filenames, project ids, tenant names, or customer contacts cross the boundary |
| T10 | Excluded material shared by mistake | Allowed kinds enumerated, excluded kinds enumerated by name, both asserted by tests |
| T11 | Address or parcel matching merges two households | No property matching in V1; scoping is by exact issued share id only |
| T12 | Compromised Homesrolo pivots into Jobrolo | Read-only, purpose-limited endpoint; no write path; no Jobrolo credentials in Homesrolo beyond the share signing key; kill switch on the Jobrolo side |
| T13 | Payload or resource abuse | Payload cap, artifact cap, rate limits, bounded response shapes |
| T14 | Silent boundary erosion over time | Contracts asserted in CI; weakening a rule fails the build |

## Privacy and data inventory

**Homesrolo will hold** (none of it yet): homeowner account id (opaque, durable),
phone number (identity and delivery), display name (optional), consent records
(share id, status, timestamps), and audit events.

**Homesrolo will not hold**: contractor tenant records, insurance policies,
carrier communications, claim files, Thresher output, payment instruments, or
government identifiers.

**Crossing the boundary, Homesrolo sends** an opaque `homeownerRef`, an opaque
`shareId`, a timestamp, a nonce, and a body digest. **It never sends** the
homeowner's phone number, email, name, or address.

**Jobrolo returns** opaque artifact references, kind, content digest, version,
expiry, and capabilities. **It never returns** storage paths, buckets, document
ids, filenames, project ids, customer contacts, tenant names, internal notes,
margins, memories, or agent analysis.

## Consent, revocation, deletion

**Consent** is explicit and per share. A homeowner accepts a specific share.
Silence is not acceptance; `pending` grants nothing.

**Revocation** is unilateral from either side and takes effect at the next read.
Neither party needs the other's agreement. A contractor may withdraw disclosure
authorization; a homeowner may withdraw consent.

**Deletion** distinguishes two things that are easy to conflate:

- A homeowner may delete their Homesrolo account, identity, and consent records.
  That removes their access and their personal data from Homesrolo.
- It does **not** delete the contractor's own job records in Jobrolo. Those are
  the contractor's business records, kept for their own legal and warranty
  obligations. Deletion revokes access; it does not reach into another party's
  system.

That distinction must be stated plainly in the homeowner-facing privacy notice,
because a homeowner who believes "delete" erases the contractor's file has been
misled.

## Audit

Append-only, with no in-place edit path: consent accepted or withdrawn,
authorization issued or revoked, every disclosure read (share id, homeowner ref,
artifact refs, outcome), every refusal with category, and every constitution
refusal with the framing devices detected. Audit records carry opaque
identifiers only.

## Failure behavior

Fail closed, without exception:

- Unknown contract version, malformed payload, oversized payload: refuse.
- Missing, expired, or revoked authorization on either side: refuse.
- Stale, future-dated, or replayed request: refuse.
- Digest mismatch or unknown artifact kind: refuse.
- Jobrolo unreachable: refuse and say so. **Never serve stale cached records**,
  because the cache cannot know whether consent was withdrawn a minute ago.
- Constitution classifier uncertain: refuse and route to a licensed professional.

An empty result is always reported as a refusal with a reason, never as an empty
success, so a caller cannot read "nothing came back" as "nothing was shared".

## Canary and rollback

Before any real homeowner:

1. Apply and verify migrations in a non-production environment.
2. Configure a dedicated share-signing secret, distinct from every other secret.
3. Run a synthetic homeowner canary end to end.
4. Prove that cross-share, cross-homeowner, revoked, withdrawn, expired,
   replayed, oversized, and malformed requests all fail closed.
5. Prove the full lifecycle: authorize, accept, read, revoke from each side,
   confirm access stops, confirm the audit trail is complete.
6. Confirm no tenant-specific identity appears anywhere in Homesrolo.

**Rollback** is an environment kill switch on the Jobrolo side that stops issuing
and honoring shares. Homesrolo degrades to education only. It must never degrade
to serving cached records.
