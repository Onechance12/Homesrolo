begin;

-- Lightweight household to-dos remain ordinary Work records. The assignee is
-- an exact-home membership rather than a principal so API responses never
-- need to expose household identity or email internals.
alter table public.homesrolo_homeowner_projects
  add column if not exists assigned_membership_ref text,
  add column if not exists due_on date;

-- Keep the exact-home assignment invariant in the database as well as in the
-- mutation RPCs. A globally valid membership from a different home must never
-- be attachable to this Work row, even through a future service path.
create unique index if not exists homesrolo_homeowner_memberships_ref_home_idx
  on public.homesrolo_homeowner_memberships(membership_ref, home_ref);
alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_assigned_membership_ref_fkey;
alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_assignment_home_fkey;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_assignment_home_fkey
  foreign key (assigned_membership_ref, home_ref)
  references public.homesrolo_homeowner_memberships(membership_ref, home_ref);

alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_work_kind_check;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_work_kind_check
  check (work_kind in ('project', 'issue', 'repair', 'service', 'incident', 'task'));

create index if not exists homesrolo_homeowner_projects_assignment_idx
  on public.homesrolo_homeowner_projects(
    home_ref, assigned_membership_ref, due_on, updated_at desc
  )
  where archived_at is null and assigned_membership_ref is not null;

-- Preserve atomic Work + initial activity creation while adding assignment and
-- a due date. The previous overload remains callable during a rolling deploy.
create or replace function public.homesrolo_create_homeowner_project(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_project_ref text,
  p_title text,
  p_work_kind text,
  p_category text,
  p_status text,
  p_occurred_on date,
  p_summary text,
  p_professional_label text,
  p_assigned_membership_ref text,
  p_due_on date,
  p_initial_activity_ref text,
  p_initial_activity_kind text,
  p_initial_activity_body text,
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
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then
    raise exception 'invalid_project_title';
  end if;
  if p_work_kind is null
    or p_work_kind not in ('project', 'issue', 'repair', 'service', 'incident', 'task') then
    raise exception 'invalid_project_work_kind';
  end if;
  if p_category not in (
    'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
    'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other'
  ) then
    raise exception 'invalid_project_category';
  end if;
  if p_status not in ('planned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid_project_status';
  end if;
  if p_occurred_on is not null and p_occurred_on > p_requested_at::date then
    raise exception 'project_date_in_future';
  end if;
  if p_summary is not null and length(btrim(p_summary)) > 2000 then
    raise exception 'invalid_project_summary';
  end if;
  if p_professional_label is not null
    and length(btrim(p_professional_label)) not between 1 and 160 then
    raise exception 'invalid_professional_label';
  end if;
  if num_nonnulls(
    p_initial_activity_ref,
    p_initial_activity_kind,
    p_initial_activity_body
  ) not in (0, 3) then
    raise exception 'invalid_initial_project_activity';
  end if;
  if p_initial_activity_ref is not null and (
    p_initial_activity_ref !~ '^hact_[A-Za-z0-9_-]{43}$'
    or p_initial_activity_kind not in ('note', 'milestone')
    or length(btrim(p_initial_activity_body)) not between 1 and 2000
  ) then
    raise exception 'invalid_initial_project_activity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.create', 0)
  );

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

  -- A completed command is terminal. Check its exact digest before consulting
  -- the assignee's current access so a network retry remains the same command
  -- even if that household membership was revoked after the first commit.
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'project.create';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  -- This is intentionally repeated inside the receipt-backed transaction.
  -- Browser-supplied home/principal claims are never used to infer authority.
  if p_assigned_membership_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_assigned_membership_ref
      and home_ref = p_home_ref
      and state = 'active'
      and role in ('workspace_controller', 'member')
  ) then
    raise exception 'assigned_membership_not_authorized';
  end if;

  insert into public.homesrolo_homeowner_projects (
    project_ref, home_ref, controller_principal_ref, title, work_kind, category, status,
    occurred_on, summary, professional_label, assigned_membership_ref, due_on,
    created_at, updated_at
  ) values (
    p_project_ref, p_home_ref, p_principal_ref, btrim(p_title), p_work_kind,
    p_category, p_status, p_occurred_on, nullif(btrim(p_summary), ''),
    nullif(btrim(p_professional_label), ''), p_assigned_membership_ref, p_due_on,
    p_requested_at, p_requested_at
  ) returning * into v_project;

  if p_initial_activity_ref is not null then
    insert into public.homesrolo_homeowner_project_activity (
      activity_ref, home_ref, project_ref, actor_principal_ref,
      kind, body, source, created_at
    ) values (
      p_initial_activity_ref, p_home_ref, p_project_ref, p_principal_ref,
      p_initial_activity_kind, btrim(p_initial_activity_body),
      'homeowner_entry', p_requested_at
    );
  end if;

  update public.homesrolo_private_homes
  set updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_project);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'project.create', p_command_digest,
    v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text, timestamptz
) to service_role;

