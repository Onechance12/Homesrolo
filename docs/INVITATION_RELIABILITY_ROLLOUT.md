# Household invitation visibility and retained company labels

The application repairs two private access-management problems:

- The household roster includes every live pending invitation (maximum 24)
  plus up to 24 recent history rows. Newer accepted/revoked/expired records
  cannot hide an invitation that still grants an opportunity to join.
- Project invitations retain a company label independently of public listing,
  current company trades, project category, or public directory pagination.
  The existing exact-home/project and professional authority checks remain.

## Release order

1. Deploy the compatible application before the database migrations. Its
   roster contract accepts up to 48 rows with separate 24-row live/history
   bounds, and both browser clients accept the optional private invitation
   `professionalDisplayLabel`. Older databases and prior command receipts
   remain readable while this field is absent.
2. Before applying the label migration, refresh every supported PWA/browser
   client and update any supported installed native client to this compatible
   decoder. Old strict decoders reject the newly added response field even
   though it is additive. This is a release gate, not backward compatibility:
   if old clients must keep working, hold the label migration until a separate
   versioned-response strategy exists. Receipt compatibility in step 1 only
   means the new application can still read old responses.
3. Apply `202609050001_household_pending_invitation_visibility.sql`, then
   `202609050002_private_invitation_company_labels.sql`, after the existing
   migrations through `202609010004`. Do not edit or rerun historical migrations.
4. Verify a synthetic older pending household invitation remains visible and
   revocable after more than 24 newer history records. Verify an existing
   company invitation keeps its label after that company becomes a private
   draft, while the company is still absent from public discovery. Confirm
   revocation still removes that exact invitation from the contractor's reads.

The label migration backfills each old invitation using its exact company's
current display name once. It cannot reconstruct a name that was changed
before this release. New labels are populated by a database trigger from the
exact organization and cannot be changed along with invitation lifecycle
updates. This does not publish draft company information or grant new access.

Keep these forward migrations when rolling back application behavior. An old
application with the 24-total-row roster contract is not a safe rollback
target for a household containing both 24 live invitations and history. The
compatible contract/decoder must remain deployed.

## Local database regression

With the PostgreSQL server/client binaries `initdb`, `pg_ctl`, and `psql` on
PATH, run:

```sh
npm run test:invitation-db
```

The test creates a temporary local PostgreSQL cluster with a unique Unix
socket and synthetic fixtures, executes the actual forward migrations, and
stops/removes that fixture cluster afterward. It does not use a connection
URL, an existing server, environment database credentials, or production data.
It verifies pending/history visibility, membership and home scope, retained
labels, caller-spoof rejection, immutable company identity, draft
nondiscovery, revoked-invitation exclusion, and unchanged browser grants.

The fixture uses relevant historical objects and minimal supporting tables,
then executes both actual forward migration files. It is not a full historical
migration replay or proof of production integration. The CI **Verify contracts**
job runs this test using PostgreSQL binaries located by `pg_config --bindir`;
the runner must provide `pg_config` and those server/client binaries. Missing
binaries fail the test rather than silently skipping database coverage.
