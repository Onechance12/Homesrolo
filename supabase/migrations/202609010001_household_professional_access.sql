begin;

-- Household members create shared work and may upload its evidence. A current
-- Home admin, rather than the actor who created either row, controls whether
-- an exact project and an explicit artifact allowlist are shared with a pro.
create or replace function public.homesrolo_create_project_invitation(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_professional_organization_ref text,
  p_message text,
  p_disclosure jsonb,
  p_disclosure_digest text,
  p_expires_at timestamptz,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_project public.homesrolo_homeowner_projects%rowtype;
  v_invitation public.homesrolo_project_invitations%rowtype;
  v_expected_trade text;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':professional.invite', 0)
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  select * into v_receipt
  from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'professional.invite';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  perform public.homesrolo_expire_project_invitations(p_requested_at);

  perform pg_advisory_xact_lock(
    hashtextextended(p_home_ref || ':' || p_project_ref || ':active-invitation-limit', 0)
  );
  if (
    select count(*)
    from public.homesrolo_project_invitations
    where home_ref = p_home_ref
      and project_ref = p_project_ref
      and status in ('pending', 'accepted')
  ) >= 12 then raise exception 'project_invitation_limit_reached'; end if;

  select * into v_project
  from public.homesrolo_homeowner_projects
  where project_ref = p_project_ref
    and home_ref = p_home_ref
    and archived_at is null
  for share;
  if not found then raise exception 'project_not_found'; end if;

  v_expected_trade := case v_project.category
    when 'roofing' then 'Roofing'
    when 'exterior' then 'Exterior'
    when 'interior' then 'Interior remodeling'
    when 'electrical' then 'Electrical'
    when 'plumbing' then 'Plumbing'
    when 'hvac' then 'Heating & cooling'
    when 'landscaping' then 'Yard & landscaping'
    when 'appliances' then 'Appliances'
    when 'pest' then 'Pest control'
    when 'pool' then 'Pool'
    when 'new_construction' then 'New construction'
    when 'other' then 'Home service'
    else null
  end;
  if v_expected_trade is null then raise exception 'invalid_project_category'; end if;

  perform 1
  from public.homesrolo_professional_organizations
    where organization_ref = p_professional_organization_ref
      and publication_state = 'published'
      and v_project.category = any(trades)
  for share;
  if not found then raise exception 'professional_profile_not_found'; end if;

  if p_expires_at <= p_requested_at
    or p_expires_at > p_requested_at + interval '30 days'
    or jsonb_typeof(p_disclosure) <> 'object'
    or not (p_disclosure ?& array[
      'title', 'workKind', 'category', 'trade', 'status', 'summary',
      'selectedArtifactRefs'
    ])
    or p_disclosure - array[
      'title', 'workKind', 'category', 'trade', 'status', 'summary',
      'selectedArtifactRefs'
    ] <> '{}'::jsonb
    or jsonb_typeof(p_disclosure -> 'selectedArtifactRefs') <> 'array'
    or jsonb_array_length(p_disclosure -> 'selectedArtifactRefs') > 25
    or p_disclosure ->> 'title' <> v_project.title
    or p_disclosure ->> 'workKind' <> v_project.work_kind
    or p_disclosure ->> 'category' <> v_project.category
    or p_disclosure ->> 'trade' <> v_expected_trade
    or p_disclosure ->> 'status' <> v_project.status
    or p_disclosure ->> 'summary' <> coalesce(v_project.summary, '')
  then raise exception 'invalid_project_disclosure'; end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_disclosure -> 'selectedArtifactRefs') ref(value)
    where value !~ '^hart_[A-Za-z0-9_-]{43}$'
      or not exists (
        select 1 from public.homesrolo_homeowner_artifacts artifact
        where artifact.artifact_ref = ref.value
          and artifact.home_ref = p_home_ref
          and artifact.project_ref = p_project_ref
          and artifact.state = 'available'
      )
  ) or (
    select count(*) <> count(distinct value)
    from jsonb_array_elements_text(p_disclosure -> 'selectedArtifactRefs') ref(value)
  ) then raise exception 'artifact_not_authorized'; end if;

  insert into public.homesrolo_project_invitations (
    invitation_ref, home_ref, project_ref, project_controller_principal_ref,
    invited_by_principal_ref, professional_organization_ref, command_ref,
    command_digest, status, message, disclosure, disclosure_digest, expires_at,
    revision, created_at
  ) values (
    p_invitation_ref, p_home_ref, p_project_ref, v_project.controller_principal_ref,
    p_principal_ref, p_professional_organization_ref, p_command_ref,
    p_command_digest, 'pending', nullif(btrim(p_message), ''), p_disclosure,
    p_disclosure_digest, p_expires_at, 1, p_requested_at
  ) returning * into v_invitation;

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_invitation);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'professional.invite', p_command_digest,
    v_result, p_requested_at, p_home_ref
  );
  return v_result;