-- Bounded updates preserve optimistic revision and receipt semantics. Null
-- clears an assignee or due date; omission leaves the stored value unchanged.
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
  p_set_work_kind boolean,
  p_work_kind text,
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
  p_set_assigned_membership_ref boolean,
  p_assigned_membership_ref text,
  p_set_due_on boolean,
  p_due_on date,
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
  if p_set_title is null
    or p_set_work_kind is null
    or p_set_category is null
    or p_set_status is null
    or p_set_occurred_on is null
    or p_set_summary is null
    or p_set_professional_label is null
    or p_set_assigned_membership_ref is null
    or p_set_due_on is null
    or p_set_archived is null then
    raise exception 'invalid_project_update_flags';
  end if;
  if not (
    p_set_title or p_set_work_kind or p_set_category or p_set_status
    or p_set_occurred_on or p_set_summary or p_set_professional_label
    or p_set_assigned_membership_ref or p_set_due_on or p_set_archived
  ) then
    raise exception 'empty_project_update';
  end if;
  if p_set_title and (p_title is null or length(btrim(p_title)) not between 1 and 120) then
    raise exception 'invalid_project_title';
  end if;
  if p_set_work_kind and (
    p_work_kind is null
    or p_work_kind not in ('project', 'issue', 'repair', 'service', 'incident', 'task')
  ) then
    raise exception 'invalid_project_work_kind';
  end if;
  if p_set_category and (
    p_category is null or p_category not in (
      'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
      'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other'
    )
  ) then
    raise exception 'invalid_project_category';
  end if;
  if p_set_status and (
    p_status is null or p_status not in ('planned', 'in_progress', 'completed', 'cancelled')
  ) then
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
  if p_set_archived and p_archived is null then
    raise exception 'invalid_archived_state';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.update', 0)
  );
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

  -- Replays are terminal before mutable assignee validation. The original
  -- optimistic update remains stable if access changed after it committed.
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

  if p_set_assigned_membership_ref
    and p_assigned_membership_ref is not null
    and not exists (
      select 1 from public.homesrolo_homeowner_memberships
      where membership_ref = p_assigned_membership_ref
        and home_ref = p_home_ref
        and state = 'active'
        and role in ('workspace_controller', 'member')
    ) then
    raise exception 'assigned_membership_not_authorized';
  end if;

  select * into v_project from public.homesrolo_homeowner_projects
  where project_ref = p_project_ref and home_ref = p_home_ref
  for update;
  if not found then raise exception 'project_not_found'; end if;
  if p_set_category
    and v_project.category = 'roofing'
    and p_category <> 'roofing'
    and exists (
      select 1 from public.homesrolo_homeowner_project_submissions
      where project_ref = p_project_ref and home_ref = p_home_ref
    ) then
    raise exception 'project_category_has_roof_records';
  end if;
  if v_project.revision <> p_expected_revision then
    raise exception 'project_revision_conflict';
  end if;
  if p_requested_at < v_project.updated_at then
    raise exception 'project_revision_conflict';
  end if;

  update public.homesrolo_homeowner_projects
  set title = case when p_set_title then btrim(p_title) else title end,
      work_kind = case when p_set_work_kind then p_work_kind else work_kind end,
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
      assigned_membership_ref = case
        when p_set_assigned_membership_ref then p_assigned_membership_ref
        else assigned_membership_ref
      end,
      due_on = case when p_set_due_on then p_due_on else due_on end,
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
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'project.update', p_command_digest,
    v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, boolean, timestamptz
) to service_role;

commit;
