begin;

alter table public.homesrolo_homeowner_projects
  add column if not exists professional_label text,
  add column if not exists revision integer not null default 1,
  add column if not exists archived_at timestamptz;

alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_professional_label_check;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_professional_label_check
  check (
    professional_label is null
    or length(btrim(professional_label)) between 1 and 160
  );
alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_revision_check;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_revision_check check (revision >= 1);
alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_archived_at_check;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_archived_at_check
  check (archived_at is null or archived_at >= created_at);
alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_projects_ref_home_unique;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_projects_ref_home_unique unique (project_ref, home_ref);

create table if not exists public.homesrolo_homeowner_project_activity (
  activity_ref text primary key check (activity_ref ~ '^hact_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text not null,
  actor_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  kind text not null check (kind in ('note', 'milestone')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  source text not null default 'homeowner_entry' check (source = 'homeowner_entry'),
  created_at timestamptz not null,
  foreign key (project_ref, home_ref)
    references public.homesrolo_homeowner_projects(project_ref, home_ref)
);

create index if not exists homesrolo_homeowner_project_activity_project_idx
  on public.homesrolo_homeowner_project_activity(home_ref, project_ref, created_at asc);

create or replace function public.homesrolo_reject_project_activity_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'project_activity_is_append_only';
end;
$$;

drop trigger if exists homesrolo_project_activity_append_only
  on public.homesrolo_homeowner_project_activity;
create trigger homesrolo_project_activity_append_only
before update or delete on public.homesrolo_homeowner_project_activity
for each row execute function public.homesrolo_reject_project_activity_mutation();

create table if not exists public.homesrolo_homeowner_project_items (
  item_ref text primary key check (item_ref ~ '^hpit_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text not null,
  created_by_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  kind text not null check (kind in ('material', 'decision', 'wishlist')),
  label text not null check (length(btrim(label)) between 1 and 160),
  detail text check (detail is null or length(btrim(detail)) between 1 and 2000),
  state text not null check (state in ('considering', 'chosen', 'purchased', 'declined')),
  source text not null default 'homeowner_entry' check (source = 'homeowner_entry'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (project_ref, home_ref)
    references public.homesrolo_homeowner_projects(project_ref, home_ref),
  check (updated_at >= created_at)
);

create index if not exists homesrolo_homeowner_project_items_project_idx
  on public.homesrolo_homeowner_project_items(home_ref, project_ref, created_at asc);

alter table public.homesrolo_homeowner_project_activity enable row level security;
alter table public.homesrolo_homeowner_project_items enable row level security;
revoke all on table public.homesrolo_homeowner_project_activity from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_project_items from public, anon, authenticated;
grant select, insert on table public.homesrolo_homeowner_project_activity to service_role;
grant select, insert, update on table public.homesrolo_homeowner_project_items to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'intake.record', 'project.create', 'project.update',
    'project.activity.append', 'project.item.save', 'artifact.upload',
    'project.submit_for_review', 'quote.create', 'quote.save', 'photo_checkup.upload'
  ));

create or replace function public.homesrolo_update_homeowner_project(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_expected_revision integer,
  p_set_title boolean,
  p_title text,
  p_set_category boolean,
  p_category text,
  p_set_status boolean,
  p_status text,
  p_set_occurred_on boolean,
  p_occurred_on date,
  p_set_summary boolean,
  p_summary text,
  p_set_professional_label boolean,
  p_professional_label text,
  p_set_archived boolean,
  p_archived boolean,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_project public.homesrolo_homeowner_projects%rowtype;
  v_result jsonb;
begin
  if not (
    p_set_title or p_set_category or p_set_status or p_set_occurred_on
    or p_set_summary or p_set_professional_label or p_set_archived
  ) then
    raise exception 'empty_project_update';
  end if;
  if p_set_title and (p_title is null or length(btrim(p_title)) not between 1 and 120) then
    raise exception 'invalid_project_title';
  end if;
  if p_set_category and p_category not in (
    'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
    'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other'
  ) then
    raise exception 'invalid_project_category';
  end if;
  if p_set_status and p_status not in ('planned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid_project_status';
  end if;
  if p_set_occurred_on and p_occurred_on is not null
    and p_occurred_on > p_requested_at::date then
    raise exception 'project_date_in_future';
  end if;
  if p_set_summary and p_summary is not null and length(btrim(p_summary)) > 2000 then
    raise exception 'invalid_project_summary';
  end if;
  if p_set_professional_label and p_professional_label is not null
    and length(btrim(p_professional_label)) not between 1 and 160 then
    raise exception 'invalid_professional_label';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.update', 0)
  );
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'project.update';
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
      and role in ('workspace_controller', 'member')
  ) then
    raise exception 'membership_not_authorized';
  end if;

  select * into v_project from public.homesrolo_homeowner_projects
  where project_ref = p_project_ref and home_ref = p_home_ref
  for update;
  if not found then raise exception 'project_not_found'; end if;
  if v_project.revision <> p_expected_revision then
    raise exception 'project_revision_conflict';
  end if;
  if p_requested_at < v_project.updated_at then
    raise exception 'project_revision_conflict';
  end if;

  update public.homesrolo_homeowner_projects
  set title = case when p_set_title then btrim(p_title) else title end,
      category = case when p_set_category then p_category else category end,
      status = case when p_set_status then p_status else status end,
      occurred_on = case when p_set_occurred_on then p_occurred_on else occurred_on end,
      summary = case
        when p_set_summary then nullif(btrim(coalesce(p_summary, '')), '')
        else summary
      end,
      professional_label = case
        when p_set_professional_label
          then nullif(btrim(coalesce(p_professional_label, '')), '')
        else professional_label
      end,
      archived_at = case
        when not p_set_archived then archived_at
        when p_archived then coalesce(archived_at, p_requested_at)
        else null
      end,
      revision = revision + 1,
      updated_at = p_requested_at
  where project_ref = p_project_ref and home_ref = p_home_ref
  returning * into v_project;

  update public.homesrolo_private_homes
  set updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_project);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.update', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_append_homeowner_project_activity(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_activity_ref text,
  p_kind text,
  p_body text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_activity public.homesrolo_homeowner_project_activity%rowtype;
  v_result jsonb;
begin
  if p_kind not in ('note', 'milestone')
    or p_body is null
    or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'invalid_project_activity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.activity.append', 0)
  );
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'project.activity.append';
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
      and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
  ) then raise exception 'project_not_found'; end if;

  insert into public.homesrolo_homeowner_project_activity (
    activity_ref, home_ref, project_ref, actor_principal_ref,
    kind, body, source, created_at
  ) values (
    p_activity_ref, p_home_ref, p_project_ref, p_principal_ref,
    p_kind, btrim(p_body), 'homeowner_entry', p_requested_at
  ) returning * into v_activity;

  update public.homesrolo_private_homes
  set updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_activity);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.activity.append', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_save_homeowner_project_item(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_item_ref text,
  p_expected_revision integer,
  p_kind text,
  p_label text,
  p_detail text,
  p_state text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_item public.homesrolo_homeowner_project_items%rowtype;
  v_result jsonb;
