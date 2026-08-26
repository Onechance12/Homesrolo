begin;

-- A homeowner approves one logical save, so its initial professional and first
-- activity belong to the same receipt-backed transaction as the project. This
-- overload leaves the prior create signatures callable during a rolling deploy.
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
    or p_work_kind not in ('project', 'issue', 'repair', 'service', 'incident') then
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

  -- Authority is fresh-checked before even an exact receipt replay. Revoking a
  -- membership therefore also revokes access to earlier command results.
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

  insert into public.homesrolo_homeowner_projects (
    project_ref, home_ref, controller_principal_ref, title, work_kind, category, status,
    occurred_on, summary, professional_label, created_at, updated_at
  ) values (
    p_project_ref, p_home_ref, p_principal_ref, btrim(p_title), p_work_kind,
    p_category, p_status, p_occurred_on, nullif(btrim(p_summary), ''),
    nullif(btrim(p_professional_label), ''), p_requested_at, p_requested_at
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
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.create', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, text, date,
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, text, date,
  text, text, text, text, text, timestamptz
) to service_role;

commit;
