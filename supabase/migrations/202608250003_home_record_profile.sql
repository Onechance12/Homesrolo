begin;

-- An exact address is private record data. Existing home summaries continue to
-- expose only display_label and private_location_label; these columns are read
-- only after exact-home membership authorization.
alter table public.homesrolo_private_homes
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists address_city text,
  add column if not exists address_region_code text,
  add column if not exists address_postal_code text,
  add column if not exists address_country_code text,
  add column if not exists record_revision integer not null default 1,
  add column if not exists record_updated_at timestamptz not null default now();

alter table public.homesrolo_private_homes
  drop constraint if exists homesrolo_private_homes_record_revision_check;
alter table public.homesrolo_private_homes
  add constraint homesrolo_private_homes_record_revision_check
  check (record_revision >= 1);

alter table public.homesrolo_private_homes
  drop constraint if exists homesrolo_private_homes_address_complete_check;
alter table public.homesrolo_private_homes
  add constraint homesrolo_private_homes_address_complete_check check (
    (
      address_line_1 is null
      and address_line_2 is null
      and address_city is null
      and address_region_code is null
      and address_postal_code is null
      and address_country_code is null
    )
    or
    (
      address_line_1 is not null
      and address_city is not null
      and address_region_code is not null
      and address_postal_code is not null
      and address_country_code is not null
      and address_line_1 = btrim(address_line_1)
      and length(address_line_1) between 1 and 120
      and address_line_1 !~ '[[:cntrl:]]'
      and (
        address_line_2 is null
        or (
          address_line_2 = btrim(address_line_2)
          and length(address_line_2) between 1 and 120
          and address_line_2 !~ '[[:cntrl:]]'
        )
      )
      and address_city = btrim(address_city)
      and length(address_city) between 1 and 80
      and address_city !~ '[[:cntrl:]]'
      and address_region_code ~ '^[A-Z]{2}$'
      and address_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'
      and address_country_code = 'US'
    )
  );

alter table public.homesrolo_private_homes
  drop constraint if exists homesrolo_private_homes_record_updated_at_check;
alter table public.homesrolo_private_homes
  add constraint homesrolo_private_homes_record_updated_at_check
  check (record_updated_at >= created_at);

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'home_record.update', 'intake.record', 'project.create',
    'project.update', 'project.activity.append', 'project.item.save',
    'artifact.upload', 'project.submit_for_review', 'quote.create',
    'quote.save', 'photo_checkup.upload'
  ));

-- Home Record receipts intentionally retain the exact replay result. Scope
-- them to the home so reuse across homes fails closed and deleting the home
-- also removes this secondary copy of its private address.
alter table public.homesrolo_homeowner_command_receipts
  add column if not exists home_ref text
    references public.homesrolo_private_homes(home_ref) on delete cascade;
alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_home_record_scope_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_home_record_scope_check
  check (action <> 'home_record.update' or home_ref is not null);

create or replace function public.homesrolo_read_home_record(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer
) returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_home public.homesrolo_private_homes%rowtype;
  v_facts jsonb;
  v_system_rows jsonb;
begin
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role in ('workspace_controller', 'member', 'viewer')
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_home from public.homesrolo_private_homes
  where home_ref = p_home_ref;
  if not found then raise exception 'home_not_found'; end if;

  select to_jsonb(f) into v_facts
  from public.homesrolo_homeowner_property_facts f
  where f.home_ref = p_home_ref;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.kind), '[]'::jsonb)
  into v_system_rows
  from public.homesrolo_homeowner_systems s
  where s.home_ref = p_home_ref;

  return jsonb_build_object(
    'home', to_jsonb(v_home),
    'property_facts', v_facts,
    'systems', v_system_rows
  );
end;
$$;

