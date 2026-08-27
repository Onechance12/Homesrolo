begin;

-- Homesrolo Pro is a narrow homeowner-safety boundary, not a contractor CRM.
-- It reuses the existing authenticated principal while keeping professional
-- organization membership entirely separate from Home Record membership.
create table public.homesrolo_professional_organizations (
  organization_ref text primary key check (organization_ref ~ '^horg_[A-Za-z0-9_-]{43}$'),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(slug) between 3 and 80
  ),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  legal_name text check (legal_name is null or length(btrim(legal_name)) between 1 and 160),
  description text check (description is null or length(btrim(description)) between 1 and 1200),
  public_phone text check (public_phone is null or length(btrim(public_phone)) between 7 and 32),
  public_email text check (
    public_email is null
    or (
      public_email = lower(public_email)
      and length(public_email) between 3 and 254
      and public_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  website_url text check (
    website_url is null
    or (website_url ~ '^https://' and website_url !~ '[[:space:]@#]')
  ),
  logo_url text check (
    logo_url is null
    or (logo_url ~ '^https://' and logo_url !~ '[[:space:]@#]')
  ),
  trades text[] not null default '{}'::text[],
  service_areas text[] not null default '{}'::text[],
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'published', 'suspended')),
  provenance text not null default 'company_self_reported'
    check (provenance = 'company_self_reported'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at),
  check (cardinality(trades) <= 12 and array_position(trades, null) is null),
  check (cardinality(service_areas) <= 40 and array_position(service_areas, null) is null),
  check (
    publication_state <> 'published'
    or (cardinality(trades) >= 1 and cardinality(service_areas) >= 1)
  ),
  check (
    trades <@ array[
      'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
      'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other'
    ]::text[]
  )
);

create index homesrolo_professional_organizations_published_idx
  on public.homesrolo_professional_organizations(display_name, organization_ref)
  where publication_state = 'published';

