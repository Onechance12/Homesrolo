begin;

-- Household collaboration extends the existing exact-home membership. It is
-- not a second account system and it never creates access through a Pro table.
alter table public.homesrolo_homeowner_memberships
  add column if not exists display_label text not null default 'Home admin';
alter table public.homesrolo_homeowner_memberships
  drop constraint if exists homesrolo_homeowner_memberships_display_label_check;
alter table public.homesrolo_homeowner_memberships
  add constraint homesrolo_homeowner_memberships_display_label_check check (
    length(btrim(display_label)) between 1 and 60
    and display_label !~ '[[:cntrl:]@:/]'
  );

create table public.homesrolo_household_invitations (
  invitation_ref text primary key check (invitation_ref ~ '^hhiv_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref) on delete cascade,
  invited_by_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  invitee_email_hash text not null check (invitee_email_hash ~ '^[a-f0-9]{64}$'),
  invitee_display_label text not null check (
    length(btrim(invitee_display_label)) between 1 and 60
    and invitee_display_label !~ '[[:cntrl:]@:/]'
  ),
  desired_role text not null check (desired_role in ('member', 'viewer')),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  accepted_by_principal_ref text
    references public.homesrolo_homeowner_principals(principal_ref),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (invited_by_principal_ref, command_ref),
  check (expires_at > created_at),
  check (
    (status = 'accepted') =
      (accepted_by_principal_ref is not null and accepted_at is not null)
  ),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (status = 'accepted' or accepted_by_principal_ref is null),
  check (status = 'accepted' or accepted_at is null),
  check (status = 'revoked' or revoked_at is null)
);

create unique index homesrolo_household_one_pending_email_idx
  on public.homesrolo_household_invitations(home_ref, invitee_email_hash)
  where status = 'pending';
create index homesrolo_household_invitations_home_idx
  on public.homesrolo_household_invitations(home_ref, created_at desc);

-- Receipts contain only the safe response projection. Raw email, its HMAC,
-- principal identities, and bearer secrets are never recorded in result.
create table public.homesrolo_household_command_receipts (
  actor_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  action text not null check (action in (
    'household.invitation.create', 'household.invitation.accept',
    'household.invitation.revoke', 'household.member.remove',
    'household.member.role.set'
  )),
  home_ref text not null references public.homesrolo_private_homes(home_ref) on delete cascade,
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (
    jsonb_typeof(result) = 'object'
    and not (result ?| array[
      'principalRef', 'principal_ref', 'email', 'emailCanonical',
      'emailHash', 'inviteeEmailHash', 'token', 'secret'
    ])
  ),
  created_at timestamptz not null,
  primary key (actor_principal_ref, command_ref, action)
);

alter table public.homesrolo_household_invitations enable row level security;
alter table public.homesrolo_household_command_receipts enable row level security;
revoke all on table public.homesrolo_household_invitations
  from public, anon, authenticated, service_role;
revoke all on table public.homesrolo_household_command_receipts
  from public, anon, authenticated, service_role;
grant select on table public.homesrolo_household_invitations to service_role;
grant select on table public.homesrolo_household_command_receipts to service_role;

create or replace function public.homesrolo_household_instant(p_value timestamptz)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create or replace function public.homesrolo_household_member_json(
  p_member public.homesrolo_homeowner_memberships,
  p_current_principal_ref text
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'recordVersion', 'homeowner-household.v1',
    'membershipRef', p_member.membership_ref,
    'homeRef', p_member.home_ref,
    'displayLabel', p_member.display_label,
    'role', p_member.role,
    'state', p_member.state,
    'isCurrentPrincipal', p_member.principal_ref = p_current_principal_ref,
    'revision', p_member.revision,
    'joinedAt', public.homesrolo_household_instant(p_member.created_at),
    'revokedAt', case when p_member.revoked_at is null then null
      else public.homesrolo_household_instant(p_member.revoked_at) end
  ));
