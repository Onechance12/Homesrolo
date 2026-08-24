# Jobrolo → Homesrolo Home Record handoff

This is a default-off, one-project canary for moving one homeowner-approved,
Jobrolo-generated work-completion PDF into one exact private Homesrolo Home Record. It preserves
the boundaries in `HOME_FILE_RFC.md`, `ARCHITECTURE_BOUNDARY.md`, and the inert
`homeowner-share.v1` contract.

## Architecture and non-discovery rule

Jobrolo creates one high-entropy `shareId` for one configured completed project.
The authenticated homeowner activates only that exact capability with:

```text
POST /api/v1/homes/{homeRef}/handoffs/{shareId}/claim
Content-Type: application/json

{}
```

The route is same-origin, size-bounded, and accepts an exact empty object. The
browser supplies neither a principal nor the opaque `hrcp` recipient binding.
Homesrolo resolves both from its HttpOnly session and server configuration,
fresh-authorizes `handoff.preview`, and requires the recipient's home,
controller, active state, and revision to match before contacting Jobrolo.
Wrong home, controller, or share existence is returned generically.

There is deliberately no discovery, recipient catalog, push receiver, fuzzy
home match, or recipient-wide list. Possession of an `hrcp` is not permission
to enumerate shares. Before a new producer call, a service-role RPC persists a
domain-separated digest—not the supplied share ID—and enforces ten attempts per
principal/home per hour plus a bounded 100,000-row global 24-hour window.
Already-stored exact shares require no second reservation or claim call. A
still-received offer is nevertheless checked against Jobrolo's current signed
authority before it is shown as reviewable, previewed, retried, or accepted.

The Jobrolo exchange is server-to-server POST over a pinned origin with
request-bound HMAC signatures, nonces, timestamps, body digests, signed response
status/content type/body digests, bounded bodies, `Accept-Encoding: identity`,
and redirects disabled. An encoded response still fails closed.
Homesrolo then verifies the canonical manifest digest, Jobrolo Ed25519
authorization, exact recipient/share, expiry, and the active runtime policy:
exactly one `work_completion_record` version 1 PDF no larger than 1 MiB. The
broader Phase 0 structural contract stays immutable and dormant; raw project
documents, photo sets, warranties, invoices, receipts, JSON, and every other
projection fail closed in the Homesrolo service, browser decoder, and database
RPC. Acceptance is explicit and signs a Homesrolo consent receipt. The one PDF
is fetched by opaque artifact reference, checked for exact
length/type/SHA-256, scanned, and copied to a Homesrolo-owned private object
path. A declined or failed record never becomes a normal Home Record artifact.

## Homesrolo configuration

The ordinary private homeowner runtime must first be valid:

```env
HOMESROLO_SUPABASE_URL=https://<project>.supabase.co
HOMESROLO_SUPABASE_PUBLISHABLE_KEY=<server-configured-value>
HOMESROLO_SUPABASE_SECRET_KEY=<service-role-secret>
HOMESROLO_APP_ORIGIN=https://app.homesrolo.com
```

Both independent handoff gates are absent/off by default and accept only the
literal `true`. Every other value below is also required; a partial or malformed
set leaves the feature unavailable and its routes return `404`.

```env
HOMESROLO_HOME_RECORD_HANDOFF_ENABLED=false
HOMESROLO_HOME_RECORD_HANDOFF_RECIPIENT_REF=
HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID=
HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64=
HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID=
HOMESROLO_HOME_RECORD_HANDOFF_ED25519_PRIVATE_KEY_PKCS8_BASE64=
HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_HOST=
HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_PORT=
HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_VERSION=

HOMESROLO_JOBROLO_HANDOFF_ENABLED=false
HOMESROLO_JOBROLO_HANDOFF_ORIGIN=
HOMESROLO_JOBROLO_HANDOFF_CLIENT_ID=
HOMESROLO_JOBROLO_HANDOFF_SHARED_SECRET=
```

