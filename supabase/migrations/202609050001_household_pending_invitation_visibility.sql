begin;

-- Deploy the compatible roster reader first: it accepts 24 live invitations
-- plus 24 history rows. Pending access must never disappear behind history.
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

  with live_invitations as (
    -- Creation/acceptance enforce a home-scoped cap of 24 active invitations.
    -- Do not apply a history-dependent limit to these actionable rows.
    select * from public.homesrolo_household_invitations
    where home_ref = p_home_ref
      and status = 'pending' and expires_at > p_now
  ), recent_history as (
    select * from public.homesrolo_household_invitations
    where home_ref = p_home_ref
      and (status <> 'pending' or expires_at <= p_now)
    order by created_at desc, invitation_ref
    limit 24
  ), visible_invitations as (
    select * from live_invitations
    union all
    select * from recent_history
  )
  select coalesce(jsonb_agg(
    public.homesrolo_household_invitation_json(invitation, p_now)
    order by case when invitation.status = 'pending' and invitation.expires_at > p_now
      then 0 else 1 end, invitation.created_at desc, invitation.invitation_ref
  ), '[]'::jsonb)
  into v_invitations
  from visible_invitations invitation;

  return jsonb_build_object(
    'recordVersion', 'homeowner-household.v1',
    'homeRef', p_home_ref,
    'members', v_members,
    'invitations', v_invitations
  );
end;
$$;

revoke all on function public.homesrolo_list_household(
  text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_list_household(
  text, text, text, integer, timestamptz
) to service_role;

commit;
