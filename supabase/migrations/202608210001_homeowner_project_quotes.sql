begin;

create or replace function public.homesrolo_valid_project_quote_scope(p_scope jsonb)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_scope) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_scope) as item(key, value)
      where item.key <> all (array[
        'measurement', 'roof_configuration', 'tear_off', 'decking',
        'underlayment', 'leak_barrier', 'primary_materials', 'starter_and_ridge',
        'valleys', 'flashing_transitions', 'penetrations', 'ventilation',
        'permits', 'cleanup', 'workmanship_warranty', 'manufacturer_warranty',
        'payment_terms', 'exclusions'
      ])
      or jsonb_typeof(item.value) <> 'object'
      or not item.value ? 'status'
      or jsonb_typeof(item.value -> 'status') <> 'string'
      or item.value ->> 'status' not in ('included', 'excluded', 'allowance', 'not_stated')
      or item.value - 'status' - 'detail' <> '{}'::jsonb
      or (
        item.value ? 'detail'
        and (
          jsonb_typeof(item.value -> 'detail') <> 'string'
          or length(item.value ->> 'detail') not between 1 and 160
          or item.value ->> 'detail' <> btrim(item.value ->> 'detail')
        )
      )
    );
$$;

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_artifacts_ref_home_project_unique;
alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_artifacts_ref_home_project_controller_unique;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_artifacts_ref_home_project_controller_unique
  unique (artifact_ref, home_ref, project_ref, controller_principal_ref);

alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_projects_ref_home_controller_unique;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_projects_ref_home_controller_unique
  unique (project_ref, home_ref, controller_principal_ref);

create table if not exists public.homesrolo_homeowner_project_quotes (
  quote_ref text primary key check (quote_ref ~ '^hquo_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text not null,
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  contractor_label text not null check (length(btrim(contractor_label)) between 1 and 120),
  proposal_date date,
  artifact_ref text,
  scope jsonb not null default '{}'::jsonb
    check (public.homesrolo_valid_project_quote_scope(scope)),
  notes text check (notes is null or length(btrim(notes)) between 1 and 500),
  source text not null default 'homeowner_entry' check (source = 'homeowner_entry'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (controller_principal_ref, command_ref),
  foreign key (project_ref, home_ref, controller_principal_ref)
    references public.homesrolo_homeowner_projects(
      project_ref, home_ref, controller_principal_ref
    ),
  foreign key (artifact_ref, home_ref, project_ref, controller_principal_ref)
    references public.homesrolo_homeowner_artifacts(
      artifact_ref, home_ref, project_ref, controller_principal_ref
    ),
  check (updated_at >= created_at)
);

create index if not exists homesrolo_homeowner_project_quotes_project_idx
  on public.homesrolo_homeowner_project_quotes(home_ref, project_ref, created_at asc);

alter table public.homesrolo_homeowner_project_quotes enable row level security;
revoke all on table public.homesrolo_homeowner_project_quotes from public, anon, authenticated;
grant select, insert, update on table public.homesrolo_homeowner_project_quotes to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'intake.record', 'project.create', 'artifact.upload',
    'project.submit_for_review', 'quote.create', 'quote.save'
  ));

create or replace function public.homesrolo_create_homeowner_project_quote(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_quote_ref text,
  p_contractor_label text,
  p_proposal_date date,
  p_artifact_ref text,
  p_scope jsonb,
  p_notes text,
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
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':quote.create', 0)
  );
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'quote.create';
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
  if not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and category = 'roofing'
  ) then raise exception 'project_not_authorized'; end if;
  if p_artifact_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_artifacts
    where artifact_ref = p_artifact_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
      and controller_principal_ref = p_principal_ref
      and kind = 'document'
      and media_type = 'application/pdf'
      and state = 'available'
  ) then raise exception 'artifact_not_authorized'; end if;

  insert into public.homesrolo_homeowner_project_quotes (
    quote_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, contractor_label, proposal_date,
    artifact_ref, scope, notes, source, revision, created_at, updated_at
  ) values (
    p_quote_ref, p_home_ref, p_project_ref, p_principal_ref,
    p_command_ref, p_command_digest, btrim(p_contractor_label), p_proposal_date,
    p_artifact_ref, p_scope, nullif(btrim(p_notes), ''), 'homeowner_entry',
    1, p_requested_at, p_requested_at
  ) returning * into v_quote;

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'quote.create', p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_save_homeowner_project_quote(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_quote_ref text,
  p_expected_revision integer,
  p_contractor_label text,
  p_proposal_date date,
  p_artifact_ref text,
  p_scope jsonb,
  p_notes text,
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
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':quote.save', 0)
  );
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'quote.save';
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
  if not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and category = 'roofing'
  ) then raise exception 'project_not_authorized'; end if;
  if p_artifact_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_artifacts
    where artifact_ref = p_artifact_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
      and controller_principal_ref = p_principal_ref
      and kind = 'document'
      and media_type = 'application/pdf'
      and state = 'available'
  ) then raise exception 'artifact_not_authorized'; end if;

  select * into v_quote from public.homesrolo_homeowner_project_quotes
  where quote_ref = p_quote_ref
    and home_ref = p_home_ref
    and project_ref = p_project_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'quote_not_authorized'; end if;
  if v_quote.revision <> p_expected_revision then
    raise exception 'quote_revision_conflict';
  end if;

  update public.homesrolo_homeowner_project_quotes
  set contractor_label = btrim(p_contractor_label),
      proposal_date = p_proposal_date,
      artifact_ref = p_artifact_ref,
      scope = p_scope,
      notes = nullif(btrim(p_notes), ''),
      revision = revision + 1,
      updated_at = p_requested_at
  where quote_ref = p_quote_ref
  returning * into v_quote;

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'quote.save', p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_valid_project_quote_scope(jsonb)
  from public, anon, authenticated;
grant execute on function public.homesrolo_valid_project_quote_scope(jsonb)
  to service_role;
revoke all on function public.homesrolo_create_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, text, date, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, text, date, text, jsonb, text, timestamptz
) to service_role;
revoke all on function public.homesrolo_save_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, integer, text, date, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_save_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, integer, text, date, text, jsonb, text, timestamptz
) to service_role;

commit;
