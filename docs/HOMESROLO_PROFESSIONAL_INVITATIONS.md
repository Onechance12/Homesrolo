# Homesrolo professional invitations

Status: **implemented, independently gated private vertical slice.** This is the
homeowner-controlled lane for a company profile, one exact project invitation,
selected evidence, and one structured proposal. It is not a CRM, open lead
board, ranking product, payment processor, or whole-home access role.

## Complete first loop

1. An existing verified Homesrolo principal creates a professional
   organization using the same email-code account.
2. The organization publishes company-supplied profile facts: name,
   description, services, service areas, and public contact methods.
3. A homeowner opens an existing project, chooses a listed company, selects up
   to 25 exact project files, reviews the message, and sends a seven-day invite.
4. An active member of that organization accepts or declines it.
5. After acceptance, that member can read only the frozen project disclosure
   and the exact selected files while the invite remains active.
6. The company submits one structured proposal and may create immutable
   revisions until the homeowner selects it.
7. The homeowner compares the proposal in the existing Quotes workspace and
   may shortlist, select, or pass. Only one proposal may be selected per
   project.

The project and quote records are reused; the feature creates no second
contractor project and no Home Record membership.

## Security boundary

- Browser requests carry opaque references and command data, never principal,
  membership, controller, role, address, storage key, or bucket authority.
- Homeowner invitation and decision writes fresh-check an exact active
  `workspace_controller` membership and the exact home/project row. The Home
  admin does not need to be the household member who originally created it.
- Professional writes fresh-check an active, email-verified principal and a
  separate active organization membership in the database transaction.
- Invitation disclosure is a bounded immutable snapshot. Its category must be
  one of the invited company’s published trades.
- Selected evidence must already be an available private artifact bound to the
  same home and project. An adult member may have uploaded it; uploader identity
  is not project authority. Each private byte read is re-authorized after
  storage returns, before bytes leave the server, and closed invitations are
  excluded from the professional workspace.
- Home admins and adult members may upload and organize shared-library
  artifacts; viewers remain read-only. Both the active upload path and the
  retained server-side upload boundary recheck current principal and exact
  household membership before replay or mutation.
- All new tables have RLS enabled. Browser roles have no grants. The service
  role has table reads only; mutations occur through revision-checked,
  receipt-backed security-definer functions.
- Public profiles are explicitly `company_self_reported`. Homesrolo does not
  turn them into a blanket verification badge or recommendation.
- Public profile links must be public HTTPS URLs without credentials, private
  network hosts, fragments, or nonstandard ports. Remote logo URLs are not
  automatically loaded in the private homeowner interface.

## New-environment release order

1. For a new environment, keep
   `HOMESROLO_PROFESSIONAL_INVITATIONS_ENABLED=false` or unset until the
   database steps below are complete.
2. Apply every Supabase migration in filename order through `202609010004`.
   The staged corrections are `202609010000` through `202609010004`; do not
   selectively apply them ahead of the earlier project, artifact, proposal,
   professional-invitation, and household migrations they depend on. Migration
   `202609010003` is forward-only after cross-member proposal evidence is
   saved; restoring the old uploader-coupled foreign key would reject those
   valid rows.
3. Verify all five new tables have RLS, browser roles have no grants, service
   role has SELECT only, and every new RPC is executable only by service role.
4. Run one two-account canary:
   - create and publish a company profile;
   - invite it to one non-sensitive test project with one test image;
   - confirm a different organization cannot see the invite or file;
   - accept, open the selected file, submit and revise a proposal;
   - shortlist and select it as the homeowner;
   - confirm the selected proposal is locked;
   - revoke the invitation and confirm the evidence URL returns no bytes.
5. Set both `HOMESROLO_PROJECT_QUOTES_ENABLED=true` and
   `HOMESROLO_PROFESSIONAL_INVITATIONS_ENABLED=true`, then deploy.

## Existing-production cutover

Do not reverse the app and database steps or apply all five corrections as one
unobserved batch against the old app.

1. Start a controlled release window. Set
   `HOMESROLO_PROFESSIONAL_INVITATIONS_ENABLED=false` and
   `HOMESROLO_PROJECT_QUOTES_ENABLED=false` in both the deployed
   `netlify.toml` and the Netlify production environment for Builds, Functions,
   and Runtime, then deploy that pause before any database change. A repository
   build value does not replace an existing runtime-scoped Netlify value.
   Redeploy after changing the runtime value. Verify the public professional
   endpoint returns `503 unavailable` and, with an existing signed-in synthetic
   session, that project quotes and professional invitations are unavailable
   before continuing. Then verify there are no noncanonical or
   case/whitespace-equivalent duplicate rows in
   `homesrolo_homeowner_principals`. Also verify the expected old proposal
   evidence foreign key is present and the new three-column key is absent.
2. Apply only
   `202609010000_safe_household_rollout_guards.sql`. If its preflight stops,
   reconcile the named principal rows explicitly and rerun it; never merge or
   delete an identity automatically. Confirm the canonical-email constraint,
   unique index, compatibility magic-link function, and
   authorized-professional-invitation RPC now exist. This guard deliberately
   increments every principal's session version once because historical
   email rotations cannot be inferred safely; all users must sign in again.
3. Deploy the compatible application. The predeploy unique index makes a rare
   provider-subject rotation fail closed instead of creating a second
   principal, while the compatibility function invalidates older sessions when
   the existing subject's verified email changes. Keep the affected writes
   paused until the remaining migrations and postflight finish.
4. Immediately apply `202609010001`, `202609010002`, `202609010003`, and
   `202609010004`, in that order. Never apply `202609010003` before the
   compatible application; the old API rejects the valid cross-member
   controller relationship after a database write.
5. Postflight the exact constraints, indexes, RPC ownership/grants, current
   principal count, active household membership, invitation status, and
   proposal/artifact project scope. Then set the two repository and Netlify
   production-runtime values back to `true`, deploy, run the two-account canary
   above, and verify revocation again before closing the release window.

Rollback is the environment flag. Set both the repository build value and the
Netlify production Builds/Functions/Runtime value to `false`, then redeploy;
the directory, Pro hub, invitation APIs, selected-evidence route, and proposal
writes then fail closed without deleting profiles, invitations, or proposal
history. The canonical identity guard and forward-only proposal evidence key
remain in place; do not restore the uploader-coupled key after cross-member
rows exist.

## Intentionally outside this slice

- payments, escrow, deposits, or Homesrolo-held contracts;
- open bidding, paid placement, lead resale, or automatic contractor routing;
- reviews, aggregate ratings, Academy credentials, or blanket verification;
- contractor CRM operations, crews, dispatch, production, or accounting;
- contractor uploads other than structured proposal facts;
- messages, shared calendar state, change orders, approvals, and completion
  handoff automation.
