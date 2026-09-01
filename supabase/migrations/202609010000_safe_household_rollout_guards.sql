begin;

-- This migration is deliberately safe to apply before the application
-- release. It prevents a verified-email identity from forking while a
-- compatibility magic-link function serves traffic. Existing ambiguity is
-- never guessed through: deployment stops for explicit reconciliation.
do $migration$
begin
  if exists (
    select 1
    from public.homesrolo_homeowner_principals
    where email_canonical <> lower(btrim(email_canonical))
  ) then
    raise exception 'homeowner_principal_email_noncanonical_requires_reconciliation';
  end if;
  if exists (
    select 1
    from public.homesrolo_homeowner_principals
    group by lower(btrim(email_canonical))
    having count(*) > 1
  ) then
    raise exception 'homeowner_principal_email_duplicates_require_reconciliation';
  end if;
end
$migration$;

alter table public.homesrolo_homeowner_principals
  add constraint homesrolo_homeowner_principals_email_canonical_form_check
  check (email_canonical = lower(btrim(email_canonical)));

create unique index homesrolo_homeowner_principals_email_canonical_uidx
  on public.homesrolo_homeowner_principals(email_canonical);

-- Invalidate every pre-cutover browser/native session once. The legacy
-- function did not version sessions when a provider changed the email on an
-- existing subject, so historical rotations cannot be identified reliably.
-- A one-time reauthentication is safer than carrying that ambiguity forward.
update public.homesrolo_homeowner_principals
set session_version = session_version + 1,
    updated_at = greatest(updated_at, clock_timestamp());

-- During the 000 -> application -> 002 rollout window, keep the old subject-
-- based behavior but version any identity-fact change. A new provider subject
-- that collides with an existing canonical email fails closed at the unique
-- index until migration 002 installs verified-email reassociation.
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

  select * into v_principal
  from public.homesrolo_homeowner_principals
  where provider_user_id = p_provider_user_id
  for update;

  if found then
    if v_principal.status <> 'active' then
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
    where principal_ref = v_principal.principal_ref
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

-- The new application can use this read boundary immediately after deploy,
-- before the later write-correction migrations are applied. It cannot expose
-- a private project to a disabled principal, revoked membership, suspended
-- organization, closed invitation, or expired invitation.
create or replace function public.homesrolo_list_authorized_professional_invitations(
  p_principal_ref text,
  p_now timestamptz
) returns setof public.homesrolo_project_invitations
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select invitation.*
  from public.homesrolo_project_invitations invitation
  join public.homesrolo_professional_organizations organization
    on organization.organization_ref = invitation.professional_organization_ref
   and organization.publication_state <> 'suspended'
  join public.homesrolo_professional_memberships membership
    on membership.organization_ref = organization.organization_ref
   and membership.principal_ref = p_principal_ref
   and membership.state = 'active'
  join public.homesrolo_homeowner_principals principal
    on principal.principal_ref = membership.principal_ref
   and principal.status = 'active'
   and principal.email_verified = true
  where invitation.status in ('pending', 'accepted')
    and invitation.expires_at > p_now
  order by invitation.created_at desc
  limit 200
$$;

revoke all on function public.homesrolo_list_authorized_professional_invitations(
  text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_list_authorized_professional_invitations(
  text, timestamptz
) to service_role;

commit;
