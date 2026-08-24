begin;

-- A recipient is an opaque, revocable route to exactly one Home Record and
-- its controller. It deliberately stores no address or property-matching
-- material. A route is never rebound; rotation creates a new recipient ref.
create table public.homesrolo_homeowner_handoff_recipients (
  recipient_ref text primary key
    check (recipient_ref ~ '^hrcp_[A-Za-z0-9_-]{43}$'),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  controller_principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  state text not null default 'active' check (state in ('active', 'revoked')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revoked_at timestamptz,
  unique (recipient_ref, home_ref, controller_principal_ref),
  foreign key (controller_principal_ref, home_ref)
    references public.homesrolo_homeowner_memberships(principal_ref, home_ref),
  check ((state = 'revoked') = (revoked_at is not null)),
  check (updated_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

-- The wire manifest and authorization receipt are immutable. Lifecycle fields
-- may move the package through review, quarantine, and final publication.
create table public.homesrolo_homeowner_handoffs (
  handoff_ref text primary key check (handoff_ref ~ '^hhof_[A-Za-z0-9_-]{43}$'),
  share_id text not null unique check (share_id ~ '^hshr_[A-Za-z0-9_-]{43}$'),
  recipient_ref text not null,
  recipient_binding_revision integer not null
    check (recipient_binding_revision >= 1),
  home_ref text not null,
  controller_principal_ref text not null,
  contract_version text not null default 'homeowner-share.v1'
    check (contract_version = 'homeowner-share.v1'),
  purpose text not null default 'homeowner_work_records'
    check (purpose = 'homeowner_work_records'),
  generation integer not null default 1 check (generation = 1),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  manifest_artifact_count integer not null
    check (manifest_artifact_count between 1 and 25),
  manifest_total_bytes bigint not null
    check (manifest_total_bytes between 1 and 104857600),
  authorization_id text not null
    check (authorization_id ~ '^hauth_[A-Za-z0-9_-]{43}$'),
  authorization_receipt jsonb not null
    check (jsonb_typeof(authorization_receipt) = 'object'),
  authorization_digest text not null
    check (authorization_digest ~ '^[a-f0-9]{64}$'),
  authorization_replay_key text not null unique
    check (authorization_replay_key ~ '^[a-f0-9]{64}$'),
  delivery_digest text not null check (delivery_digest ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  authorized_at timestamptz not null,
  received_at timestamptz not null,
  state text not null check (state in (
    'received', 'accepting', 'accepted', 'rejected', 'expired',
    'quarantined', 'reconciliation_required'
  )),
  state_changed_at timestamptz not null,
  accepting_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text check (
    quarantine_reason is null or quarantine_reason in (
      'mutated_replay', 'source_changed', 'byte_length_mismatch',
      'digest_mismatch', 'media_type_mismatch', 'content_rejected',
      'storage_verification_failed'
    )
  ),
  reconciliation_required_at timestamptz,
  reconciliation_reason text check (
    reconciliation_reason is null or reconciliation_reason in (
      'fetch_outcome_unknown', 'storage_outcome_unknown',
      'database_commit_unknown', 'authority_changed', 'cleanup_required',
      'other'
    )
  ),
  revision integer not null default 1 check (revision >= 1),
  unique (handoff_ref, home_ref, controller_principal_ref),
  foreign key (recipient_ref, home_ref, controller_principal_ref)
    references public.homesrolo_homeowner_handoff_recipients(
      recipient_ref, home_ref, controller_principal_ref
    ),
  check (expires_at > issued_at),
  check (authorized_at >= issued_at and authorized_at < expires_at),
  check (state_changed_at >= received_at),
  check (state <> 'accepting' or accepting_at is not null),
  check (state <> 'accepted' or accepted_at is not null),
  check (state <> 'rejected' or rejected_at is not null),
  check (state <> 'expired' or expired_at is not null),
  check (state <> 'quarantined'
    or (quarantined_at is not null and quarantine_reason is not null)),
  check (state <> 'reconciliation_required'
    or (reconciliation_required_at is not null
      and reconciliation_reason is not null)),
  check (accepting_at is null or accepting_at >= received_at),
  check (accepted_at is null or accepted_at >= received_at),
  check (rejected_at is null or rejected_at >= received_at),
  check (expired_at is null or expired_at >= received_at),
  check (quarantined_at is null or quarantined_at >= received_at),
  check (reconciliation_required_at is null
    or reconciliation_required_at >= received_at),
  check (manifest ->> 'shareId' = share_id),
  check (manifest ->> 'recipientRef' = recipient_ref),
  check (manifest ->> 'contractVersion' = contract_version),
  check (manifest ->> 'purpose' = purpose),
  check (authorization_receipt ->> 'authorizationId' = authorization_id),
  check (authorization_receipt ->> 'shareId' = share_id),
  check (authorization_receipt ->> 'recipientRef' = recipient_ref),
  check (authorization_receipt ->> 'manifestDigest' = manifest_digest)
);

create index homesrolo_homeowner_handoffs_home_state_idx
  on public.homesrolo_homeowner_handoffs(home_ref, state, received_at desc);
create index homesrolo_homeowner_handoffs_expiry_idx
  on public.homesrolo_homeowner_handoffs(expires_at)
  where state in ('received', 'accepting');

-- Mutated deliveries never replace the first immutable wire record. The
-- conflicting bytes are retained separately and the original row is moved to
-- quarantine so a replay collision cannot remain silently active.
create table public.homesrolo_homeowner_handoff_replay_conflicts (
  existing_handoff_ref text not null
    references public.homesrolo_homeowner_handoffs(handoff_ref),
  incoming_handoff_ref text not null
    check (incoming_handoff_ref ~ '^hhof_[A-Za-z0-9_-]{43}$'),
  incoming_share_id text not null
    check (incoming_share_id ~ '^hshr_[A-Za-z0-9_-]{43}$'),
  incoming_recipient_ref text not null
    check (incoming_recipient_ref ~ '^hrcp_[A-Za-z0-9_-]{43}$'),
  incoming_manifest jsonb not null check (jsonb_typeof(incoming_manifest) = 'object'),
  incoming_manifest_digest text not null
    check (incoming_manifest_digest ~ '^[a-f0-9]{64}$'),
  incoming_authorization_receipt jsonb not null
    check (jsonb_typeof(incoming_authorization_receipt) = 'object'),
  incoming_authorization_digest text not null
    check (incoming_authorization_digest ~ '^[a-f0-9]{64}$'),
  incoming_authorization_replay_key text not null
    check (incoming_authorization_replay_key ~ '^[a-f0-9]{64}$'),
  incoming_delivery_digest text not null
    check (incoming_delivery_digest ~ '^[a-f0-9]{64}$'),
  detected_at timestamptz not null,
  primary key (existing_handoff_ref, incoming_delivery_digest)
);

-- One row preserves the exact source projection descriptor and the complete
-- quarantine/copy decision. The generic Home Record artifact does not exist
-- until package finalization, so staged objects cannot appear in normal lists
-- or exports.
create table public.homesrolo_homeowner_handoff_items (
  handoff_ref text not null,
  source_artifact_ref text not null
    check (source_artifact_ref ~ '^hproj_[A-Za-z0-9_-]{43}$'),
  manifest_ordinal integer not null check (manifest_ordinal between 1 and 25),
  home_ref text not null,
  controller_principal_ref text not null,
  descriptor jsonb not null check (jsonb_typeof(descriptor) = 'object'),
  source text not null default 'homeowner_release'
    check (source = 'homeowner_release'),
  projection_kind text not null check (projection_kind in (
    'work_document_copy', 'work_photo_set', 'work_completion_record',
    'work_warranty_record', 'work_invoice_receipt'
  )),
  projection_version integer not null check (projection_version between 1 and 100),
  media_type text not null check (media_type in (
    'application/pdf', 'image/jpeg', 'image/png'
  )),
  byte_length integer not null check (byte_length between 1 and 26214400),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  decision text not null default 'pending'
    check (decision in ('pending', 'accepted', 'rejected')),
  scan_state text not null default 'pending'
    check (scan_state in ('pending', 'not_required', 'clean', 'rejected', 'error')),
  quarantine_state text not null default 'isolated'
    check (quarantine_state in ('isolated', 'not_required', 'clean', 'rejected', 'released')),
  copy_state text not null default 'not_requested' check (copy_state in (
    'not_requested', 'reserved', 'quarantined_clean', 'available',
    'reconciliation_required'
  )),
  quarantine_reason text check (
    quarantine_reason is null or quarantine_reason in (
      'mutated_replay', 'source_changed', 'byte_length_mismatch',
      'digest_mismatch', 'media_type_mismatch', 'content_rejected',
      'storage_verification_failed'
    )
  ),
  reserved_homeowner_artifact_ref text unique
    check (reserved_homeowner_artifact_ref is null
      or reserved_homeowner_artifact_ref ~ '^hart_[A-Za-z0-9_-]{43}$'),
  reserved_storage_object_ref text unique
    check (reserved_storage_object_ref is null
      or reserved_storage_object_ref ~ '^hobj_[A-Za-z0-9_-]{43}$'),
  reserved_storage_key text unique,
  artifact_command_ref text
    check (artifact_command_ref is null
      or artifact_command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  reserved_project_ref text
    check (reserved_project_ref is null
      or reserved_project_ref ~ '^hprj_[A-Za-z0-9_-]{43}$'),
  reserved_artifact_kind text
    check (reserved_artifact_kind is null
      or reserved_artifact_kind in ('photo', 'document', 'warranty')),
  reserved_display_name text check (
    reserved_display_name is null
    or (reserved_display_name = btrim(reserved_display_name)
      and length(reserved_display_name) between 1 and 160
      and reserved_display_name !~ '[[:cntrl:]]')
  ),
  verified_media_type text check (
    verified_media_type is null or verified_media_type in (
      'application/pdf', 'image/jpeg', 'image/png'
    )
  ),
  verified_byte_length integer
    check (verified_byte_length is null
      or verified_byte_length between 1 and 26214400),
  verified_payload_sha256 text
    check (verified_payload_sha256 is null
      or verified_payload_sha256 ~ '^[a-f0-9]{64}$'),
  scan_provider text check (
    scan_provider is null
    or (scan_provider = btrim(scan_provider)
      and length(scan_provider) between 1 and 80
      and scan_provider !~ '[[:cntrl:]]')
  ),
  scan_version text check (
    scan_version is null
    or (scan_version = btrim(scan_version)
      and length(scan_version) between 1 and 80
      and scan_version !~ '[[:cntrl:]]')
  ),
  homeowner_artifact_ref text unique
    references public.homesrolo_homeowner_artifacts(artifact_ref),
  decision_recorded_at timestamptz,
  scan_completed_at timestamptz,
  copy_staged_at timestamptz,
  available_at timestamptz,
  primary key (handoff_ref, source_artifact_ref),
  unique (handoff_ref, manifest_ordinal),
  unique (controller_principal_ref, artifact_command_ref),
  foreign key (handoff_ref, home_ref, controller_principal_ref)
    references public.homesrolo_homeowner_handoffs(
      handoff_ref, home_ref, controller_principal_ref
    ),
  foreign key (reserved_project_ref, home_ref, controller_principal_ref)
    references public.homesrolo_homeowner_projects(
      project_ref, home_ref, controller_principal_ref
    ),
  check (descriptor = jsonb_build_object(
    'artifactRef', source_artifact_ref,
    'source', source,
    'projectionKind', projection_kind,
    'projectionVersion', projection_version,
    'mediaType', media_type,
    'byteLength', byte_length,
    'sha256', payload_sha256
  )),
  check (
    (media_type = 'application/pdf' and projection_kind in (
      'work_document_copy', 'work_completion_record',
      'work_warranty_record', 'work_invoice_receipt'
    ))
    or (media_type in ('image/jpeg', 'image/png')
      and projection_kind = 'work_photo_set')
  ),
  check (
    (decision = 'accepted') =
    (reserved_homeowner_artifact_ref is not null
      and reserved_storage_object_ref is not null
      and reserved_storage_key is not null
      and artifact_command_ref is not null
      and reserved_artifact_kind is not null
      and reserved_display_name is not null)
  ),
  check (reserved_storage_key is null
    or reserved_storage_key = home_ref || '/' || reserved_storage_object_ref),
  check (reserved_artifact_kind is null or reserved_artifact_kind = case
    when media_type in ('image/jpeg', 'image/png') then 'photo'
    when projection_kind = 'work_warranty_record' then 'warranty'
    else 'document'
  end),
  check (decision <> 'pending'
    or (scan_state = 'pending' and quarantine_state = 'isolated'
      and copy_state = 'not_requested' and decision_recorded_at is null)),
  check (decision <> 'rejected'
    or (scan_state = 'not_required' and quarantine_state = 'not_required'
      and copy_state = 'not_requested')),
  check (scan_state <> 'clean'
    or (verified_media_type is not null and verified_byte_length is not null
      and verified_payload_sha256 is not null and scan_provider is not null
      and scan_version is not null and scan_completed_at is not null)),
  check (verified_media_type is null or verified_media_type = media_type),
  check (verified_byte_length is null or verified_byte_length = byte_length),
  check (verified_payload_sha256 is null or verified_payload_sha256 = payload_sha256),
  check ((scan_provider is null) = (scan_version is null)),
  check (copy_state <> 'quarantined_clean'
    or (decision = 'accepted' and scan_state = 'clean'
      and quarantine_state = 'clean' and copy_staged_at is not null)),
  check (copy_state <> 'available'
    or (decision = 'accepted' and scan_state = 'clean'
      and quarantine_state = 'released' and homeowner_artifact_ref is not null
      and available_at is not null)),
  check (homeowner_artifact_ref is null
    or copy_state in ('available', 'reconciliation_required')),
  check (quarantine_state <> 'rejected' or quarantine_reason is not null),
  check (decision_recorded_at is null or decision <> 'pending'),
  check (scan_completed_at is null or decision = 'accepted'),
  check (copy_staged_at is null or decision = 'accepted'),
  check (available_at is null or decision = 'accepted')
);

create index homesrolo_handoff_items_pending_copy_idx
  on public.homesrolo_homeowner_handoff_items(handoff_ref, copy_state, manifest_ordinal);

-- Handoff decisions have their own idempotency ledgers. This leaves the
-- existing homeowner command-receipt action constraint untouched.
create table public.homesrolo_homeowner_handoff_acceptance_commands (
  principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  handoff_ref text not null unique,
  home_ref text not null,
  membership_ref text not null
    references public.homesrolo_homeowner_memberships(membership_ref),
  membership_revision integer not null check (membership_revision >= 1),
  reservation jsonb not null check (jsonb_typeof(reservation) = 'array'),
  consent_id text not null check (consent_id ~ '^hcons_[A-Za-z0-9_-]{43}$'),
  consent_receipt jsonb not null check (jsonb_typeof(consent_receipt) = 'object'),
  consent_digest text not null check (consent_digest ~ '^[a-f0-9]{64}$'),
  consent_replay_key text not null unique
    check (consent_replay_key ~ '^[a-f0-9]{64}$'),
  selection_digest text not null check (selection_digest ~ '^[a-f0-9]{64}$'),
  acceptance_statement_digest text not null
    check (acceptance_statement_digest ~ '^[a-f0-9]{64}$'),
  accepted_intent_at timestamptz not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  state text not null check (state in (
    'reserved', 'accepted', 'quarantined', 'reconciliation_required', 'expired'
  )),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (principal_ref, command_ref),
  foreign key (handoff_ref, home_ref, principal_ref)
    references public.homesrolo_homeowner_handoffs(
      handoff_ref, home_ref, controller_principal_ref
    ),
  check (updated_at >= created_at),
  check (accepted_intent_at <= created_at),
  check (consent_receipt ->> 'consentId' = consent_id),
  check (consent_receipt ->> 'receiptVersion' = 'homeowner-share.consent.v1'),
  check (consent_receipt ->> 'issuer' = 'homesrolo'),
  check (consent_receipt ->> 'audience' = 'jobrolo'),
  check (consent_receipt ->> 'purpose' = 'homeowner_work_records')
);

create table public.homesrolo_homeowner_handoff_rejection_commands (
  principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  command_ref text not null check (command_ref ~ '^hcmd_[A-Za-z0-9_-]{43}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  handoff_ref text not null unique,
  home_ref text not null,
  membership_ref text not null
    references public.homesrolo_homeowner_memberships(membership_ref),
  membership_revision integer not null check (membership_revision >= 1),
  reason_code text not null check (reason_code in (
    'not_wanted', 'wrong_home', 'unexpected_sender',
    'contents_not_expected', 'other'
  )),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null,
  primary key (principal_ref, command_ref),
  foreign key (handoff_ref, home_ref, principal_ref)
    references public.homesrolo_homeowner_handoffs(
      handoff_ref, home_ref, controller_principal_ref
  )
);

-- Exact-share claim attempts are admitted before any producer network call.
-- Only a domain-separated digest of the caller-supplied high-entropy share ID
-- is retained; this ledger is not a recipient catalog and cannot enumerate
-- Jobrolo offers.
create table public.homesrolo_homeowner_handoff_claim_attempts (
  attempt_ref bigint generated always as identity primary key,
  principal_ref text not null
    references public.homesrolo_homeowner_principals(principal_ref),
  home_ref text not null references public.homesrolo_private_homes(home_ref),
  membership_ref text not null
    references public.homesrolo_homeowner_memberships(membership_ref),
  membership_revision integer not null check (membership_revision >= 1),
  recipient_ref text not null,
  recipient_binding_revision integer not null
    check (recipient_binding_revision >= 1),
  claim_digest text not null check (claim_digest ~ '^[a-f0-9]{64}$'),
  attempted_at timestamptz not null,
  foreign key (recipient_ref, home_ref, principal_ref)
    references public.homesrolo_homeowner_handoff_recipients(
      recipient_ref, home_ref, controller_principal_ref
    )
);

create index homesrolo_handoff_claim_attempts_scope_time_idx
  on public.homesrolo_homeowner_handoff_claim_attempts(
    principal_ref, home_ref, attempted_at desc
  );
create index homesrolo_handoff_claim_attempts_time_idx
  on public.homesrolo_homeowner_handoff_claim_attempts(attempted_at);

alter table public.homesrolo_homeowner_handoff_recipients enable row level security;
alter table public.homesrolo_homeowner_handoffs enable row level security;
alter table public.homesrolo_homeowner_handoff_replay_conflicts enable row level security;
alter table public.homesrolo_homeowner_handoff_items enable row level security;
alter table public.homesrolo_homeowner_handoff_acceptance_commands enable row level security;
alter table public.homesrolo_homeowner_handoff_rejection_commands enable row level security;
alter table public.homesrolo_homeowner_handoff_claim_attempts enable row level security;

revoke all on table public.homesrolo_homeowner_handoff_recipients
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoffs
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoff_replay_conflicts
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoff_items
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoff_acceptance_commands
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoff_rejection_commands
  from public, anon, authenticated;
revoke all on table public.homesrolo_homeowner_handoff_claim_attempts
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.homesrolo_homeowner_handoff_recipients
  to service_role;
grant select, insert, update on table public.homesrolo_homeowner_handoffs
  to service_role;
grant select, insert on table public.homesrolo_homeowner_handoff_replay_conflicts
  to service_role;
grant select, insert, update on table public.homesrolo_homeowner_handoff_items
  to service_role;
grant select, insert, update on table public.homesrolo_homeowner_handoff_acceptance_commands
  to service_role;
grant select, insert on table public.homesrolo_homeowner_handoff_rejection_commands
  to service_role;

-- Immutability guards ensure even privileged application code cannot mutate a
-- recipient route, accepted wire record, or source descriptor in place.
create or replace function public.homesrolo_guard_handoff_recipient_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(new.recipient_ref, new.home_ref, new.controller_principal_ref, new.created_at)
    is distinct from
    row(old.recipient_ref, old.home_ref, old.controller_principal_ref, old.created_at) then
    raise exception 'handoff_recipient_binding_is_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.homesrolo_mark_homeowner_handoff_reconciliation(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_handoff_ref text,
  p_command_ref text,
  p_command_digest text,
  p_reason text,
  p_failed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_acceptance_commands%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  if p_reason not in (
    'fetch_outcome_unknown', 'storage_outcome_unknown',
    'database_commit_unknown', 'authority_changed', 'cleanup_required', 'other'
  ) then raise exception 'handoff_reconciliation_reason_invalid'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  select * into v_command
  from public.homesrolo_homeowner_handoff_acceptance_commands
  where handoff_ref = p_handoff_ref and principal_ref = p_principal_ref
    and command_ref = p_command_ref and command_digest = p_command_digest
  for update;
  if not found then raise exception 'handoff_acceptance_not_found'; end if;
  if v_handoff.state = 'reconciliation_required' then return to_jsonb(v_handoff); end if;
  if v_handoff.state not in ('accepting', 'quarantined') then
    raise exception 'handoff_not_reconcilable';
  end if;
  update public.homesrolo_homeowner_handoff_items
  set copy_state = 'reconciliation_required'
  where handoff_ref = p_handoff_ref and decision = 'accepted'
    and copy_state <> 'available';
  update public.homesrolo_homeowner_handoff_acceptance_commands
  set state = 'reconciliation_required', updated_at = p_failed_at,
      result = result || jsonb_build_object('state', 'reconciliation_required')
  where handoff_ref = p_handoff_ref;
  update public.homesrolo_homeowner_handoffs
  set state = 'reconciliation_required', state_changed_at = p_failed_at,
      reconciliation_required_at = p_failed_at,
      reconciliation_reason = p_reason, revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;
  return to_jsonb(v_handoff);
end;
$$;

-- External fetch or Storage outcomes can become unknown after authority is
-- revoked. This service-only closeout binds the immutable acceptance command
-- instead of requiring a now-impossible live membership.
create or replace function public.homesrolo_mark_homeowner_handoff_unknown(
  p_handoff_ref text,
  p_controller_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_failed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  select handoff.* into v_handoff
  from public.homesrolo_homeowner_handoffs handoff
  join public.homesrolo_homeowner_handoff_acceptance_commands command
    on command.handoff_ref = handoff.handoff_ref
  where handoff.handoff_ref = p_handoff_ref
    and handoff.controller_principal_ref = p_controller_principal_ref
    and command.principal_ref = p_controller_principal_ref
    and command.command_ref = p_command_ref
    and command.command_digest = p_command_digest
  for update of handoff;
  if not found then raise exception 'handoff_acceptance_not_found'; end if;
  if v_handoff.state = 'reconciliation_required' then return; end if;
  if v_handoff.state not in ('accepting', 'quarantined') then
    raise exception 'handoff_not_reconcilable';
  end if;
  update public.homesrolo_homeowner_handoff_items
  set copy_state = 'reconciliation_required'
  where handoff_ref = p_handoff_ref and decision = 'accepted'
    and copy_state <> 'available';
  update public.homesrolo_homeowner_handoff_acceptance_commands
  set state = 'reconciliation_required', updated_at = p_failed_at,
      result = result || jsonb_build_object('state', 'reconciliation_required')
  where handoff_ref = p_handoff_ref
    and principal_ref = p_controller_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest;
  update public.homesrolo_homeowner_handoffs
  set state = 'reconciliation_required', state_changed_at = p_failed_at,
      reconciliation_required_at = p_failed_at,
      reconciliation_reason = 'database_commit_unknown',
      revision = revision + 1
  where handoff_ref = p_handoff_ref;
end;
$$;

create or replace function public.homesrolo_expire_homeowner_handoff(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_handoff_ref text,
  p_expired_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if v_handoff.state = 'expired' then return to_jsonb(v_handoff); end if;
  if p_expired_at < v_handoff.expires_at then
    raise exception 'handoff_not_expired';
  end if;
  if v_handoff.state not in ('received', 'accepting') then
    raise exception 'handoff_not_expirable';
  end if;
  update public.homesrolo_homeowner_handoff_items
  set copy_state = 'reconciliation_required'
  where handoff_ref = p_handoff_ref and decision = 'accepted';
  update public.homesrolo_homeowner_handoff_acceptance_commands
  set state = 'expired', updated_at = p_expired_at,
      result = result || jsonb_build_object('state', 'expired')
  where handoff_ref = p_handoff_ref;
  update public.homesrolo_homeowner_handoffs
  set state = 'expired', state_changed_at = p_expired_at,
      expired_at = p_expired_at, revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;
  return to_jsonb(v_handoff);
end;
$$;

create or replace function public.homesrolo_reserve_homeowner_handoff_acceptance(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_handoff_ref text,
  p_reservations jsonb,
  p_consent_receipt jsonb,
  p_consent_digest text,
  p_consent_replay_key text,
  p_selection_digest text,
  p_acceptance_statement_digest text,
  p_accepted_intent_at timestamptz,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_acceptance_commands%rowtype;
  v_item public.homesrolo_homeowner_handoff_items%rowtype;
  v_entry jsonb;
  v_project_ref text;
  v_artifact_kind text;
  v_accepted_count integer := 0;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'homesrolo:handoff-accept:' || p_principal_ref || ':' || p_command_ref, 0
    )
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref
    and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = v_handoff.recipient_ref
      and revision = v_handoff.recipient_binding_revision
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and state = 'active'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;

  select * into v_command
  from public.homesrolo_homeowner_handoff_acceptance_commands
  where principal_ref = p_principal_ref and command_ref = p_command_ref
  for update;
  if found then
    if v_command.command_digest <> p_command_digest
      or v_command.handoff_ref <> p_handoff_ref
      or v_command.reservation <> p_reservations
      or v_command.consent_receipt <> p_consent_receipt
      or v_command.consent_digest <> p_consent_digest
      or v_command.consent_replay_key <> p_consent_replay_key
      or v_command.selection_digest <> p_selection_digest
      or v_command.acceptance_statement_digest <> p_acceptance_statement_digest
      or v_command.accepted_intent_at <> p_accepted_intent_at then
      raise exception 'handoff_acceptance_command_mismatch';
    end if;
    return v_command.result;
  end if;
  if exists (
    select 1 from public.homesrolo_homeowner_handoff_acceptance_commands
    where handoff_ref = p_handoff_ref
  ) then raise exception 'handoff_acceptance_already_reserved'; end if;
  if v_handoff.state <> 'received' then
    raise exception 'handoff_not_receivable';
  end if;
  if p_requested_at >= v_handoff.expires_at then
    raise exception 'handoff_expired';
  end if;
  if p_consent_digest !~ '^[a-f0-9]{64}$'
    or p_consent_replay_key !~ '^[a-f0-9]{64}$'
    or p_selection_digest !~ '^[a-f0-9]{64}$'
    or p_acceptance_statement_digest !~ '^[a-f0-9]{64}$'
    or p_accepted_intent_at < v_handoff.authorized_at
    or p_accepted_intent_at > p_requested_at
    or p_accepted_intent_at >= v_handoff.expires_at
    or jsonb_typeof(p_consent_receipt) is distinct from 'object'
    or not (p_consent_receipt ?& array[
      'receiptVersion', 'issuer', 'audience', 'purpose', 'consentId',
      'shareId', 'recipientRef', 'manifestDigest', 'manifestContractVersion',
      'consentPolicyVersion', 'acceptedAt', 'expiresAt', 'signing'
    ])
    or p_consent_receipt - 'receiptVersion' - 'issuer' - 'audience'
      - 'purpose' - 'consentId' - 'shareId' - 'recipientRef'
      - 'manifestDigest' - 'manifestContractVersion' - 'consentPolicyVersion'
      - 'acceptedAt' - 'expiresAt' - 'signing' <> '{}'::jsonb
    or p_consent_receipt ->> 'receiptVersion' <> 'homeowner-share.consent.v1'
    or p_consent_receipt ->> 'issuer' <> 'homesrolo'
    or p_consent_receipt ->> 'audience' <> 'jobrolo'
    or p_consent_receipt ->> 'purpose' <> 'homeowner_work_records'
    or p_consent_receipt ->> 'consentId' !~ '^hcons_[A-Za-z0-9_-]{43}$'
    or p_consent_receipt ->> 'shareId' <> v_handoff.share_id
    or p_consent_receipt ->> 'recipientRef' <> v_handoff.recipient_ref
    or p_consent_receipt ->> 'manifestDigest' <> v_handoff.manifest_digest
    or p_consent_receipt ->> 'manifestContractVersion' <> 'homeowner-share.v1'
    or p_consent_receipt ->> 'consentPolicyVersion'
      <> 'homesrolo-share-consent.v1'
    or p_consent_receipt ->> 'acceptedAt'
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or (p_consent_receipt ->> 'acceptedAt')::timestamptz
      <> p_accepted_intent_at
    or p_consent_receipt ->> 'expiresAt'
      <> v_handoff.manifest ->> 'expiresAt'
    or jsonb_typeof(p_consent_receipt -> 'signing') is distinct from 'object'
    or not ((p_consent_receipt -> 'signing') ?& array[
      'algorithm', 'keyId', 'signature'
    ])
    or (p_consent_receipt -> 'signing')
      - 'algorithm' - 'keyId' - 'signature' <> '{}'::jsonb
    or p_consent_receipt #>> '{signing,algorithm}' <> 'Ed25519'
    or p_consent_receipt #>> '{signing,keyId}'
      !~ '^[A-Za-z0-9._-]{1,80}$'
    or p_consent_receipt #>> '{signing,signature}'
      !~ '^[A-Za-z0-9_-]{86}$' then
    raise exception 'handoff_consent_invalid';
  end if;
  if jsonb_typeof(p_reservations) is distinct from 'array'
    or jsonb_array_length(p_reservations) <> (
      select count(*)
      from public.homesrolo_homeowner_handoff_items
      where handoff_ref = p_handoff_ref
    ) then raise exception 'handoff_reservations_incomplete'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_reservations) entry
    group by entry ->> 'sourceArtifactRef'
    having count(*) > 1
  ) then raise exception 'handoff_reservation_duplicated'; end if;

  for v_entry in select value from jsonb_array_elements(p_reservations)
  loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or not (v_entry ?& array['sourceArtifactRef', 'decision'])
      or v_entry ->> 'sourceArtifactRef' !~ '^hproj_[A-Za-z0-9_-]{43}$'
      or v_entry ->> 'decision' not in ('accepted', 'rejected') then
      raise exception 'handoff_reservation_invalid';
    end if;
    select * into v_item
    from public.homesrolo_homeowner_handoff_items
    where handoff_ref = p_handoff_ref
      and source_artifact_ref = v_entry ->> 'sourceArtifactRef'
    for update;
    if not found or v_item.decision <> 'pending' then
      raise exception 'handoff_item_not_pending';
    end if;

    if v_entry ->> 'decision' = 'rejected' then
      if v_entry - 'sourceArtifactRef' - 'decision' <> '{}'::jsonb then
        raise exception 'handoff_rejection_reservation_invalid';
      end if;
      update public.homesrolo_homeowner_handoff_items
      set decision = 'rejected', scan_state = 'not_required',
          quarantine_state = 'not_required', copy_state = 'not_requested',
          decision_recorded_at = p_requested_at
      where handoff_ref = p_handoff_ref
        and source_artifact_ref = v_item.source_artifact_ref;
      continue;
    end if;

    if not (v_entry ?& array[
      'homeownerArtifactRef', 'storageObjectRef', 'artifactCommandRef',
      'displayName'
    ])
      or v_entry - 'sourceArtifactRef' - 'decision' - 'homeownerArtifactRef'
        - 'storageObjectRef' - 'artifactCommandRef' - 'displayName'
        - 'projectRef' <> '{}'::jsonb
      or v_entry ->> 'homeownerArtifactRef' !~ '^hart_[A-Za-z0-9_-]{43}$'
      or v_entry ->> 'storageObjectRef' !~ '^hobj_[A-Za-z0-9_-]{43}$'
      or v_entry ->> 'artifactCommandRef' !~ '^hcmd_[A-Za-z0-9_-]{43}$'
      or v_entry ->> 'displayName' <> btrim(v_entry ->> 'displayName')
      or length(v_entry ->> 'displayName') not between 1 and 160
      or v_entry ->> 'displayName' ~ '[[:cntrl:]]'
      or (v_entry ? 'projectRef'
        and jsonb_typeof(v_entry -> 'projectRef') not in ('string', 'null')) then
      raise exception 'handoff_copy_reservation_invalid';
    end if;
    v_project_ref := v_entry ->> 'projectRef';
    if v_project_ref is not null and (
      v_project_ref !~ '^hprj_[A-Za-z0-9_-]{43}$'
      or not exists (
        select 1 from public.homesrolo_homeowner_projects
        where project_ref = v_project_ref
          and home_ref = p_home_ref
          and controller_principal_ref = p_principal_ref
      )
    ) then raise exception 'handoff_project_not_authorized'; end if;
    if exists (
      select 1 from public.homesrolo_homeowner_artifacts
      where artifact_ref = v_entry ->> 'homeownerArtifactRef'
        or storage_object_ref = v_entry ->> 'storageObjectRef'
        or storage_key = p_home_ref || '/' || (v_entry ->> 'storageObjectRef')
        or (controller_principal_ref = p_principal_ref
          and command_ref = v_entry ->> 'artifactCommandRef')
    ) then raise exception 'handoff_copy_identity_conflict'; end if;

    v_artifact_kind := case
      when v_item.media_type in ('image/jpeg', 'image/png') then 'photo'
      when v_item.projection_kind = 'work_warranty_record' then 'warranty'
      else 'document'
    end;
    update public.homesrolo_homeowner_handoff_items
    set decision = 'accepted', scan_state = 'pending',
        quarantine_state = 'isolated', copy_state = 'reserved',
        reserved_homeowner_artifact_ref = v_entry ->> 'homeownerArtifactRef',
        reserved_storage_object_ref = v_entry ->> 'storageObjectRef',
        reserved_storage_key = p_home_ref || '/' || (v_entry ->> 'storageObjectRef'),
        artifact_command_ref = v_entry ->> 'artifactCommandRef',
        reserved_project_ref = v_project_ref,
        reserved_artifact_kind = v_artifact_kind,
        reserved_display_name = v_entry ->> 'displayName',
        decision_recorded_at = p_requested_at
    where handoff_ref = p_handoff_ref
      and source_artifact_ref = v_item.source_artifact_ref;
    v_accepted_count := v_accepted_count + 1;
  end loop;

  if v_accepted_count < 1 then
    raise exception 'handoff_acceptance_requires_item';
  end if;
  update public.homesrolo_homeowner_handoffs
  set state = 'accepting', state_changed_at = p_requested_at,
      accepting_at = p_requested_at, revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;

  select jsonb_build_object(
    'handoffRef', p_handoff_ref,
    'shareId', v_handoff.share_id,
    'state', 'accepting',
    'selectionDigest', p_selection_digest,
    'acceptanceStatementDigest', p_acceptance_statement_digest,
    'consent', p_consent_receipt,
    'consentDigest', p_consent_digest,
    'consentReplayKey', p_consent_replay_key,
    'acceptedIntentAt', p_accepted_intent_at,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'sourceArtifactRef', item.source_artifact_ref,
      'decision', item.decision,
      'homeownerArtifactRef', item.reserved_homeowner_artifact_ref,
      'storageObjectRef', item.reserved_storage_object_ref,
      'storageKey', item.reserved_storage_key,
      'artifactCommandRef', item.artifact_command_ref,
      'projectRef', item.reserved_project_ref,
      'artifactKind', item.reserved_artifact_kind,
      'displayName', item.reserved_display_name
    ) order by item.manifest_ordinal), '[]'::jsonb)
  ) into v_result
  from public.homesrolo_homeowner_handoff_items item
  where item.handoff_ref = p_handoff_ref;

  insert into public.homesrolo_homeowner_handoff_acceptance_commands (
    principal_ref, command_ref, command_digest, handoff_ref, home_ref,
    membership_ref, membership_revision, reservation, consent_id,
    consent_receipt, consent_digest, consent_replay_key, selection_digest,
    acceptance_statement_digest, accepted_intent_at, result, state,
    created_at, updated_at
  ) values (
    p_principal_ref, p_command_ref, p_command_digest, p_handoff_ref, p_home_ref,
    p_membership_ref, p_membership_revision, p_reservations,
    p_consent_receipt ->> 'consentId', p_consent_receipt, p_consent_digest,
    p_consent_replay_key, p_selection_digest, p_acceptance_statement_digest,
    p_accepted_intent_at, v_result,
    'reserved', p_requested_at, p_requested_at
  );
  return v_result;
end;
$$;

create or replace function public.homesrolo_reject_homeowner_handoff(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_command_ref text,
  p_command_digest text,
  p_handoff_ref text,
  p_reason_code text,
  p_rejected_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_rejection_commands%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'homesrolo:handoff-reject:' || p_principal_ref || ':' || p_command_ref, 0
    )
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref
    and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = v_handoff.recipient_ref
      and revision = v_handoff.recipient_binding_revision
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and state = 'active'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;

  select * into v_command
  from public.homesrolo_homeowner_handoff_rejection_commands
  where principal_ref = p_principal_ref and command_ref = p_command_ref;
  if found then
    if v_command.command_digest <> p_command_digest
      or v_command.handoff_ref <> p_handoff_ref
      or v_command.reason_code <> p_reason_code then
      raise exception 'handoff_rejection_command_mismatch';
    end if;
    return v_command.result;
  end if;
  if p_reason_code not in (
    'not_wanted', 'wrong_home', 'unexpected_sender',
    'contents_not_expected', 'other'
  ) then raise exception 'handoff_rejection_reason_invalid'; end if;
  if v_handoff.state <> 'received' then
    raise exception 'handoff_not_rejectable';
  end if;
  if p_rejected_at >= v_handoff.expires_at then
    raise exception 'handoff_expired';
  end if;

  update public.homesrolo_homeowner_handoff_items
  set decision = 'rejected', scan_state = 'not_required',
      quarantine_state = 'not_required', copy_state = 'not_requested',
      decision_recorded_at = p_rejected_at
  where handoff_ref = p_handoff_ref and decision = 'pending';
  update public.homesrolo_homeowner_handoffs
  set state = 'rejected', state_changed_at = p_rejected_at,
      rejected_at = p_rejected_at, revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;
  v_result := jsonb_build_object(
    'handoffRef', p_handoff_ref, 'shareId', v_handoff.share_id,
    'state', 'rejected', 'reasonCode', p_reason_code
  );
  insert into public.homesrolo_homeowner_handoff_rejection_commands (
    principal_ref, command_ref, command_digest, handoff_ref, home_ref,
    membership_ref, membership_revision, reason_code, result, created_at
  ) values (
    p_principal_ref, p_command_ref, p_command_digest, p_handoff_ref, p_home_ref,
    p_membership_ref, p_membership_revision, p_reason_code, v_result,
    p_rejected_at
  );
  return v_result;
end;
$$;

create trigger homesrolo_guard_handoff_recipient_immutability_trigger
before update on public.homesrolo_homeowner_handoff_recipients
for each row execute function public.homesrolo_guard_handoff_recipient_immutability();

create or replace function public.homesrolo_guard_handoff_wire_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(
    new.handoff_ref, new.share_id, new.recipient_ref,
    new.recipient_binding_revision, new.home_ref, new.controller_principal_ref,
    new.contract_version, new.purpose, new.generation, new.manifest,
    new.manifest_digest, new.manifest_artifact_count, new.manifest_total_bytes,
    new.authorization_id, new.authorization_receipt, new.authorization_digest,
    new.authorization_replay_key, new.delivery_digest, new.issued_at,
    new.expires_at, new.authorized_at, new.received_at
  ) is distinct from row(
    old.handoff_ref, old.share_id, old.recipient_ref,
    old.recipient_binding_revision, old.home_ref, old.controller_principal_ref,
    old.contract_version, old.purpose, old.generation, old.manifest,
    old.manifest_digest, old.manifest_artifact_count, old.manifest_total_bytes,
    old.authorization_id, old.authorization_receipt, old.authorization_digest,
    old.authorization_replay_key, old.delivery_digest, old.issued_at,
    old.expires_at, old.authorized_at, old.received_at
  ) then
    raise exception 'handoff_wire_record_is_immutable';
  end if;
  return new;
end;
$$;

create trigger homesrolo_guard_handoff_wire_immutability_trigger
before update on public.homesrolo_homeowner_handoffs
for each row execute function public.homesrolo_guard_handoff_wire_immutability();

create or replace function public.homesrolo_guard_handoff_item_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(
    new.handoff_ref, new.source_artifact_ref, new.manifest_ordinal, new.home_ref,
    new.controller_principal_ref, new.descriptor, new.source,
    new.projection_kind, new.projection_version, new.media_type,
    new.byte_length, new.payload_sha256
  ) is distinct from row(
    old.handoff_ref, old.source_artifact_ref, old.manifest_ordinal, old.home_ref,
    old.controller_principal_ref, old.descriptor, old.source,
    old.projection_kind, old.projection_version, old.media_type,
    old.byte_length, old.payload_sha256
  ) then
    raise exception 'handoff_item_descriptor_is_immutable';
  end if;
  if old.reserved_homeowner_artifact_ref is not null and row(
    new.reserved_homeowner_artifact_ref, new.reserved_storage_object_ref,
    new.reserved_storage_key, new.artifact_command_ref,
    new.reserved_project_ref, new.reserved_artifact_kind,
    new.reserved_display_name
  ) is distinct from row(
    old.reserved_homeowner_artifact_ref, old.reserved_storage_object_ref,
    old.reserved_storage_key, old.artifact_command_ref,
    old.reserved_project_ref, old.reserved_artifact_kind,
    old.reserved_display_name
  ) then
    raise exception 'handoff_item_copy_reservation_is_immutable';
  end if;
  if old.decision <> 'pending' and new.decision is distinct from old.decision then
    raise exception 'handoff_item_decision_is_immutable';
  end if;
  return new;
end;
$$;

create trigger homesrolo_guard_handoff_item_immutability_trigger
before update on public.homesrolo_homeowner_handoff_items
for each row execute function public.homesrolo_guard_handoff_item_immutability();

create or replace function public.homesrolo_guard_handoff_acceptance_command_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(
    new.principal_ref, new.command_ref, new.command_digest, new.handoff_ref,
    new.home_ref, new.membership_ref, new.membership_revision,
    new.reservation, new.consent_id, new.consent_receipt,
    new.consent_digest, new.consent_replay_key, new.selection_digest,
    new.acceptance_statement_digest, new.accepted_intent_at, new.created_at
  ) is distinct from row(
    old.principal_ref, old.command_ref, old.command_digest, old.handoff_ref,
    old.home_ref, old.membership_ref, old.membership_revision,
    old.reservation, old.consent_id, old.consent_receipt,
    old.consent_digest, old.consent_replay_key, old.selection_digest,
    old.acceptance_statement_digest, old.accepted_intent_at, old.created_at
  ) then
    raise exception 'handoff_acceptance_command_is_immutable';
  end if;
  return new;
end;
$$;

create trigger homesrolo_guard_handoff_acceptance_command_immutability_trigger
before update on public.homesrolo_homeowner_handoff_acceptance_commands
for each row execute function public.homesrolo_guard_handoff_acceptance_command_immutability();

create or replace function public.homesrolo_bind_homeowner_handoff_recipient(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_recipient_ref text,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.homesrolo_homeowner_handoff_recipients%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff-recipient:' || p_recipient_ref, 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;

  select * into v_recipient
  from public.homesrolo_homeowner_handoff_recipients
  where recipient_ref = p_recipient_ref
  for update;
  if found then
    if v_recipient.home_ref <> p_home_ref
      or v_recipient.controller_principal_ref <> p_principal_ref then
      raise exception 'handoff_recipient_binding_conflict';
    end if;
    if v_recipient.state <> 'active' then
      raise exception 'handoff_recipient_revoked';
    end if;
    return to_jsonb(v_recipient);
  end if;

  insert into public.homesrolo_homeowner_handoff_recipients (
    recipient_ref, home_ref, controller_principal_ref, state, revision,
    created_at, updated_at
  ) values (
    p_recipient_ref, p_home_ref, p_principal_ref, 'active', 1,
    p_requested_at, p_requested_at
  ) returning * into v_recipient;
  return to_jsonb(v_recipient);
end;
$$;

create or replace function public.homesrolo_reserve_homeowner_handoff_claim_attempt(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_recipient_ref text,
  p_recipient_binding_revision integer,
  p_claim_digest text,
  p_attempted_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_scope_count integer;
  v_global_count integer;
begin
  if p_claim_digest !~ '^[a-f0-9]{64}$'
    or p_recipient_ref !~ '^hrcp_[A-Za-z0-9_-]{43}$'
    or p_recipient_binding_revision < 1
    or p_attempted_at is null
    or p_attempted_at < v_now - interval '5 minutes'
    or p_attempted_at > v_now + interval '1 minute' then
    raise exception 'handoff_claim_attempt_invalid';
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
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = p_recipient_ref
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and revision = p_recipient_binding_revision
      and state = 'active'
  ) then
    raise exception 'handoff_recipient_binding_conflict';
  end if;

  -- Serialize cleanup, the bounded global cap, and scoped admission so
  -- concurrent service instances cannot over-admit.
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff-claim-attempts:global', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'homesrolo:handoff-claim-attempts:' || p_principal_ref || ':' || p_home_ref,
    0
  ));

  -- Recheck authority after waiting for admission locks. Revocation or
  -- revision changes must win before a reservation is persisted.
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) or not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = p_recipient_ref
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and revision = p_recipient_binding_revision
      and state = 'active'
  ) then
    raise exception 'handoff_claim_authority_changed';
  end if;

  delete from public.homesrolo_homeowner_handoff_claim_attempts
  where attempted_at < v_now - interval '24 hours';

  select count(*) into v_global_count
  from public.homesrolo_homeowner_handoff_claim_attempts;
  if v_global_count >= 100000 then return false; end if;

  select count(*) into v_scope_count
  from public.homesrolo_homeowner_handoff_claim_attempts
  where principal_ref = p_principal_ref
    and home_ref = p_home_ref
    and attempted_at >= v_now - interval '1 hour';
  if v_scope_count >= 10 then return false; end if;

  insert into public.homesrolo_homeowner_handoff_claim_attempts (
    principal_ref, home_ref, membership_ref, membership_revision,
    recipient_ref, recipient_binding_revision, claim_digest, attempted_at
  ) values (
    p_principal_ref, p_home_ref, p_membership_ref, p_membership_revision,
    p_recipient_ref, p_recipient_binding_revision, p_claim_digest, v_now
  );
  return true;