$$;

create or replace function public.homesrolo_household_invitation_json(
  p_invitation public.homesrolo_household_invitations,
  p_now timestamptz
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'recordVersion', 'homeowner-household.v1',
    'invitationRef', p_invitation.invitation_ref,
    'homeRef', p_invitation.home_ref,
    'inviteeDisplayLabel', p_invitation.invitee_display_label,
    'desiredRole', p_invitation.desired_role,
    'status', case
      when p_invitation.status = 'pending' and p_invitation.expires_at <= p_now
        then 'expired'
      else p_invitation.status
    end,
    'expiresAt', public.homesrolo_household_instant(p_invitation.expires_at),
    'revision', p_invitation.revision,
    'createdAt', public.homesrolo_household_instant(p_invitation.created_at),
    'acceptedAt', case when p_invitation.accepted_at is null then null
      else public.homesrolo_household_instant(p_invitation.accepted_at) end,
    'revokedAt', case when p_invitation.revoked_at is null then null
      else public.homesrolo_household_instant(p_invitation.revoked_at) end
  ));
$$;

-- Any active exact-home member may see safe household labels. No identity row,
-- email, HMAC, or invitation secret is present in the result.
create or replace function public.homesrolo_list_household(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_members jsonb;
  v_invitations jsonb;
begin
  if not exists (
    select 1
    from public.homesrolo_homeowner_principals principal
    join public.homesrolo_homeowner_memberships membership
      on membership.principal_ref = principal.principal_ref
    where principal.principal_ref = p_principal_ref
      and principal.status = 'active'
      and principal.email_verified = true
      and membership.membership_ref = p_membership_ref
      and membership.home_ref = p_home_ref
      and membership.revision = p_membership_revision
      and membership.state = 'active'
      and membership.role in ('workspace_controller', 'member', 'viewer')
  ) then raise exception 'household_membership_not_authorized'; end if;

  select coalesce(jsonb_agg(
    public.homesrolo_household_member_json(member, p_principal_ref)
    order by case member.role when 'workspace_controller' then 0 when 'member' then 1 else 2 end,
      member.created_at, member.membership_ref
  ), '[]'::jsonb)
  into v_members
  from public.homesrolo_homeowner_memberships member
  where member.home_ref = p_home_ref and member.state = 'active';

  select coalesce(jsonb_agg(
    public.homesrolo_household_invitation_json(invitation, p_now)
    order by invitation.created_at desc, invitation.invitation_ref
  ), '[]'::jsonb)
  into v_invitations
  from (
    select * from public.homesrolo_household_invitations
    where home_ref = p_home_ref
    order by created_at desc, invitation_ref
    limit 24
  ) invitation;

  return jsonb_build_object(
    'recordVersion', 'homeowner-household.v1',
    'homeRef', p_home_ref,
    'members', v_members,
    'invitations', v_invitations
  );
end;
$$;

create or replace function public.homesrolo_create_household_invitation(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_invitee_email_hash text,
  p_invitee_display_label text,
  p_desired_role text,
  p_expires_at timestamptz,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_household_command_receipts%rowtype;
  v_invitation public.homesrolo_household_invitations%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_principal_ref || ':' || p_command_ref || ':household.invitation.create', 0
  ));
  select * into v_receipt
  from public.homesrolo_household_command_receipts
  where actor_principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'household.invitation.create';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    if v_receipt.home_ref <> p_home_ref then raise exception 'household_scope_mismatch'; end if;
    return v_receipt.result;
  end if;

  if p_invitee_email_hash !~ '^[a-f0-9]{64}$'
    or p_desired_role not in ('member', 'viewer')
    or p_expires_at <= p_requested_at
    or p_expires_at > p_requested_at + interval '14 days'
    or length(btrim(p_invitee_display_label)) not between 1 and 60
    or p_invitee_display_label ~ '[[:cntrl:]@:/]'
  then raise exception 'invalid_household_invitation'; end if;

  if not exists (
    select 1
    from public.homesrolo_homeowner_principals principal
    join public.homesrolo_homeowner_memberships membership
      on membership.principal_ref = principal.principal_ref
    where principal.principal_ref = p_principal_ref
      and principal.status = 'active' and principal.email_verified = true
      and membership.membership_ref = p_membership_ref
      and membership.home_ref = p_home_ref
      and membership.revision = p_membership_revision
      and membership.state = 'active'
      and membership.role = 'workspace_controller'
  ) then raise exception 'household_controller_not_authorized'; end if;

  -- Membership acceptance and invitation creation both consume capacity for
  -- this home. Serialize those decisions so concurrent commands cannot each
  -- observe the same final slot and exceed the public 24-member/invite cap.
  perform pg_advisory_xact_lock(hashtextextended(
    p_home_ref || ':household.capacity', 0
  ));

  if (select count(*) from public.homesrolo_homeowner_memberships
      where home_ref = p_home_ref and state = 'active') >= 24
  then raise exception 'household_member_limit_reached'; end if;
  if (select count(*) from public.homesrolo_household_invitations
      where home_ref = p_home_ref and status = 'pending' and expires_at > p_requested_at) >= 24
  then raise exception 'household_invitation_limit_reached'; end if;
  if exists (
    select 1 from public.homesrolo_household_invitations
    where home_ref = p_home_ref and invitee_email_hash = p_invitee_email_hash
      and status = 'pending' and expires_at > p_requested_at
  ) then raise exception 'household_invitation_already_pending'; end if;

  -- Expired rows no longer block a replacement invitation.
  update public.homesrolo_household_invitations
  set status = 'expired', revision = revision + 1
  where home_ref = p_home_ref and invitee_email_hash = p_invitee_email_hash
    and status = 'pending' and expires_at <= p_requested_at;

  insert into public.homesrolo_household_invitations (
    invitation_ref, home_ref, invited_by_principal_ref, invitee_email_hash,
    invitee_display_label, desired_role, command_ref, command_digest, status,
    expires_at, revision, created_at
  ) values (
    p_invitation_ref, p_home_ref, p_principal_ref, p_invitee_email_hash,
    btrim(p_invitee_display_label), p_desired_role, p_command_ref,
    p_command_digest, 'pending', p_expires_at, 1, p_requested_at
  ) returning * into v_invitation;

  v_result := public.homesrolo_household_invitation_json(v_invitation, p_requested_at);
  insert into public.homesrolo_household_command_receipts (
    actor_principal_ref, command_ref, action, home_ref, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'household.invitation.create', p_home_ref,
    p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_accept_household_invitation(
  p_principal_ref text,
  p_email_canonical text,
  p_invitee_email_hash text,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_membership_ref text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_household_command_receipts%rowtype;
  v_invitation public.homesrolo_household_invitations%rowtype;
  v_member public.homesrolo_homeowner_memberships%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_principal_ref || ':' || p_command_ref || ':household.invitation.accept', 0
  ));
  select * into v_receipt
  from public.homesrolo_household_command_receipts
  where actor_principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'household.invitation.accept';
  if found then
    if v_receipt.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return v_receipt.result;
  end if;

  if p_email_canonical <> lower(btrim(p_email_canonical))
    or p_invitee_email_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.homesrolo_homeowner_principals
      where principal_ref = p_principal_ref
        and email_canonical = p_email_canonical
        and status = 'active' and email_verified = true
    )
  then raise exception 'household_invitee_not_authorized'; end if;

  select * into v_invitation
  from public.homesrolo_household_invitations
  where invitation_ref = p_invitation_ref;
  if not found then raise exception 'household_invitation_not_found'; end if;

  -- Acquire the home lock before the invitation row lock. Invitation creation
  -- uses the same order when expiring an old row, avoiding a row/advisory-lock
  -- cycle between create and accept.
  perform pg_advisory_xact_lock(hashtextextended(
    v_invitation.home_ref || ':household.capacity', 0
  ));

  select * into v_invitation
  from public.homesrolo_household_invitations
  where invitation_ref = p_invitation_ref
  for update;
  if not found then raise exception 'household_invitation_not_found'; end if;
  if v_invitation.invitee_email_hash <> p_invitee_email_hash then
    raise exception 'household_invitation_email_mismatch';
  end if;
  if v_invitation.status <> 'pending' then raise exception 'household_invitation_not_pending'; end if;
  if v_invitation.expires_at <= p_requested_at then
    raise exception 'household_invitation_expired';
  end if;

  if (select count(*) from public.homesrolo_homeowner_memberships
      where home_ref = v_invitation.home_ref and state = 'active') >= 24
  then raise exception 'household_member_limit_reached'; end if;

  select * into v_member
  from public.homesrolo_homeowner_memberships
  where principal_ref = p_principal_ref and home_ref = v_invitation.home_ref
  for update;
  if found and v_member.state = 'active' then
    raise exception 'household_membership_already_active';
  elsif found then
    update public.homesrolo_homeowner_memberships
    set role = v_invitation.desired_role,
      basis = 'accepted_invitation',
      state = 'active',
      relationship_label = 'invited_participant',
      display_label = v_invitation.invitee_display_label,
      revision = revision + 1,
      revoked_at = null
    where membership_ref = v_member.membership_ref
    returning * into v_member;
  else
    insert into public.homesrolo_homeowner_memberships (
      membership_ref, principal_ref, home_ref, role, basis, state,
      relationship_label, display_label, revision, created_at
    ) values (
      p_membership_ref, p_principal_ref, v_invitation.home_ref,
      v_invitation.desired_role, 'accepted_invitation', 'active',
      'invited_participant', v_invitation.invitee_display_label, 1, p_requested_at
    ) returning * into v_member;
  end if;

  update public.homesrolo_household_invitations
  set status = 'accepted', accepted_by_principal_ref = p_principal_ref,
    accepted_at = p_requested_at, revision = revision + 1
  where invitation_ref = v_invitation.invitation_ref
  returning * into v_invitation;

  v_result := jsonb_build_object(
    'member', public.homesrolo_household_member_json(v_member, p_principal_ref),
    'invitation', public.homesrolo_household_invitation_json(v_invitation, p_requested_at)
  );
  insert into public.homesrolo_household_command_receipts (
    actor_principal_ref, command_ref, action, home_ref, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'household.invitation.accept',
    v_invitation.home_ref, p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_revoke_household_invitation(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_invitation_ref text,
  p_expected_revision integer,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_household_command_receipts%rowtype;
  v_invitation public.homesrolo_household_invitations%rowtype;
  v_result jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_principal_ref || ':' || p_command_ref || ':household.invitation.revoke', 0
  ));
  select * into v_receipt from public.homesrolo_household_command_receipts
  where actor_principal_ref = p_principal_ref and command_ref = p_command_ref
    and action = 'household.invitation.revoke';
  if found then
    if v_receipt.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    if v_receipt.home_ref <> p_home_ref then raise exception 'household_scope_mismatch'; end if;
    return v_receipt.result;
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_principals principal
    join public.homesrolo_homeowner_memberships membership
      on membership.principal_ref = principal.principal_ref
    where principal.principal_ref = p_principal_ref
      and principal.status = 'active' and principal.email_verified = true
      and membership.membership_ref = p_membership_ref
      and membership.home_ref = p_home_ref
      and membership.revision = p_membership_revision
      and membership.state = 'active' and membership.role = 'workspace_controller'
  ) then raise exception 'household_controller_not_authorized'; end if;

  select * into v_invitation from public.homesrolo_household_invitations
  where invitation_ref = p_invitation_ref and home_ref = p_home_ref for update;
  if not found then raise exception 'household_invitation_not_found'; end if;
  if v_invitation.revision <> p_expected_revision then raise exception 'household_revision_conflict'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= p_requested_at then
    raise exception 'household_invitation_not_pending';
  end if;

  update public.homesrolo_household_invitations
  set status = 'revoked', revoked_at = p_requested_at, revision = revision + 1
  where invitation_ref = p_invitation_ref returning * into v_invitation;
  v_result := public.homesrolo_household_invitation_json(v_invitation, p_requested_at);
  insert into public.homesrolo_household_command_receipts (
    actor_principal_ref, command_ref, action, home_ref, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'household.invitation.revoke', p_home_ref,
    p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_remove_household_member(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_target_membership_ref text,
  p_expected_revision integer,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_household_command_receipts%rowtype;
  v_target public.homesrolo_homeowner_memberships%rowtype;
  v_result jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_home_ref || ':household.members', 0));
  select * into v_receipt from public.homesrolo_household_command_receipts
  where actor_principal_ref = p_principal_ref and command_ref = p_command_ref
    and action = 'household.member.remove';
  if found then
    if v_receipt.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    if v_receipt.home_ref <> p_home_ref then raise exception 'household_scope_mismatch'; end if;
    return v_receipt.result;
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_principals principal
    join public.homesrolo_homeowner_memberships membership
      on membership.principal_ref = principal.principal_ref
    where principal.principal_ref = p_principal_ref
      and principal.status = 'active' and principal.email_verified = true
      and membership.membership_ref = p_membership_ref
      and membership.home_ref = p_home_ref
      and membership.revision = p_membership_revision
      and membership.state = 'active' and membership.role = 'workspace_controller'
  ) then raise exception 'household_controller_not_authorized'; end if;

  select * into v_target from public.homesrolo_homeowner_memberships
  where membership_ref = p_target_membership_ref and home_ref = p_home_ref for update;
  if not found then raise exception 'household_member_not_found'; end if;
  if v_target.revision <> p_expected_revision then raise exception 'household_revision_conflict'; end if;
  if v_target.state <> 'active' then raise exception 'household_member_not_active'; end if;
  if v_target.role = 'workspace_controller' and not exists (
    select 1 from public.homesrolo_homeowner_memberships other
    where other.home_ref = p_home_ref and other.state = 'active'
      and other.role = 'workspace_controller'
      and other.membership_ref <> v_target.membership_ref
  ) then raise exception 'last_household_controller_required'; end if;

  update public.homesrolo_homeowner_memberships
  set state = 'revoked', revoked_at = p_requested_at, revision = revision + 1
  where membership_ref = v_target.membership_ref returning * into v_target;
  v_result := public.homesrolo_household_member_json(v_target, p_principal_ref);
  insert into public.homesrolo_household_command_receipts (
    actor_principal_ref, command_ref, action, home_ref, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'household.member.remove', p_home_ref,
    p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_set_household_member_role(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_target_membership_ref text,
  p_expected_revision integer,
  p_desired_role text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_household_command_receipts%rowtype;
  v_target public.homesrolo_homeowner_memberships%rowtype;
  v_result jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;
  if p_desired_role is null
    or p_desired_role not in ('workspace_controller', 'member', 'viewer') then
    raise exception 'invalid_household_role';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_home_ref || ':household.members', 0));
  select * into v_receipt from public.homesrolo_household_command_receipts
  where actor_principal_ref = p_principal_ref and command_ref = p_command_ref
    and action = 'household.member.role.set';
  if found then
    if v_receipt.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    if v_receipt.home_ref <> p_home_ref then raise exception 'household_scope_mismatch'; end if;
    return v_receipt.result;
  end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_principals principal
    join public.homesrolo_homeowner_memberships membership
      on membership.principal_ref = principal.principal_ref
    where principal.principal_ref = p_principal_ref
      and principal.status = 'active' and principal.email_verified = true
      and membership.membership_ref = p_membership_ref
      and membership.home_ref = p_home_ref
      and membership.revision = p_membership_revision
      and membership.state = 'active' and membership.role = 'workspace_controller'
  ) then raise exception 'household_controller_not_authorized'; end if;

  select * into v_target from public.homesrolo_homeowner_memberships
  where membership_ref = p_target_membership_ref and home_ref = p_home_ref for update;
  if not found then raise exception 'household_member_not_found'; end if;
  if v_target.revision <> p_expected_revision then raise exception 'household_revision_conflict'; end if;
  if v_target.state <> 'active' then raise exception 'household_member_not_active'; end if;
  if v_target.role = 'workspace_controller' and p_desired_role <> 'workspace_controller'
    and not exists (
      select 1 from public.homesrolo_homeowner_memberships other
      where other.home_ref = p_home_ref and other.state = 'active'
        and other.role = 'workspace_controller'
        and other.membership_ref <> v_target.membership_ref
    )
  then raise exception 'last_household_controller_required'; end if;

  if v_target.role <> p_desired_role then
    update public.homesrolo_homeowner_memberships
    set role = p_desired_role, revision = revision + 1
    where membership_ref = v_target.membership_ref returning * into v_target;
  end if;
  v_result := public.homesrolo_household_member_json(v_target, p_principal_ref);
  insert into public.homesrolo_household_command_receipts (
    actor_principal_ref, command_ref, action, home_ref, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'household.member.role.set', p_home_ref,
    p_command_digest, v_result, p_requested_at
  );
  return v_result;
