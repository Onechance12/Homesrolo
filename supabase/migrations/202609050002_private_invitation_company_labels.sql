begin;

-- A private invitation is a retained relationship, not a directory search
-- result. Keep its company label even if the company unpublishes, renames, or
-- changes trades. No additional public profile data or access is exposed.
alter table public.homesrolo_project_invitations
  add column professional_display_label text;

-- Older invitations did not capture a label. Their original spelling cannot
-- be reconstructed reliably, so retain the exact related company's current
-- label once at cutover, rather than guessing from a later proposal.
update public.homesrolo_project_invitations invitation
set professional_display_label = btrim(organization.display_name)
from public.homesrolo_professional_organizations organization
where organization.organization_ref = invitation.professional_organization_ref;

alter table public.homesrolo_project_invitations
  alter column professional_display_label set not null,
  add constraint homesrolo_project_invitations_display_label_check
    check (professional_display_label = btrim(professional_display_label)
      and length(professional_display_label) between 1 and 120);

create or replace function public.homesrolo_capture_invitation_company_label()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Never trust a caller-supplied label. The existing invitation RPC still
    -- verifies the published trade match and exact homeowner authority.
    select btrim(display_name) into new.professional_display_label
    from public.homesrolo_professional_organizations
    where organization_ref = new.professional_organization_ref
    for share;
    if not found then raise exception 'professional_profile_not_found'; end if;
  elsif new.professional_display_label is distinct from old.professional_display_label
    or new.professional_organization_ref is distinct from old.professional_organization_ref then
    raise exception 'invitation_company_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger homesrolo_invitation_company_label_guard
before insert or update of professional_display_label, professional_organization_ref
on public.homesrolo_project_invitations
for each row execute function public.homesrolo_capture_invitation_company_label();

revoke all on function public.homesrolo_capture_invitation_company_label()
  from public, anon, authenticated, service_role;

commit;
