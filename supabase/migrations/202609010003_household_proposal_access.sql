begin;

-- A proposal belongs to a shared project, while its controller column preserves
-- the principal who originally created that project. Evidence may be uploaded
-- by a different active household member, so keep the artifact relationship
-- exact without treating the uploader as the proposal owner.
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_artifacts_ref_home_project_unique
  unique (artifact_ref, home_ref, project_ref);

alter table public.homesrolo_homeowner_project_quotes
  drop constraint homesrolo_homeowner_project_q_artifact_ref_home_ref_projec_fkey;
alter table public.homesrolo_homeowner_project_quotes
  add constraint homesrolo_project_quotes_artifact_scope_fkey
  foreign key (artifact_ref, home_ref, project_ref)
  references public.homesrolo_homeowner_artifacts(
    artifact_ref, home_ref, project_ref
  );

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
  v_project public.homesrolo_homeowner_projects%rowtype;
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':quote.create', 0)
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

  select * into v_project
  from public.homesrolo_homeowner_projects
  where project_ref = p_project_ref
    and home_ref = p_home_ref
    and archived_at is null
  for share;
  if not found then raise exception 'project_not_authorized'; end if;

  if p_artifact_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_artifacts
    where artifact_ref = p_artifact_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
      and kind = 'document'
      and media_type = 'application/pdf'
      and state = 'available'
  ) then raise exception 'artifact_not_authorized'; end if;

  insert into public.homesrolo_homeowner_project_quotes (
    quote_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, contractor_label, proposal_date,
    artifact_ref, scope, notes, source, revision, created_at, updated_at
  ) values (
    p_quote_ref, p_home_ref, p_project_ref, v_project.controller_principal_ref,
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
    p_principal_ref, p_command_ref, 'quote.create', p_command_digest,
    v_result, p_requested_at
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
  v_project public.homesrolo_homeowner_projects%rowtype;
  v_quote public.homesrolo_homeowner_project_quotes%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':quote.save', 0)
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

  select * into v_project
  from public.homesrolo_homeowner_projects
  where project_ref = p_project_ref
    and home_ref = p_home_ref
    and archived_at is null
  for share;
  if not found then raise exception 'project_not_authorized'; end if;

  if p_artifact_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_artifacts
    where artifact_ref = p_artifact_ref
      and home_ref = p_home_ref
      and project_ref = p_project_ref
      and kind = 'document'
      and media_type = 'application/pdf'
      and state = 'available'
  ) then raise exception 'artifact_not_authorized'; end if;

  select * into v_quote from public.homesrolo_homeowner_project_quotes
  where quote_ref = p_quote_ref
    and home_ref = p_home_ref
    and project_ref = p_project_ref
    and controller_principal_ref = v_project.controller_principal_ref
    and source = 'homeowner_entry'
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
    and home_ref = p_home_ref
    and project_ref = p_project_ref
    and controller_principal_ref = v_project.controller_principal_ref
    and source = 'homeowner_entry'
  returning * into v_quote;

  update public.homesrolo_private_homes
  set updated_at = p_requested_at
  where home_ref = p_home_ref;

  v_result := to_jsonb(v_quote);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'quote.save', p_command_digest,
    v_result, p_requested_at
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_create_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, text, date, text, jsonb,
  text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, text, date, text, jsonb,
  text, timestamptz
) to service_role;
revoke all on function public.homesrolo_save_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, integer, text, date, text,
  jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_save_homeowner_project_quote(
  text, text, text, text, integer, text, text, text, integer, text, date, text,
  jsonb, text, timestamptz
) to service_role;

commit;
