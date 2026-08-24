# Jobrolo → Homesrolo Home Record handoff

This is a default-off, one-project canary for moving homeowner-approved work
records from Jobrolo into one exact private Homesrolo Home Record. It preserves
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
Already-stored exact shares are returned locally without another reservation or
network call.

The Jobrolo exchange is server-to-server POST over a pinned origin with
request-bound HMAC signatures, nonces, timestamps, body digests, signed response
status/content type/body digests, bounded bodies, and redirects disabled.
Homesrolo then verifies the canonical manifest digest, Jobrolo Ed25519
authorization, exact recipient/share, expiry, PDF/JPEG/PNG policy, and current
authorization. Acceptance is itemized and signs a Homesrolo consent receipt.
Selected bytes are fetched by opaque artifact reference, checked for exact
length/type/SHA-256, scanned, and copied to a Homesrolo-owned private object
path. Unselected or failed items never become normal Home Record artifacts.

## Homesrolo configuration

The ordinary private homeowner runtime must first be valid:

```env
HOMESROLO_SUPABASE_URL=https://<project>.supabase.co
HOMESROLO_SUPABASE_PUBLISHABLE_KEY=<server-configured-value>
HOMESROLO_SUPABASE_SECRET_KEY=<service-role-secret>
HOMESROLO_APP_ORIGIN=https://<homesrolo-host>
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

The Jobrolo origin must be one exact HTTPS origin; only loopback HTTP is allowed
for local development. The HMAC client and secret are dedicated to this lane.
ClamAV must be reachable on `127.0.0.1`, `::1`, or `localhost`; a remote scanner
host is rejected. Record and verify the deployed ClamAV version. A scanner
timeout, unknown reply, or unavailable socket fails closed and does not publish
the copied file.

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
4. Verify loopback ClamAV with a clean synthetic PDF/JPEG/PNG and a rejected
   antivirus test fixture. Verify no object is published on scanner failure.
5. Run a synthetic end-to-end share: create it as the exact Jobrolo owner/admin,
   claim its exact `shareId` from the bound Homesrolo home with `{}`, review the
   safe preview, accept a subset, confirm only selected exact bytes appear, and
   verify rejection, expiry, replay, rate-limit, and export behavior.
6. Enable Homesrolo's two environment gates, then Jobrolo's environment gate,
   and finally the one contractor database gate. Monitor only the canary.

## Rollback, reconciliation, and export truth

To stop new activity, disable the Jobrolo database gate and both products'
environment gates, then revoke the `hrcp`. Rotate the HMAC secret or signing
keys if compromise is suspected. Disabling/revoking does not pretend already
accepted homeowner-controlled copies disappeared.

An uncertain fetch, scan, object write, or database finalization remains
quarantined or `reconciliation_required`; it is not blindly retried or exposed.
Reconcile the exact handoff/item against its immutable digests and private
object receipt, clean up any staged orphan, and use the narrow service-role
reconciliation operations. A failed claim can be retried by exact share ID;
once its receipt is stored, retries are served locally.

`homesrolo-home-record.zip` is specifically an export of accepted professional
handoff files, not every category in the full Home Record. It contains the
selected original bytes, `home-record-manifest.json`, and a readable
`home-record-summary.txt`. The machine-readable manifest includes the exact
source manifest, signed Jobrolo authorization, signed Homesrolo consent,
selection/acceptance digests, provenance, copy times, lengths, and SHA-256
digests. Export is exact-home/controller authorized, rechecks authority around
each private-object read, validates every original again, and is bounded before
reading objects.

## Explicit exclusions

This slice imports no measurements and has no measurement field, projection,
route, computation, or UI. It also excludes insurance/claim handling, public
adjuster workflows, AI, paid services, broad recipient discovery, catalogs,
address matching, direct Jobrolo database/session/object-key reads, public
storage URLs, automatic acceptance, and production deployment.
