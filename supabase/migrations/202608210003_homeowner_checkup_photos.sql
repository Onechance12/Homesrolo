begin;

-- A deliberately small, private beta. The hard caps are below Supabase Free's
-- included storage and cannot be raised from browser input.
create table public.homesrolo_homeowner_checkup_photos (
  photo_ref text primary key check (photo_ref ~ '^hpho_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  controller_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  observed_on date,
  area text check (area is null or area in (
    'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
    'hvac', 'water_heater', 'foundation', 'gutters', 'other'
  )),
  view_label text check (
    view_label is null
    or (view_label = btrim(view_label) and length(view_label) between 1 and 80
      and view_label !~ '[[:cntrl:]]')
  ),
  caption text check (
    caption is null or (caption = btrim(caption) and length(caption) <= 240
      and caption !~ '[[:cntrl:]]')
  ),
  input_media_type text check (
    input_media_type is null or input_media_type in ('image/jpeg', 'image/png')
  ),
  input_byte_length integer check (
    input_byte_length is null or input_byte_length between 1 and 10485760
  ),
  input_payload_sha256 text check (
    input_payload_sha256 is null or input_payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  media_type text check (media_type is null or media_type = 'image/jpeg'),
  full_storage_object_ref text unique check (
    full_storage_object_ref is null or full_storage_object_ref ~ '^hobj_[A-Za-z0-9_-]{43}$'
  ),
  full_storage_key text unique,
  thumbnail_storage_object_ref text unique check (
    thumbnail_storage_object_ref is null
    or thumbnail_storage_object_ref ~ '^hobj_[A-Za-z0-9_-]{43}$'
  ),
  thumbnail_storage_key text unique,
  reserved_byte_length integer not null default 1638400
    check (reserved_byte_length = 1638400),
  full_byte_length integer check (full_byte_length between 1 and 1536000),
  full_payload_sha256 text check (
    full_payload_sha256 is null or full_payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  thumbnail_byte_length integer check (thumbnail_byte_length between 1 and 102400),
  thumbnail_payload_sha256 text check (
    thumbnail_payload_sha256 is null or thumbnail_payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  width integer check (width between 1 and 2048),
  height integer check (height between 1 and 2048),
  lease_token text check (lease_token is null or lease_token ~ '^hles_[A-Za-z0-9_-]{43}$'),
  lease_expires_at timestamptz,
  state text not null check (state in ('processing', 'available', 'deleting', 'deleted', 'failed')),
  created_at timestamptz not null,
  state_changed_at timestamptz not null,
  available_at timestamptz,
  deleted_at timestamptz,
  objects_cleaned_at timestamptz,
  unique (controller_principal_ref, command_ref),
  check (
    (full_storage_key is null and full_storage_object_ref is null)
    or full_storage_key = home_ref || '/checkup-photos/' || full_storage_object_ref
  ),
  check (
    (thumbnail_storage_key is null and thumbnail_storage_object_ref is null)
    or thumbnail_storage_key = home_ref || '/checkup-photos/' || thumbnail_storage_object_ref
  ),
  check (
    full_storage_object_ref is null or thumbnail_storage_object_ref is null
    or full_storage_object_ref <> thumbnail_storage_object_ref
  ),
  check ((state = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  check (
    (state in ('available', 'deleting')) =
    (full_byte_length is not null and full_payload_sha256 is not null
      and thumbnail_byte_length is not null and thumbnail_payload_sha256 is not null
      and width is not null and height is not null and available_at is not null)
  ),
  check (
    (state in ('processing', 'available', 'deleting')
      or (state = 'failed' and objects_cleaned_at is null)) =
    (observed_on is not null and area is not null and view_label is not null
      and caption is not null and input_media_type is not null
      and input_byte_length is not null and input_payload_sha256 is not null
      and media_type is not null and full_storage_object_ref is not null
      and full_storage_key is not null and thumbnail_storage_object_ref is not null
      and thumbnail_storage_key is not null)
  ),
  check ((state = 'deleted') = (deleted_at is not null)),
  check (objects_cleaned_at is null or state in ('failed', 'deleted')),
  check (state_changed_at >= created_at),
  check (available_at is null or available_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at)
);

create index homesrolo_checkup_photos_home_observed_idx
  on public.homesrolo_homeowner_checkup_photos(home_ref, observed_on desc, created_at desc)
  where state = 'available';
create index homesrolo_checkup_photos_reconcile_idx
  on public.homesrolo_homeowner_checkup_photos(home_ref, state_changed_at)
  where state in ('processing', 'failed', 'deleting') and objects_cleaned_at is null;

alter table public.homesrolo_homeowner_checkup_photos enable row level security;
revoke all on table public.homesrolo_homeowner_checkup_photos from public, anon, authenticated;
grant select, insert, update on table public.homesrolo_homeowner_checkup_photos to service_role;

-- A one-hour rolling admission ledger covers both first attempts and retries.
-- It is pruned under the same global advisory lock before every insertion, so
-- cleaned failed commands cannot bypass the transform/Storage rate caps and
-- the ledger itself remains hard-bounded.
create table public.homesrolo_homeowner_checkup_photo_upload_attempts (
  attempt_id bigint generated always as identity primary key,
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  photo_ref text not null check (photo_ref ~ '^hpho_[A-Za-z0-9_-]{43}$'),
  reserved_output_bytes integer not null default 1638400
    check (reserved_output_bytes = 1638400),
  attempted_at timestamptz not null
);
create index homesrolo_checkup_photo_upload_attempts_principal_idx
  on public.homesrolo_homeowner_checkup_photo_upload_attempts(
    principal_ref, attempted_at desc
  );
create index homesrolo_checkup_photo_upload_attempts_home_idx
  on public.homesrolo_homeowner_checkup_photo_upload_attempts(home_ref, attempted_at desc);
create index homesrolo_checkup_photo_upload_attempts_global_idx
  on public.homesrolo_homeowner_checkup_photo_upload_attempts(attempted_at desc);
alter table public.homesrolo_homeowner_checkup_photo_upload_attempts enable row level security;
revoke all on table public.homesrolo_homeowner_checkup_photo_upload_attempts
  from public, anon, authenticated;
grant select, insert, delete on table public.homesrolo_homeowner_checkup_photo_upload_attempts
  to service_role;

-- Conservative egress reservations are charged before Storage reads. Failed
-- downloads still count, which prevents retry storms from exceeding the cap.
create table public.homesrolo_homeowner_checkup_photo_egress (
  egress_ref text primary key check (egress_ref ~ '^hegr_[A-Za-z0-9_-]{43}$'),
  principal_ref text not null references public.homesrolo_homeowner_principals(principal_ref),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  photo_ref text not null references public.homesrolo_homeowner_checkup_photos(photo_ref)
    on delete cascade,
  variant text not null check (variant in ('full', 'thumbnail')),
  byte_length integer not null check (byte_length between 1 and 1536000),
  reserved_at timestamptz not null
);
create index homesrolo_checkup_photo_egress_principal_idx
  on public.homesrolo_homeowner_checkup_photo_egress(principal_ref, reserved_at desc);
create index homesrolo_checkup_photo_egress_global_idx
  on public.homesrolo_homeowner_checkup_photo_egress(reserved_at desc);
alter table public.homesrolo_homeowner_checkup_photo_egress enable row level security;
revoke all on table public.homesrolo_homeowner_checkup_photo_egress
  from public, anon, authenticated;
grant select, insert on table public.homesrolo_homeowner_checkup_photo_egress to service_role;

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'intake.record', 'project.create', 'artifact.upload',
    'project.submit_for_review', 'quote.create', 'quote.save', 'photo_checkup.upload'
  ));

create or replace function public.homesrolo_reserve_checkup_photo_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_photo_ref text,
  p_observed_on date,
  p_area text,
  p_view_label text,
  p_caption text,
  p_input_media_type text,
  p_input_byte_length integer,
  p_input_payload_sha256 text,
  p_full_storage_object_ref text,
  p_full_storage_key text,
  p_thumbnail_storage_object_ref text,
  p_thumbnail_storage_key text,
  p_lease_token text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
  v_home_count bigint;
  v_principal_count bigint;
  v_global_count bigint;
  v_home_bytes bigint;
  v_principal_bytes bigint;
  v_global_bytes bigint;
  v_principal_output_bytes bigint;
  v_global_output_bytes bigint;
  v_is_retry boolean := false;
begin
  if p_requested_at < clock_timestamp() - interval '5 minutes'
    or p_requested_at > clock_timestamp() + interval '5 minutes'
    or p_observed_on > p_requested_at::date then
    raise exception 'invalid_photo_time';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));

  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

  -- Bound lifetime DB rows without retaining failed payload metadata forever.
  -- Deleted photos keep only a redacted idempotency tombstone. A later reserve
  -- may prune it after 30 days; there is deliberately no fixed-time claim.
  with expired as (
    delete from public.homesrolo_homeowner_checkup_photos
    where (state = 'failed' and objects_cleaned_at is not null
        and state_changed_at < p_requested_at - interval '1 day')
      or (state = 'deleted' and deleted_at < p_requested_at - interval '30 days')
    returning controller_principal_ref, command_ref
  )
  delete from public.homesrolo_homeowner_command_receipts receipt
  using expired
  where receipt.principal_ref = expired.controller_principal_ref
    and receipt.command_ref = expired.command_ref
    and receipt.action = 'photo_checkup.upload';

  -- Failed-but-not-cleaned reservations continue consuming count and byte
  -- quota until the server confirms both exact opaque object keys were removed.
  update public.homesrolo_homeowner_checkup_photos
  set state = 'failed', lease_token = null, lease_expires_at = null,
      state_changed_at = p_requested_at
  where state = 'processing' and lease_expires_at < p_requested_at;

  select * into v_photo
  from public.homesrolo_homeowner_checkup_photos
  where controller_principal_ref = p_principal_ref and command_ref = p_command_ref
  for update;
  if found then
    if v_photo.home_ref <> p_home_ref then
      raise exception 'command_scope_mismatch';
    end if;
    if v_photo.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    if v_photo.state = 'available' then return to_jsonb(v_photo); end if;
    if v_photo.state = 'processing' then raise exception 'upload_in_progress'; end if;
    if v_photo.state in ('deleting', 'deleted') then raise exception 'photo_deleted'; end if;
    if v_photo.state = 'failed' and v_photo.objects_cleaned_at is null then
      return to_jsonb(v_photo);
    end if;
    if v_photo.state <> 'failed' then raise exception 'photo_state_invalid'; end if;
    v_is_retry := true;
  end if;

  delete from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where attempted_at < least(
    date_trunc('month', p_requested_at),
    p_requested_at - interval '1 hour'
  );
  select count(*) into v_principal_count
  from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where principal_ref = p_principal_ref
    and attempted_at >= p_requested_at - interval '1 hour';
  select count(*) into v_home_count
  from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where home_ref = p_home_ref
    and attempted_at >= p_requested_at - interval '1 hour';
  select count(*) into v_global_count
  from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where attempted_at >= p_requested_at - interval '1 hour';
  if v_principal_count >= 20 or v_home_count >= 12 or v_global_count >= 120 then
    raise exception 'photo_rate_limited';
  end if;

  select coalesce(sum(reserved_output_bytes), 0) into v_principal_output_bytes
  from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where principal_ref = p_principal_ref
    and attempted_at >= date_trunc('month', p_requested_at);
  select coalesce(sum(reserved_output_bytes), 0) into v_global_output_bytes
  from public.homesrolo_homeowner_checkup_photo_upload_attempts
  where attempted_at >= date_trunc('month', p_requested_at);
  if v_principal_output_bytes + 1638400 > 268435456
    or v_global_output_bytes + 1638400 > 536870912 then
    raise exception 'photo_output_limited';
  end if;

  if not v_is_retry and ((select count(*) from public.homesrolo_homeowner_checkup_photos
      where controller_principal_ref = p_principal_ref) >= 1000
    or (select count(*) from public.homesrolo_homeowner_checkup_photos) >= 5000) then
    raise exception 'photo_quota_exceeded';
  end if;

  if (select count(*) from public.homesrolo_homeowner_checkup_photos
      where controller_principal_ref = p_principal_ref and state = 'processing') >= 1
    or (select count(*) from public.homesrolo_homeowner_checkup_photos
      where home_ref = p_home_ref and state = 'processing') >= 1
    or (select count(*) from public.homesrolo_homeowner_checkup_photos
      where state = 'processing') >= 4 then
    raise exception 'photo_concurrency_limited';
  end if;

  select count(*), coalesce(sum(coalesce(
      full_byte_length + thumbnail_byte_length, reserved_byte_length
    )), 0)
  into v_home_count, v_home_bytes
  from public.homesrolo_homeowner_checkup_photos
  where home_ref = p_home_ref
    and (state in ('processing', 'available', 'deleting')
      or (state = 'failed' and objects_cleaned_at is null));
  select count(*), coalesce(sum(coalesce(
      full_byte_length + thumbnail_byte_length, reserved_byte_length
    )), 0)
  into v_principal_count, v_principal_bytes
  from public.homesrolo_homeowner_checkup_photos
  where controller_principal_ref = p_principal_ref
    and (state in ('processing', 'available', 'deleting')
      or (state = 'failed' and objects_cleaned_at is null));
  select count(*), coalesce(sum(coalesce(
      full_byte_length + thumbnail_byte_length, reserved_byte_length
    )), 0)
  into v_global_count, v_global_bytes
  from public.homesrolo_homeowner_checkup_photos
  where state in ('processing', 'available', 'deleting')
    or (state = 'failed' and objects_cleaned_at is null);

  if v_home_count >= 100 or v_home_bytes + 1638400 > 157286400
    or v_principal_count >= 200 or v_principal_bytes + 1638400 > 262144000
    or v_global_count >= 500 or v_global_bytes + 1638400 > 524288000 then
    raise exception 'photo_quota_exceeded';
  end if;

  insert into public.homesrolo_homeowner_checkup_photo_upload_attempts (
    principal_ref, home_ref, photo_ref, reserved_output_bytes, attempted_at
  ) values (
    p_principal_ref, p_home_ref,
    case when v_is_retry then v_photo.photo_ref else p_photo_ref end,
    1638400, p_requested_at
  );

  if v_is_retry then
    update public.homesrolo_homeowner_checkup_photos
    set state = 'processing', lease_token = p_lease_token,
        lease_expires_at = p_requested_at + interval '5 minutes',
        state_changed_at = p_requested_at, objects_cleaned_at = null,
        observed_on = p_observed_on, area = p_area, view_label = btrim(p_view_label),
        caption = btrim(p_caption), input_media_type = p_input_media_type,
        input_byte_length = p_input_byte_length,
        input_payload_sha256 = p_input_payload_sha256, media_type = 'image/jpeg',
        full_storage_object_ref = p_full_storage_object_ref,
        full_storage_key = p_full_storage_key,
        thumbnail_storage_object_ref = p_thumbnail_storage_object_ref,
        thumbnail_storage_key = p_thumbnail_storage_key
    where photo_ref = v_photo.photo_ref
    returning * into v_photo;
    return to_jsonb(v_photo);
  end if;

  insert into public.homesrolo_homeowner_checkup_photos (
    photo_ref, home_ref, controller_principal_ref, command_ref, command_digest,
    observed_on, area, view_label, caption, input_media_type, input_byte_length,
    input_payload_sha256, media_type, full_storage_object_ref, full_storage_key,
    thumbnail_storage_object_ref, thumbnail_storage_key, lease_token,
    lease_expires_at, state, created_at, state_changed_at
  ) values (
    p_photo_ref, p_home_ref, p_principal_ref, p_command_ref, p_command_digest,
    p_observed_on, p_area, btrim(p_view_label), btrim(p_caption),
    p_input_media_type, p_input_byte_length,
    p_input_payload_sha256, 'image/jpeg', p_full_storage_object_ref, p_full_storage_key,
    p_thumbnail_storage_object_ref, p_thumbnail_storage_key, p_lease_token,
    p_requested_at + interval '5 minutes', 'processing', p_requested_at, p_requested_at
  ) returning * into v_photo;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.homesrolo_finalize_checkup_photo_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_photo_ref text,
  p_lease_token text,
  p_full_storage_object_ref text,
  p_full_byte_length integer,
  p_full_payload_sha256 text,
  p_thumbnail_storage_object_ref text,
  p_thumbnail_byte_length integer,
  p_thumbnail_payload_sha256 text,
  p_width integer,
  p_height integer,
  p_completed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
  v_result jsonb;
begin
  if p_completed_at < clock_timestamp() - interval '5 minutes'
    or p_completed_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'invalid_photo_time';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_photo from public.homesrolo_homeowner_checkup_photos
  where photo_ref = p_photo_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref and command_ref = p_command_ref
    and command_digest = p_command_digest
  for update;
  if not found then raise exception 'photo_reservation_not_found'; end if;
  if v_photo.state = 'available' then return to_jsonb(v_photo); end if;
  if v_photo.state <> 'processing' or v_photo.lease_token <> p_lease_token
    or v_photo.lease_expires_at < p_completed_at
    or v_photo.full_storage_object_ref <> p_full_storage_object_ref
    or v_photo.thumbnail_storage_object_ref <> p_thumbnail_storage_object_ref then
    raise exception 'photo_lease_not_authorized';
  end if;

  update public.homesrolo_homeowner_checkup_photos
  set full_byte_length = p_full_byte_length,
      full_payload_sha256 = p_full_payload_sha256,
      thumbnail_byte_length = p_thumbnail_byte_length,
      thumbnail_payload_sha256 = p_thumbnail_payload_sha256,
      width = p_width, height = p_height,
      lease_token = null, lease_expires_at = null,
      state = 'available', state_changed_at = p_completed_at,
      available_at = p_completed_at
  where photo_ref = p_photo_ref
  returning * into v_photo;

  update public.homesrolo_private_homes set updated_at = p_completed_at
  where home_ref = p_home_ref;
  v_result := jsonb_build_object('photo_ref', v_photo.photo_ref, 'state', 'available');
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'photo_checkup.upload',
    p_command_digest, v_result, p_completed_at
  ) on conflict (principal_ref, command_ref, action) do nothing;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.homesrolo_reject_checkup_photo_upload(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_photo_ref text,
  p_lease_token text,
  p_rejected_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  update public.homesrolo_homeowner_checkup_photos
  set state = 'failed', lease_token = null, lease_expires_at = null,
      state_changed_at = p_rejected_at
  where photo_ref = p_photo_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref and state = 'processing'
    and lease_token = p_lease_token
  returning * into v_photo;
  if not found then raise exception 'photo_lease_not_authorized'; end if;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.homesrolo_begin_checkup_photo_delete(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_photo_ref text,
  p_deleted_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_photo from public.homesrolo_homeowner_checkup_photos
  where photo_ref = p_photo_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'photo_not_found'; end if;
  if v_photo.state = 'deleted' then return to_jsonb(v_photo); end if;
  if v_photo.state not in ('available', 'deleting') then raise exception 'photo_not_available'; end if;
  if v_photo.state = 'available' then
    update public.homesrolo_homeowner_checkup_photos
    set state = 'deleting', state_changed_at = p_deleted_at
    where photo_ref = p_photo_ref returning * into v_photo;
  end if;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.homesrolo_finalize_checkup_photo_delete(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_photo_ref text,
  p_deleted_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_photo from public.homesrolo_homeowner_checkup_photos
  where photo_ref = p_photo_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'photo_not_found'; end if;
  if v_photo.state = 'deleted' then return to_jsonb(v_photo); end if;
  if v_photo.state <> 'deleting' then raise exception 'photo_not_deleting'; end if;
  update public.homesrolo_homeowner_checkup_photos
  set state = 'deleted', state_changed_at = p_deleted_at,
      deleted_at = p_deleted_at, objects_cleaned_at = p_deleted_at,
      observed_on = null, area = null, view_label = null, caption = null,
      input_media_type = null, input_byte_length = null,
      input_payload_sha256 = null, media_type = null,
      full_storage_object_ref = null, full_storage_key = null,
      thumbnail_storage_object_ref = null, thumbnail_storage_key = null,
      full_byte_length = null, full_payload_sha256 = null,
      thumbnail_byte_length = null, thumbnail_payload_sha256 = null,
      width = null, height = null, available_at = null
  where photo_ref = p_photo_ref returning * into v_photo;
  update public.homesrolo_homeowner_command_receipts
  set result = jsonb_build_object('photo_ref', p_photo_ref, 'state', 'deleted')
  where principal_ref = p_principal_ref and command_ref = v_photo.command_ref
    and action = 'photo_checkup.upload';
  update public.homesrolo_private_homes set updated_at = p_deleted_at
  where home_ref = p_home_ref;
  return to_jsonb(v_photo);
end;
$$;

-- Service-role cleanup deliberately does not require a live membership. It is
-- fed only a server-selected exact row so revoked accounts cannot strand bytes
-- or quota forever.
create or replace function public.homesrolo_service_expire_stale_checkup_photo_uploads(
  p_requested_at timestamptz
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_expired integer;
begin
  if p_requested_at < clock_timestamp() - interval '5 minutes'
    or p_requested_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'invalid_photo_time';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  update public.homesrolo_homeowner_checkup_photos
  set state = 'failed', lease_token = null, lease_expires_at = null,
      state_changed_at = p_requested_at
  where state = 'processing' and lease_expires_at < p_requested_at;
  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

create or replace function public.homesrolo_service_reconcile_checkup_photo_objects(
  p_photo_ref text,
  p_expected_state text,
  p_cleaned_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-checkups:global', 0));
  select * into v_photo from public.homesrolo_homeowner_checkup_photos
  where photo_ref = p_photo_ref for update;
  if not found or v_photo.state <> p_expected_state
    or v_photo.state not in ('failed', 'deleting') then
    raise exception 'photo_cleanup_state_changed';
  end if;
  if v_photo.state = 'failed' then
    update public.homesrolo_homeowner_checkup_photos
    set objects_cleaned_at = coalesce(objects_cleaned_at, p_cleaned_at),
        observed_on = null, area = null, view_label = null, caption = null,
        input_media_type = null, input_byte_length = null,
        input_payload_sha256 = null, media_type = null,
        full_storage_object_ref = null, full_storage_key = null,
        thumbnail_storage_object_ref = null, thumbnail_storage_key = null
    where photo_ref = p_photo_ref;
  else
    update public.homesrolo_homeowner_checkup_photos
    set state = 'deleted', state_changed_at = p_cleaned_at,
        deleted_at = p_cleaned_at, objects_cleaned_at = p_cleaned_at,
        observed_on = null, area = null, view_label = null, caption = null,
        input_media_type = null, input_byte_length = null,
        input_payload_sha256 = null, media_type = null,
        full_storage_object_ref = null, full_storage_key = null,
        thumbnail_storage_object_ref = null, thumbnail_storage_key = null,
        full_byte_length = null, full_payload_sha256 = null,
        thumbnail_byte_length = null, thumbnail_payload_sha256 = null,
        width = null, height = null, available_at = null
    where photo_ref = p_photo_ref;
    update public.homesrolo_homeowner_command_receipts
    set result = jsonb_build_object('photo_ref', p_photo_ref, 'state', 'deleted')
    where principal_ref = v_photo.controller_principal_ref
      and command_ref = v_photo.command_ref and action = 'photo_checkup.upload';
    update public.homesrolo_private_homes set updated_at = p_cleaned_at
    where home_ref = v_photo.home_ref;
  end if;
end;
$$;

create or replace function public.homesrolo_reserve_checkup_photo_egress(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_photo_ref text,
  p_variant text,
  p_egress_ref text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_photo public.homesrolo_homeowner_checkup_photos%rowtype;
  v_bytes integer;
  v_principal_day_bytes bigint;
  v_global_day_bytes bigint;
  v_principal_month_bytes bigint;
  v_global_month_bytes bigint;
begin
  if p_requested_at < clock_timestamp() - interval '5 minutes'
    or p_requested_at > clock_timestamp() + interval '5 minutes'
    or p_variant not in ('full', 'thumbnail') then
    raise exception 'invalid_egress_request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homesrolo:photo-egress:global', 0));
  -- Keep the current calendar month plus any prior-month rows still inside the
  -- rolling 24-hour window. Pruning under the same global transaction lock
  -- bounds the ledger without resetting daily limits at a month boundary.
  delete from public.homesrolo_homeowner_checkup_photo_egress
  where reserved_at < least(
    date_trunc('month', p_requested_at),
    p_requested_at - interval '24 hours'
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref and principal_ref = p_principal_ref
      and home_ref = p_home_ref and revision = p_membership_revision
      and state = 'active' and role in ('workspace_controller', 'member', 'viewer')
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_photo from public.homesrolo_homeowner_checkup_photos
  where photo_ref = p_photo_ref and home_ref = p_home_ref and state = 'available';
  if not found then raise exception 'photo_not_found'; end if;
  v_bytes := case when p_variant = 'full'
    then v_photo.full_byte_length else v_photo.thumbnail_byte_length end;

  if (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where principal_ref = p_principal_ref
        and reserved_at >= p_requested_at - interval '1 minute') >= 120
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where principal_ref = p_principal_ref and variant = 'full'
        and reserved_at >= p_requested_at - interval '1 minute') >= 12
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where reserved_at >= p_requested_at - interval '1 minute') >= 500
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where variant = 'full'
        and reserved_at >= p_requested_at - interval '1 minute') >= 100 then
    raise exception 'photo_egress_rate_limited';
  end if;

  if (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where principal_ref = p_principal_ref
        and reserved_at >= p_requested_at - interval '24 hours') >= 1000
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where reserved_at >= p_requested_at - interval '24 hours') >= 5000
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where principal_ref = p_principal_ref
        and reserved_at >= date_trunc('month', p_requested_at)) >= 5000
    or (select count(*) from public.homesrolo_homeowner_checkup_photo_egress
      where reserved_at >= date_trunc('month', p_requested_at)) >= 25000 then
    raise exception 'photo_egress_rate_limited';
  end if;

  select coalesce(sum(byte_length), 0) into v_principal_day_bytes
  from public.homesrolo_homeowner_checkup_photo_egress
  where principal_ref = p_principal_ref
    and reserved_at >= p_requested_at - interval '24 hours';
  select coalesce(sum(byte_length), 0) into v_global_day_bytes
  from public.homesrolo_homeowner_checkup_photo_egress
  where reserved_at >= p_requested_at - interval '24 hours';
  select coalesce(sum(byte_length), 0) into v_principal_month_bytes
  from public.homesrolo_homeowner_checkup_photo_egress
  where principal_ref = p_principal_ref
    and reserved_at >= date_trunc('month', p_requested_at);
  select coalesce(sum(byte_length), 0) into v_global_month_bytes
  from public.homesrolo_homeowner_checkup_photo_egress
  where reserved_at >= date_trunc('month', p_requested_at);

  if v_principal_day_bytes + v_bytes > 134217728
    or v_global_day_bytes + v_bytes > 536870912
    or v_principal_month_bytes + v_bytes > 536870912
    or v_global_month_bytes + v_bytes > 2147483648 then
    raise exception 'photo_egress_limited';
  end if;

  insert into public.homesrolo_homeowner_checkup_photo_egress (
    egress_ref, principal_ref, home_ref, photo_ref, variant, byte_length, reserved_at
  ) values (
    p_egress_ref, p_principal_ref, p_home_ref, p_photo_ref,
    p_variant, v_bytes, p_requested_at
  );
  return to_jsonb(v_photo);
end;
$$;

revoke all on function public.homesrolo_reserve_checkup_photo_upload(
  text, text, text, integer, text, text, text, date, text, text, text, text, integer,
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_finalize_checkup_photo_upload(
  text, text, text, integer, text, text, text, text, text, integer, text,
  text, integer, text, integer, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_reject_checkup_photo_upload(
  text, text, text, integer, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_begin_checkup_photo_delete(
  text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_finalize_checkup_photo_delete(
  text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_service_reconcile_checkup_photo_objects(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_service_expire_stale_checkup_photo_uploads(
  timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_reserve_checkup_photo_egress(
  text, text, text, integer, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.homesrolo_reserve_checkup_photo_upload(
  text, text, text, integer, text, text, text, date, text, text, text, text, integer,
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_finalize_checkup_photo_upload(
  text, text, text, integer, text, text, text, text, text, integer, text,
  text, integer, text, integer, integer, timestamptz
) to service_role;
grant execute on function public.homesrolo_reject_checkup_photo_upload(
  text, text, text, integer, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_begin_checkup_photo_delete(
  text, text, text, integer, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_finalize_checkup_photo_delete(
  text, text, text, integer, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_service_reconcile_checkup_photo_objects(
  text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_service_expire_stale_checkup_photo_uploads(
  timestamptz
) to service_role;
grant execute on function public.homesrolo_reserve_checkup_photo_egress(
  text, text, text, integer, text, text, text, timestamptz
) to service_role;

commit;
