begin;

-- Generic private artifacts remain the one project-file lane. These nullable
-- fields add homeowner-authored photo organization without retaining EXIF or
-- changing the existing signed-upload contract.
alter table public.homesrolo_homeowner_artifacts
  add column if not exists observed_on date,
  add column if not exists photo_phase text,
  add column if not exists area_label text,
  add column if not exists geo_latitude double precision,
  add column if not exists geo_longitude double precision,
  add column if not exists geo_accuracy_meters double precision,
  add column if not exists geo_captured_at timestamptz,
  add column if not exists geo_provenance text,
  add column if not exists revision integer not null default 1,
  add column if not exists updated_at timestamptz;

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_photo_phase_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_photo_phase_check
  check (photo_phase is null or photo_phase in ('before', 'during', 'after', 'reference'));

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_area_label_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_area_label_check
  check (
    area_label is null
    or (
      length(btrim(area_label)) between 1 and 120
      and area_label !~ '[[:cntrl:]]'
    )
  );

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_geo_pin_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_geo_pin_check
  check (
    num_nonnulls(
      geo_latitude, geo_longitude, geo_accuracy_meters,
      geo_captured_at, geo_provenance
    ) in (0, 5)
    and (
      geo_latitude is null
      or (
        geo_latitude between -90 and 90
        and geo_longitude between -180 and 180
        and geo_accuracy_meters between 0 and 100000
        and geo_provenance = 'device_confirmed'
      )
    )
  );

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_photo_metadata_kind_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_photo_metadata_kind_check
  check (
    kind = 'photo'
    or num_nonnulls(
      observed_on, photo_phase, area_label, geo_latitude, geo_longitude,
      geo_accuracy_meters, geo_captured_at, geo_provenance
    ) = 0
  );

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_metadata_revision_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_metadata_revision_check
  check (revision >= 1);

alter table public.homesrolo_homeowner_artifacts
  drop constraint if exists homesrolo_homeowner_artifacts_metadata_time_check;
alter table public.homesrolo_homeowner_artifacts
  add constraint homesrolo_homeowner_artifacts_metadata_time_check
  check (
    (updated_at is null or updated_at >= created_at)
    and (geo_captured_at is null or updated_at is null or geo_captured_at <= updated_at)
  );

create index if not exists homesrolo_homeowner_artifacts_project_observed_idx
  on public.homesrolo_homeowner_artifacts(
    home_ref, project_ref, observed_on desc, created_at desc
  )
  where state = 'available' and kind = 'photo';

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_action_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_action_check
  check (action in (
    'home.create', 'home_record.update', 'intake.record', 'project.create',
    'project.update', 'project.activity.append', 'project.item.save',
    'artifact.upload', 'artifact.metadata.update', 'project.submit_for_review',
    'quote.create', 'quote.save', 'photo_checkup.upload', 'professional.invite',
    'professional.invitation.revoke', 'proposal.decide'
  ));

alter table public.homesrolo_homeowner_command_receipts
  drop constraint if exists homesrolo_homeowner_command_receipts_artifact_metadata_scope_check;
alter table public.homesrolo_homeowner_command_receipts
  add constraint homesrolo_homeowner_command_receipts_artifact_metadata_scope_check
  check (action <> 'artifact.metadata.update' or home_ref is not null);

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
  from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  for share;
  if not found then raise exception 'membership_not_authorized'; end if;

  -- Metadata commands are retried only across a bounded client window. Keep
  -- receipts private and finite even when a homeowner organizes many photos.
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

  select * into v_artifact from public.homesrolo_homeowner_artifacts
  where artifact_ref = p_artifact_ref
    and home_ref = p_home_ref
    and state = 'available'
  for update;
  if not found then raise exception 'artifact_not_found'; end if;

  select * into v_receipt from public.homesrolo_homeowner_command_receipts
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
    -- receipt after the homeowner later clears or replaces it.
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
    select 1 from public.homesrolo_homeowner_projects
    where project_ref = p_project_ref and home_ref = p_home_ref
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
  where artifact_ref = p_artifact_ref and home_ref = p_home_ref
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

commit;
