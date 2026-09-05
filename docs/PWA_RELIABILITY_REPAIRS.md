# PWA reliability repair pass — September 2026

This repair pass follows the September 4 synthetic PWA QA and source audit.
It does not add child accounts, recurring maintenance, scheduling, payments,
or construction-completion features.

## Repairs

- **A1 — Rolo history during outages.** Exact-home authorization still gates
  rendering and hydration. Network errors, malformed responses, rate limits,
  and 5xx failures no longer delete stored project conversations. Only matching
  application denial pairs (`403/forbidden`, `404/not_found`) authorize an
  exact-principal/home purge. A retry notice replaces the indefinite loader.
  Session sign-out retains its separate cleanup policy.
- **A2 — unrelated questions after refusals.** Standalone safe topics and
  explicit urgent reports no longer inherit a prior unrelated refusal. Refused
  exchanges are removed before later safe topics reach the assistant; direct
  prohibited requests, referential pressure, existing provider safeguards,
  and output auditing remain. Continuation/hazard recognition is lexical,
  not a general intent classifier or a new deterministic safety service.
- **A3 — actionable household invitations.** The roster returns all live
  pending invitations plus independently bounded recent history.
- **A4 — accepted invitation wording.** The professional UI distinguishes
  accepted access to a project workspace from homeowner proposal selection.
- **Q1 — shared-cookie account changes.** The PWA hides private content and
  its photo-preview portal while checking identity, blocks private actions
  before dispatch, and ignores stale responses and old-account API bindings.
  Same-person verification retains mounted forms; a different principal
  remounts the private subtree. Focus/visibility checks and paired,
  credential-free browser signals cover known application sign-in/sign-out
  paths. A vanished sign-in tab produces a bounded, retryable error. Session
  checks do not delete chats on temporary failures. Only interrupted read
  loaders recover automatically after same-person confirmation; mutations
  never replay. Native bearer and synthetic preview behavior is unchanged.
- **Q2 — service-area roundtrip.** Both company editors preserve commas inside
  city/state names and split only line endings. Existing trimming,
  case-insensitive deduplication, and list limits remain. Existing corrupted
  production entries cannot safely be reconstructed automatically.
- **Q3 — retained invitation identity.** Privately authorized invitations get
  a stable server-captured company label, independent of public discovery.
  Unpublishing or changing trades does not erase it or grant new access.

The server remains the authentication authority. Browser signals carry only
a change marker, never credentials or an account identity. This client-side
coordination cannot cancel a write already dispatched or atomically cover an
external cookie change that emits no application signal. Session identity
verification is not global household-membership cache invalidation; existing
exact-home/project server authorization and Rolo access checks still apply.

## Verification scope

Final local gates passed: root contracts **207**, homeowner **320**, mobile
**341**, public directory **82**, and the local PostgreSQL migration regression
**1** — **951 passing tests**, zero failures or skips. Root, homeowner, and
mobile typechecks and homeowner lint passed. The production-configured Expo
PWA export and Next production build passed. Native exports and public web
builds are additionally exercised by the pull request's CI gates.
The database regression is local-only until an authorized maintainer adds its
documented CI step; the current GitHub sign-in cannot edit workflow files.

Regression coverage includes both previously reproduced account-transition
races, actual API-client methods with fake native IO and fetch, upload-stage
boundaries, same-principal read recovery, old-principal rejection, and native
transport controls. These tests send no real requests and use no credentials.

Provider/portal preservation checks are source assertions, not mounted UI
tests. The real-PWA acceptance pass below remains a release gate; a successful
bundle is not evidence that deployed multi-account behavior was retested.

## Release boundaries

Implementation and local verification do not change production. Merge,
deployment, database migration execution, and the post-deploy synthetic PWA
retest are separate release steps.

Follow [the invitation rollout order](./INVITATION_RELIABILITY_ROLLOUT.md).
The compatible server application and supported clients must be updated
before applying the forward migrations. Old strict response decoders cannot
consume the newly added invitation-label field. Prior receipts without the
field remain readable by the new application; this does not make old clients
forward-compatible. The historical 24-total-invitation cap was in the server
roster contract; the old Expo mobile/PWA roster decoder accepted arrays without
a length cap. Do not roll back the server to that old 24-total-invitation
contract after applying the roster migration. Keep the conservative ordered
client-refresh and migration gate in the rollout runbook.

On September 5, 2026, Chance confirmed that nobody was using Homesrolo and the
app had not been published. This owner-reported inventory context does not
prove that all previous clients refreshed. Known synthetic browser sessions
must still reload the compatible shell after deployment and before migrations.

The database regression uses actual forward migrations with the relevant
historical objects and synthetic fixtures in a newly created local cluster.
It is not a full historical migration replay or proof of production state.

## Post-deployment acceptance checklist

Use synthetic accounts and records only; never log credentials or tokens.

1. Confirm the deployed revision and upgraded client shell, then apply the
   reviewed forward migrations in order.
2. Verify shared household Work, attributed updates, viewer restrictions,
   and private project-chat separation.
3. Interrupt home access with a temporary network failure; verify the private
   conversation stays hidden during uncertainty and returns after retry.
4. Ask an ordinary question and an urgent safety question after a refusal;
   verify neither receives the old unrelated refusal. Confirm pressure to
   continue the prohibited request remains refused.
5. Switch accounts across tabs; verify stale content/actions stay unavailable
   during revalidation and the confirmed identity is displayed afterward.
   Leave a form and photo preview open, return as the same person, and verify
   the draft survives while the preview is hidden during uncertainty. Change
   to another person and verify neither draft nor preview crosses identities.
   Close a sign-in tab mid-exchange; verify startup and existing tabs expose
   retry after the bounded wait. Verify an interrupted read reloads without
   resubmitting any write.
6. Save a comma-containing service area while changing only publication.
   Verify the area remains one entry.
7. Invite one synthetic professional to two projects, submit distinct
   proposals, select one, revoke only that project's access, and verify the
   other still permits its own proposal revision.
8. Verify an older pending household invitation remains manageable after more
   than 24 newer history rows, and an existing professional invitation retains
   its name after the company becomes private.
9. Revoke only this run's test access, restore private synthetic listings, and
   retain clearly labeled test history for evidence. No actual work or money.