exception
  when unique_violation then
    raise exception 'active_invitation_exists';
end;
$$;

revoke all on function public.homesrolo_create_project_invitation(
  text, text, text, text, integer, text, text, text, text, text, jsonb,
  text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_project_invitation(
  text, text, text, text, integer, text, text, text, text, text, jsonb,
  text, timestamptz, timestamptz
) to service_role;

-- Hold the exact controller membership stable until each administrative write
-- commits. Without this row lock, a concurrent household-role change could
-- revoke authority after the check but before the invitation mutation.
create or replace function public.homesrolo_revoke_project_invitation(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_expected_revision integer,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_invitation public.homesrolo_project_invitations%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_principal_ref || ':' || p_command_ref || ':professional.invitation.revoke', 0
    )
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
  where membership_ref = p_membership_ref
    and principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and revision = p_membership_revision
    and state = 'active'
    and role = 'workspace_controller'
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  select * into v_receipt
  from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'professional.invitation.revoke';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  select * into v_invitation
  from public.homesrolo_project_invitations
  where invitation_ref = p_invitation_ref
    and home_ref = p_home_ref
    and project_ref = p_project_ref
  for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_invitation.status not in ('pending', 'accepted') then
    raise exception 'invitation_not_revocable';
  end if;
  if v_invitation.revision <> p_expected_revision then
    raise exception 'invitation_revision_conflict';
  end if;

  update public.homesrolo_project_invitations
  set status = 'revoked',
      responded_at = null,
      revoked_at = p_requested_at,
      revision = revision + 1
  where invitation_ref = p_invitation_ref
  returning * into v_invitation;

  v_result := to_jsonb(v_invitation);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'professional.invitation.revoke',
    p_command_digest, v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_revoke_project_invitation(
  text, text, text, text, integer, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_revoke_project_invitation(
  text, text, text, text, integer, text, text, text, integer, timestamptz
) to service_role;

-- Proposal decisions need the same transaction-stable controller authority.
create or replace function public.homesrolo_decide_professional_proposal(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_quote_ref text,
  p_expected_decision_revision integer,
  p_decision text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':proposal.decide', 0)
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
  where membership_ref = p_membership_ref
    and principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and revision = p_membership_revision
    and state = 'active'
    and role = 'workspace_controller'
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  select * into v_receipt
  from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'proposal.decide';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if p_decision not in ('shortlisted', 'selected', 'declined') then
    raise exception 'invalid_proposal_decision';
  end if;

  select * into v_quote
  from public.homesrolo_homeowner_project_quotes
  where quote_ref = p_quote_ref
    and home_ref = p_home_ref
    and project_ref = p_project_ref
    and source = 'professional_submission'
    and proposal_state = 'submitted'
  for update;
  if not found then raise exception 'professional_proposal_not_found'; end if;
  if v_quote.decision_revision <> p_expected_decision_revision then
    raise exception 'proposal_decision_revision_conflict';
  end if;
  if v_quote.homeowner_decision = p_decision then
    raise exception 'proposal_decision_unchanged';
  end if;

  if p_decision = 'selected' then
    update public.homesrolo_homeowner_project_quotes
    set homeowner_decision = 'shortlisted',
        decision_revision = decision_revision + 1,
        updated_at = p_requested_at
    where home_ref = p_home_ref
      and project_ref = p_project_ref
      and source = 'professional_submission'
      and proposal_state = 'submitted'
      and homeowner_decision = 'selected'
      and quote_ref <> p_quote_ref;
  end if;

  update public.homesrolo_homeowner_project_quotes
  set homeowner_decision = p_decision,
      decision_revision = decision_revision + 1,
      updated_at = p_requested_at
  where quote_ref = p_quote_ref
  returning * into v_quote;

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'proposal.decide', p_command_digest,
    v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_decide_professional_proposal(
  text, text, text, text, integer, text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_decide_professional_proposal(
  text, text, text, text, integer, text, text, text, integer, text, timestamptz
) to service_role;

-- A professional command may only be replayed while the principal that issued
-- it is still active and verified. Hold that identity row through commit so a
-- concurrent disable cannot race organization creation or receipt replay.
create or replace function public.homesrolo_create_professional_organization(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_organization_ref text,
  p_membership_ref text,
  p_slug text,
  p_display_name text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_professional_command_receipts%rowtype;
  v_organization public.homesrolo_professional_organizations%rowtype;
  v_membership public.homesrolo_professional_memberships%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':organization.create', 0)
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'principal_not_authorized'; end if;

  select * into v_receipt
  from public.homesrolo_professional_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'organization.create';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':professional-organization-limit', 0)
  );
  if (
    select count(*)
    from public.homesrolo_professional_memberships
    where principal_ref = p_principal_ref and state = 'active'
  ) >= 3 then raise exception 'professional_organization_limit_reached'; end if;

  if p_slug in ('api', 'home', 'homes', 'new', 'pro', 'pros', 'signin', 'settings') then
    raise exception 'reserved_profile_slug';
  end if;

  insert into public.homesrolo_professional_organizations (
    organization_ref, slug, display_name, publication_state, provenance,
    revision, created_at, updated_at
  ) values (
    p_organization_ref, lower(btrim(p_slug)), btrim(p_display_name), 'draft',
    'company_self_reported', 1, p_requested_at, p_requested_at
  ) returning * into v_organization;

  insert into public.homesrolo_professional_memberships (
    membership_ref, organization_ref, principal_ref, role, state,
    revision, created_at
  ) values (
    p_membership_ref, p_organization_ref, p_principal_ref, 'owner', 'active',
    1, p_requested_at
  ) returning * into v_membership;

  v_result := jsonb_build_object(
    'organization', to_jsonb(v_organization),
    'membership', to_jsonb(v_membership)
  );
  insert into public.homesrolo_professional_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'organization.create', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
exception
  when unique_violation then
    raise exception 'profile_slug_unavailable';
end;
$$;

revoke all on function public.homesrolo_create_professional_organization(
  text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_professional_organization(
  text, text, text, text, text, text, text, timestamptz
) to service_role;

-- Profile writes hold the principal, administrative membership, and target
-- organization rows before consulting an idempotency receipt. A revoked admin
-- or disabled principal therefore cannot replay a formerly authorized command.
create or replace function public.homesrolo_save_professional_profile(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_organization_ref text,
  p_expected_revision integer,
  p_display_name text,
  p_legal_name text,
  p_description text,
  p_public_phone text,
  p_public_email text,
  p_website_url text,
  p_logo_url text,
  p_trades text[],
  p_service_areas text[],
  p_publication_state text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_professional_command_receipts%rowtype;
  v_organization public.homesrolo_professional_organizations%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':profile.save', 0)
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then
    raise exception 'professional_membership_not_authorized';
  end if;

  perform 1
  from public.homesrolo_professional_memberships
  where organization_ref = p_organization_ref
    and principal_ref = p_principal_ref
    and state = 'active'
    and role in ('owner', 'admin')
  for share;
  if not found then
    raise exception 'professional_membership_not_authorized';
  end if;

  select * into v_organization
  from public.homesrolo_professional_organizations
  where organization_ref = p_organization_ref
  for update;
  if not found or v_organization.publication_state = 'suspended' then
    raise exception 'professional_profile_not_authorized';
  end if;

  select * into v_receipt
  from public.homesrolo_professional_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'profile.save';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if p_publication_state not in ('draft', 'published')
    or p_trades is null or cardinality(p_trades) > 12
    or p_service_areas is null or cardinality(p_service_areas) > 40
    or exists (select 1 from unnest(p_trades) value where value is null or value = '')
    or exists (select 1 from unnest(p_service_areas) value where value is null or btrim(value) = '')
    or (select count(*) <> count(distinct lower(value)) from unnest(p_trades) value)
    or (select count(*) <> count(distinct lower(btrim(value))) from unnest(p_service_areas) value)
    or (
      p_publication_state = 'published'
      and (cardinality(p_trades) < 1 or cardinality(p_service_areas) < 1)
    ) then raise exception 'invalid_professional_profile'; end if;

  if v_organization.revision <> p_expected_revision then
    raise exception 'professional_profile_revision_conflict';
  end if;

  update public.homesrolo_professional_organizations
  set display_name = btrim(p_display_name),
      legal_name = nullif(btrim(p_legal_name), ''),
      description = nullif(btrim(p_description), ''),
      public_phone = nullif(btrim(p_public_phone), ''),
      public_email = nullif(lower(btrim(p_public_email)), ''),
      website_url = nullif(btrim(p_website_url), ''),
      logo_url = nullif(btrim(p_logo_url), ''),
      trades = p_trades,
      service_areas = array(select btrim(value) from unnest(p_service_areas) value),
      publication_state = p_publication_state,
      provenance = 'company_self_reported',
      revision = revision + 1,
      updated_at = p_requested_at
  where organization_ref = p_organization_ref
  returning * into v_organization;

  v_result := to_jsonb(v_organization);
  insert into public.homesrolo_professional_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'profile.save', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_save_professional_profile(
  text, text, text, text, integer, text, text, text, text, text, text,
  text, text[], text[], text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_save_professional_profile(
  text, text, text, text, integer, text, text, text, text, text, text,
  text, text[], text[], text, timestamptz
) to service_role;

-- Invitation responses lock every row that grants professional authority
-- before a receipt can be replayed. Lifecycle and revision checks remain after
-- the receipt so a currently authorized caller can safely retry a prior write.
create or replace function public.homesrolo_respond_project_invitation(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_expected_revision integer,
  p_response text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_professional_command_receipts%rowtype;
  v_invitation public.homesrolo_project_invitations%rowtype;
  v_result jsonb;
begin
  perform public.homesrolo_expire_project_invitations(p_requested_at);
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':invitation.respond', 0)
  );

  select invitation.* into v_invitation
  from public.homesrolo_project_invitations invitation
  join public.homesrolo_professional_organizations organization
    on organization.organization_ref = invitation.professional_organization_ref
   and organization.publication_state <> 'suspended'
  join public.homesrolo_professional_memberships membership
    on membership.organization_ref = organization.organization_ref
   and membership.principal_ref = p_principal_ref
   and membership.state = 'active'
  join public.homesrolo_homeowner_principals principal
    on principal.principal_ref = membership.principal_ref
   and principal.status = 'active'
   and principal.email_verified = true
  where invitation.invitation_ref = p_invitation_ref
  for update of invitation
  for share of organization, membership, principal;
  if not found then raise exception 'invitation_not_found'; end if;

  select * into v_receipt
  from public.homesrolo_professional_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'invitation.respond';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid_invitation_response';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= p_requested_at then
    raise exception 'invitation_not_pending';
  end if;
  if v_invitation.revision <> p_expected_revision then
    raise exception 'invitation_revision_conflict';
  end if;

  update public.homesrolo_project_invitations
  set status = p_response,
      responded_at = p_requested_at,
      revision = revision + 1
  where invitation_ref = p_invitation_ref
  returning * into v_invitation;

  v_result := to_jsonb(v_invitation);
  insert into public.homesrolo_professional_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'invitation.respond', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_respond_project_invitation(
  text, text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_respond_project_invitation(
  text, text, text, text, integer, text, timestamptz
) to service_role;

-- Proposal submission holds the accepted invitation plus the current
-- principal, organization membership, and non-suspended organization through
-- commit. The receipt cannot outlive any of those authorization facts.
create or replace function public.homesrolo_submit_professional_proposal(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_quote_ref text,
  p_version_ref text,
  p_proposal_date date,
  p_total_amount_cents bigint,
  p_summary text,
  p_scope jsonb,
  p_content_digest text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_professional_command_receipts%rowtype;
  v_invitation public.homesrolo_project_invitations%rowtype;
  v_organization public.homesrolo_professional_organizations%rowtype;
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_content jsonb;
  v_result jsonb;
begin
  perform public.homesrolo_expire_project_invitations(p_requested_at);
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':proposal.submit', 0)
  );

  select invitation.* into v_invitation
  from public.homesrolo_project_invitations invitation
  join public.homesrolo_professional_organizations organization
    on organization.organization_ref = invitation.professional_organization_ref
   and organization.publication_state <> 'suspended'
  join public.homesrolo_professional_memberships membership
    on membership.organization_ref = organization.organization_ref
   and membership.principal_ref = p_principal_ref
   and membership.state = 'active'
  join public.homesrolo_homeowner_principals principal
    on principal.principal_ref = membership.principal_ref
   and principal.status = 'active'
   and principal.email_verified = true
  where invitation.invitation_ref = p_invitation_ref
  for update of invitation
  for share of organization, membership, principal;
  if not found then raise exception 'accepted_invitation_not_found'; end if;

  select * into v_receipt
  from public.homesrolo_professional_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'proposal.submit';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if v_invitation.status <> 'accepted'
    or v_invitation.expires_at <= p_requested_at
  then raise exception 'accepted_invitation_not_found'; end if;

  select * into v_organization
  from public.homesrolo_professional_organizations
  where organization_ref = v_invitation.professional_organization_ref;
  if not found then raise exception 'professional_profile_not_found'; end if;

  if p_proposal_date is null
    or p_proposal_date > p_requested_at::date
    or p_total_amount_cents is not null
      and p_total_amount_cents not between 0 and 1000000000
    or p_scope is null
    or not public.homesrolo_valid_project_quote_scope(p_scope)
  then raise exception 'invalid_professional_proposal'; end if;

  v_content := jsonb_build_object(
    'proposalDate', p_proposal_date::text,
    'totalAmountCents', p_total_amount_cents,
    'currencyCode', 'USD',
    'summary', nullif(btrim(p_summary), ''),
    'scope', p_scope
  );

  insert into public.homesrolo_homeowner_project_quotes (
    quote_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, contractor_label, proposal_date,
    artifact_ref, scope, notes, source, professional_organization_ref,
    invitation_ref, submitted_by_principal_ref, total_amount_cents,
    currency_code, professional_summary, proposal_state, homeowner_decision,
    decision_revision, latest_version_ref, content_digest, revision,
    created_at, updated_at
  ) values (
    p_quote_ref, v_invitation.home_ref, v_invitation.project_ref,
    v_invitation.project_controller_principal_ref, p_command_ref,
    p_command_digest, v_organization.display_name, p_proposal_date, null,
    p_scope, null, 'professional_submission', v_organization.organization_ref,
    p_invitation_ref, p_principal_ref, p_total_amount_cents, 'USD',
    nullif(btrim(p_summary), ''), 'submitted', 'undecided', 1,
    p_version_ref, p_content_digest, 1, p_requested_at, p_requested_at
  ) returning * into v_quote;

  insert into public.homesrolo_professional_proposal_versions (
    version_ref, quote_ref, invitation_ref, professional_organization_ref,
    submitted_by_principal_ref, revision, content, content_digest, created_at
  ) values (
    p_version_ref, p_quote_ref, p_invitation_ref,
    v_organization.organization_ref, p_principal_ref, 1, v_content,
    p_content_digest, p_requested_at
  );

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = v_invitation.home_ref;

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_professional_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'proposal.submit', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
exception
  when unique_violation then
    raise exception 'proposal_already_submitted';
end;
$$;

revoke all on function public.homesrolo_submit_professional_proposal(
  text, text, text, text, text, text, date, bigint, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_submit_professional_proposal(
  text, text, text, text, text, text, date, bigint, text, jsonb, text, timestamptz
) to service_role;

-- A revision locks the proposal itself and shares locks on the invitation and
-- every row establishing the caller's present professional authority.
create or replace function public.homesrolo_revise_professional_proposal(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_quote_ref text,
  p_version_ref text,
  p_expected_revision integer,
  p_proposal_date date,
  p_total_amount_cents bigint,
  p_summary text,
  p_scope jsonb,
  p_content_digest text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_professional_command_receipts%rowtype;
  v_invitation public.homesrolo_project_invitations%rowtype;
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_content jsonb;
  v_result jsonb;
begin
  perform public.homesrolo_expire_project_invitations(p_requested_at);
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':proposal.revise', 0)
  );

  select quote.* into v_quote
  from public.homesrolo_homeowner_project_quotes quote
  join public.homesrolo_project_invitations invitation
    on invitation.invitation_ref = quote.invitation_ref
  join public.homesrolo_professional_organizations organization
    on organization.organization_ref = quote.professional_organization_ref
   and organization.publication_state <> 'suspended'
  join public.homesrolo_professional_memberships membership
    on membership.organization_ref = organization.organization_ref
   and membership.principal_ref = p_principal_ref
   and membership.state = 'active'
  join public.homesrolo_homeowner_principals principal
    on principal.principal_ref = membership.principal_ref
   and principal.status = 'active'
   and principal.email_verified = true
  where quote.quote_ref = p_quote_ref
    and quote.invitation_ref = p_invitation_ref
    and quote.source = 'professional_submission'
  for update of quote
  for share of invitation, organization, membership, principal;
  if not found then raise exception 'professional_proposal_not_found'; end if;

  select * into v_invitation
  from public.homesrolo_project_invitations
  where invitation_ref = p_invitation_ref;

  select * into v_receipt
  from public.homesrolo_professional_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'proposal.revise';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if v_quote.proposal_state <> 'submitted'
    or v_quote.homeowner_decision = 'selected'
    or v_invitation.status <> 'accepted'
    or v_invitation.expires_at <= p_requested_at
  then raise exception 'professional_proposal_not_found'; end if;
  if v_quote.revision <> p_expected_revision then
    raise exception 'professional_proposal_revision_conflict';
  end if;
  if p_proposal_date is null
    or p_proposal_date > p_requested_at::date
    or p_total_amount_cents is not null
      and p_total_amount_cents not between 0 and 1000000000
    or p_scope is null
    or not public.homesrolo_valid_project_quote_scope(p_scope)
  then raise exception 'invalid_professional_proposal'; end if;

  v_content := jsonb_build_object(
    'proposalDate', p_proposal_date::text,
    'totalAmountCents', p_total_amount_cents,
    'currencyCode', 'USD',
    'summary', nullif(btrim(p_summary), ''),
    'scope', p_scope
  );

  update public.homesrolo_homeowner_project_quotes
  set proposal_date = p_proposal_date,
      total_amount_cents = p_total_amount_cents,
      professional_summary = nullif(btrim(p_summary), ''),
      scope = p_scope,
      latest_version_ref = p_version_ref,
      content_digest = p_content_digest,
      revision = revision + 1,
      updated_at = p_requested_at
  where quote_ref = p_quote_ref
  returning * into v_quote;

  insert into public.homesrolo_professional_proposal_versions (
    version_ref, quote_ref, invitation_ref, professional_organization_ref,
    submitted_by_principal_ref, revision, content, content_digest, created_at
  ) values (
    p_version_ref, p_quote_ref, p_invitation_ref,
    v_quote.professional_organization_ref, p_principal_ref, v_quote.revision,
    v_content, p_content_digest, p_requested_at
  );

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_professional_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'proposal.revise', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_revise_professional_proposal(
  text, text, text, text, text, text, integer, date, bigint, text, jsonb,
  text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_revise_professional_proposal(
  text, text, text, text, text, text, integer, date, bigint, text, jsonb,
  text, timestamptz
) to service_role;

commit;
