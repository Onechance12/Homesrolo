# Signed-in development private uploads

This lane lets an existing Homesrolo principal test private home files on the
Netlify-hosted PWA without sending file bytes through a Netlify Function. It is
not a public-upload launch. `HOMESROLO_PRIVATE_UPLOADS_ENABLED` remains `false`
in `netlify.toml` and is the immediate kill switch.

## Protocol

The protocol is platform-neutral and can be reused by a future iPhone or
Android client:

1. The client reads a PDF, JPEG, or PNG no larger than 10 MiB, derives its
   magic-byte media type and SHA-256, and sends only the bounded descriptor to
   `POST /api/v1/homes/{homeRef}/artifacts`.
2. The server authenticates the HttpOnly session, fresh-reads the exact-home
   membership, checks an optional project belongs to that home, and reserves
   one opaque object key. Controllers and active members may upload; viewers
   cannot.
3. The server charges one token issuance before Supabase mints the signed PUT.
   The client PUTs `application/octet-stream` directly to that exact key with
   cookies and referrer omitted and `x-upsert:false`.
4. The client calls the authenticated same-origin completion route. A fenced,
   DB-clock lease is claimed before Storage I/O. The server downloads at most
   10 MiB and re-derives length, SHA-256, and file signature. Only an exact
   match is listed as available.
5. Downloads and JPEG/PNG previews use authenticated same-origin routes with
   `private, no-store`; no public Storage URL enters the UI. PDFs are
   attachment-only. The service worker bypasses every `/api/` response.

The client APIs do not carry a principal, role, membership, address, or
storage authority. Camera capture remains a UI concern; the transport is
ordinary JSON plus signed HTTP PUT. HEIC is not accepted yet. A future native
or server-side conversion step can decode HEIC, strip metadata, and reserve the
resulting JPEG without changing the authorization protocol.

## Deliberately conservative quota model

Supabase signed PUT authorization has no provider-enforced request-body
deadline that Homesrolo can prove. A PUT started before token expiry could
finish after any cleanup timer. This development lane therefore never
automatically deletes a reservation, marks its key clean, or returns its quota.
Every reservation permanently charges the full 10 MiB bucket authority even
when the declared or verified file is smaller, rejected, or abandoned.

Under one global advisory lock, combined existing artifact/checkup storage and
new authority is capped at:

- 500 MiB per home;
- 500 MiB per uploader principal;
- 600 MiB globally.

That permits roughly 50 test reservations for one home while leaving about
400 MiB of the Supabase Free 1 GiB storage allowance as headroom. Existing
objects reduce the remaining capacity. Each command can receive at most three
signed tokens and each costly completion claim consumes one issued attempt.
Only one live completion runs for a home/uploader and four globally. Stale
leases are judged from PostgreSQL `clock_timestamp()`, not caller clocks.

This permanent accounting is intentional for development. Do not add a timed
cleanup job until the provider supplies a provable upload-duration/lifecycle
guarantee or the application moves to a bounded proxy/chunk protocol.

There is one service-only reclamation path, and it retires the entire bucket
generation rather than trusting an age on one reservation. Disable the upload
gate, preserve or remove every available artifact, empty and delete the bucket
through Supabase Storage, then call
`homesrolo_retire_dev_homeowner_upload_bucket` as `service_role`. The RPC fails
while the bucket exists or an artifact still references it, tombstones the
bucket id so this migration cannot recreate it, and only then releases the
generation's quota charges. A retired bucket id must never be reused. Enabling
uploads again requires a new migration and a new bucket id. Individual failed,
rejected, or abandoned reservations cannot safely reclaim quota while their
signed-upload namespace still exists.

## Deferred before public signup

Malware scanning, user deletion/retention controls, durable distributed request
rate limiting, and HEIC conversion are deferred. The database rejects content
whose verified magic bytes/hash/length do not match, but that is not malware
scanning. Keep both gates fail-closed:

- `HOMESROLO_PRIVATE_UPLOADS_ENABLED=false` disables the lane.
- `HOMESROLO_SELF_SIGNUP_ENABLED=false` prevents Supabase OTP from creating a
  new user while allowing existing principals to sign in.

## Activation and rollback

No code deployment or migration application is performed by this branch.

1. Deploy with both gates still `false`.
2. Apply `supabase/migrations/202608250002_homeowner_dev_private_uploads.sql`.
3. In Supabase, confirm `homesrolo-homeowner-dev-uploads` is private, has a
   10 MiB limit, allows only `application/octet-stream`, and has no anon or
   authenticated Storage policy.
4. Confirm the seven new RPCs, reservation table, and retired-bucket tombstone
   table are service-role only.
5. Keep `HOMESROLO_SELF_SIGNUP_ENABLED=false`. Sign in with an existing test
   principal and set only `HOMESROLO_PRIVATE_UPLOADS_ENABLED=true`.
6. Test a PDF, JPEG, and PNG; project linkage; image preview; attachment
   download; member success; viewer denial; cross-home denial; oversize and
   mismatched content; retry after an ambiguous PUT; and kill-switch rollback.
7. Set `HOMESROLO_PRIVATE_UPLOADS_ENABLED=false` immediately after the private
   test window or upon unexpected behavior. Disabling the gate hides upload,
   list, preview, and download capabilities without deleting private bytes.

Never make the bucket public and never paste a signed URL into logs, analytics,
support messages, or persisted browser state.
