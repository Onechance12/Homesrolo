# Private address-first Home Record profile

Homesrolo now treats the exact property as the starting point for one private
Home Record. A signed-in workspace controller can save and edit:

- one structured US property address;
- home type and exact or approximate build year; and
- the existing six-system inventory (roof, heating, cooling, water heater,
  gutters, and foundation), including an optional exact or approximate
  installed/replaced year.

Measurements are intentionally outside this slice.

## Privacy boundary

The exact address is stored on `homesrolo_private_homes`, which already has RLS
enabled and grants table access only to `service_role`. It is returned only to
an active workspace controller by `GET /api/v1/homes/{homeRef}/record`.
`GET /api/v1/homes` and `GET /api/v1/homes/{homeRef}` keep their original
address-free v1 projections, so invited members/viewers and older clients never
receive the exact address as part of routine workspace reads.

The update receipt stores only `homeRef`, the resulting revision, and the first
execution time in the service-role-only table. It never duplicates the address
or profile. On a digest-matched retry, the RPC rebuilds the browser response
from the retry inputs bound by that digest and the stored revision/time. The
receipt is keyed and indexed by `home_ref` with `ON DELETE CASCADE`. As
opportunistic abuse hygiene (not a scheduled retention guarantee), subsequent
updates prune receipts older than 30 days and cap retained update receipts at
64 per home. The read RPC rechecks the exact active controller membership and
returns the home, facts, and systems from one database snapshot.

The address and facts remain homeowner-entered recollection. They do not prove
ownership, property condition, value, code compliance, or insurance coverage.

## Write boundary

`POST /api/v1/homes/{homeRef}/record` accepts one strict command containing a
browser-minted idempotency reference, the last observed aggregate revision,
the structured address, basic facts, and every supported system exactly once.
The server supplies the principal, current membership, source, and execution
time.

The database function:

1. serializes all Home Record writes for one exact home;
2. locks and rechecks the exact active `workspace_controller` membership before
   receipt replay, so a concurrent revoke serializes before or after the write;
3. binds the receipt digest and stored result to the exact home;
4. rejects a stale `record_revision`;
5. updates address, facts, and systems atomically; and
6. increments the aggregate revision and stores an idempotency receipt.

The older initial-intake RPC shares the same home-level lock and increments the
same aggregate revision. It is now first-write-only: once facts or systems have
been recorded, edits must use the revision-backed Home Record command. A later
profile editor therefore sees a revision conflict instead of silently replacing
a concurrent intake write.

## Migration order

Apply migrations in filename order. This feature specifically requires:

1. `202608120001_homeowner_runtime.sql`
2. all already-shipped migrations through
   `202608250002_homeowner_dev_private_uploads.sql`
3. `202608250003_home_record_profile.sql`

Apply `202608250003_home_record_profile.sql` before deploying code that reads
`record_revision`, `record_updated_at`, or the structured address columns.

## Known limits

- Address input is US-only in this first contract (`countryCode = US`).
- No address autocomplete, geocoding, public-record lookup, parcel match, or
  ownership verification runs in this slice.
- Duplicate-address resolution and owner-to-owner transfer remain separate
  product problems; an address entered here is not a global property claim.
- A free-form home name remains separate from property identity so households
  can use familiar labels without changing the address.
