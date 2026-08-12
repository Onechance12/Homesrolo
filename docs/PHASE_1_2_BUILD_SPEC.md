# Phase 1–2 build spec — server authority and persistence

Owner: Codex (integration lane). Written by the experience lane against main
`0c06ce2` plus PRs #15–#17, which implement the item-4 create boundary and
the item-6 systems/intake boundary fail-closed. Dependency-ordered: each item
assumes everything above it. The
browser side of every step already exists and fails closed until the
corresponding capability flips true.

**Product decision this implements:** Homesrolo is the durable record of each
physical home. The home record outlives any one homeowner; the current
verified controller manages access and contributes the living record. The
schema must never make the home a child row of an account.

## Phase 1 — a real homeowner, a real home

1. **Identity provider** behind `HomeownerIdentityPort.resolvePrincipal`.
   Magic-link email sign-in (`capabilities.magicLinkSignIn`), no passwords.
   Needs: `POST /api/v1/session/magic-link` accepting `{ email }` with a
   generic 202 that never reveals whether the address exists, a token
   redemption route that mints the session, and `DELETE /api/v1/session`.
   The browser client already hides the email form until the capability is
   true and already treats acceptance generically.

2. **Session mint.** Cookie name `hrolo_session` (one constant in
   `apps/homeowner/lib/server/cookie.ts` — rename freely); value is an opaque
   handle, 16–256 base64url chars; HttpOnly, Secure, SameSite set at mint. The
   route adapter already reads it and treats malformed as absent.

3. **Homes persistence** behind `HomeownerRepositoryPort`. Tables for homes
   (`PrivateHomeProfile`), principals, and memberships
   (`HomeownerMembership`) — the home is the root entity; membership is the
   only link between a principal and a home, exactly as
   `homeowner-runtime.v1` models it. `readMembership`, `listMemberships`,
   `readHome` go live; the three GET routes then serve real data with zero
   route/UI changes.

4. **`POST /api/v1/homes`** — the first write. **Decided and implemented
   fail-closed in PR #15** (`homeownerApiCreateHomeInputSchema`): the body is
   exactly `{ commandRef, displayLabel, privateLocationLabel }`, strict. The
   **browser mints the opaque `commandRef`** (`hcmd_` + 43 base64url chars),
   once per submission attempt group, and **reuses the same value on every
   retry** of that group so the command stays idempotency-stable; an edited
   draft is a new group with a fresh ref. The **server derives `requestedAt`
   and all authority** — principal, membership role/basis/state, and
   relationship label never cross the wire. Success: 201 with
   `{ data: HomeownerApiHomeSummary }`; membership lands as
   `workspace_controller` / `self_created_workspace` / `claimed_unverified`
   and is coherence-checked before the summary returns. Remaining here: the
   real command/persistence provider. Flip `capabilities.persistence` only
   when it actually stores — and dedupe on `commandRef` when it does.

   *Route-adapter requirements the client enforces:* success bodies are
   exactly `{ "data": ... }` with no sibling keys; `updatedAt` is the
   canonical UTC instant (`homeownerUtcInstantSchema`); errors are
   `{ error: { code } }` with the PR #10 status mapping.

5. **Counsel gate.** Before the first real homeowner signs up — identity and
   control, retention and deletion, corrections. Named in `README.md` and
   `docs/LEGAL_POSTURE.md`; unchanged here.

## Phase 2 — the living record

6. **Systems inventory contract** — **decided and implemented fail-closed in
   PRs #16/#17.** `homeowner-runtime.v1` defines `HomeownerPropertyFacts`
   (`hfac_`) and `HomeownerSystem` (`hsys_`) records, both sourced
   `homeowner_recollection` with precision-preserving
   `{ value, precision: exact|approximate }` years — an approximate year is
   never stored as exact, and only a present system may carry a year.
   `POST /api/v1/homes/{homeRef}/intake` takes exactly
   `{ commandRef, homeType, yearBuilt, systems }` (each supported kind once;
   strict; the browser mints and retry-reuses this commandRef as a SEPARATE
   ref from the create command's). `requestedAt`, the principal, the source,
   and all authority are server-derived; success is 201 with the strict
   intake view. The client submits create-then-intake against the returned
   `homeRef`, and on a create-success/intake-failure partial it retries
   intake only — never a second create. Remaining here: the persistence
   provider, and a read route for recorded facts (today the view exists only
   as the write response).

7. **Project / maintenance / document-metadata writes.**
   `createHomeownerProjectInputSchema` exists; add the route. Maintenance and
   document-metadata records follow `homeownerArtifactMetadataSchema` and the
   runtime's semantic records. Every stored fact carries its source; the UI
   renders recollection and attestation differently and needs the source to
   do it.

8. **Timeline read** (`GET .../timeline`) derived server-side from projects,
   documents, and maintenance — the client decodes nothing it can't verify
   and currently treats this route as nonexistent.

## Permanent boundaries (apply to every phase)

- **No price estimates.** The file makes a price defensible; it never states
  one. Valuation/underwriting/adverse-action uses are forbidden in
  `home-file.v1`.
- **No pay-to-rank.** Ordering and routing are never influenced by payment.
- **No Homesrolo certification.** Contractors attest, homeowners countersign,
  Homesrolo holds the record.
- **No claim advocacy.** Education and records only; the constitution
  enforces it in code.