create table public.homesrolo_professional_memberships (
  membership_ref text primary key check (membership_ref ~ '^hpmr_[A-Za-z0-9_-]{43}$'),
  organization_ref text not null
    references public.homesrolo_professional_organizations(organization_ref),
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  role text not null check (role in ('owner', 'admin', 'member')),
  state text not null default 'active' check (state in ('active', 'revoked')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  revoked_at timestamptz,
  unique (organization_ref, principal_ref),
  check ((state = 'revoked') = (revoked_at is not null))
);

create unique index homesrolo_professional_one_active_owner_idx
  on public.homesrolo_professional_memberships(organization_ref)
  where role = 'owner' and state = 'active';
create index homesrolo_professional_memberships_principal_idx
  on public.homesrolo_professional_memberships(principal_ref, state, created_at);

create table public.homesrolo_professional_command_receipts (
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  action text not null check (action in (
    'organization.create', 'profile.save', 'invitation.respond',
    'proposal.submit', 'proposal.revise'
  )),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null,
  primary key (principal_ref, command_ref, action)
);

create table public.homesrolo_project_invitations (
  invitation_ref text primary key check (invitation_ref ~ '^hinv_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text not null,
  project_controller_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  invited_by_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  professional_organization_ref text not null
    references public.homesrolo_professional_organizations(organization_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  message text check (message is null or length(btrim(message)) between 1 and 1000),
  disclosure jsonb not null check (jsonb_typeof(disclosure) = 'object'),
  disclosure_digest text not null check (disclosure_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  responded_at timestamptz,
  revoked_at timestamptz,
  unique (invited_by_principal_ref, command_ref),
  foreign key (project_ref, home_ref, project_controller_principal_ref)
    references public.homesrolo_homeowner_projects(
      project_ref, home_ref, controller_principal_ref
    ),
  check (expires_at > created_at),
  check (
    (status in ('accepted', 'declined') and responded_at is not null)
    or (status in ('pending', 'revoked') and responded_at is null)
    or status = 'expired'
  ),
  check ((status = 'revoked') = (revoked_at is not null))
);

create unique index homesrolo_project_invitations_one_active_org_idx
  on public.homesrolo_project_invitations(
    home_ref, project_ref, professional_organization_ref
  ) where status in ('pending', 'accepted');
create index homesrolo_project_invitations_home_project_idx
  on public.homesrolo_project_invitations(home_ref, project_ref, created_at desc);
create index homesrolo_project_invitations_org_idx
  on public.homesrolo_project_invitations(
    professional_organization_ref, status, created_at desc
  );

alter table public.homesrolo_homeowner_project_quotes
  add column professional_organization_ref text
    references public.homesrolo_professional_organizations(organization_ref),
  add column invitation_ref text references public.homesrolo_project_invitations(invitation_ref),
  add column submitted_by_principal_ref text
    references public.homesrolo_homeowner_principals(principal_ref),
  add column total_amount_cents bigint check (
    total_amount_cents is null or total_amount_cents between 0 and 1000000000
  ),
  add column currency_code text check (currency_code is null or currency_code = 'USD'),
  add column professional_summary text check (
    professional_summary is null or length(btrim(professional_summary)) between 1 and 2000
  ),
  add column proposal_state text check (
    proposal_state is null or proposal_state in ('submitted', 'withdrawn')
  ),
  add column homeowner_decision text not null default 'undecided'
    check (homeowner_decision in ('undecided', 'shortlisted', 'selected', 'declined')),
  add column decision_revision integer not null default 1 check (decision_revision >= 1),
  add column latest_version_ref text check (
    latest_version_ref is null or latest_version_ref ~ '^hpvr_[A-Za-z0-9_-]{43}$'
  ),
  add column content_digest text check (
    content_digest is null or content_digest ~ '^[a-f0-9]{64}$'
  );

alter table public.homesrolo_homeowner_project_quotes
  drop constraint if exists homesrolo_homeowner_project_quotes_source_check;
alter table public.homesrolo_homeowner_project_quotes
  add constraint homesrolo_homeowner_project_quotes_source_check
  check (source in ('homeowner_entry', 'professional_submission'));
alter table public.homesrolo_homeowner_project_quotes
  add constraint homesrolo_homeowner_project_quotes_professional_source_check
  check (
    (
      source = 'homeowner_entry'
      and professional_organization_ref is null
      and invitation_ref is null
      and submitted_by_principal_ref is null
      and total_amount_cents is null
      and currency_code is null
      and professional_summary is null
      and proposal_state is null
      and homeowner_decision = 'undecided'
      and decision_revision = 1
      and latest_version_ref is null
      and content_digest is null
    )
    or
    (
      source = 'professional_submission'
      and professional_organization_ref is not null
      and invitation_ref is not null
      and submitted_by_principal_ref is not null
      and proposal_state is not null
      and currency_code = 'USD'
      and latest_version_ref is not null
      and content_digest is not null
      and artifact_ref is null
      and notes is null
    )
  );

create unique index homesrolo_project_quotes_one_selected_idx
  on public.homesrolo_homeowner_project_quotes(home_ref, project_ref)
  where source = 'professional_submission'
    and proposal_state = 'submitted'
    and homeowner_decision = 'selected';
create index homesrolo_project_quotes_professional_org_idx
  on public.homesrolo_homeowner_project_quotes(
    professional_organization_ref, invitation_ref, created_at desc
  ) where source = 'professional_submission';
create unique index homesrolo_project_quotes_one_per_invitation_idx
  on public.homesrolo_homeowner_project_quotes(invitation_ref)
  where source = 'professional_submission';

create or replace function public.homesrolo_guard_professional_quote_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_content_changed boolean;
  v_decision_changed boolean;
begin
  if new.source <> old.source then raise exception 'proposal_source_is_immutable'; end if;
  if old.source <> 'professional_submission' then return new; end if;

  if new.home_ref <> old.home_ref
    or new.project_ref <> old.project_ref
    or new.controller_principal_ref <> old.controller_principal_ref
    or new.contractor_label <> old.contractor_label
    or new.professional_organization_ref <> old.professional_organization_ref
    or new.invitation_ref <> old.invitation_ref
    or new.submitted_by_principal_ref <> old.submitted_by_principal_ref
    or new.command_ref <> old.command_ref
    or new.command_digest <> old.command_digest
    or new.created_at <> old.created_at
    or new.artifact_ref is not null
  then raise exception 'professional_proposal_identity_is_immutable'; end if;

  v_content_changed := new.proposal_date is distinct from old.proposal_date
    or new.total_amount_cents is distinct from old.total_amount_cents
    or new.currency_code is distinct from old.currency_code
    or new.professional_summary is distinct from old.professional_summary
    or new.scope is distinct from old.scope
    or new.proposal_state is distinct from old.proposal_state;
  v_decision_changed := new.homeowner_decision is distinct from old.homeowner_decision;

  if v_content_changed and v_decision_changed then
    raise exception 'proposal_content_and_decision_are_separate_writes';
  end if;
  if v_content_changed and (
    new.revision <> old.revision + 1
    or new.decision_revision <> old.decision_revision
    or new.content_digest is not distinct from old.content_digest
    or new.latest_version_ref is not distinct from old.latest_version_ref
  ) then raise exception 'invalid_professional_proposal_revision'; end if;
  if v_decision_changed and (
    new.revision <> old.revision
    or new.decision_revision <> old.decision_revision + 1
    or new.content_digest is distinct from old.content_digest
    or new.latest_version_ref is distinct from old.latest_version_ref
  ) then raise exception 'invalid_professional_proposal_decision_revision'; end if;
  if not v_content_changed and not v_decision_changed and new is distinct from old then
    raise exception 'unsupported_professional_proposal_update';
  end if;
  return new;
end;
$$;

create trigger homesrolo_professional_quote_update_guard
before update on public.homesrolo_homeowner_project_quotes
for each row execute function public.homesrolo_guard_professional_quote_update();

create table public.homesrolo_professional_proposal_versions (
  version_ref text primary key check (version_ref ~ '^hpvr_[A-Za-z0-9_-]{43}$'),
  quote_ref text not null references public.homesrolo_homeowner_project_quotes(quote_ref),
  invitation_ref text not null references public.homesrolo_project_invitations(invitation_ref),
  professional_organization_ref text not null
    references public.homesrolo_professional_organizations(organization_ref),
  submitted_by_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  revision integer not null check (revision >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  unique (quote_ref, revision),
  unique (quote_ref, content_digest)
);

create or replace function public.homesrolo_reject_professional_proposal_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'professional_proposal_versions_are_immutable';
end;
$$;

create trigger homesrolo_professional_proposal_versions_immutable
before update or delete on public.homesrolo_professional_proposal_versions
for each row execute function public.homesrolo_reject_professional_proposal_version_mutation();

alter table public.homesrolo_professional_organizations enable row level security;
alter table public.homesrolo_professional_memberships enable row level security;
alter table public.homesrolo_professional_command_receipts enable row level security;
alter table public.homesrolo_project_invitations enable row level security;
alter table public.homesrolo_professional_proposal_versions enable row level security;

revoke all on table public.homesrolo_professional_organizations from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_professional_memberships from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_professional_command_receipts from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_project_invitations from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_professional_proposal_versions from public, anon, authenticated, service_role;

-- Application code may project these rows, but every mutation stays behind a
-- revision-checked, receipt-backed security-definer function below.
grant select on table public.homesrolo_professional_organizations to service_role;
grant select on table public.homesrolo_professional_memberships to service_role;
grant select on table public.homesrolo_professional_command_receipts to service_role;
grant select on table public.homesrolo_project_invitations to service_role;
grant select on table public.homesrolo_professional_proposal_versions to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'home_record.update', 'intake.record', 'project.create',
    'project.update', 'project.activity.append', 'project.item.save',
    'artifact.upload', 'project.submit_for_review', 'quote.create',
    'quote.save', 'photo_checkup.upload', 'professional.invite',
    'professional.invitation.revoke', 'proposal.decide'
  ));

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_professional_scope_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_professional_scope_check
  check (
    action not in (
      'professional.invite', 'professional.invitation.revoke', 'proposal.decide'
    ) or home_ref is not null
  );

create or replace function public.homesrolo_expire_project_invitations(
  p_now timestamptz
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.homesrolo_project_invitations
  set status = 'expired', revision = revision + 1
  where status in ('pending', 'accepted') and expires_at <= p_now;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.homesrolo_expire_project_invitations(timestamptz)
  from public, anon, authenticated;
grant execute on function public.homesrolo_expire_project_invitations(timestamptz)
  to service_role;

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

  if not exists (
    select 1 from public.homesrolo_homeowner_principals
    where principal_ref = p_principal_ref
      and status = 'active'
      and email_verified = true
  ) then raise exception 'principal_not_authorized'; end if;

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

  if not exists (
    select 1
    from public.homesrolo_professional_memberships m
    join public.homesrolo_homeowner_principals p
      on p.principal_ref = m.principal_ref
    where m.organization_ref = p_organization_ref
      and m.principal_ref = p_principal_ref
      and m.state = 'active'
      and m.role in ('owner', 'admin')
      and p.status = 'active'
      and p.email_verified = true
  ) then raise exception 'professional_membership_not_authorized'; end if;

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

  select * into v_organization
  from public.homesrolo_professional_organizations
  where organization_ref = p_organization_ref
  for update;
  if not found or v_organization.publication_state = 'suspended' then
    raise exception 'professional_profile_not_authorized';
  end if;
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
  perform public.homesrolo_expire_project_invitations(p_requested_at);
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':professional.invite', 0)
  );
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

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

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
    and controller_principal_ref = p_principal_ref
    and archived_at is null;
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

  if not exists (
    select 1 from public.homesrolo_professional_organizations
    where organization_ref = p_professional_organization_ref
      and publication_state = 'published'
      and v_project.category = any(trades)
  ) then raise exception 'professional_profile_not_found'; end if;

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
          and artifact.controller_principal_ref = v_project.controller_principal_ref
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

  select invitation.* into v_invitation
  from public.homesrolo_project_invitations invitation
  where invitation.invitation_ref = p_invitation_ref
    and exists (
      select 1
      from public.homesrolo_professional_memberships membership
      join public.homesrolo_homeowner_principals principal
        on principal.principal_ref = membership.principal_ref
      where membership.organization_ref = invitation.professional_organization_ref
        and membership.principal_ref = p_principal_ref
        and membership.state = 'active'
        and principal.status = 'active'
        and principal.email_verified = true
    )
  for update;
  if not found then raise exception 'invitation_not_found'; end if;
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

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

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

  select invitation.* into v_invitation
  from public.homesrolo_project_invitations invitation
  where invitation.invitation_ref = p_invitation_ref
    and invitation.status = 'accepted'
    and invitation.expires_at > p_requested_at
    and exists (
      select 1
      from public.homesrolo_professional_memberships membership
      join public.homesrolo_homeowner_principals principal
        on principal.principal_ref = membership.principal_ref
      where membership.organization_ref = invitation.professional_organization_ref
        and membership.principal_ref = p_principal_ref
        and membership.state = 'active'
        and principal.status = 'active'
        and principal.email_verified = true
    )
  for update;
  if not found then raise exception 'accepted_invitation_not_found'; end if;

  select * into v_organization
  from public.homesrolo_professional_organizations
  where organization_ref = v_invitation.professional_organization_ref
    and publication_state <> 'suspended';
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
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_content jsonb;
  v_result jsonb;
begin
  perform public.homesrolo_expire_project_invitations(p_requested_at);
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':proposal.revise', 0)
  );
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

  select quote.* into v_quote
  from public.homesrolo_homeowner_project_quotes quote
  join public.homesrolo_project_invitations invitation
    on invitation.invitation_ref = quote.invitation_ref
  where quote.quote_ref = p_quote_ref
    and quote.invitation_ref = p_invitation_ref
    and quote.source = 'professional_submission'
    and quote.proposal_state = 'submitted'
    and quote.homeowner_decision <> 'selected'
    and invitation.status = 'accepted'
    and invitation.expires_at > p_requested_at
    and exists (
      select 1
      from public.homesrolo_professional_memberships membership
      join public.homesrolo_homeowner_principals principal
        on principal.principal_ref = membership.principal_ref
      where membership.organization_ref = quote.professional_organization_ref
        and membership.principal_ref = p_principal_ref
        and membership.state = 'active'
        and principal.status = 'active'
        and principal.email_verified = true
    )
  for update of quote;
  if not found then raise exception 'professional_proposal_not_found'; end if;
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
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

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

commit;
