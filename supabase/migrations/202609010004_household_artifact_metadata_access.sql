begin;

-- Shared-library organization is available to adult household members in the
-- API. Keep the database boundary aligned, while holding both the current
-- principal and exact membership stable through command replay and mutation.
create or replace function public.homesrolo_update_homeowner_artifact_metadata(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_artifact_ref text,
  p_expected_revision integer,
  p_project_ref text,
  p_observed_on date,
  p_photo_phase text,
  p_area_label text,
  p_geo_latitude double precision,
  p_geo_longitude double precision,
  p_geo_accuracy_meters double precision,
  p_geo_captured_at timestamptz,
  p_geo_provenance text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.homesrolo_homeowner_command_receipts%rowtype;
  v_artifact public.homesrolo_homeowner_artifacts%rowtype;
  v_result jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid_expected_revision';
  end if;
  if p_observed_on is not null and p_observed_on > p_requested_at::date then
    raise exception 'artifact_observed_date_in_future';
  end if;
  if p_photo_phase is not null
    and p_photo_phase not in ('before', 'during', 'after', 'reference') then
    raise exception 'invalid_artifact_photo_phase';
  end if;
  if p_area_label is not null and (
    length(btrim(p_area_label)) not between 1 and 120
    or p_area_label ~ '[[:cntrl:]]'
  ) then
    raise exception 'invalid_artifact_area_label';
  end if;
  if num_nonnulls(
    p_geo_latitude, p_geo_longitude, p_geo_accuracy_meters,
    p_geo_captured_at, p_geo_provenance
  ) not in (0, 5) then
    raise exception 'invalid_artifact_geo_pin';
  end if;
  if p_geo_latitude is not null and not (
    p_geo_latitude between -90 and 90
    and p_geo_longitude between -180 and 180
    and p_geo_accuracy_meters between 0 and 100000
    and p_geo_captured_at <= p_requested_at
    and p_geo_provenance = 'device_confirmed'
  ) then
    raise exception 'invalid_artifact_geo_pin';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_ref || ':' || p_command_ref || ':artifact.metadata.update', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_home_ref || ':' || p_artifact_ref || ':artifact.metadata', 0)
  );

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
  where membership_ref = p_membership_ref
    and principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and revision = p_membership_revision
    and state = 'active'
    and role in ('workspace_controller', 'member')
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  -- Metadata commands are retried only across a bounded client window. Keep
  -- receipts private and finite even when a household organizes many photos.
  delete from public.homesrolo_homeowner_command_receipts receipt
  where receipt.action = 'artifact.metadata.update'
    and receipt.home_ref = p_home_ref
    and receipt.created_at < p_requested_at - interval '30 days';
  delete from public.homesrolo_homeowner_command_receipts receipt
  using (
    select principal_ref, command_ref, action
    from public.homesrolo_homeowner_command_receipts
    where action = 'artifact.metadata.update'
      and home_ref = p_home_ref
    order by created_at desc, principal_ref, command_ref
    offset 63
  ) stale
  where receipt.principal_ref = stale.principal_ref
    and receipt.command_ref = stale.command_ref
    and receipt.action = stale.action;

  select * into v_artifact
  from public.homesrolo_homeowner_artifacts
  where artifact_ref = p_artifact_ref
    and home_ref = p_home_ref
    and state = 'available'
  for update;
  if not found then raise exception 'artifact_not_found'; end if;

  select * into v_receipt
  from public.homesrolo_homeowner_command_receipts
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and action = 'artifact.metadata.update';
  if found then
    if v_receipt.command_digest <> p_command_digest
      or v_receipt.home_ref is distinct from p_home_ref
      or v_receipt.result ->> 'artifact_ref' is distinct from p_artifact_ref then
      raise exception 'command_scope_mismatch';
    end if;
    -- The digest binds these retry fields to the original command. Rebuild the
    -- result without retaining precise location or organization metadata in a
    -- receipt after the household later clears or replaces it.
    return to_jsonb(v_artifact) || jsonb_build_object(
      'project_ref', p_project_ref,
      'observed_on', p_observed_on,
      'photo_phase', p_photo_phase,
      'area_label', case when p_area_label is null then null else btrim(p_area_label) end,
      'geo_latitude', p_geo_latitude,
      'geo_longitude', p_geo_longitude,
      'geo_accuracy_meters', p_geo_accuracy_meters,
      'geo_captured_at', p_geo_captured_at,
      'geo_provenance', p_geo_provenance,
      'revision', (v_receipt.result ->> 'revision')::integer,
      'updated_at', v_receipt.result ->> 'updated_at'
    );
  end if;

  if p_project_ref is not null and not exists (
    select 1
    from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref
      and home_ref = p_home_ref
      and archived_at is null
  ) then
    raise exception 'project_not_in_home';
  end if;
  if v_artifact.kind <> 'photo' and num_nonnulls(
    p_observed_on, p_photo_phase, p_area_label, p_geo_latitude,
    p_geo_longitude, p_geo_accuracy_meters, p_geo_captured_at,
    p_geo_provenance
  ) <> 0 then
    raise exception 'artifact_photo_metadata_requires_photo';
  end if;
  if v_artifact.revision <> p_expected_revision
    or (v_artifact.updated_at is not null and p_requested_at < v_artifact.updated_at) then
    raise exception 'artifact_metadata_revision_conflict';
  end if;

  update public.homesrolo_homeowner_artifacts
  set project_ref = p_project_ref,
      observed_on = p_observed_on,
      photo_phase = p_photo_phase,
      area_label = case
        when p_area_label is null then null else btrim(p_area_label)
      end,
      geo_latitude = p_geo_latitude,
      geo_longitude = p_geo_longitude,
      geo_accuracy_meters = p_geo_accuracy_meters,
      geo_captured_at = p_geo_captured_at,
      geo_provenance = p_geo_provenance,
      revision = revision + 1,
      updated_at = p_requested_at
  where artifact_ref = p_artifact_ref
    and home_ref = p_home_ref
  returning * into v_artifact;

  update public.homesrolo_private_homes
  set updated_at = greatest(updated_at, p_requested_at)
  where home_ref = p_home_ref;

  -- Receipts retain only opaque scope, revision, and original execution time.
  -- Exact coordinates, labels, dates, project linkage, storage keys, digests,
  -- uploader identity, and byte details remain out of retry storage.
  v_result := jsonb_build_object(
    'artifact_ref', v_artifact.artifact_ref,
    'home_ref', v_artifact.home_ref,
    'revision', v_artifact.revision,
    'updated_at', v_artifact.updated_at
  );
  insert into public.homesrolo_homeowner_command_receipts (
    principal_ref, command_ref, action, command_digest,
    home_ref, result, created_at
  ) values (
    p_principal_ref, p_command_ref, 'artifact.metadata.update', p_command_digest,
    p_home_ref, v_result, p_requested_at
  );
  return to_jsonb(v_artifact);