In production the Jobrolo origin must be the byte-exact
`https://jobrolo.com`; URL normalization, alternate ports, casing, aliases, and
paths are rejected. Explicit development loopback and test-only `.test`
origins are accepted only under their matching `NODE_ENV`. Production also
requires the byte-exact `https://app.homesrolo.com` app origin. The HMAC client
and secret are dedicated to this lane. Neither value may equal the recipient,
either signing-key ID, any raw/encoded/derived Ed25519 key material, or either
credential from the existing Jobrolo intake lane. The inbound Jobrolo and
outbound Homesrolo signing key IDs and Ed25519 public keys must be distinct.
Raw intake client-ID/secret residue is inspected even when the old intake gate
is off; partial, malformed, or reused residue blocks this handoff lane.
ClamAV must be reachable on `127.0.0.1`, `::1`, or `localhost`; a remote scanner
host is rejected. Record and verify the deployed ClamAV version. A scanner
timeout, unknown reply, or unavailable socket fails closed and does not publish
the copied file.

This release has a code-owned production-readiness interlock set to `false`.
Production configuration cannot activate the lane even if every environment
or database gate is set to true. Development and test environments can exercise
the bounded contract. The interlock must not be changed until the prerequisites
listed below are implemented and separately reviewed. Those prerequisites also
include one common database lock order for membership, recipient binding, and
handoff mutations, plus a final in-transaction authority recheck, so concurrent
membership or recipient revocation cannot race reserve, item-state, or finalize
operations.

Apply Supabase migrations in filename order through
`202608240001_homeowner_inbound_handoffs.sql`. Its direct prerequisites are the
private homeowner runtime, private artifacts, and generic project migrations;
do not selectively apply the handoff migration ahead of earlier migrations.

## Exact recipient provisioning and revocation

Generate one opaque `hrcp_<43 base64url characters>` outside the browser. With
the service role, bind it to the current controller membership using exact refs
and the current membership revision:

```sql
select public.homesrolo_bind_homeowner_handoff_recipient(
  p_principal_ref => 'hprn_<opaque>',
  p_home_ref => 'hhom_<opaque>',
  p_membership_ref => 'hmbr_<opaque>',
  p_membership_revision => 1,
  p_recipient_ref => 'hrcp_<opaque>',
  p_requested_at => now()
);
```

The RPC is service-role-only. It rejects inactive/non-controller memberships
and conflicting bindings; an `hrcp` is never rebound. Put that same `hrcp` in
both products' server configuration only after checking the returned home,
controller, state, and revision.

For rollback or rotation, first turn off both products' gates, then revoke the
exact active binding with its current revisions:

```sql
select public.homesrolo_revoke_homeowner_handoff_recipient(
  p_principal_ref => 'hprn_<opaque>',
  p_home_ref => 'hhom_<opaque>',
  p_membership_ref => 'hmbr_<opaque>',
  p_membership_revision => 1,
  p_recipient_ref => 'hrcp_<opaque>',
  p_expected_recipient_revision => 1,
  p_revoked_at => now()
);
```

Rotation creates a new recipient ref; it does not reactivate or rebind the old
one. Provision/revoke while the exact controller membership is active.

## Paired Jobrolo configuration

Jobrolo also remains off unless its environment gate and the exact contractor's
database `homeownerHandoffEnabled` flag are both true. Configure only one
contractor and one completed project:

```env
JOBROLO_HOMEOWNER_HANDOFF_ENABLED=false
JOBROLO_HOMEOWNER_HANDOFF_CONTRACTOR_ID=
JOBROLO_HOMEOWNER_HANDOFF_PROJECT_ID=
JOBROLO_HOMEOWNER_HANDOFF_RECIPIENT_REF=
JOBROLO_HOMEOWNER_HANDOFF_HOMESROLO_APP_ORIGIN=
JOBROLO_HOMEOWNER_HANDOFF_SIGNING_KEY_ID=
JOBROLO_HOMEOWNER_HANDOFF_ED25519_PRIVATE_KEY_PKCS8_BASE64=
JOBROLO_HOMEOWNER_HANDOFF_HOMESROLO_CLIENT_ID=
JOBROLO_HOMEOWNER_HANDOFF_HOMESROLO_SHARED_SECRET=
JOBROLO_HOMEOWNER_HANDOFF_HOMESROLO_SIGNING_KEY_ID=
JOBROLO_HOMEOWNER_HANDOFF_HOMESROLO_ED25519_PUBLIC_KEY_SPKI_BASE64=
```

Pair the values exactly:

- both recipient-ref variables name the one Homesrolo binding;
- Jobrolo's signing private key/key ID match Homesrolo's pinned Jobrolo public
  key/key ID;
- Homesrolo's consent private key/key ID match Jobrolo's pinned Homesrolo
  public key/key ID;
