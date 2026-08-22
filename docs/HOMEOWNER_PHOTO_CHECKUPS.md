# Private Seasonal Photo Checkups

Status: **implemented, default-off, image-only private beta.** This capability
is deliberately separate from the generic PDF/JPEG/PNG artifact uploader. It
uses the existing private Supabase bucket and existing Render application, and
requires no paid image, malware-scanning, AI, or scheduling service.

## What a homeowner can do

- record one observation date, one home area, and one repeatable spot name;
- add one JPEG or PNG at a time, up to 10 MiB;
- optionally add a factual note of at most 240 characters;
- review private photos grouped by the same area and spot;
- compare the latest two photos for that exact view; and
- delete one saved photo.

Examples of useful spot names are “hall ceiling by vent,” “north attic rafter,”
and “rear gutter above patio.” Area alone is not treated as a like-for-like
view.

The feature does not inspect a home, diagnose damage, determine causation,
prove when a condition began, estimate repair cost, or send a photo to Jobrolo
or a contractor. No AI model receives the photo.

## Stored-image boundary

The exact-home controller is authorized before the body is buffered. The input
must declare JPEG or PNG, contain matching bytes, be no larger than 10 MiB, and
decode as one bounded still image. The server uses Sharp/libvips with a single
in-process transform slot, disabled shared cache, a 32-megapixel input ceiling,
and bounded read/transform times.

The server auto-orients and re-encodes the pixels into two new JPEGs:

- full: at most 2,048 pixels on either side and at most 1.5 MiB;
- thumbnail: at most 480 pixels on either side and at most 100 KiB.

Only those derivatives are stored. The raw upload and original filename are
never persisted. EXIF/GPS, XMP, IPTC, ICC, device data, and comments are not
copied into the derivatives. HEIC/HEIF is not accepted by the server; the UI
tells an iPhone user to export or share a JPEG copy when the browser does not
provide one.

Both objects use opaque, server-selected keys in the non-public
`homesrolo-homeowner-private` bucket. The browser receives only exact same-origin
content routes. Every list, content, and delete operation rechecks the exact
home membership. Content is integrity-checked after the private Storage read
and returned with private `no-store`, `nosniff`, same-origin resource policy,
and sandbox headers.

## Hard pilot caps

The limits are enforced transactionally in Postgres and cannot be raised by a
browser request:

- 100 active/reserved photos or 150 MiB per home;
- 200 active/reserved photos or 250 MiB per controller;
- 500 active/reserved photos or 500 MiB across the pilot;
- one active upload per home/controller, four reservations globally, and one
  body/transform at a time in each Render process;
- 20 upload attempts per controller, 12 per home, and 120 globally per rolling
  hour, including retries;
- 256 MiB of conservatively reserved upload output per controller and 512 MiB
  globally per calendar month;
- 128 MiB of served images per controller and 512 MiB globally per rolling day;
- 512 MiB of served images per controller and 2 GiB globally per calendar month;
  and
- separate per-minute, daily, and monthly image-request count ceilings.

Each admitted upload reserves the 1,638,400-byte worst case against the monthly
output budget. Deleting a photo or starting a new command does not reset that
budget.

Failed or interrupted rows continue consuming quota until their exact objects
are confirmed removed. Once a later upload runs housekeeping, cleaned failures
older than one day and deleted opaque tombstones older than 30 days are
eligible for pruning. They may remain longer when no later upload runs because
this beta has no timed cleanup job. The table still has hard lifetime row caps
of 1,000 per controller and 5,000 globally. The egress ledger retains every row
needed by either the rolling 24-hour limits or current-calendar-month limits,
including up to 24 hours from the prior month, then transactionally prunes rows
older than both windows without a paid cron.

These are product kill-switch limits, not a promise that the upstream free
plans will never change. Check the current Supabase Storage/egress and Render
service usage before expanding the beta.

## Delete and interrupted-work behavior

Delete first makes the photo unavailable, removes both exact private objects
through the Storage API, and then strips the observation date, area, spot name,
caption, input facts, hashes, sizes, dimensions, and storage keys. Only a
minimal opaque idempotency tombstone remains for retry safety until later
housekeeping. Provider backup, security, or legal retention can differ from
active application storage; the UI does not promise immediate erasure from
provider backups or a fixed tombstone-removal date.

Interrupted uploads and deletes remain quarantined and are never listed or
served. Later photo-list and write requests perform bounded, service-role
cleanup that does not depend on a still-active homeowner membership. A cleanup
failure remains counted and retryable but does not block an unrelated
homeowner’s request. There is no timed cleanup job in this beta, so operators
must monitor stuck rows and can turn the capability off immediately.

## Release checklist

Before enabling the beta on any deployment:

1. Apply and verify migration `202608210003_homeowner_checkup_photos.sql`.
2. Confirm the existing `homesrolo-homeowner-private` bucket is non-public.
3. Confirm the service remains on the intended no-new-spend plan and current
   Storage/database/egress usage leaves room under the hard caps.
4. Deploy with `HOMESROLO_PHOTO_CHECKUPS_ENABLED=false` first and verify the
   session reports `photoCheckups: false` while `uploads`,
   `projectReviewAttachments`, and `homeResearch` remain false.
   The session capability envelope is strict in both directions, so any tab
   left open across this beta deployment must be reloaded once after the
   atomic Render cutover; this release is not a rolling old-client/new-server
   compatibility protocol.
5. Test a real iPhone JPEG and Android JPEG: orientation, dimensions, metadata
   stripping, list, thumbnail, full view, retry, and delete.
6. Set only `HOMESROLO_PHOTO_CHECKUPS_ENABLED=true`, redeploy, and verify the
   signed-in session reports the one new capability.
7. Run a private canary upload/delete and verify both Storage objects and the
   active metadata are gone after deletion.
8. Keep `HOMESROLO_PRIVATE_UPLOADS_ENABLED=false` and
   `HOMESROLO_JOBROLO_ATTACHMENTS_ENABLED=false` until their separate security
   gates are complete.

For a broad public launch, add account/home deletion, operational monitoring,
a timed orphan sweeper, and tested incident procedures. Do not expand accepted
file types or reuse this lane for PDFs without a separate security design.
