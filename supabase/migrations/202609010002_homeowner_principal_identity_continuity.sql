begin;

-- The predeploy guard has already made canonical email identity unique. This
-- replacement now reconnects a newly verified provider subject to that exact
-- principal and invalidates older sessions when identity facts rotate.
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
  v_by_provider public.homesrolo_homeowner_principals%rowtype;
  v_by_email public.homesrolo_homeowner_principals%rowtype;
  v_principal public.homesrolo_homeowner_principals%rowtype;
begin
  if p_provider_user_id is null
    or p_email_canonical is null
    or p_email_canonical <> lower(btrim(p_email_canonical))
    or length(p_email_canonical) not between 3 and 254
    or p_new_principal_ref is null
    or p_new_principal_ref !~ '^hprn_[A-Za-z0-9_-]{43}$'
    or p_session_hash is null
    or p_session_hash !~ '^[a-f0-9]{64}$'
    or p_now is null
    or p_expires_at is null
    or p_expires_at <= p_now then
    raise exception 'invalid_session_input';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:homeowner-principal-identity', 0)
  );

  select * into v_by_provider
  from public.homesrolo_homeowner_principals
  where provider_user_id = p_provider_user_id
  for update;

  select * into v_by_email
  from public.homesrolo_homeowner_principals
  where email_canonical = p_email_canonical
  for update;

  if v_by_provider.principal_ref is not null
    and v_by_email.principal_ref is not null
    and v_by_provider.principal_ref <> v_by_email.principal_ref then
    raise exception 'homeowner_principal_identity_conflict';
  end if;

  if v_by_provider.principal_ref is not null then
    if v_by_provider.status <> 'active' then
      return null;
    end if;

    update public.homesrolo_homeowner_principals
    set email_canonical = p_email_canonical,
        email_verified = true,
        session_version = session_version + case
          when email_canonical is distinct from p_email_canonical
            or email_verified is distinct from true
          then 1 else 0
        end,
        updated_at = greatest(updated_at, p_now)
    where principal_ref = v_by_provider.principal_ref
    returning * into v_principal;

  elsif v_by_email.principal_ref is not null then
    if v_by_email.status <> 'active' then
      return null;
    end if;

    update public.homesrolo_homeowner_principals
    set provider_user_id = p_provider_user_id,
        email_verified = true,
        session_version = session_version + 1,
        updated_at = greatest(updated_at, p_now)
    where principal_ref = v_by_email.principal_ref
    returning * into v_principal;

  else
    insert into public.homesrolo_homeowner_principals (
      principal_ref, provider_user_id, email_canonical, status, email_verified,
      session_version, created_at, updated_at
    ) values (
      p_new_principal_ref, p_provider_user_id, p_email_canonical, 'active', true,
      1, p_now, p_now
    )
    returning * into v_principal;
  end if;

  insert into public.homesrolo_homeowner_sessions (
    session_hash, principal_ref, session_version, created_at, expires_at
  ) values (
    p_session_hash, v_principal.principal_ref, v_principal.session_version,
    p_now, p_expires_at
  );

  return to_jsonb(v_principal) - 'provider_user_id' - 'email_canonical';
end;
$$;

revoke all on function public.homesrolo_complete_magic_link(
  uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.homesrolo_complete_magic_link(
  uuid, text, text, text, timestamptz, timestamptz
) to service_role;

commit;