end;
$$;

create or replace function public.homesrolo_revoke_homeowner_handoff_recipient(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_recipient_ref text,
  p_expected_recipient_revision integer,
  p_revoked_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.homesrolo_homeowner_handoff_recipients%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_recipient_ref !~ '^hrcp_[A-Za-z0-9_-]{43}$'
    or p_expected_recipient_revision < 1
    or p_revoked_at is null
    or p_revoked_at < v_now - interval '5 minutes'
    or p_revoked_at > v_now + interval '1 minute' then
    raise exception 'handoff_recipient_revocation_invalid';
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

  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff-recipient:' || p_recipient_ref, 0)
  );
  select * into v_recipient
  from public.homesrolo_homeowner_handoff_recipients
  where recipient_ref = p_recipient_ref
  for update;
  if not found
    or v_recipient.home_ref <> p_home_ref
    or v_recipient.controller_principal_ref <> p_principal_ref then
    raise exception 'handoff_recipient_binding_conflict';
  end if;
  if v_recipient.state = 'revoked'
    and v_recipient.revision = p_expected_recipient_revision + 1 then
    return to_jsonb(v_recipient);
  end if;
  if v_recipient.state <> 'active'
    or v_recipient.revision <> p_expected_recipient_revision then
    raise exception 'handoff_recipient_revision_conflict';
  end if;

  update public.homesrolo_homeowner_handoff_recipients
  set state = 'revoked',
    revision = revision + 1,
    updated_at = p_revoked_at,
    revoked_at = p_revoked_at
  where recipient_ref = p_recipient_ref
  returning * into v_recipient;
  return to_jsonb(v_recipient);