end;
$$;

-- Defense in depth for any future definer function that updates membership.
create or replace function public.homesrolo_guard_last_household_controller()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.state = 'active' and old.role = 'workspace_controller'
    and (new.state <> 'active' or new.role <> 'workspace_controller')
    and not exists (
      select 1 from public.homesrolo_homeowner_memberships other
      where other.home_ref = old.home_ref and other.state = 'active'
        and other.role = 'workspace_controller'
        and other.membership_ref <> old.membership_ref
    )
  then raise exception 'last_household_controller_required'; end if;
  return new;
end;
$$;

drop trigger if exists homesrolo_last_household_controller_guard
  on public.homesrolo_homeowner_memberships;
create trigger homesrolo_last_household_controller_guard
before update on public.homesrolo_homeowner_memberships
for each row execute function public.homesrolo_guard_last_household_controller();

revoke all on function public.homesrolo_household_instant(timestamptz)
  from public, anon, authenticated;
revoke all on function public.homesrolo_household_member_json(
  public.homesrolo_homeowner_memberships, text
) from public, anon, authenticated;
revoke all on function public.homesrolo_household_invitation_json(
  public.homesrolo_household_invitations, timestamptz
) from public, anon, authenticated;

revoke all on function public.homesrolo_list_household(text, text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.homesrolo_list_household(text, text, text, integer, timestamptz)
  to service_role;
revoke all on function public.homesrolo_create_household_invitation(
  text, text, text, integer, text, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_create_household_invitation(
  text, text, text, integer, text, text, text, text, text, text, timestamptz, timestamptz
) to service_role;
revoke all on function public.homesrolo_accept_household_invitation(
  text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_accept_household_invitation(
  text, text, text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.homesrolo_revoke_household_invitation(
  text, text, text, integer, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_revoke_household_invitation(
  text, text, text, integer, text, text, text, integer, timestamptz
) to service_role;
revoke all on function public.homesrolo_remove_household_member(
  text, text, text, integer, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_remove_household_member(
  text, text, text, integer, text, text, text, integer, timestamptz
) to service_role;
revoke all on function public.homesrolo_set_household_member_role(
  text, text, text, integer, text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_set_household_member_role(
  text, text, text, integer, text, text, text, integer, text, timestamptz
) to service_role;

commit;
