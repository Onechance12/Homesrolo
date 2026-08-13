begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homesrolo-homeowner-private',
  'homesrolo-homeowner-private',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.homesrolo_homeowner_projects
  add constraint homesrolo_homeowner_projects_ref_home_unique unique (project_ref, home_ref);

create table if not exists public.homesrolo_homeowner_artifacts (
  artifact_ref text primary key check (artifact_ref ~ '^hart_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text,
  controller_principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('photo', 'document', 'warranty')),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  media_type text not null check (media_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_length integer not null check (byte_length between 1 and 26214400),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  storage_object_ref text not null unique check (storage_object_ref ~ '^hobj_[A-Za-z0-9_-]{43}$'),
  storage_key text not null unique check (storage_key ~ '^hhom_[A-Za-z0-9_-]{43}/hobj_[A-Za-z0-9_-]{43}$'),
  content_class text not null default 'homeowner_private' check (content_class = 'homeowner_private'),
  state text not null check (state in ('uploading', 'available')),
  created_at timestamptz not null,
  available_at timestamptz,
  unique (controller_principal_ref, command_ref),
  foreign key (project_ref, home_ref)
    references public.homesrolo_homeowner_projects(project_ref, home_ref),
  check (storage_key = home_ref || '/' || storage_object_ref),
  check ((state = 'available') = (available_at is not null))
);

create index if not exists homesrolo_homeowner_artifacts_home_created_idx
  on public.homesrolo_homeowner_artifacts(home_ref, created_at desc)
  where state = 'available';

alter table public.homesrolo_homeowner_artifacts enable row level security;
revoke all on table public.homesrolo_homeowner_artifacts from public, anon, authenticated;
grant select, insert, update on table public.homesrolo_homeowner_artifacts to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in ('home.create', 'intake.record', 'project.create', 'artifact.upload'));

create or replace function public.homesrolo_reserve_homeowner_artifact_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_artifact_ref text,
  p_project_ref text,
  p_kind text,
  p_display_name text,
  p_media_type text,
  p_byte_length integer,
  p_payload_sha256 text,
  p_storage_object_ref text,
  p_storage_key text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_artifact public.homesrolo_homeowner_artifacts%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':artifact.upload', 0)
  );

  select * into v_artifact from public.homesrolo_homeowner_artifacts
  where controller_principal_ref = p_principal_ref and command_ref = p_command_ref;
  if found then
    if v_artifact.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return to_jsonb(v_artifact);
  end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then
    raise exception 'membership_not_authorized';
  end if;

  if p_project_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
  ) then
    raise exception 'project_not_in_home';
  end if;

  insert into public.homesrolo_homeowner_artifacts (
    artifact_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, kind, display_name, media_type, byte_length,
    payload_sha256, storage_object_ref, storage_key, content_class, state, created_at
  ) values (
    p_artifact_ref, p_home_ref, p_project_ref, p_principal_ref,
    p_command_ref, p_command_digest, p_kind, btrim(p_display_name), p_media_type,
    p_byte_length, p_payload_sha256, p_storage_object_ref, p_storage_key,
    'homeowner_private', 'uploading', p_requested_at
  ) returning * into v_artifact;
  return to_jsonb(v_artifact);
end;
$$;

create or replace function public.homesrolo_finalize_homeowner_artifact_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_artifact_ref text,
  p_storage_object_ref text,
  p_completed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_artifact public.homesrolo_homeowner_artifacts%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':artifact.upload', 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then
    raise exception 'membership_not_authorized';
  end if;

  select * into v_artifact from public.homesrolo_homeowner_artifacts
  where artifact_ref = p_artifact_ref
    and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest
    and storage_object_ref = p_storage_object_ref
  for update;
  if not found then raise exception 'artifact_reservation_not_found'; end if;

  if v_artifact.state <> 'available' then
    update public.homesrolo_homeowner_artifacts
    set state = 'available', available_at = p_completed_at
    where artifact_ref = p_artifact_ref
    returning * into v_artifact;
    update public.homesrolo_private_homes
    set updated_at = p_completed_at
    where home_ref = p_home_ref;
  end if;

  v_result := to_jsonb(v_artifact);
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'artifact.upload', p_command_digest, v_result, p_completed_at
  ) on conflict (principal_ref, command_ref, action) do nothing;
  return v_result;
end;
$$;

revoke all on function public.homesrolo_reserve_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, text, text, text, integer,
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_finalize_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_reserve_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, text, text, text, integer,
  text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_finalize_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, timestamptz
) to service_role;

commit;
