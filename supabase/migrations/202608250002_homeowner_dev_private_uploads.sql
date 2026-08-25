begin;

-- Development-only direct-upload lane. Browsers receive a short-lived signed
-- PUT for one opaque key in this non-public bucket. The service role remains
-- the only database/storage reader; no public or authenticated Storage policy
-- is created.
create table if not exists public.homesrolo_homeowner_retired_upload_buckets (
  bucket_id text primary key,
  retired_at timestamptz not null
);
alter table public.homesrolo_homeowner_retired_upload_buckets enable row level security;
revoke all on table public.homesrolo_homeowner_retired_upload_buckets
  from public, anon, authenticated;
grant select, insert on table public.homesrolo_homeowner_retired_upload_buckets
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'homesrolo-homeowner-dev-uploads',
  'homesrolo-homeowner-dev-uploads',
  false,
  10485760,
  array['application/octet-stream']
where not exists (
  select 1 from public.homesrolo_homeowner_retired_upload_buckets
  where bucket_id = 'homesrolo-homeowner-dev-uploads'
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (
    select 1 from public.homesrolo_homeowner_retired_upload_buckets retired
    join storage.buckets bucket on bucket.id = retired.bucket_id
    where retired.bucket_id = 'homesrolo-homeowner-dev-uploads'
  ) then
    raise exception 'retired_upload_bucket_recreated';
  end if;
end;
$$;

alter table public.homesrolo_homeowner_artifacts
  add column if not exists storage_bucket text not null
    default 'homesrolo-homeowner-private';
alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_storage_bucket_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_storage_bucket_check check (
    storage_bucket in (
      'homesrolo-homeowner-private',
      'homesrolo-homeowner-dev-uploads'
    )
  );

-- There is intentionally no automatic cleanup or quota release. Supabase's
-- signed upload endpoint does not expose a provider-enforced body deadline, so
-- a PUT authorized before token expiry could finish much later. Charging every
-- reservation forever keeps every possible late object known and bounded.
create table if not exists public.homesrolo_homeowner_dev_upload_reservations (
  artifact_ref text primary key check (artifact_ref ~ '^hart_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  project_ref text,
  uploader_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  membership_ref text not null check (membership_ref ~ '^hmbr_[A-Za-z0-9_-]{43}$'),
  membership_revision integer not null check (membership_revision >= 1),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('photo', 'document', 'warranty')),
  display_name text not null check (
    display_name = btrim(display_name)
    and length(display_name) between 1 and 160
    and display_name !~ '[[:cntrl:]]'
  ),
  declared_media_type text not null
    check (declared_media_type in ('application/pdf', 'image/jpeg', 'image/png')),
  declared_byte_length integer not null check (declared_byte_length between 1 and 10485760),
  declared_payload_sha256 text not null check (declared_payload_sha256 ~ '^[a-f0-9]{64}$'),
  storage_object_ref text not null unique check (storage_object_ref ~ '^hobj_[A-Za-z0-9_-]{43}$'),
  storage_key text not null unique
    check (storage_key = home_ref || '/' || storage_object_ref),
  storage_bucket text not null default 'homesrolo-homeowner-dev-uploads'
    check (storage_bucket = 'homesrolo-homeowner-dev-uploads'),
  authorized_byte_length integer not null default 10485760
    check (authorized_byte_length = 10485760),
  quota_released_at timestamptz,
  signed_upload_issuance_count integer not null default 0
    check (signed_upload_issuance_count between 0 and 3),
  latest_upload_expires_at timestamptz,
  completion_claim_count integer not null default 0
    check (completion_claim_count between 0 and 3),
  completion_lease_token text
    check (completion_lease_token is null or completion_lease_token ~ '^hles_[A-Za-z0-9_-]{43}$'),
  completion_lease_expires_at timestamptz,
  retry_not_before timestamptz,
  state text not null check (state in ('reserved', 'processing', 'available', 'rejected')),
  rejection_reason text check (
    rejection_reason is null or rejection_reason in ('descriptor_mismatch', 'content_rejected')
  ),
  created_at timestamptz not null,
  state_changed_at timestamptz not null,
  available_at timestamptz,
  rejected_at timestamptz,
  unique (uploader_principal_ref, command_ref),
  foreign key (project_ref, home_ref)
    references public.homesrolo_homeowner_projects(project_ref, home_ref),
  check (
    (state = 'processing'
      and completion_lease_token is not null
      and completion_lease_expires_at is not null)
    or
    (state <> 'processing'
      and completion_lease_token is null
      and completion_lease_expires_at is null)
  ),
  check ((state = 'available') = (available_at is not null)),
  check ((state = 'rejected') = (rejected_at is not null and rejection_reason is not null)),
  check (completion_claim_count <= signed_upload_issuance_count),
  check (latest_upload_expires_at is not null or signed_upload_issuance_count = 0),
  check (state_changed_at >= created_at)
);

create index if not exists homesrolo_dev_upload_home_idx
  on public.homesrolo_homeowner_dev_upload_reservations(home_ref, created_at desc);
create index if not exists homesrolo_dev_upload_live_lease_idx
  on public.homesrolo_homeowner_dev_upload_reservations(completion_lease_expires_at)
  where state = 'processing';

alter table public.homesrolo_homeowner_dev_upload_reservations enable row level security;
revoke all on table public.homesrolo_homeowner_dev_upload_reservations
  from public, anon, authenticated;
grant select, insert, update on table public.homesrolo_homeowner_dev_upload_reservations
  to service_role;

create or replace function public.homesrolo_reserve_dev_homeowner_artifact_upload(
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
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
  v_home_bytes bigint;
  v_principal_bytes bigint;
  v_global_bytes bigint;
begin
  if p_requested_at < v_now - interval '5 minutes'
    or p_requested_at > v_now + interval '5 minutes' then
    raise exception 'invalid_upload_time';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:dev-private-uploads:global', 0));
  if not exists (
    select 1 from storage.buckets where id = 'homesrolo-homeowner-dev-uploads'
  ) or exists (
    select 1 from public.homesrolo_homeowner_retired_upload_buckets
    where bucket_id = 'homesrolo-homeowner-dev-uploads'
  ) then raise exception 'upload_bucket_retired'; end if;

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_upload
  from public.homesrolo_homeowner_dev_upload_reservations
  where uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
  for update;
  if found then
    if v_upload.home_ref <> p_home_ref then raise exception 'command_scope_mismatch'; end if;
    if v_upload.command_digest <> p_command_digest then raise exception 'command_digest_mismatch'; end if;
    if v_upload.state = 'rejected' then raise exception 'upload_rejected'; end if;
    if v_upload.state = 'processing'
      and v_upload.completion_lease_expires_at <= v_now then
      update public.homesrolo_homeowner_dev_upload_reservations
      set state = 'reserved', completion_lease_token = null,
          completion_lease_expires_at = null, state_changed_at = v_now
      where artifact_ref = v_upload.artifact_ref
      returning * into v_upload;
    elsif v_upload.state = 'processing' then
      raise exception 'completion_in_progress';
    end if;
    return to_jsonb(v_upload);
  end if;

  if p_project_ref is not null and not exists (
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
  ) then raise exception 'project_not_in_home'; end if;

  -- Existing private objects plus every permanently charged development slot
  -- share conservative home/principal/global storage ceilings.
  select
    coalesce((select sum(byte_length) from public.homesrolo_homeowner_artifacts
      where home_ref = p_home_ref
        and storage_bucket <> 'homesrolo-homeowner-dev-uploads'), 0)
    + coalesce((select sum(reserved_byte_length)
      from public.homesrolo_homeowner_checkup_photos
      where home_ref = p_home_ref and objects_cleaned_at is null), 0)
    + coalesce((select sum(authorized_byte_length)
      from public.homesrolo_homeowner_dev_upload_reservations
      where home_ref = p_home_ref and quota_released_at is null), 0)
  into v_home_bytes;
  select
    coalesce((select sum(byte_length) from public.homesrolo_homeowner_artifacts
      where controller_principal_ref = p_principal_ref
        and storage_bucket <> 'homesrolo-homeowner-dev-uploads'), 0)
    + coalesce((select sum(reserved_byte_length)
      from public.homesrolo_homeowner_checkup_photos
      where controller_principal_ref = p_principal_ref and objects_cleaned_at is null), 0)
    + coalesce((select sum(authorized_byte_length)
      from public.homesrolo_homeowner_dev_upload_reservations
      where uploader_principal_ref = p_principal_ref and quota_released_at is null), 0)
  into v_principal_bytes;
  select
    coalesce((select sum(byte_length) from public.homesrolo_homeowner_artifacts
      where storage_bucket <> 'homesrolo-homeowner-dev-uploads'), 0)
    + coalesce((select sum(reserved_byte_length)
      from public.homesrolo_homeowner_checkup_photos where objects_cleaned_at is null), 0)
    + coalesce((select sum(authorized_byte_length)
      from public.homesrolo_homeowner_dev_upload_reservations
      where quota_released_at is null), 0)
  into v_global_bytes;
  if v_home_bytes + 10485760 > 524288000
    or v_principal_bytes + 10485760 > 524288000
    or v_global_bytes + 10485760 > 629145600 then
    raise exception 'upload_quota_exceeded';
  end if;

  insert into public.homesrolo_homeowner_dev_upload_reservations (
    artifact_ref, home_ref, project_ref, uploader_principal_ref,
    membership_ref, membership_revision, command_ref, command_digest,
    kind, display_name, declared_media_type, declared_byte_length,
    declared_payload_sha256, storage_object_ref, storage_key,
    state, created_at, state_changed_at
  ) values (
    p_artifact_ref, p_home_ref, p_project_ref, p_principal_ref,
    p_membership_ref, p_membership_revision, p_command_ref, p_command_digest,
    p_kind, btrim(p_display_name), p_media_type, p_byte_length,
    p_payload_sha256, p_storage_object_ref, p_storage_key,
    'reserved', v_now, v_now
  ) returning * into v_upload;
  return to_jsonb(v_upload);
end;
$$;

-- Quota can be reclaimed only for an entire retired bucket generation. The
-- operator must first disable uploads, preserve/delete any wanted available
-- files, empty and delete the bucket through Storage, and never reuse its id.
-- Checking both Storage absence and zero live artifact references prevents an
-- individual reservation from being released while a signed PUT can still
-- address a valid bucket namespace.
create or replace function public.homesrolo_retire_dev_homeowner_upload_bucket(
  p_bucket_id text,
  p_requested_at timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_released bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:dev-private-uploads:global', 0));
  if p_requested_at < v_now - interval '5 minutes'
    or p_requested_at > v_now + interval '5 minutes'
    or p_bucket_id <> 'homesrolo-homeowner-dev-uploads' then
    raise exception 'invalid_retirement_request';
  end if;
  if exists (select 1 from storage.buckets where id = p_bucket_id) then
    raise exception 'upload_bucket_still_exists';
  end if;
  if exists (
    select 1 from public.homesrolo_homeowner_artifacts
    where storage_bucket = p_bucket_id
  ) then
    raise exception 'artifact_still_references_bucket';
  end if;
  insert into public.homesrolo_homeowner_retired_upload_buckets(bucket_id, retired_at)
  values (p_bucket_id, v_now)
  on conflict (bucket_id) do nothing;
  update public.homesrolo_homeowner_dev_upload_reservations
  set quota_released_at = coalesce(quota_released_at, v_now)
  where storage_bucket = p_bucket_id and quota_released_at is null;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

create or replace function public.homesrolo_issue_dev_homeowner_artifact_token(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_artifact_ref text,
  p_command_ref text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:dev-private-uploads:global', 0));
  if not exists (
    select 1 from storage.buckets where id = 'homesrolo-homeowner-dev-uploads'
  ) or exists (
    select 1 from public.homesrolo_homeowner_retired_upload_buckets
    where bucket_id = 'homesrolo-homeowner-dev-uploads'
  ) then raise exception 'upload_bucket_retired'; end if;
  if p_expires_at < v_now + interval '115 minutes'
    or p_expires_at > v_now + interval '125 minutes' then
    raise exception 'invalid_token_expiry';
  end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_upload
  from public.homesrolo_homeowner_dev_upload_reservations
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
    and uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
  for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_upload.state <> 'reserved' then raise exception 'not_issuable'; end if;
  if v_upload.signed_upload_issuance_count >= 3 then raise exception 'issuance_exhausted'; end if;
  update public.homesrolo_homeowner_dev_upload_reservations
  set signed_upload_issuance_count = signed_upload_issuance_count + 1,
      latest_upload_expires_at = greatest(
        coalesce(latest_upload_expires_at, p_expires_at), p_expires_at
      ), state_changed_at = v_now
  where artifact_ref = p_artifact_ref
  returning * into v_upload;
  return to_jsonb(v_upload);
end;
$$;

create or replace function public.homesrolo_claim_dev_homeowner_artifact_completion(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_artifact_ref text,
  p_command_ref text,
  p_lease_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
  v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:dev-private-uploads:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_upload
  from public.homesrolo_homeowner_dev_upload_reservations
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
    and uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
  for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_upload.state = 'available' then return to_jsonb(v_upload); end if;
  if v_upload.state = 'rejected' then raise exception 'upload_rejected'; end if;
  if v_upload.state = 'processing'
    and v_upload.completion_lease_expires_at > v_now then
    raise exception 'completion_in_progress';
  end if;
  if v_upload.retry_not_before is not null and v_upload.retry_not_before > v_now then
    raise exception 'completion_retry_not_ready';
  end if;
  if v_upload.completion_claim_count >= v_upload.signed_upload_issuance_count
    or v_upload.completion_claim_count >= 3 then
    raise exception 'completion_attempt_not_issued';
  end if;
  select count(*) into v_count
  from public.homesrolo_homeowner_dev_upload_reservations
  where artifact_ref <> p_artifact_ref and state = 'processing'
    and completion_lease_expires_at > v_now
    and (home_ref = p_home_ref or uploader_principal_ref = p_principal_ref);
  if v_count > 0 then raise exception 'completion_capacity_limited'; end if;
  select count(*) into v_count
  from public.homesrolo_homeowner_dev_upload_reservations
  where artifact_ref <> p_artifact_ref and state = 'processing'
    and completion_lease_expires_at > v_now;
  if v_count >= 4 then raise exception 'completion_capacity_limited'; end if;
  update public.homesrolo_homeowner_dev_upload_reservations
  set state = 'processing', completion_claim_count = completion_claim_count + 1,
      completion_lease_token = p_lease_token,
      completion_lease_expires_at = v_now + interval '2 minutes',
      state_changed_at = v_now
  where artifact_ref = p_artifact_ref
  returning * into v_upload;
  return to_jsonb(v_upload);
end;
$$;

create or replace function public.homesrolo_release_dev_homeowner_artifact_completion(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_artifact_ref text,
  p_command_ref text,
  p_lease_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
begin
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  update public.homesrolo_homeowner_dev_upload_reservations
  set state = 'reserved', completion_lease_token = null,
      completion_lease_expires_at = null, retry_not_before = v_now + interval '2 seconds',
      state_changed_at = v_now
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
    and uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
    and state = 'processing' and completion_lease_token = p_lease_token
    and completion_lease_expires_at > v_now
  returning * into v_upload;
  if not found then raise exception 'lease_mismatch'; end if;
  return to_jsonb(v_upload);
end;
$$;

create or replace function public.homesrolo_reject_dev_homeowner_artifact_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_artifact_ref text,
  p_command_ref text,
  p_lease_token text,
  p_rejection_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
begin
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  update public.homesrolo_homeowner_dev_upload_reservations
  set state = 'rejected', rejection_reason = p_rejection_reason,
      rejected_at = v_now, completion_lease_token = null,
      completion_lease_expires_at = null, state_changed_at = v_now
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
    and uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
    and state = 'processing' and completion_lease_token = p_lease_token
    and completion_lease_expires_at > v_now
  returning * into v_upload;
  if not found then raise exception 'lease_mismatch'; end if;
  return to_jsonb(v_upload);
end;
$$;

create or replace function public.homesrolo_finalize_dev_homeowner_artifact_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_artifact_ref text,
  p_command_ref text,
  p_command_digest text,
  p_storage_object_ref text,
  p_lease_token text,
  p_verified_media_type text,
  p_verified_byte_length integer,
  p_verified_payload_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_upload public.homesrolo_homeowner_dev_upload_reservations%rowtype;
  v_artifact public.homesrolo_homeowner_artifacts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:dev-private-uploads:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member')
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_upload
  from public.homesrolo_homeowner_dev_upload_reservations
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
    and uploader_principal_ref = p_principal_ref and command_ref = p_command_ref
    and command_digest = p_command_digest and storage_object_ref = p_storage_object_ref
  for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_upload.state = 'available' then
    select * into v_artifact from public.homesrolo_homeowner_artifacts
    where artifact_ref = p_artifact_ref and home_ref = p_home_ref and state = 'available';
    if not found then raise exception 'artifact_not_found'; end if;
    return to_jsonb(v_artifact);
  end if;
  if v_upload.state <> 'processing'
    or v_upload.completion_lease_token <> p_lease_token
    or v_upload.completion_lease_expires_at <= v_now then
    raise exception 'lease_mismatch';
  end if;
  if v_upload.declared_media_type <> p_verified_media_type
    or v_upload.declared_byte_length <> p_verified_byte_length
    or v_upload.declared_payload_sha256 <> p_verified_payload_sha256 then
    raise exception 'descriptor_mismatch';
  end if;

  insert into public.homesrolo_homeowner_artifacts (
    artifact_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, kind, display_name, media_type, byte_length,
    payload_sha256, storage_object_ref, storage_key, storage_bucket,
    content_class, state, created_at, available_at
  ) values (
    v_upload.artifact_ref, v_upload.home_ref, v_upload.project_ref,
    v_upload.uploader_principal_ref, v_upload.command_ref, v_upload.command_digest,
    v_upload.kind, v_upload.display_name, p_verified_media_type,
    p_verified_byte_length, p_verified_payload_sha256,
    v_upload.storage_object_ref, v_upload.storage_key,
    'homesrolo-homeowner-dev-uploads', 'homeowner_private', 'available',
    v_upload.created_at, v_now
  ) returning * into v_artifact;
  update public.homesrolo_homeowner_dev_upload_reservations
  set state = 'available', available_at = v_now,
      completion_lease_token = null, completion_lease_expires_at = null,
      state_changed_at = v_now
  where artifact_ref = p_artifact_ref;
  update public.homesrolo_private_homes set updated_at = v_now where home_ref = p_home_ref;
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'artifact.upload', p_command_digest,
    to_jsonb(v_artifact), v_now
  ) on conflict (principal_ref, command_ref, action) do nothing;
  return to_jsonb(v_artifact);
end;
$$;

revoke all on function public.homesrolo_reserve_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text,text,text,text,integer,text,text,text,timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_issue_dev_homeowner_artifact_token(
  text,text,text,integer,text,text,timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_claim_dev_homeowner_artifact_completion(
  text,text,text,integer,text,text,text
) from public, anon, authenticated;
revoke all on function public.homesrolo_release_dev_homeowner_artifact_completion(
  text,text,text,integer,text,text,text
) from public, anon, authenticated;
revoke all on function public.homesrolo_reject_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.homesrolo_finalize_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text,text,text,integer,text
) from public, anon, authenticated;
revoke all on function public.homesrolo_retire_dev_homeowner_upload_bucket(
  text,timestamptz
) from public, anon, authenticated;

grant execute on function public.homesrolo_reserve_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text,text,text,text,integer,text,text,text,timestamptz
) to service_role;
grant execute on function public.homesrolo_issue_dev_homeowner_artifact_token(
  text,text,text,integer,text,text,timestamptz
) to service_role;
grant execute on function public.homesrolo_claim_dev_homeowner_artifact_completion(
  text,text,text,integer,text,text,text
) to service_role;
grant execute on function public.homesrolo_release_dev_homeowner_artifact_completion(
  text,text,text,integer,text,text,text
) to service_role;
grant execute on function public.homesrolo_reject_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text
) to service_role;
grant execute on function public.homesrolo_finalize_dev_homeowner_artifact_upload(
  text,text,text,integer,text,text,text,text,text,text,integer,text
) to service_role;
grant execute on function public.homesrolo_retire_dev_homeowner_upload_bucket(
  text,timestamptz
) to service_role;

commit;