end;
$$;

create or replace function public.homesrolo_receive_homeowner_handoff(
  p_handoff_ref text,
  p_recipient_ref text,
  p_share_id text,
  p_manifest jsonb,
  p_manifest_digest text,
  p_authorization_receipt jsonb,
  p_authorization_digest text,
  p_authorization_replay_key text,
  p_delivery_digest text,
  p_received_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient public.homesrolo_homeowner_handoff_recipients%rowtype;
  v_existing public.homesrolo_homeowner_handoffs%rowtype;
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_artifact record;
  v_descriptor jsonb;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_authorized_at timestamptz;
  v_artifact_count integer := 0;
  v_total_bytes bigint := 0;
  v_conflict_at timestamptz;
begin
  if p_handoff_ref !~ '^hhof_[A-Za-z0-9_-]{43}$'
    or p_manifest_digest !~ '^[a-f0-9]{64}$'
    or p_authorization_digest !~ '^[a-f0-9]{64}$'
    or p_authorization_replay_key !~ '^[a-f0-9]{64}$'
    or p_delivery_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'handoff_digest_invalid';
  end if;
  if jsonb_typeof(p_manifest) is distinct from 'object'
    or not (p_manifest ?& array[
      'contractVersion', 'issuer', 'audience', 'purpose', 'shareId',
      'recipientRef', 'generation', 'issuedAt', 'expiresAt', 'nonce', 'artifacts'
    ])
    or p_manifest - 'contractVersion' - 'issuer' - 'audience' - 'purpose'
      - 'shareId' - 'recipientRef' - 'generation' - 'issuedAt' - 'expiresAt'
      - 'nonce' - 'artifacts' <> '{}'::jsonb
    or p_manifest ->> 'contractVersion' <> 'homeowner-share.v1'
    or p_manifest ->> 'issuer' <> 'jobrolo'
    or p_manifest ->> 'audience' <> 'homesrolo'
    or p_manifest ->> 'purpose' <> 'homeowner_work_records'
    or p_manifest ->> 'shareId' <> p_share_id
    or p_manifest ->> 'recipientRef' <> p_recipient_ref
    or p_manifest ->> 'generation' <> '1'
    or p_share_id !~ '^hshr_[A-Za-z0-9_-]{43}$'
    or p_recipient_ref !~ '^hrcp_[A-Za-z0-9_-]{43}$'
    or p_manifest ->> 'nonce' !~ '^hnce_[A-Za-z0-9_-]{43}$'
    or p_manifest ->> 'issuedAt'
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_manifest ->> 'expiresAt'
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or jsonb_typeof(p_manifest -> 'artifacts') is distinct from 'array'
    or jsonb_array_length(p_manifest -> 'artifacts') not between 1 and 25 then
    raise exception 'handoff_manifest_invalid';
  end if;

  begin
    v_issued_at := (p_manifest ->> 'issuedAt')::timestamptz;
    v_expires_at := (p_manifest ->> 'expiresAt')::timestamptz;
  exception when others then
    raise exception 'handoff_manifest_time_invalid';
  end;
  if v_expires_at - v_issued_at < interval '1 day'
    or v_expires_at - v_issued_at > interval '30 days' then
    raise exception 'handoff_manifest_lifetime_invalid';
  end if;

  for v_artifact in
    select value as descriptor, ordinality::integer as ordinal
    from jsonb_array_elements(p_manifest -> 'artifacts') with ordinality
  loop
    v_descriptor := v_artifact.descriptor;
    if jsonb_typeof(v_descriptor) is distinct from 'object'
      or not (v_descriptor ?& array[
        'artifactRef', 'source', 'projectionKind', 'projectionVersion',
        'mediaType', 'byteLength', 'sha256'
      ])
      or v_descriptor - 'artifactRef' - 'source' - 'projectionKind'
        - 'projectionVersion' - 'mediaType' - 'byteLength' - 'sha256'
        <> '{}'::jsonb
      or v_descriptor ->> 'artifactRef' !~ '^hproj_[A-Za-z0-9_-]{43}$'
      or v_descriptor ->> 'source' <> 'homeowner_release'
      or v_descriptor ->> 'projectionKind' not in (
        'work_document_copy', 'work_photo_set', 'work_completion_record',
        'work_warranty_record', 'work_invoice_receipt'
      )
      or v_descriptor ->> 'projectionVersion' !~ '^[0-9]+$'
      or (v_descriptor ->> 'projectionVersion')::integer not between 1 and 100
      or v_descriptor ->> 'mediaType' not in (
        'application/pdf', 'image/jpeg', 'image/png'
      )
      or not (
        (v_descriptor ->> 'mediaType' = 'application/pdf'
          and v_descriptor ->> 'projectionKind' in (
            'work_document_copy', 'work_completion_record',
            'work_warranty_record', 'work_invoice_receipt'
          ))
        or (v_descriptor ->> 'mediaType' in ('image/jpeg', 'image/png')
          and v_descriptor ->> 'projectionKind' = 'work_photo_set')
      )
      or v_descriptor ->> 'byteLength' !~ '^[0-9]+$'
      or (v_descriptor ->> 'byteLength')::bigint not between 1 and 26214400
      or v_descriptor ->> 'sha256' !~ '^[a-f0-9]{64}$' then
      raise exception 'handoff_artifact_descriptor_invalid';
    end if;
    v_artifact_count := v_artifact_count + 1;
    v_total_bytes := v_total_bytes + (v_descriptor ->> 'byteLength')::bigint;
    if v_total_bytes > 104857600 then
      raise exception 'handoff_artifact_total_exceeded';
    end if;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'artifacts') descriptor
    group by descriptor ->> 'artifactRef'
    having count(*) > 1
  ) then raise exception 'handoff_artifact_ref_duplicated'; end if;

  if jsonb_typeof(p_authorization_receipt) is distinct from 'object'
    or not (p_authorization_receipt ?& array[
      'receiptVersion', 'issuer', 'audience', 'purpose', 'authorizationId',
      'shareId', 'recipientRef', 'manifestDigest', 'manifestContractVersion',
      'authorizedByRole', 'authorizedActorRef', 'authorizationPolicyVersion',
      'authorizedAt', 'expiresAt', 'signing'
    ])
    or p_authorization_receipt - 'receiptVersion' - 'issuer' - 'audience'
      - 'purpose' - 'authorizationId' - 'shareId' - 'recipientRef'
      - 'manifestDigest' - 'manifestContractVersion' - 'authorizedByRole'
      - 'authorizedActorRef' - 'authorizationPolicyVersion' - 'authorizedAt'
      - 'expiresAt' - 'signing' <> '{}'::jsonb
    or p_authorization_receipt ->> 'receiptVersion'
      <> 'homeowner-share.authorization.v1'
    or p_authorization_receipt ->> 'issuer' <> 'jobrolo'
    or p_authorization_receipt ->> 'audience' <> 'homesrolo'
    or p_authorization_receipt ->> 'purpose' <> 'homeowner_work_records'
    or p_authorization_receipt ->> 'authorizationId'
      !~ '^hauth_[A-Za-z0-9_-]{43}$'
    or p_authorization_receipt ->> 'shareId' <> p_share_id
    or p_authorization_receipt ->> 'recipientRef' <> p_recipient_ref
    or p_authorization_receipt ->> 'manifestDigest' <> p_manifest_digest
    or p_authorization_receipt ->> 'manifestContractVersion'
      <> 'homeowner-share.v1'
    or p_authorization_receipt ->> 'authorizedByRole' not in ('owner', 'admin')
    or p_authorization_receipt ->> 'authorizedActorRef'
      !~ '^hactor_[A-Za-z0-9_-]{43}$'
    or p_authorization_receipt ->> 'authorizationPolicyVersion'
      <> 'jobrolo-homeowner-disclosure.v1'
    or p_authorization_receipt ->> 'authorizedAt'
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_authorization_receipt ->> 'expiresAt' <> p_manifest ->> 'expiresAt'
    or jsonb_typeof(p_authorization_receipt -> 'signing') is distinct from 'object'
    or not ((p_authorization_receipt -> 'signing') ?& array[
      'algorithm', 'keyId', 'signature'
    ])
    or (p_authorization_receipt -> 'signing')
      - 'algorithm' - 'keyId' - 'signature' <> '{}'::jsonb
    or p_authorization_receipt #>> '{signing,algorithm}' <> 'Ed25519'
    or p_authorization_receipt #>> '{signing,keyId}'
      !~ '^[A-Za-z0-9._-]{1,80}$'
    or p_authorization_receipt #>> '{signing,signature}'
      !~ '^[A-Za-z0-9_-]{86}$' then
    raise exception 'handoff_authorization_invalid';
  end if;
  begin
    v_authorized_at := (p_authorization_receipt ->> 'authorizedAt')::timestamptz;
  exception when others then
    raise exception 'handoff_authorization_time_invalid';
  end;
  if v_authorized_at < v_issued_at or v_authorized_at >= v_expires_at then
    raise exception 'handoff_authorization_time_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff-share:' || p_share_id, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff-authorization:' || p_authorization_replay_key, 0)
  );

  select * into v_recipient
  from public.homesrolo_homeowner_handoff_recipients
  where recipient_ref = p_recipient_ref and state = 'active'
  for share;
  if not found then raise exception 'handoff_recipient_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where principal_ref = v_recipient.controller_principal_ref
      and home_ref = v_recipient.home_ref
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;

  select * into v_existing
  from public.homesrolo_homeowner_handoffs
  where share_id = p_share_id
    or authorization_replay_key = p_authorization_replay_key
  order by (share_id = p_share_id) desc
  limit 1
  for update;
  if found then
    if v_existing.share_id = p_share_id
      and v_existing.recipient_ref = p_recipient_ref
      and v_existing.home_ref = v_recipient.home_ref
      and v_existing.controller_principal_ref = v_recipient.controller_principal_ref
      and v_existing.manifest = p_manifest
      and v_existing.manifest_digest = p_manifest_digest
      and v_existing.authorization_receipt = p_authorization_receipt
      and v_existing.authorization_digest = p_authorization_digest
      and v_existing.authorization_replay_key = p_authorization_replay_key
      and v_existing.delivery_digest = p_delivery_digest then
      return jsonb_build_object(
        'handoff', to_jsonb(v_existing), 'replayed', true, 'quarantined',
        v_existing.state = 'quarantined'
      );
    end if;

    v_conflict_at := greatest(p_received_at, v_existing.state_changed_at);
    insert into public.homesrolo_homeowner_handoff_replay_conflicts (
      existing_handoff_ref, incoming_handoff_ref, incoming_share_id,
      incoming_recipient_ref,
      incoming_manifest, incoming_manifest_digest,
      incoming_authorization_receipt, incoming_authorization_digest,
      incoming_authorization_replay_key, incoming_delivery_digest, detected_at
    ) values (
      v_existing.handoff_ref, p_handoff_ref, p_share_id, p_recipient_ref,
      p_manifest, p_manifest_digest, p_authorization_receipt,
      p_authorization_digest, p_authorization_replay_key,
      p_delivery_digest, v_conflict_at
    ) on conflict (existing_handoff_ref, incoming_delivery_digest) do nothing;

    update public.homesrolo_homeowner_artifacts artifact
    set state = 'uploading', available_at = null
    where exists (
      select 1 from public.homesrolo_homeowner_handoff_items item
      where item.handoff_ref = v_existing.handoff_ref
        and item.homeowner_artifact_ref = artifact.artifact_ref
    );
    update public.homesrolo_homeowner_handoff_items
    set copy_state = 'reconciliation_required',
        quarantine_state = 'rejected',
        quarantine_reason = 'mutated_replay'
    where handoff_ref = v_existing.handoff_ref and decision = 'accepted';
    update public.homesrolo_homeowner_handoff_acceptance_commands
    set state = 'quarantined', updated_at = v_conflict_at
    where handoff_ref = v_existing.handoff_ref;
    update public.homesrolo_homeowner_handoffs
    set state = 'quarantined', state_changed_at = v_conflict_at,
        quarantined_at = coalesce(quarantined_at, v_conflict_at),
        quarantine_reason = 'mutated_replay', revision = revision + 1
    where handoff_ref = v_existing.handoff_ref
    returning * into v_existing;
    return jsonb_build_object(
      'handoff', to_jsonb(v_existing), 'replayed', false, 'quarantined', true
    );
  end if;

  insert into public.homesrolo_homeowner_handoffs (
    handoff_ref, share_id, recipient_ref, recipient_binding_revision,
    home_ref, controller_principal_ref,
    contract_version, purpose, generation, manifest, manifest_digest,
    manifest_artifact_count, manifest_total_bytes, authorization_id,
    authorization_receipt, authorization_digest, authorization_replay_key,
    delivery_digest, issued_at, expires_at, authorized_at, received_at,
    state, state_changed_at, expired_at, revision
  ) values (
    p_handoff_ref, p_share_id, p_recipient_ref, v_recipient.revision,
    v_recipient.home_ref,
    v_recipient.controller_principal_ref, 'homeowner-share.v1',
    'homeowner_work_records', 1, p_manifest, p_manifest_digest,
    v_artifact_count, v_total_bytes,
    p_authorization_receipt ->> 'authorizationId', p_authorization_receipt,
    p_authorization_digest, p_authorization_replay_key, p_delivery_digest,
    v_issued_at, v_expires_at, v_authorized_at, p_received_at,
    case when p_received_at >= v_expires_at then 'expired' else 'received' end,
    p_received_at,
    case when p_received_at >= v_expires_at then p_received_at else null end,
    1
  ) returning * into v_handoff;

  for v_artifact in
    select value as descriptor, ordinality::integer as ordinal
    from jsonb_array_elements(p_manifest -> 'artifacts') with ordinality
  loop
    v_descriptor := v_artifact.descriptor;
    insert into public.homesrolo_homeowner_handoff_items (
      handoff_ref, source_artifact_ref, manifest_ordinal, home_ref,
      controller_principal_ref, descriptor, source, projection_kind,
      projection_version, media_type, byte_length, payload_sha256,
      decision, scan_state, quarantine_state, copy_state
    ) values (
      p_handoff_ref, v_descriptor ->> 'artifactRef', v_artifact.ordinal,
      v_recipient.home_ref, v_recipient.controller_principal_ref,
      v_descriptor, 'homeowner_release', v_descriptor ->> 'projectionKind',
      (v_descriptor ->> 'projectionVersion')::integer,
      v_descriptor ->> 'mediaType',
      (v_descriptor ->> 'byteLength')::integer,
      v_descriptor ->> 'sha256', 'pending', 'pending', 'isolated',
      'not_requested'
    );
  end loop;

  return jsonb_build_object(
    'handoff', to_jsonb(v_handoff), 'replayed', false, 'quarantined', false
  );
