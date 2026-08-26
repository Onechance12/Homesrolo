begin;

-- Keep one proposal record model for every kind of home work. Existing roof
-- rows remain valid; the additional keys are optional, neutral comparison
-- facts for remodeling, service, yard, pool, HVAC, and other projects.
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
        'project_scope', 'site_conditions', 'preparation', 'labor',
        'materials_products', 'allowances', 'schedule', 'access_protection',
        'inspection_closeout', 'warranty', 'change_orders',
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

-- Proposal records now follow a project when its whole-home category is
-- corrected. The only remaining category lock is the separately scoped,
-- roofing-only Jobrolo review submission.
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
    or p_set_archived is null then
    raise exception 'invalid_project_update_flags';
  end if;
  if not (
    p_set_title or p_set_work_kind or p_set_category or p_set_status
    or p_set_occurred_on or p_set_summary or p_set_professional_label or p_set_archived
  ) then
    raise exception 'empty_project_update';
  end if;
  if p_set_title and (p_title is null or length(btrim(p_title)) not between 1 and 120) then
    raise exception 'invalid_project_title';
  end if;
  if p_set_work_kind and (
    p_work_kind is null
    or p_work_kind not in ('project', 'issue', 'repair', 'service', 'incident')
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
revoke all on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, text, boolean, text, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_update_homeowner_project(
  text, text, text, text, integer, text, text, integer,
  boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, date, boolean, text, boolean, text, boolean, boolean, timestamptz
) to service_role;

commit;