create or replace function public.homesrolo_update_home_record(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_expected_revision integer,
  p_address_line_1 text,
  p_address_line_2 text,
  p_address_city text,
  p_address_region_code text,
  p_address_postal_code text,
  p_address_country_code text,
  p_property_facts_ref text,
  p_home_type text,
  p_year_built_value integer,
  p_year_built_precision text,
  p_systems jsonb,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_home public.homesrolo_private_homes%rowtype;
  v_facts public.homesrolo_homeowner_property_facts%rowtype;
  v_system jsonb;
  v_system_rows jsonb;
  v_result jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;
  if p_address_line_1 is null
    or btrim(p_address_line_1) = ''
    or length(btrim(p_address_line_1)) > 120
    or btrim(p_address_line_1) ~ '[[:cntrl:]]'
    or (p_address_line_2 is not null and (
      btrim(p_address_line_2) = ''
      or length(btrim(p_address_line_2)) > 120
      or btrim(p_address_line_2) ~ '[[:cntrl:]]'
    ))
    or p_address_city is null
    or btrim(p_address_city) = ''
    or length(btrim(p_address_city)) > 80
    or btrim(p_address_city) ~ '[[:cntrl:]]'
    or p_address_region_code is null
    or p_address_region_code !~ '^[A-Z]{2}$'
    or p_address_postal_code is null
    or p_address_postal_code !~ '^[0-9]{5}(-[0-9]{4})?$'
    or p_address_country_code is null
    or p_address_country_code <> 'US' then
    raise exception 'invalid_private_address';
  end if;
  if p_home_type is null
    or p_home_type not in ('house', 'townhouse', 'condo', 'other', 'unknown')
    or ((p_year_built_value is null) <> (p_year_built_precision is null))
    or (p_year_built_value is not null and (
      p_year_built_value not between 1800 and extract(year from p_requested_at)::integer
      or p_year_built_precision not in ('exact', 'approximate')
    )) then
    raise exception 'invalid_home_facts';
  end if;
  if p_systems is null
    or jsonb_typeof(p_systems) <> 'array'
    or jsonb_array_length(p_systems) <> 6
    or (select count(distinct value->>'kind') from jsonb_array_elements(p_systems)) <> 6
    or exists (
      select 1 from jsonb_array_elements(p_systems) item
      where jsonb_typeof(item) <> 'object'
        or item->>'system_ref' !~ '^hsys_[A-Za-z0-9_-]{43}$'
        or item->>'kind' not in (
          'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation'
        )
        or item->>'present' not in ('yes', 'no', 'unknown')
        or (
          ((item->>'installed_or_replaced_year_value') is null)
          <> ((item->>'installed_or_replaced_year_precision') is null)
        )
        or (
          item->>'installed_or_replaced_year_value' is not null
          and (
            (item->>'installed_or_replaced_year_value')::integer not between 1800
              and extract(year from p_requested_at)::integer
            or item->>'installed_or_replaced_year_precision'
              not in ('exact', 'approximate')
          )
        )
        or (
          item->>'present' <> 'yes'
          and item->>'installed_or_replaced_year_value' is not null
        )
    ) then
    raise exception 'invalid_systems';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:home-record:' || p_home_ref, 0)
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

  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'home_record.update';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    if v_receipt.home_ref is distinct from p_home_ref
      or v_receipt.result #>> '{home,home_ref}' is distinct from p_home_ref then
      raise exception 'command_scope_mismatch';
    end if;
    return v_receipt.result;
  end if;

  select * into v_home from public.homesrolo_private_homes
  where home_ref = p_home_ref
  for update;
  if not found then raise exception 'home_not_found'; end if;
  if v_home.record_revision <> p_expected_revision then
    raise exception 'home_record_revision_conflict';
  end if;

  insert into public.homesrolo_homeowner_property_facts (
    property_facts_ref, home_ref, controller_principal_ref, home_type,
    year_built_value, year_built_precision, source, revision, created_at, updated_at
  ) values (
    p_property_facts_ref, p_home_ref, p_principal_ref, p_home_type,
    p_year_built_value, p_year_built_precision, 'homeowner_recollection',
    1, p_requested_at, p_requested_at
  )
  on conflict (home_ref) do update set
    controller_principal_ref = excluded.controller_principal_ref,
    home_type = excluded.home_type,
    year_built_value = excluded.year_built_value,
    year_built_precision = excluded.year_built_precision,
    revision = public.homesrolo_homeowner_property_facts.revision + 1,
    updated_at = excluded.updated_at
  returning * into v_facts;

  for v_system in select value from jsonb_array_elements(p_systems)
  loop
    insert into public.homesrolo_homeowner_systems (
      system_ref, home_ref, controller_principal_ref, kind, present,
      installed_or_replaced_year_value, installed_or_replaced_year_precision,
      source, revision, created_at, updated_at
    ) values (
      v_system->>'system_ref', p_home_ref, p_principal_ref,
      v_system->>'kind', v_system->>'present',
      (v_system->>'installed_or_replaced_year_value')::integer,
      v_system->>'installed_or_replaced_year_precision',
      'homeowner_recollection', 1, p_requested_at, p_requested_at
    )
    on conflict (home_ref, kind) do update set
      controller_principal_ref = excluded.controller_principal_ref,
      present = excluded.present,
      installed_or_replaced_year_value = excluded.installed_or_replaced_year_value,
      installed_or_replaced_year_precision = excluded.installed_or_replaced_year_precision,
      revision = public.homesrolo_homeowner_systems.revision + 1,
      updated_at = excluded.updated_at;
  end loop;

  update public.homesrolo_private_homes
  set address_line_1 = btrim(p_address_line_1),
      address_line_2 = nullif(btrim(coalesce(p_address_line_2, '')), ''),
      address_city = btrim(p_address_city),
      address_region_code = p_address_region_code,
      address_postal_code = p_address_postal_code,
      address_country_code = p_address_country_code,
      private_location_label = btrim(p_address_city) || ', ' || p_address_region_code,
      record_revision = record_revision + 1,
      record_updated_at = greatest(record_updated_at, p_requested_at),
      updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref
  returning * into v_home;

  select jsonb_agg(to_jsonb(s) order by s.kind) into v_system_rows
  from public.homesrolo_homeowner_systems s
  where s.home_ref = p_home_ref;
  v_result := jsonb_build_object(
    'home', to_jsonb(v_home),
    'property_facts', to_jsonb(v_facts),
    'systems', v_system_rows
  );
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'home_record.update',
    p_command_digest, v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

-- Keep the older onboarding command coherent with aggregate revision checks.
create or replace function public.homesrolo_record_initial_intake(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_property_facts_ref text,
  p_home_type text,
  p_year_built_value integer,
  p_year_built_precision text,
  p_systems jsonb,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_facts public.homesrolo_homeowner_property_facts%rowtype;
  v_system jsonb;
  v_system_rows jsonb;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:home-record:' || p_home_ref, 0)
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

  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'intake.record';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    if v_receipt.home_ref is not null
      and v_receipt.home_ref is distinct from p_home_ref then
      raise exception 'command_scope_mismatch';
    end if;
    if v_receipt.result #>> '{property_facts,home_ref}' is distinct from p_home_ref then
      raise exception 'command_scope_mismatch';
    end if;
    return v_receipt.result;
  end if;

  -- The compatibility endpoint is initial intake, not an unrevisioned edit
  -- path. Once any profile facts exist, all edits must use the aggregate
  -- expected-revision command above.
  if exists (
    select 1 from public.homesrolo_homeowner_property_facts
    where home_ref = p_home_ref
  ) or exists (
    select 1 from public.homesrolo_homeowner_systems
    where home_ref = p_home_ref
  ) then raise exception 'initial_intake_already_recorded'; end if;

  if p_systems is null
    or jsonb_typeof(p_systems) <> 'array'
    or jsonb_array_length(p_systems) <> 6
    or (select count(distinct value->>'kind') from jsonb_array_elements(p_systems)) <> 6
    or exists (
      select 1 from jsonb_array_elements(p_systems) item
      where item->>'kind' not in (
        'roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation'
      )
        or item->>'present' not in ('yes', 'no', 'unknown')
        or (
          item->>'present' <> 'yes'
          and item->>'installed_or_replaced_year_value' is not null
        )
    ) then raise exception 'invalid_systems'; end if;

  insert into public.homesrolo_homeowner_property_facts (
    property_facts_ref, home_ref, controller_principal_ref, home_type,
    year_built_value, year_built_precision, source, revision, created_at, updated_at
  ) values (
    p_property_facts_ref, p_home_ref, p_principal_ref, p_home_type,
    p_year_built_value, p_year_built_precision, 'homeowner_recollection',
    1, p_requested_at, p_requested_at
  )
  on conflict (home_ref) do update set
    controller_principal_ref = excluded.controller_principal_ref,
    home_type = excluded.home_type,
    year_built_value = excluded.year_built_value,
    year_built_precision = excluded.year_built_precision,
    revision = public.homesrolo_homeowner_property_facts.revision + 1,
    updated_at = excluded.updated_at
  returning * into v_facts;

  for v_system in select value from jsonb_array_elements(p_systems)
  loop
    insert into public.homesrolo_homeowner_systems (
      system_ref, home_ref, controller_principal_ref, kind, present,
      installed_or_replaced_year_value, installed_or_replaced_year_precision,
      source, revision, created_at, updated_at
    ) values (
      v_system->>'system_ref', p_home_ref, p_principal_ref,
      v_system->>'kind', v_system->>'present',
      (v_system->>'installed_or_replaced_year_value')::integer,
      v_system->>'installed_or_replaced_year_precision',
      'homeowner_recollection', 1, p_requested_at, p_requested_at
    )
    on conflict (home_ref, kind) do update set
      controller_principal_ref = excluded.controller_principal_ref,
      present = excluded.present,
      installed_or_replaced_year_value = excluded.installed_or_replaced_year_value,
      installed_or_replaced_year_precision = excluded.installed_or_replaced_year_precision,
      revision = public.homesrolo_homeowner_systems.revision + 1,
      updated_at = excluded.updated_at;
  end loop;

  update public.homesrolo_private_homes
  set record_revision = record_revision + 1,
      record_updated_at = greatest(record_updated_at, p_requested_at),
      updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  select jsonb_agg(to_jsonb(s) order by s.kind) into v_system_rows
  from public.homesrolo_homeowner_systems s
  where s.home_ref = p_home_ref;
  v_result := jsonb_build_object(
    'property_facts', to_jsonb(v_facts),
    'systems', v_system_rows
  );
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at, home_ref
  ) values (
    p_principal_ref, p_command_ref, 'intake.record',
    p_command_digest, v_result, p_requested_at, p_home_ref
  );
  return v_result;
end;
$$;

revoke all on function public.homesrolo_update_home_record(
  text, text, text, integer, text, text, integer,
  text, text, text, text, text, text, text, text, integer, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_read_home_record(
  text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.homesrolo_update_home_record(
  text, text, text, integer, text, text, integer,
  text, text, text, text, text, text, text, text, integer, text, jsonb, timestamptz
) to service_role;
grant execute on function public.homesrolo_read_home_record(
  text, text, text, integer
) to service_role;

commit;
