begin;

create table if not exists public.homesrolo_homeowner_projects (
  project_ref text primary key check (project_ref ~ '^hprj_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (category in (
    'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac', 'landscaping', 'other'
  )),
  status text not null check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  occurred_on date,
  summary text check (summary is null or length(btrim(summary)) <= 2000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at)
);

create index if not exists homesrolo_homeowner_projects_home_updated_idx
  on public.homesrolo_homeowner_projects(home_ref, updated_at desc);

alter table public.homesrolo_homeowner_projects enable row level security;
revoke all on table public.homesrolo_homeowner_projects from public, anon, authenticated;
grant select, insert, update, delete on table public.homesrolo_homeowner_projects to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in ('home.create', 'intake.record', 'project.create'));

create or replace function public.homesrolo_create_homeowner_roofing_project(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_project_ref text,
  p_title text,
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
    p_project_ref, p_home_ref, p_principal_ref, btrim(p_title), 'roofing', 'planned',
    null, nullif(btrim(p_summary), ''), p_requested_at, p_requested_at
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

revoke all on function public.homesrolo_create_homeowner_roofing_project(
  text, text, text, integer, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_roofing_project(
  text, text, text, integer, text, text, text, text, text, timestamptz
) to service_role;

commit;