end;
$$;

revoke all on function public.homesrolo_update_homeowner_artifact_metadata(
  text, text, text, integer, text, text, text, integer, text, date, text,
  text, double precision, double precision, double precision, timestamptz,
  text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_update_homeowner_artifact_metadata(
  text, text, text, integer, text, text, text, integer, text, date, text,
  text, double precision, double precision, double precision, timestamptz,
  text, timestamptz
) to service_role;

-- Keep the legacy server-side object port aligned with the same adult-member
-- upload policy. Although the active mobile route uses the leased development
-- upload RPCs, this boundary must not replay or finish a reservation after
-- current authority is lost.
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

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
  where membership_ref = p_membership_ref
    and principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and revision = p_membership_revision
    and state = 'active'
    and role in ('workspace_controller', 'member')
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  select * into v_artifact
  from public.homesrolo_homeowner_artifacts
  where controller_principal_ref = p_principal_ref
    and command_ref = p_command_ref
  for update;
  if found then
    if v_artifact.command_digest <> p_command_digest then
      raise exception 'command_digest_mismatch';
    end if;
    return to_jsonb(v_artifact);
  end if;

  if p_project_ref is not null and not exists (
    select 1
    from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref
      and home_ref = p_home_ref
      and archived_at is null
  ) then
    raise exception 'project_not_in_home';
  end if;

  insert into public.homesrolo_homeowner_artifacts (
    artifact_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, kind, display_name, media_type, byte_length,
    payload_sha256, storage_object_ref, storage_key, content_class, state,
    created_at
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

  perform 1
  from public.homesrolo_homeowner_principals
  where principal_ref = p_principal_ref
    and status = 'active'
    and email_verified = true
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  perform 1
  from public.homesrolo_homeowner_memberships
  where membership_ref = p_membership_ref
    and principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and revision = p_membership_revision
    and state = 'active'
    and role in ('workspace_controller', 'member')
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  select * into v_artifact
  from public.homesrolo_homeowner_artifacts
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
    p_principal_ref, p_command_ref, 'artifact.upload', p_command_digest,
    v_result, p_completed_at
  ) on conflict (principal_ref, command_ref, action) do nothing;
  return v_result;
end;
$$;

revoke all on function public.homesrolo_reserve_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, text, text, text, integer,
  text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_reserve_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, text, text, text, integer,
  text, text, text, timestamptz
) to service_role;
revoke all on function public.homesrolo_finalize_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.homesrolo_finalize_homeowner_artifact_upload(
  text, text, text, integer, text, text, text, text, timestamptz
) to service_role;

commit;
