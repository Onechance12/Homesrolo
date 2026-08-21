begin;

alter table public.homesrolo_homeowner_projects
  drop constraint if exists homesrolo_homeowner_projects_category_check;
alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_category_check check (category in (
    'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
    'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other'
  ));

-- The project table has always allowed the major home trades. This receipt-
-- backed command makes that existing model usable for planned, active, and
-- historical work without weakening the exact-home authorization boundary.
create or replace function public.homesrolo_create_homeowner_project(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_project_ref text,
  p_title text,
  p_category text,
  p_status text,
  p_occurred_on date,
  p_summary text,
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.create', 0)
  );
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

  insert into public.homesrolo_homeowner_projects (
    project_ref, home_ref, controller_principal_ref, title, category, status,
    occurred_on, summary, created_at, updated_at
  ) values (
    p_project_ref, p_home_ref, p_principal_ref, btrim(p_title), p_category, p_status,
    p_occurred_on, nullif(btrim(p_summary), ''), p_requested_at, p_requested_at
  ) returning * into v_project;

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_project);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.create', p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, date, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_project(
  text, text, text, integer, text, text, text, text, text, text, date, text, timestamptz
) to service_role;

commit;
