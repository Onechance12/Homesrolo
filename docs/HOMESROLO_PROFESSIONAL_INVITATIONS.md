# Homesrolo professional invitations

Status: **implemented, default-off private vertical slice.** This is the
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
  `workspace_controller` membership and the exact home/project/controller row.
- Professional writes fresh-check an active, email-verified principal and a
  separate active organization membership in the database transaction.
- Invitation disclosure is a bounded immutable snapshot. Its category must be
  one of the invited company’s published trades.
- Selected evidence must already be an available private artifact bound to the
  same home, project, and controller. Each private byte read is re-authorized
  after storage returns, before bytes leave the server.
- All new tables have RLS enabled. Browser roles have no grants. The service
  role has table reads only; mutations occur through revision-checked,
  receipt-backed security-definer functions.
- Public profiles are explicitly `company_self_reported`. Homesrolo does not
  turn them into a blanket verification badge or recommendation.
- Public profile links must be public HTTPS URLs without credentials, private
  network hosts, fragments, or nonstandard ports. Remote logo URLs are not
  automatically loaded in the private homeowner interface.

## Release order

1. Keep `HOMESROLO_PROFESSIONAL_INVITATIONS_ENABLED=false` or unset.
2. Verify proposal migrations `202608210001` and `202608260001`, then apply
   `supabase/migrations/202608260002_homesrolo_professional_invitations.sql`.
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

Rollback is the environment flag. Set it to `false` and redeploy; the directory,
Pro hub, invitation APIs, selected-evidence route, and proposal writes then fail
closed without deleting profiles, invitations, or proposal history.

## Intentionally outside this slice

- payments, escrow, deposits, or Homesrolo-held contracts;
- open bidding, paid placement, lead resale, or automatic contractor routing;
- reviews, aggregate ratings, Academy credentials, or blanket verification;
- contractor CRM operations, crews, dispatch, production, or accounting;
- contractor uploads other than structured proposal facts;
- messages, shared calendar state, change orders, approvals, and completion
  handoff automation; and
- native mobile presentation. The APIs and authority model are reusable by the
  Expo client, but native screens require a separate reviewed release.
