begin;

create table if not exists public.homesrolo_homeowner_principals (
  principal_ref text primary key check (principal_ref ~ '^hprn_[A-Za-z0-9_-]{43}$'),
  provider_user_id uuid not null unique,
  email_canonical text not null check (email_canonical = lower(email_canonical) and length(email_canonical) between 3 and 254),
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  email_verified boolean not null default true,
  session_version integer not null default 1 check (session_version >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at)
);

create table if not exists public.homesrolo_homeowner_sessions (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  session_version integer not null check (session_version >= 1),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists homesrolo_homeowner_sessions_principal_idx
  on public.homesrolo_homeowner_sessions(principal_ref, expires_at desc);

create table if not exists public.homesrolo_private_homes (
  home_ref text primary key check (home_ref ~ '^hhom_[A-Za-z0-9_-]{43}$'),
  created_by_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  display_label text not null check (length(btrim(display_label)) between 1 and 80),
  private_location_label text not null check (length(btrim(private_location_label)) between 1 and 200),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at)
);

create table if not exists public.homesrolo_homeowner_memberships (
  membership_ref text primary key check (membership_ref ~ '^hmbr_[A-Za-z0-9_-]{43}$'),
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  role text not null check (role in ('workspace_controller', 'member', 'viewer')),
  basis text not null check (basis in ('self_created_workspace', 'verified_control', 'accepted_invitation')),
  state text not null check (state in ('pending', 'active', 'revoked')),
  relationship_label text not null check (relationship_label in ('claimed_unverified', 'verified_controller', 'invited_participant')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  revoked_at timestamptz,
  unique (principal_ref, home_ref),
  check ((state = 'revoked') = (revoked_at is not null))
);

create table if not exists public.homesrolo_homeowner_property_facts (
  property_facts_ref text primary key check (property_facts_ref ~ '^hfac_[A-Za-z0-9_-]{43}$'),
  home_ref text not null unique references public.homesrolo_private_homes(home_ref),
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  home_type text not null check (home_type in ('house', 'townhouse', 'condo', 'other', 'unknown')),
  year_built_value integer check (year_built_value between 1800 and 9999),
  year_built_precision text check (year_built_precision in ('exact', 'approximate')),
  source text not null default 'homeowner_recollection' check (source = 'homeowner_recollection'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check ((year_built_value is null) = (year_built_precision is null)),
  check (updated_at >= created_at)
);

create table if not exists public.homesrolo_homeowner_systems (
  system_ref text primary key check (system_ref ~ '^hsys_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  kind text not null check (kind in ('roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation')),
  present text not null check (present in ('yes', 'no', 'unknown')),
  installed_or_replaced_year_value integer check (installed_or_replaced_year_value between 1800 and 9999),
  installed_or_replaced_year_precision text check (installed_or_replaced_year_precision in ('exact', 'approximate')),
  source text not null default 'homeowner_recollection' check (source = 'homeowner_recollection'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (home_ref, kind),
  check ((installed_or_replaced_year_value is null) = (installed_or_replaced_year_precision is null)),
  check (present = 'yes' or installed_or_replaced_year_value is null),
  check (updated_at >= created_at)
);

create table if not exists public.homesrolo_homeowner_command_receipts (
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  action text not null check (action in ('home.create', 'intake.record')),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null,
  primary key (principal_ref, command_ref, action)
);

alter table public.homesrolo_homeowner_principals enable row level security;
alter table public.homesrolo_homeowner_sessions enable row level security;
alter table public.homesrolo_private_homes enable row level security;
alter table public.homesrolo_homeowner_memberships enable row level security;
alter table public.homesrolo_homeowner_property_facts enable row level security;
alter table public.homesrolo_homeowner_systems enable row level security;
alter table public.homesrolo_homeowner_command_receipts enable row level security;

revoke all on table public.homesrolo_homeowner_principals from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_sessions from public, anon, authenticated;
revoke all on table public.homesrolo_private_homes from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_memberships from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_property_facts from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_systems from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_command_receipts from public, anon, authenticated;

grant select, insert, update, delete on table public.homesrolo_homeowner_principals to service_role;
grant select, insert, update, delete on table public.homesrolo_homeowner_sessions to service_role;
grant select, insert, update, delete on table public.homesrolo_private_homes to service_role;
grant select, insert, update, delete on table public.homesrolo_homeowner_memberships to service_role;
grant select, insert, update, delete on table public.homesrolo_homeowner_property_facts to service_role;
grant select, insert, update, delete on table public.homesrolo_homeowner_systems to service_role;
grant select, insert, update, delete on table public.homesrolo_homeowner_command_receipts to service_role;

create or replace function public.homesrolo_complete_magic_link(
  p_provider_user_id uuid,
  p_email_canonical text,
  p_new_principal_ref text,
  p_session_hash text,
  p_now timestamptz,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_principal public.homesrolo_homeowner_principals%rowtype;
begin
  if p_email_canonical <> lower(p_email_canonical)
    or p_expires_at <= p_now
    or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_session_input';
  end if;

  insert into public.homesrolo_homeowner_principals (
    principal_ref, provider_user_id, email_canonical, status, email_verified,
    session_version, created_at, updated_at
  ) values (
    p_new_principal_ref, p_provider_user_id, p_email_canonical, 'active', true,
    1, p_now, p_now
  )
  on conflict (provider_user_id) do update set
    email_canonical = excluded.email_canonical,
    email_verified = true,
    updated_at = excluded.updated_at
  returning * into v_principal;

  if v_principal.status <> 'active' then
    return null;
  end if;

  insert into public.homesrolo_homeowner_sessions (
    session_hash, principal_ref, session_version, created_at, expires_at
  ) values (
    p_session_hash, v_principal.principal_ref, v_principal.session_version, p_now, p_expires_at
  );

  return to_jsonb(v_principal) - 'provider_user_id' - 'email_canonical';
end;
$$;

create or replace function public.homesrolo_resolve_homeowner_principal(
  p_session_hash text,
  p_now timestamptz
) returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select to_jsonb(p) - 'provider_user_id' - 'email_canonical'
  from public.homesrolo_homeowner_sessions s
  join public.homesrolo_homeowner_principals p on p.principal_ref = s.principal_ref
  where s.session_hash = p_session_hash
    and s.revoked_at is null
    and s.expires_at > p_now
    and s.session_version = p.session_version
    and p.status = 'active'
    and p.email_verified = true
  limit 1;
$$;

create or replace function public.homesrolo_revoke_homeowner_session(
  p_session_hash text,
  p_now timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.homesrolo_homeowner_sessions
  set revoked_at = coalesce(revoked_at, p_now)
  where session_hash = p_session_hash;
$$;

create or replace function public.homesrolo_create_private_home_workspace(
  p_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_home_ref text,
  p_membership_ref text,
  p_display_label text,
  p_private_location_label text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_home public.homesrolo_private_homes%rowtype;
  v_membership public.homesrolo_homeowner_memberships%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_principal_ref || ':' || p_command_ref || ':home.create', 0));
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref and command_ref = p_command_ref and action = 'home.create';
  if found then
    if v_receipt.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    return v_receipt.result;
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_principals
    where principal_ref = p_principal_ref and status = 'active' and email_verified = true
  ) then raise exception 'principal_not_authorized'; end if;

  insert into public.homesrolo_private_homes (
    home_ref, created_by_principal_ref, display_label, private_location_label, created_at, updated_at
  ) values (
    p_home_ref, p_principal_ref, btrim(p_display_label), btrim(p_private_location_label), p_requested_at, p_requested_at
  ) returning * into v_home;

  insert into public.homesrolo_homeowner_memberships (
    membership_ref, principal_ref, home_ref, role, basis, state,
    relationship_label, revision, created_at
  ) values (
    p_membership_ref, p_principal_ref, p_home_ref, 'workspace_controller',
    'self_created_workspace', 'active', 'claimed_unverified', 1, p_requested_at
  ) returning * into v_membership;

  v_result := jsonb_build_object('home', to_jsonb(v_home), 'membership', to_jsonb(v_membership));
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (p_principal_ref, p_command_ref, 'home.create', p_command_digest, v_result, p_requested_at);
  return v_result;
end;
$$;

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
  perform pg_advisory_xact_lock(hashtextextended(p_principal_ref || ':' || p_command_ref || ':intake.record', 0));
  select * into v_receipt from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref and command_ref = p_command_ref and action = 'intake.record';
  if found then
    if v_receipt.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    return v_receipt.result;
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

  if jsonb_typeof(p_systems) <> 'array' or jsonb_array_length(p_systems) <> 6
    or (select count(distinct value->>'kind') from jsonb_array_elements(p_systems)) <> 6
    or exists (
      select 1 from jsonb_array_elements(p_systems) item
      where item->>'kind' not in ('roof', 'heating', 'cooling', 'water_heater', 'gutters', 'foundation')
        or item->>'present' not in ('yes', 'no', 'unknown')
        or (item->>'present' <> 'yes' and item->'installed_or_replaced_year_value' <> 'null'::jsonb)
    ) then raise exception 'invalid_systems'; end if;

  insert into public.homesrolo_homeowner_property_facts (
    property_facts_ref, home_ref, controller_principal_ref, home_type,
    year_built_value, year_built_precision, source, revision, created_at, updated_at
  ) values (
    p_property_facts_ref, p_home_ref, p_principal_ref, p_home_type,
    p_year_built_value, p_year_built_precision, 'homeowner_recollection', 1, p_requested_at, p_requested_at
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
      v_system->>'system_ref', p_home_ref, p_principal_ref, v_system->>'kind', v_system->>'present',
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

  update public.homesrolo_private_homes set updated_at = p_requested_at where home_ref = p_home_ref;
  select jsonb_agg(to_jsonb(s) order by s.kind) into v_system_rows
  from public.homesrolo_homeowner_systems s where s.home_ref = p_home_ref;
  v_result := jsonb_build_object('property_facts', to_jsonb(v_facts), 'systems', v_system_rows);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (p_principal_ref, p_command_ref, 'intake.record', p_command_digest, v_result, p_requested_at);
  return v_result;
end;
$$;

revoke all on function public.homesrolo_complete_magic_link(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.homesrolo_resolve_homeowner_principal(text, timestamptz) from public, anon, authenticated;
revoke all on function public.homesrolo_revoke_homeowner_session(text, timestamptz) from public, anon, authenticated;
revoke all on function public.homesrolo_create_private_home_workspace(text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.homesrolo_record_initial_intake(text, text, text, integer, text, text, text, text, integer, text, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.homesrolo_complete_magic_link(uuid, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.homesrolo_resolve_homeowner_principal(text, timestamptz) to service_role;
grant execute on function public.homesrolo_revoke_homeowner_session(text, timestamptz) to service_role;
grant execute on function public.homesrolo_create_private_home_workspace(text, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.homesrolo_record_initial_intake(text, text, text, integer, text, text, text, text, integer, text, jsonb, timestamptz) to service_role;

commit;

