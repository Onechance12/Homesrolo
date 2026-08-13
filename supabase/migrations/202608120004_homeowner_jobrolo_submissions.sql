begin;

create table if not exists public.homesrolo_homeowner_project_submissions (
  submission_ref text primary key check (submission_ref ~ '^hsub_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text not null references public.homesrolo_homeowner_projects(project_ref),
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  disclosure_digest text not null check (disclosure_digest ~ '^[a-f0-9]{64}$'),
  disclosure jsonb not null,
  consent_version text not null check (consent_version = 'homesrolo-project-review-consent.v1'),
  consent_accepted_at timestamptz not null,
  state text not null check (state in ('executing', 'awaiting_chance_review', 'reconciliation_required')),
  jobrolo_receipt jsonb,
  created_at timestamptz not null,
  received_at timestamptz,
  updated_at timestamptz not null,
  unique (controller_principal_ref, command_ref),
  unique (controller_principal_ref, project_ref, disclosure_digest),
  check (updated_at >= created_at),
  check ((state = 'awaiting_chance_review') = (jobrolo_receipt is not null)),
  check ((state = 'awaiting_chance_review') = (received_at is not null))
);

create index if not exists homesrolo_homeowner_submissions_project_idx
  on public.homesrolo_homeowner_project_submissions(home_ref, project_ref, created_at desc);

alter table public.homesrolo_homeowner_project_submissions enable row level security;
revoke all on table public.homesrolo_homeowner_project_submissions from public, anon, authenticated;
grant select, insert, update on table public.homesrolo_homeowner_project_submissions to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'intake.record', 'project.create', 'artifact.upload',
    'project.submit_for_review'
  ));

create or replace function public.homesrolo_reserve_project_review_submission(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_submission_ref text,
  p_disclosure_digest text,
  p_disclosure jsonb,
  p_consent_accepted_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.homesrolo_homeowner_project_submissions%rowtype;
begin
  -- One browser command cannot fork into two effects, and one unchanged
  -- consent-bound disclosure cannot be resubmitted under a fresh command after
  -- an uncertain outcome (for example after a refresh).
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.submit_for_review', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_project_ref || ':' || p_disclosure_digest, 0)
  );
  select * into v_submission from public.homesrolo_homeowner_project_submissions
  where controller_principal_ref = p_principal_ref and command_ref = p_command_ref;
  if found then
    if v_submission.command_digest <> p_command_digest
      or v_submission.disclosure_digest <> p_disclosure_digest then
      raise exception 'submission_digest_mismatch';
    end if;
    return to_jsonb(v_submission);
  end if;

  select * into v_submission from public.homesrolo_homeowner_project_submissions
  where controller_principal_ref = p_principal_ref
    and project_ref = p_project_ref
    and disclosure_digest = p_disclosure_digest;
  if found then
    return to_jsonb(v_submission);
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then
    raise exception 'membership_not_authorized';
  end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref and category = 'roofing'
  ) then
    raise exception 'project_not_authorized';
  end if;

  insert into public.homesrolo_homeowner_project_submissions (
    submission_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, disclosure_digest, disclosure, consent_version,
    consent_accepted_at, state, created_at, updated_at
  ) values (
    p_submission_ref, p_home_ref, p_project_ref, p_principal_ref,
    p_command_ref, p_command_digest, p_disclosure_digest, p_disclosure,
    'homesrolo-project-review-consent.v1', p_consent_accepted_at,
    'executing', p_consent_accepted_at, p_consent_accepted_at
  ) returning * into v_submission;
  return to_jsonb(v_submission);
end;
$$;

create or replace function public.homesrolo_complete_project_review_submission(
  p_principal_ref text,
  p_home_ref text,
  p_project_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_submission_ref text,
  p_receipt jsonb,
  p_received_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.homesrolo_homeowner_project_submissions%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':project.submit_for_review', 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_submission from public.homesrolo_homeowner_project_submissions
  where submission_ref = p_submission_ref
    and home_ref = p_home_ref and project_ref = p_project_ref
    and controller_principal_ref = p_principal_ref
    and command_ref = p_command_ref and command_digest = p_command_digest
  for update;
  if not found then raise exception 'submission_not_found'; end if;
  if v_submission.state = 'reconciliation_required' then
    raise exception 'submission_requires_reconciliation';
  end if;
  update public.homesrolo_homeowner_project_submissions
  set state = 'awaiting_chance_review', jobrolo_receipt = p_receipt,
      received_at = p_received_at, updated_at = p_received_at
  where submission_ref = p_submission_ref;
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'project.submit_for_review', p_command_digest,
    jsonb_build_object('submission_ref', p_submission_ref, 'receipt', p_receipt), p_received_at
  ) on conflict (principal_ref, command_ref, action) do nothing;
end;
$$;

create or replace function public.homesrolo_mark_project_review_unknown(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_submission_ref text,
  p_failed_at timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.homesrolo_homeowner_project_submissions
  set state = 'reconciliation_required', updated_at = p_failed_at
  where submission_ref = p_submission_ref
    and controller_principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest
    and state = 'executing';
$$;

revoke all on function public.homesrolo_reserve_project_review_submission(
  text, text, text, text, integer, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_complete_project_review_submission(
  text, text, text, text, integer, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_mark_project_review_unknown(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_reserve_project_review_submission(
  text, text, text, text, integer, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.homesrolo_complete_project_review_submission(
  text, text, text, text, integer, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.homesrolo_mark_project_review_unknown(
  text, text, text, text, timestamptz
) to service_role;

commit;
