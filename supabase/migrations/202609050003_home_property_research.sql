begin;

-- Additive property evidence. Neither lookup nor storage modifies a Home Record,
-- grants access, verifies ownership, or publishes a listing. Existing v1 record
-- schemas and the shared command-action constraint remain untouched.
create or replace function public.homesrolo_property_address_valid(p_address jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  if p_address is null or jsonb_typeof(p_address) <> 'object'
    or not (p_address ?& array['line1', 'line2', 'city', 'regionCode', 'postalCode', 'countryCode'])
    or p_address - array['line1', 'line2', 'city', 'regionCode', 'postalCode', 'countryCode'] <> '{}'::jsonb
  then return false; end if;
  if jsonb_typeof(p_address->'line1') <> 'string'
    or length(p_address->>'line1') not between 1 and 120
    or p_address->>'line1' <> btrim(p_address->>'line1')
    or p_address->>'line1' ~ '[[:cntrl:]]'
    or jsonb_typeof(p_address->'city') <> 'string'
    or length(p_address->>'city') not between 1 and 80
    or p_address->>'city' <> btrim(p_address->>'city')
    or p_address->>'city' ~ '[[:cntrl:]]'
    or jsonb_typeof(p_address->'regionCode') <> 'string'
    or p_address->>'regionCode' !~ '^[A-Z]{2}$'
    or jsonb_typeof(p_address->'postalCode') <> 'string'
    or p_address->>'postalCode' !~ '^[0-9]{5}(-[0-9]{4})?$'
    or p_address->'countryCode' <> '"US"'::jsonb
  then return false; end if;
  if p_address->'line2' <> 'null'::jsonb and (
    jsonb_typeof(p_address->'line2') <> 'string'
    or length(p_address->>'line2') not between 1 and 120
    or p_address->>'line2' <> btrim(p_address->>'line2')
    or p_address->>'line2' ~ '[[:cntrl:]]'
  ) then return false; end if;
  return true;
end;
$$;

create or replace function public.homesrolo_property_facts_valid(p_facts jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_number numeric;
  v_min numeric;
  v_max numeric;
begin
  if p_facts is null or jsonb_typeof(p_facts) <> 'object'
    or octet_length(p_facts::text) > 8192
    or not (p_facts ?& array['squareFeet', 'yearBuilt', 'lotSquareFeet', 'bedrooms', 'bathrooms',
      'rooms', 'garageSpaces', 'centralHeat', 'centralAir', 'subdivision'])
    or p_facts - array['squareFeet', 'yearBuilt', 'lotSquareFeet', 'bedrooms', 'bathrooms',
      'rooms', 'garageSpaces', 'centralHeat', 'centralAir', 'subdivision'] <> '{}'::jsonb
  then return false; end if;
  foreach v_key in array array['squareFeet', 'yearBuilt', 'lotSquareFeet', 'bedrooms', 'bathrooms', 'rooms', 'garageSpaces'] loop
    if p_facts->v_key = 'null'::jsonb then continue; end if;
    if jsonb_typeof(p_facts->v_key) <> 'number' then return false; end if;
    v_number := (p_facts->>v_key)::numeric;
    v_min := case v_key when 'squareFeet' then 1 when 'yearBuilt' then 1000 else 0 end;
    v_max := case v_key when 'squareFeet' then 1000000 when 'yearBuilt' then 2100
      when 'lotSquareFeet' then 10000000000 when 'rooms' then 1000 else 100 end;
    if v_number < v_min or v_number > v_max
      or (v_key = 'lotSquareFeet' and v_number <= 0)
      or (v_key = 'bathrooms' and mod(v_number, 0.25) <> 0)
      or (v_key not in ('lotSquareFeet', 'bathrooms') and trunc(v_number) <> v_number)
    then return false; end if;
  end loop;
  foreach v_key in array array['centralHeat', 'centralAir'] loop
    if jsonb_typeof(p_facts->v_key) not in ('null', 'boolean') then return false; end if;
  end loop;
  if p_facts->'subdivision' <> 'null'::jsonb and (
    jsonb_typeof(p_facts->'subdivision') <> 'string'
    or length(p_facts->>'subdivision') not between 1 and 160
    or p_facts->>'subdivision' <> btrim(p_facts->>'subdivision')
    or p_facts->>'subdivision' ~ '[[:cntrl:]]'
  ) then return false; end if;
  return true;
exception when numeric_value_out_of_range or invalid_text_representation then return false;
end;
$$;

-- This validates storage shape only. The server must verify the signed lookup
-- receipt before calling save; a browser cannot call these service-only RPCs.
create or replace function public.homesrolo_property_lookup_valid(p_lookup jsonb, p_address jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp
as $$
declare v_note jsonb;
begin
  if p_lookup is null or p_lookup = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p_lookup) <> 'object' or octet_length(p_lookup::text) > 16384
    or not (p_lookup ?& array['version', 'status', 'address', 'matchedAddress', 'county',
      'retrievedAt', 'source', 'facts', 'notes'])
    or p_lookup - array['version', 'status', 'address', 'matchedAddress', 'county',
      'retrievedAt', 'source', 'facts', 'notes'] <> '{}'::jsonb
    or p_lookup->'version' <> '"property-lookup.v1"'::jsonb
    or p_lookup->'status' <> '"matched"'::jsonb
    or p_lookup->'address' is distinct from p_address
    or not public.homesrolo_property_address_valid(p_lookup->'address')
    or not public.homesrolo_property_facts_valid(p_lookup->'facts')
    or jsonb_typeof(p_lookup->'matchedAddress') <> 'string'
    or length(p_lookup->>'matchedAddress') not between 1 and 360
    or p_lookup->>'matchedAddress' <> btrim(p_lookup->>'matchedAddress')
    or p_lookup->>'matchedAddress' ~ '[[:cntrl:]]'
    or jsonb_typeof(p_lookup->'retrievedAt') <> 'string'
    or p_lookup->>'retrievedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  then return false; end if;
  if jsonb_typeof(p_lookup->'county') <> 'object'
    or not ((p_lookup->'county') ?& array['name', 'fips'])
    or (p_lookup->'county') - array['name', 'fips'] <> '{}'::jsonb
    or p_lookup#>'{county,fips}' <> '"48439"'::jsonb
    or jsonb_typeof(p_lookup#>'{county,name}') <> 'string'
    or length(p_lookup#>>'{county,name}') not between 1 and 120
    or p_lookup#>>'{county,name}' <> btrim(p_lookup#>>'{county,name}')
    or p_lookup#>>'{county,name}' ~ '[[:cntrl:]]'
  then return false; end if;
  if jsonb_typeof(p_lookup->'source') <> 'object'
    or not ((p_lookup->'source') ?& array['id', 'title', 'url', 'parcelId', 'recordDate'])
    or (p_lookup->'source') - array['id', 'title', 'url', 'parcelId', 'recordDate'] <> '{}'::jsonb
    or p_lookup#>'{source,id}' <> '"tarrant_county"'::jsonb
    or p_lookup#>'{source,url}' <> '"https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0"'::jsonb
    or jsonb_typeof(p_lookup#>'{source,title}') <> 'string'
    or length(p_lookup#>>'{source,title}') not between 1 and 160
    or p_lookup#>>'{source,title}' <> btrim(p_lookup#>>'{source,title}')
    or p_lookup#>>'{source,title}' ~ '[[:cntrl:]]'
    or jsonb_typeof(p_lookup#>'{source,parcelId}') <> 'string'
    or p_lookup#>>'{source,parcelId}' !~ '^[0-9]{1,20}$'
    or (p_lookup#>'{source,recordDate}' <> 'null'::jsonb and (
      jsonb_typeof(p_lookup#>'{source,recordDate}') <> 'string'
      or p_lookup#>>'{source,recordDate}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ))
    or jsonb_typeof(p_lookup->'notes') <> 'array'
  then return false; end if;
  if jsonb_array_length(p_lookup->'notes') > 8 then return false; end if;
  for v_note in select value from jsonb_array_elements(p_lookup->'notes') loop
    if jsonb_typeof(v_note) <> 'string' or length(v_note#>>'{}') not between 1 and 500
      or v_note#>>'{}' <> btrim(v_note#>>'{}') or v_note#>>'{}' ~ '[[:cntrl:]]'
    then return false; end if;
  end loop;
  -- The source timestamp must be an actual canonical instant, not just digits
  -- that happen to match an ISO-shaped string.
  if to_char((p_lookup->>'retrievedAt')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    is distinct from p_lookup->>'retrievedAt' then return false; end if;
  return true;
exception when datetime_field_overflow or invalid_datetime_format then return false;
end;
$$;

create table public.homesrolo_home_property_snapshots (
  home_ref text primary key references public.homesrolo_private_homes(home_ref) on delete cascade,
  reviewed_by_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  address jsonb not null check (public.homesrolo_property_address_valid(address)),
  reviewed_facts jsonb not null check (public.homesrolo_property_facts_valid(reviewed_facts)),
  original_lookup jsonb check (public.homesrolo_property_lookup_valid(original_lookup, address)),
  reviewed_at timestamptz not null check (isfinite(reviewed_at))
);

-- One immutable snapshot means one receipt per home. No duplicated address,
-- source evidence, session, or fact payload is retained in receipts.
create table public.homesrolo_home_property_receipts (
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  home_ref text not null unique references public.homesrolo_home_property_snapshots(home_ref) on delete cascade,
  created_at timestamptz not null,
  primary key (principal_ref, command_ref)
);

-- One ten-minute counter per principal plus a global cost ceiling.
-- No address, lookup result, session handle, or third-party identifier enters it.
create table public.homesrolo_property_lookup_limits (
  scope_key text primary key check (scope_key = 'global' or scope_key ~ '^hprn_[A-Za-z0-9_-]{43}$'),
  window_started_at timestamptz not null,
  used_count integer not null check (used_count between 0 and 1000)
);
create index homesrolo_property_lookup_limits_window_idx
  on public.homesrolo_property_lookup_limits(window_started_at);

alter table public.homesrolo_home_property_snapshots enable row level security;
alter table public.homesrolo_home_property_receipts enable row level security;
alter table public.homesrolo_property_lookup_limits enable row level security;
revoke all on table public.homesrolo_home_property_snapshots from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_home_property_receipts from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_property_lookup_limits from public, anon, authenticated, service_role;

create or replace function public.homesrolo_consume_property_lookup(p_principal_ref text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_global integer;
  v_principal integer;
begin
  perform 1 from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref and status = 'active' and email_verified = true
  for share;
  if not found then raise exception 'property_not_authorized'; end if;

  -- All instances acquire the same DB lock before checking either ceiling.
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:property-lookup:global', 0));
  v_now := clock_timestamp();
  delete from public.homesrolo_property_lookup_limits
  where window_started_at <= v_now - interval '10 minutes';
  select used_count into v_global from public.homesrolo_property_lookup_limits where scope_key = 'global';
  select used_count into v_principal from public.homesrolo_property_lookup_limits where scope_key = p_principal_ref;
  if coalesce(v_global, 0) >= 1000 or coalesce(v_principal, 0) >= 8 then return false; end if;
  insert into public.homesrolo_property_lookup_limits(scope_key, window_started_at, used_count)
  values ('global', v_now, 1), (p_principal_ref, v_now, 1)
  on conflict (scope_key) do update set used_count = homesrolo_property_lookup_limits.used_count + 1;
  return true;
end;
$$;

create or replace function public.homesrolo_read_property_snapshot(p_principal_ref text, p_home_ref text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_snapshot public.homesrolo_home_property_snapshots%rowtype;
  v_home public.homesrolo_private_homes%rowtype;
  v_address jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:home-record:' || p_home_ref, 0));
  perform 1 from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref and status = 'active' and email_verified = true
  for share;
  if not found then raise exception 'property_not_authorized'; end if;
  -- `member` is the existing adult household role. Viewers and professional
  -- invitation recipients do not receive this new full property projection.
  perform 1 from public.homesrolo_homeowner_memberships
  where principal_ref = p_principal_ref and home_ref = p_home_ref
    and state = 'active' and role in ('workspace_controller', 'member')
  for share;
  if not found then raise exception 'property_not_authorized'; end if;
  select * into v_home from public.homesrolo_private_homes where home_ref = p_home_ref for share;
  if not found then raise exception 'property_home_not_found'; end if;
  v_address := jsonb_build_object(
    'line1', v_home.address_line_1, 'line2', v_home.address_line_2,
    'city', v_home.address_city, 'regionCode', v_home.address_region_code,
    'postalCode', v_home.address_postal_code, 'countryCode', v_home.address_country_code
  );
  select * into v_snapshot from public.homesrolo_home_property_snapshots where home_ref = p_home_ref;
  if not found then return null; end if;
  -- Return the original address with this immutable historical snapshot. The
  -- client compares it with the current Home Record address, hides mismatched
  -- facts, and explains that this snapshot belongs to an earlier address. A
  -- mismatch is not an absent snapshot and must never offer another initial save.
  return jsonb_build_object(
    'version', 'home-property-snapshot.v1', 'homeRef', v_snapshot.home_ref,
    'address', v_snapshot.address, 'facts', v_snapshot.reviewed_facts,
    'lookup', v_snapshot.original_lookup,
    'reviewedAt', to_char(v_snapshot.reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

create or replace function public.homesrolo_save_property_snapshot(
  p_principal_ref text, p_home_ref text, p_command_ref text, p_command_digest text,
  p_address jsonb, p_facts jsonb, p_lookup jsonb, p_reviewed_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_home public.homesrolo_private_homes%rowtype;
  v_receipt public.homesrolo_home_property_receipts%rowtype;
  v_snapshot public.homesrolo_home_property_snapshots%rowtype;
  v_address jsonb;
  v_lookup jsonb := nullif(p_lookup, 'null'::jsonb);
begin
  if p_command_ref is null or p_command_ref !~ '^hcmd_[A-Za-z0-9_-]{43}$'
    or p_command_digest is null or p_command_digest !~ '^[a-f0-9]{64}$'
    or not public.homesrolo_property_address_valid(p_address)
    or not public.homesrolo_property_facts_valid(p_facts)
    or not public.homesrolo_property_lookup_valid(v_lookup, p_address)
    or p_reviewed_at is null or not isfinite(p_reviewed_at)
    or p_reviewed_at < '2000-01-01'::timestamptz or p_reviewed_at > clock_timestamp() + interval '5 minutes'
  then raise exception 'property_invalid_snapshot'; end if;

  perform pg_advisory_xact_lock(hashtextextended('homesrolo:property-command:' || p_principal_ref || ':' || p_command_ref, 0));
  -- Share the existing Home Record lock so address changes serialize with save.
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:home-record:' || p_home_ref, 0));
  perform 1 from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref and status = 'active' and email_verified = true
  for share;
  if not found then raise exception 'property_not_authorized'; end if;
  perform 1 from public.homesrolo_homeowner_memberships
  where principal_ref = p_principal_ref and home_ref = p_home_ref
    and state = 'active' and role = 'workspace_controller'
  for share;
  if not found then raise exception 'property_not_authorized'; end if;
  select * into v_home from public.homesrolo_private_homes where home_ref = p_home_ref for share;
  if not found then raise exception 'property_home_not_found'; end if;
  v_address := jsonb_build_object(
    'line1', v_home.address_line_1, 'line2', v_home.address_line_2,
    'city', v_home.address_city, 'regionCode', v_home.address_region_code,
    'postalCode', v_home.address_postal_code, 'countryCode', v_home.address_country_code
  );
  if p_address is distinct from v_address then raise exception 'property_address_mismatch'; end if;

  -- Fresh verified principal + current controller + exact saved address are
  -- checked before replay. A revoked account cannot retrieve a prior result.
  select * into v_receipt from public.homesrolo_home_property_receipts
  where principal_ref = p_principal_ref and command_ref = p_command_ref;
  if found then
    if v_receipt.command_digest <> p_command_digest or v_receipt.home_ref <> p_home_ref
    then raise exception 'property_command_conflict'; end if;
    select * into strict v_snapshot from public.homesrolo_home_property_snapshots where home_ref = p_home_ref;
    if v_snapshot.address is distinct from p_address
      or v_snapshot.reviewed_facts is distinct from p_facts
      or v_snapshot.original_lookup is distinct from v_lookup
    then raise exception 'property_command_conflict'; end if;
    -- Return the original reviewedAt, not a retry's server execution time.
    return public.homesrolo_read_property_snapshot(p_principal_ref, p_home_ref);
  end if;
  if exists (select 1 from public.homesrolo_home_property_snapshots where home_ref = p_home_ref)
  then raise exception 'property_snapshot_exists'; end if;
  insert into public.homesrolo_home_property_snapshots(
    home_ref, reviewed_by_principal_ref, address, reviewed_facts, original_lookup, reviewed_at
  ) values (p_home_ref, p_principal_ref, p_address, p_facts, v_lookup, p_reviewed_at);
  insert into public.homesrolo_home_property_receipts(
    principal_ref, command_ref, command_digest, home_ref, created_at
  ) values (p_principal_ref, p_command_ref, p_command_digest, p_home_ref, p_reviewed_at);
  return public.homesrolo_read_property_snapshot(p_principal_ref, p_home_ref);
end;
$$;

revoke all on function public.homesrolo_property_address_valid(jsonb) from public, anon, authenticated;
revoke all on function public.homesrolo_property_facts_valid(jsonb) from public, anon, authenticated;
revoke all on function public.homesrolo_property_lookup_valid(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.homesrolo_consume_property_lookup(text) from public, anon, authenticated;
revoke all on function public.homesrolo_read_property_snapshot(text, text) from public, anon, authenticated;
revoke all on function public.homesrolo_save_property_snapshot(text, text, text, text, jsonb, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.homesrolo_consume_property_lookup(text) to service_role;
grant execute on function public.homesrolo_read_property_snapshot(text, text) to service_role;
grant execute on function public.homesrolo_save_property_snapshot(text, text, text, text, jsonb, jsonb, jsonb, timestamptz) to service_role;

commit;