begin
  if p_kind not in ('material', 'decision', 'wishlist')
    or p_state not in ('considering', 'chosen', 'purchased', 'declined')
    or p_label is null
    or length(btrim(p_label)) not between 1 and 160
    or (p_detail is not null and length(btrim(p_detail)) not between 1 and 2000) then
    raise exception 'invalid_project_item';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.item.save', 0)
  );
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'project.item.save';
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
      and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
  ) then raise exception 'project_not_found'; end if;

  if p_expected_revision is null then
    insert into public.homesrolo_homeowner_project_items (
      item_ref, home_ref, project_ref, created_by_principal_ref,
      kind, label, detail, state, source, revision, created_at, updated_at
    ) values (
      p_item_ref, p_home_ref, p_project_ref, p_principal_ref,
      p_kind, btrim(p_label), nullif(btrim(coalesce(p_detail, '')), ''),
      p_state, 'homeowner_entry', 1, p_requested_at, p_requested_at
    ) returning * into v_item;
  else
    select * into v_item from public.homesrolo_homeowner_project_items
    where item_ref = p_item_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
    for update;
    if not found then raise exception 'project_item_not_found'; end if;
    if v_item.revision <> p_expected_revision then
      raise exception 'project_item_revision_conflict';
    end if;
    if p_requested_at < v_item.updated_at then
      raise exception 'project_item_revision_conflict';
    end if;

    update public.homesrolo_homeowner_project_items
    set kind = p_kind,
        label = btrim(p_label),
        detail = nullif(btrim(coalesce(p_detail, '')), ''),
        state = p_state,
        revision = revision + 1,
        updated_at = p_requested_at
    where item_ref = p_item_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
    returning * into v_item;
  end if;

  update public.homesrolo_private_homes
  set updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_item);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.item.save', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_reject_project_activity_mutation()
  from public, anon, authenticated;
revoke all on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, date,
  boolean, text, boolean, text, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, date,
  boolean, text, boolean, text, boolean, boolean, timestamptz
) to service_role;
revoke all on function public.homesrolo_append_homeowner_project_activity(
  text, text, text, text, integer, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_append_homeowner_project_activity(
  text, text, text, text, integer, text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.homesrolo_save_homeowner_project_item(
  text, text, text, text, integer, text, text, text, integer,
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_save_homeowner_project_item(
  text, text, text, text, integer, text, text, text, integer,
  text, text, text, text, timestamptz
) to service_role;

commit;