- the HMAC client IDs and secrets match and are not reused by intake or another
  integration; and
- Jobrolo's Homesrolo app origin equals the canonical `HOMESROLO_APP_ORIGIN`.

Jobrolo additionally enforces its exact contractor/project canary, active
tenant gate, completed-project state, and owner/admin authorization when the
share is created. It returns an opaque share receipt; it does not push into,
query, or obtain a session for Homesrolo.

## Canary preflight and activation

1. Keep both environment gates and Jobrolo's database gate off. Apply and
   verify migrations, private bucket policy, RLS/revokes, and service RPC grants.
2. Generate independent Ed25519 identities and a dedicated HMAC secret in the
   secret manager. Exchange public keys only. Confirm exact origin equality and
   clock synchronization.
3. Provision one `hrcp` against the intended Homesrolo home/controller and
   record its revision. Configure that same ref and only one Jobrolo
   contractor/completed project.
4. Verify loopback ClamAV with a clean synthetic completion PDF and a rejected
   antivirus test fixture. Verify no object is published on scanner failure.
5. In a nonproduction environment, run a synthetic end-to-end share: create it
   as the exact Jobrolo owner/admin,
   claim its exact `shareId` from the bound Homesrolo home with `{}`, review the
   Completion record details, accept it, confirm only its exact bytes appear, and
   verify rejection, expiry, replay, rate-limit, and export behavior.
6. Leave all production gates off. This checklist is preflight-only and does
   not authorize production activation. Production remains code-blocked in this
   release.

## Rollback, reconciliation, and export truth

To stop new activity, disable the Jobrolo database gate and both products'
environment gates, then revoke the `hrcp`. Rotate the HMAC secret or signing
keys if compromise is suspected. Disabling/revoking does not pretend already
accepted homeowner-controlled copies disappeared.

An uncertain fetch, scan, object write, or database finalization remains
quarantined or `reconciliation_required`; it is not blindly retried or exposed.
This release has no reconciliation or staged-object cleanup RPC, worker, CLI,
or service transition. Do not use broad manual SQL or storage operations as a
substitute. A future reviewed recovery design must bind the exact grant,
reservation, consent, selection, command, object receipt, bytes, and digests;
then either atomically finalize the accepted record or quarantine/delete only
the exact invalid staged object. Until that exists, a staged orphan requires
operator containment and production activation remains code-blocked. A failed
claim can be retried by exact share ID only while its current Jobrolo authority
is still valid; terminal accepted/rejected receipts remain locally listable.

`homesrolo-home-record.zip` is specifically an export of accepted professional
completion records, not every category in the full Home Record. It contains the
accepted original PDFs, `home-record-manifest.json`, and a readable
`home-record-summary.txt`. The machine-readable manifest includes the exact
source manifest, signed Jobrolo authorization, signed Homesrolo consent,
selection/acceptance digests, provenance, copy times, lengths, and SHA-256
digests. Export is exact-home/controller authorized, rechecks authority around
each private-object read, validates every original again, and is bounded before
reading objects. One stable accepted-only query requests an exact count and at
most the 250-record cap plus one; a count/row mismatch or overflow fails closed
instead of treating a short server page as the end of the record or truncating.
The exact controller grant is checked again after the ZIP is built and
immediately before the archive is returned.

## Pre-acceptance limitation

The current screen shows **Completion record details**, not the PDF itself.
Before acceptance, the PDF cannot be opened. The fixed generator is limited to
the contractor business display name, completed status, recorded start and
completion dates, and issue date. It excludes raw photos, raw documents,
invoices, warranties, claims, and measurements. A homeowner should accept only
when they recognize the sender and the link. Keep production gates off until a
separately reviewed pre-acceptance PDF renderer and signed browser-safe sender
provenance, the exact reconciliation/cleanup path above, and the shared
authority-lock/final-recheck design are available.

## Explicit exclusions

This slice imports no measurements and has no measurement field, projection,
route, computation, or UI. The active canary also imports no raw documents,
photos, warranties, invoices, or receipts; those remain only dormant Phase 0
structural vocabulary until each kind has a separately reviewed content policy.
It also excludes insurance/claim handling, public adjuster workflows, AI, paid
services, broad recipient discovery, catalogs, address matching, direct Jobrolo
database/session/object-key reads, public storage URLs, automatic acceptance,
and production deployment.