end;
$$;

-- Despite the RPC name, this marks a copied object as verified and clean only
-- inside the handoff quarantine. It does not create an available Home Record
-- artifact; publication is reserved for the package-level finalizer below.
create or replace function public.homesrolo_mark_handoff_item_available(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_handoff_ref text,
  p_command_ref text,
  p_command_digest text,
  p_source_artifact_ref text,
  p_storage_object_ref text,
  p_verified_media_type text,
  p_verified_byte_length integer,
  p_verified_payload_sha256 text,
  p_scan_provider text,
  p_scan_version text,
  p_scanned_at timestamptz,
  p_copied_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_acceptance_commands%rowtype;
  v_item public.homesrolo_homeowner_handoff_items%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref
    and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = v_handoff.recipient_ref
      and revision = v_handoff.recipient_binding_revision
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and state = 'active'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;
  select * into v_command
  from public.homesrolo_homeowner_handoff_acceptance_commands
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest
    and handoff_ref = p_handoff_ref
  for update;
  if not found then raise exception 'handoff_acceptance_not_found'; end if;
  select * into v_item
  from public.homesrolo_homeowner_handoff_items
  where handoff_ref = p_handoff_ref
    and source_artifact_ref = p_source_artifact_ref
  for update;
  if not found or v_item.decision <> 'accepted' then
    raise exception 'handoff_item_not_accepted';
  end if;
  if v_handoff.state = 'accepted'
    and v_item.copy_state = 'available'
    and v_item.reserved_storage_object_ref = p_storage_object_ref
    and v_item.verified_media_type = p_verified_media_type
    and v_item.verified_byte_length = p_verified_byte_length
    and v_item.verified_payload_sha256 = p_verified_payload_sha256
    and v_item.scan_provider = p_scan_provider
    and v_item.scan_version = p_scan_version
    and v_item.scan_completed_at = p_scanned_at
    and v_item.copy_staged_at = p_copied_at then
    return to_jsonb(v_item);
  end if;
  if v_handoff.state <> 'accepting' or v_command.state <> 'reserved' then
    raise exception 'handoff_not_accepting';
  end if;
  if p_scanned_at > p_copied_at or p_copied_at >= v_handoff.expires_at then
    raise exception 'handoff_expired';
  end if;
  if p_scan_provider <> btrim(p_scan_provider)
    or length(p_scan_provider) not between 1 and 80
    or p_scan_provider ~ '[[:cntrl:]]'
    or p_scan_version <> btrim(p_scan_version)
    or length(p_scan_version) not between 1 and 80
    or p_scan_version ~ '[[:cntrl:]]' then
    raise exception 'handoff_scan_identity_invalid';
  end if;
  if v_item.reserved_storage_object_ref <> p_storage_object_ref
    or v_item.media_type <> p_verified_media_type
    or v_item.byte_length <> p_verified_byte_length
    or v_item.payload_sha256 <> p_verified_payload_sha256 then
    raise exception 'handoff_item_verification_mismatch';
  end if;
  if v_item.copy_state = 'quarantined_clean' then
    if v_item.verified_media_type <> p_verified_media_type
      or v_item.verified_byte_length <> p_verified_byte_length
      or v_item.verified_payload_sha256 <> p_verified_payload_sha256
      or v_item.scan_provider <> p_scan_provider
      or v_item.scan_version <> p_scan_version
      or v_item.scan_completed_at <> p_scanned_at
      or v_item.copy_staged_at <> p_copied_at then
      raise exception 'handoff_item_clean_replay_mismatch';
    end if;
    return to_jsonb(v_item);
  end if;
  if v_item.copy_state <> 'reserved'
    or v_item.scan_state <> 'pending'
    or v_item.quarantine_state <> 'isolated' then
    raise exception 'handoff_item_not_reserved';
  end if;

  update public.homesrolo_homeowner_handoff_items
  set verified_media_type = p_verified_media_type,
      verified_byte_length = p_verified_byte_length,
      verified_payload_sha256 = p_verified_payload_sha256,
      scan_provider = p_scan_provider,
      scan_version = p_scan_version,
      scan_state = 'clean', quarantine_state = 'clean',
      copy_state = 'quarantined_clean',
      scan_completed_at = p_scanned_at,
      copy_staged_at = p_copied_at
  where handoff_ref = p_handoff_ref
    and source_artifact_ref = p_source_artifact_ref
  returning * into v_item;
  return to_jsonb(v_item);
end;
$$;

create or replace function public.homesrolo_quarantine_handoff_item(
  p_handoff_ref text,
  p_controller_principal_ref text,
  p_command_ref text,
  p_command_digest text,
  p_source_artifact_ref text,
  p_reason text,
  p_quarantined_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_acceptance_commands%rowtype;
  v_item public.homesrolo_homeowner_handoff_items%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  if p_reason not in (
    'source_changed', 'byte_length_mismatch', 'digest_mismatch',
    'media_type_mismatch', 'content_rejected',
    'storage_verification_failed'
  ) then
    raise exception 'handoff_quarantine_input_invalid';
  end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref
    and controller_principal_ref = p_controller_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = v_handoff.recipient_ref
      and revision = v_handoff.recipient_binding_revision
      and home_ref = v_handoff.home_ref
      and controller_principal_ref = p_controller_principal_ref
      and state = 'active'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;
  select * into v_command
  from public.homesrolo_homeowner_handoff_acceptance_commands
  where principal_ref = p_controller_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest
    and handoff_ref = p_handoff_ref
  for update;
  if not found then raise exception 'handoff_acceptance_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = v_command.membership_ref
      and principal_ref = p_controller_principal_ref
      and home_ref = v_handoff.home_ref
      and revision = v_command.membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_item
  from public.homesrolo_homeowner_handoff_items
  where handoff_ref = p_handoff_ref
    and source_artifact_ref = p_source_artifact_ref
  for update;
  if not found or v_item.decision <> 'accepted' then
    raise exception 'handoff_item_not_accepted';
  end if;
  if v_handoff.state = 'quarantined'
    and v_item.quarantine_state = 'rejected'
    and v_item.quarantine_reason = p_reason then
    return jsonb_build_object(
      'handoff', to_jsonb(v_handoff), 'item', to_jsonb(v_item)
    );
  end if;
  if v_handoff.state <> 'accepting' or v_command.state <> 'reserved' then
    raise exception 'handoff_not_accepting';
  end if;

  update public.homesrolo_homeowner_handoff_items
  set scan_state = 'rejected',
      quarantine_state = 'rejected', copy_state = 'reconciliation_required',
      quarantine_reason = p_reason,
      scan_completed_at = coalesce(scan_completed_at, p_quarantined_at)
  where handoff_ref = p_handoff_ref
    and source_artifact_ref = p_source_artifact_ref
  returning * into v_item;
  update public.homesrolo_homeowner_handoff_acceptance_commands
  set state = 'quarantined', updated_at = p_quarantined_at,
      result = result || jsonb_build_object('state', 'quarantined')
  where principal_ref = p_controller_principal_ref
    and command_ref = p_command_ref
    and handoff_ref = p_handoff_ref;
  update public.homesrolo_homeowner_handoffs
  set state = 'quarantined', state_changed_at = p_quarantined_at,
      quarantined_at = p_quarantined_at, quarantine_reason = p_reason,
      revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;
  return jsonb_build_object(
    'handoff', to_jsonb(v_handoff), 'item', to_jsonb(v_item)
  );
end;
$$;

create or replace function public.homesrolo_finalize_homeowner_handoff_accepted(
  p_principal_ref text,
  p_home_ref text,
  p_membership_ref text,
  p_membership_revision integer,
  p_handoff_ref text,
  p_command_ref text,
  p_command_digest text,
  p_finalized_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handoff public.homesrolo_homeowner_handoffs%rowtype;
  v_command public.homesrolo_homeowner_handoff_acceptance_commands%rowtype;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('homesrolo:handoff:' || p_handoff_ref, 0)
  );
  if not exists (
    select 1 from public.homesrolo_homeowner_memberships
    where membership_ref = p_membership_ref
      and principal_ref = p_principal_ref
      and home_ref = p_home_ref
      and revision = p_membership_revision
      and state = 'active'
      and role = 'workspace_controller'
  ) then raise exception 'membership_not_authorized'; end if;
  select * into v_handoff
  from public.homesrolo_homeowner_handoffs
  where handoff_ref = p_handoff_ref
    and home_ref = p_home_ref
    and controller_principal_ref = p_principal_ref
  for update;
  if not found then raise exception 'handoff_not_found'; end if;
  if not exists (
    select 1 from public.homesrolo_homeowner_handoff_recipients
    where recipient_ref = v_handoff.recipient_ref
      and revision = v_handoff.recipient_binding_revision
      and home_ref = p_home_ref
      and controller_principal_ref = p_principal_ref
      and state = 'active'
  ) then raise exception 'handoff_recipient_not_authorized'; end if;
  select * into v_command
  from public.homesrolo_homeowner_handoff_acceptance_commands
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and command_digest = p_command_digest
    and handoff_ref = p_handoff_ref
  for update;
  if not found then raise exception 'handoff_acceptance_not_found'; end if;
  if v_handoff.state = 'accepted' and v_command.state = 'accepted' then
    return v_command.result;
  end if;
  if v_handoff.state <> 'accepting' or v_command.state <> 'reserved' then
    raise exception 'handoff_not_accepting';
  end if;
  if p_finalized_at >= v_handoff.expires_at then
    raise exception 'handoff_expired';
  end if;
  if exists (
    select 1 from public.homesrolo_homeowner_handoff_items
    where handoff_ref = p_handoff_ref and decision = 'pending'
  ) or not exists (
    select 1 from public.homesrolo_homeowner_handoff_items
    where handoff_ref = p_handoff_ref and decision = 'accepted'
  ) or exists (
    select 1 from public.homesrolo_homeowner_handoff_items
    where handoff_ref = p_handoff_ref
      and decision = 'accepted'
      and (scan_state <> 'clean' or quarantine_state <> 'clean'
        or copy_state <> 'quarantined_clean'
        or verified_media_type is distinct from media_type
        or verified_byte_length is distinct from byte_length
        or verified_payload_sha256 is distinct from payload_sha256
        or scan_provider is null or scan_version is null
        or reserved_homeowner_artifact_ref is null
        or reserved_storage_object_ref is null
        or reserved_storage_key is null
        or artifact_command_ref is null)
  ) then raise exception 'handoff_items_not_ready'; end if;

  -- These inserts and the package state transition share one transaction.
  -- There is no globally available artifact row before this statement.
  insert into public.homesrolo_homeowner_artifacts (
    artifact_ref, home_ref, project_ref, controller_principal_ref,
    command_ref, command_digest, kind, display_name, media_type, byte_length,
    payload_sha256, storage_object_ref, storage_key, content_class, state,
    created_at, available_at
  )
  select
    item.reserved_homeowner_artifact_ref, item.home_ref,
    item.reserved_project_ref, item.controller_principal_ref,
    item.artifact_command_ref, p_command_digest, item.reserved_artifact_kind,
    item.reserved_display_name, item.verified_media_type,
    item.verified_byte_length, item.verified_payload_sha256,
    item.reserved_storage_object_ref, item.reserved_storage_key,
    'homeowner_private', 'available', p_finalized_at, p_finalized_at
  from public.homesrolo_homeowner_handoff_items item
  where item.handoff_ref = p_handoff_ref and item.decision = 'accepted'
  order by item.manifest_ordinal;

  update public.homesrolo_homeowner_handoff_items
  set homeowner_artifact_ref = reserved_homeowner_artifact_ref,
      quarantine_state = 'released', copy_state = 'available',
      available_at = p_finalized_at
  where handoff_ref = p_handoff_ref and decision = 'accepted';
  update public.homesrolo_homeowner_handoffs
  set state = 'accepted', state_changed_at = p_finalized_at,
      accepted_at = p_finalized_at, revision = revision + 1
  where handoff_ref = p_handoff_ref
  returning * into v_handoff;

  select jsonb_build_object(
    'handoffRef', p_handoff_ref,
    'shareId', v_handoff.share_id,
    'state', 'accepted',
    'acceptedAt', p_finalized_at,
    'selectionDigest', v_command.selection_digest,
    'acceptanceStatementDigest', v_command.acceptance_statement_digest,
    'consent', v_command.consent_receipt,
    'consentDigest', v_command.consent_digest,
    'consentReplayKey', v_command.consent_replay_key,
    'acceptedIntentAt', v_command.accepted_intent_at,
    'artifacts', coalesce(jsonb_agg(jsonb_build_object(
      'sourceArtifactRef', item.source_artifact_ref,
      'homeownerArtifactRef', item.homeowner_artifact_ref,
      'projectRef', item.reserved_project_ref,
      'kind', item.reserved_artifact_kind,
      'displayName', item.reserved_display_name,
      'mediaType', item.verified_media_type,
      'byteLength', item.verified_byte_length,
      'sha256', item.verified_payload_sha256
    ) order by item.manifest_ordinal), '[]'::jsonb)
  ) into v_result
  from public.homesrolo_homeowner_handoff_items item
  where item.handoff_ref = p_handoff_ref and item.decision = 'accepted';

  update public.homesrolo_homeowner_handoff_acceptance_commands
  set state = 'accepted', result = v_result, updated_at = p_finalized_at
  where principal_ref = p_principal_ref
    and command_ref = p_command_ref
    and handoff_ref = p_handoff_ref;
  update public.homesrolo_private_homes
  set updated_at = p_finalized_at
  where home_ref = p_home_ref;
  return v_result;
end;
$$;

revoke all on function public.homesrolo_guard_handoff_recipient_immutability()
  from public, anon, authenticated;
revoke all on function public.homesrolo_guard_handoff_wire_immutability()
  from public, anon, authenticated;
revoke all on function public.homesrolo_guard_handoff_item_immutability()
  from public, anon, authenticated;
revoke all on function public.homesrolo_guard_handoff_acceptance_command_immutability()
  from public, anon, authenticated;
revoke all on function public.homesrolo_bind_homeowner_handoff_recipient(
  text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_reserve_homeowner_handoff_claim_attempt(
  text, text, text, integer, text, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_revoke_homeowner_handoff_recipient(
  text, text, text, integer, text, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_receive_homeowner_handoff(
  text, text, text, jsonb, text, jsonb, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_reserve_homeowner_handoff_acceptance(
  text, text, text, integer, text, text, text, jsonb, jsonb, text, text,
  text, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_reject_homeowner_handoff(
  text, text, text, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_mark_handoff_item_available(
  text, text, text, integer, text, text, text, text, text, text, integer,
  text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_quarantine_handoff_item(
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_finalize_homeowner_handoff_accepted(
  text, text, text, integer, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_mark_homeowner_handoff_reconciliation(
  text, text, text, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_mark_homeowner_handoff_unknown(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.homesrolo_expire_homeowner_handoff(
  text, text, text, integer, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.homesrolo_guard_handoff_recipient_immutability()
  to service_role;
grant execute on function public.homesrolo_guard_handoff_wire_immutability()
  to service_role;
grant execute on function public.homesrolo_guard_handoff_item_immutability()
  to service_role;
grant execute on function public.homesrolo_guard_handoff_acceptance_command_immutability()
  to service_role;
grant execute on function public.homesrolo_bind_homeowner_handoff_recipient(
  text, text, text, integer, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_reserve_homeowner_handoff_claim_attempt(
  text, text, text, integer, text, integer, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_revoke_homeowner_handoff_recipient(
  text, text, text, integer, text, integer, timestamptz
) to service_role;
grant execute on function public.homesrolo_receive_homeowner_handoff(
  text, text, text, jsonb, text, jsonb, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_reserve_homeowner_handoff_acceptance(
  text, text, text, integer, text, text, text, jsonb, jsonb, text, text,
  text, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.homesrolo_reject_homeowner_handoff(
  text, text, text, integer, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_mark_handoff_item_available(
  text, text, text, integer, text, text, text, text, text, text, integer,
  text, text, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.homesrolo_quarantine_handoff_item(
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_finalize_homeowner_handoff_accepted(
  text, text, text, integer, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_mark_homeowner_handoff_reconciliation(
  text, text, text, integer, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_mark_homeowner_handoff_unknown(
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.homesrolo_expire_homeowner_handoff(
  text, text, text, integer, text, timestamptz
) to service_role;

commit;
