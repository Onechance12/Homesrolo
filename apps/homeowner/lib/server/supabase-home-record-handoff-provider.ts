import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  homeownerShareConsentReplayKey,
  homeownerShareSha256,
  parseHomeownerShareAuthorizationReceipt,
  parseHomeownerShareConsentReceipt,
  parseHomeownerShareManifest,
} from '../../../../src/contracts/homeowner-share.v1.ts'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS,
  HOME_RECORD_HANDOFF_VERSION,
  homeRecordHandoffDisplayName,
  parseHomeRecordHandoffRecord,
  type HomeRecordHandoffItemRecord,
  type HomeRecordHandoffObjectPort,
  type HomeRecordHandoffPersistencePort,
  type HomeRecordHandoffRecipientBinding,
  type HomeRecordHandoffRecipientPort,
  type HomeRecordHandoffRecord,
} from '../../../../src/homeowner/home-record-handoff.v1.ts'

type JsonRow = Record<string, unknown>

function row(input: unknown): JsonRow {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HomeownerApiError('unavailable')
  }
  return input as JsonRow
}

function text(input: JsonRow, key: string) {
  const value = input[key]
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function optionalText(input: JsonRow, key: string) {
  const value = input[key]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function integer(input: JsonRow, key: string) {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new HomeownerApiError('unavailable')
  }
  return value
}

function instant(input: JsonRow, key: string) {
  const parsed = new Date(text(input, key))
  if (!Number.isFinite(parsed.getTime())) throw new HomeownerApiError('unavailable')
  return parsed.toISOString()
}

function optionalInstant(input: JsonRow, key: string) {
  const value = optionalText(input, key)
  if (!value) return undefined
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new HomeownerApiError('unavailable')
  return parsed.toISOString()
}

function opaque(prefix: string) {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

function copyState(input: JsonRow): HomeRecordHandoffItemRecord['copyState'] {
  if (text(input, 'quarantine_state') === 'rejected') return 'quarantined'
  const state = text(input, 'copy_state')
  if (state === 'available') return 'available'
  if (state === 'quarantined_clean') return 'staged_clean'
  return 'not_started'
}

const QUARANTINE_REASONS = new Set<NonNullable<
  HomeRecordHandoffItemRecord['quarantineReason']
>>([
  'mutated_replay',
  'source_changed',
  'byte_length_mismatch',
  'digest_mismatch',
  'media_type_mismatch',
  'content_rejected',
  'storage_verification_failed',
])

function itemFromRow(
  input: unknown,
  manifest: ReturnType<typeof parseHomeownerShareManifest>,
): HomeRecordHandoffItemRecord {
  const value = row(input)
  const ordinal = integer(value, 'manifest_ordinal')
  const descriptor = manifest.artifacts[ordinal - 1]
  if (!descriptor) throw new HomeownerApiError('unavailable')
  const state = copyState(value)
  const quarantineReason = optionalText(value, 'quarantine_reason')
  if (quarantineReason && !QUARANTINE_REASONS.has(
    quarantineReason as NonNullable<HomeRecordHandoffItemRecord['quarantineReason']>,
  )) throw new HomeownerApiError('unavailable')
  const homeownerArtifactRef = optionalText(value, 'homeowner_artifact_ref')
    ?? optionalText(value, 'reserved_homeowner_artifact_ref')
  const storageObjectRef = optionalText(value, 'reserved_storage_object_ref')
  const scanProvider = optionalText(value, 'scan_provider')
  const scanVersion = optionalText(value, 'scan_version')
  const scannedAt = optionalInstant(value, 'scan_completed_at')
  const copiedAt = optionalInstant(value, 'available_at')
    ?? optionalInstant(value, 'copy_staged_at')
  const projectionKind = text(value, 'projection_kind')
  const projectionVersion = integer(value, 'projection_version')
  const mediaType = text(value, 'media_type')
  if (projectionKind !== 'work_completion_record'
    || projectionVersion !== 1
    || mediaType !== 'application/pdf') {
    throw new HomeownerApiError('unavailable')
  }
  return {
    sourceArtifactRef: text(value, 'source_artifact_ref'),
    projectionKind,
    projectionVersion,
    mediaType,
    byteLength: integer(value, 'byte_length'),
    payloadSha256: text(value, 'payload_sha256'),
    displayName: optionalText(value, 'reserved_display_name')
      ?? homeRecordHandoffDisplayName(descriptor, ordinal - 1),
    decision: text(value, 'decision') as HomeRecordHandoffItemRecord['decision'],
    copyState: state,
    ...(homeownerArtifactRef ? { homeownerArtifactRef } : {}),
    ...(storageObjectRef ? { storageObjectRef } : {}),
    ...(scanProvider ? { scanProvider } : {}),
    ...(scanVersion ? { scanVersion } : {}),
    ...(scannedAt ? { scannedAt } : {}),
    ...(copiedAt ? { copiedAt } : {}),
    ...(quarantineReason
      ? { quarantineReason: quarantineReason as NonNullable<
          HomeRecordHandoffItemRecord['quarantineReason']
        > }
      : {}),
  }
}

function grantArguments(grant: {
  readonly principalRef: string
  readonly homeRef: string
  readonly membershipRef: string
  readonly membershipRevision: number
}) {
  return {
    p_principal_ref: grant.principalRef,
    p_home_ref: grant.homeRef,
    p_membership_ref: grant.membershipRef,
    p_membership_revision: grant.membershipRevision,
  }
}

/**
 * Export requests one stable, accepted-only result with an exact count and a
 * cap+1 limit. Count/row disagreement (including a PostgREST max_rows cap or a
 * changing result) is an error, never a reason to truncate history.
 */
export async function boundedAcceptedHandoffRefsForExport(
  client: SupabaseClient,
  homeRef: string,
  principalRef: string,
) {
  const maximum = HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS
  const { data, error, count } = await client
    .from('homesrolo_homeowner_handoffs')
    .select('handoff_ref,received_at', { count: 'exact' })
    .eq('home_ref', homeRef)
    .eq('controller_principal_ref', principalRef)
    .eq('state', 'accepted')
    .order('received_at', { ascending: false })
    .order('handoff_ref', { ascending: false })
    .limit(maximum + 1)
  if (error || !Array.isArray(data) || typeof count !== 'number'
    || !Number.isSafeInteger(count) || count < 0
    || count > maximum || data.length !== count) {
    throw new HomeownerApiError('unavailable')
  }
  const references: string[] = []
  const seen = new Set<string>()
  for (const value of data) {
    const reference = text(row(value), 'handoff_ref')
    if (seen.has(reference)) throw new HomeownerApiError('unavailable')
    seen.add(reference)
    references.push(reference)
  }
  return references
}

/** Service-role-only adapter. It never accepts or returns a Jobrolo object key. */
export class SupabaseHomeRecordHandoffProvider implements
  HomeRecordHandoffRecipientPort,
  HomeRecordHandoffPersistencePort,
  HomeRecordHandoffObjectPort {
  readonly #client: SupabaseClient
  readonly #bucket = 'homesrolo-homeowner-private'

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async resolveRecipientBinding(recipientRef: string) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_handoff_recipients')
      .select('*')
      .eq('recipient_ref', recipientRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    if (!data) return null
    const value = row(data)
    return {
      recipientRef: text(value, 'recipient_ref'),
      homeRef: text(value, 'home_ref'),
      controllerPrincipalRef: text(value, 'controller_principal_ref'),
      revision: integer(value, 'revision'),
      state: text(value, 'state') as HomeRecordHandoffRecipientBinding['state'],
    }
  }

  async reserveClaimAttempt(
    input: Parameters<HomeRecordHandoffRecipientPort['reserveClaimAttempt']>[0],
  ) {
    const { data, error } = await this.#client.rpc(
      'homesrolo_reserve_homeowner_handoff_claim_attempt',
      {
        ...grantArguments(input.grant),
        p_recipient_ref: input.recipientRef,
        p_recipient_binding_revision: input.recipientBindingRevision,
        p_claim_digest: input.claimDigest,
        p_attempted_at: input.attemptedAt,
      },
    )
    if (error || typeof data !== 'boolean') throw new HomeownerApiError('unavailable')
    return data
  }

  async receiveOffer(input: Parameters<HomeRecordHandoffPersistencePort['receiveOffer']>[0]) {
    if (input.binding.recipientRef !== input.offer.manifest.recipientRef
      || input.items.length !== input.offer.manifest.artifacts.length) {
      throw new HomeownerApiError('unavailable')
    }
    const parameters = {
      p_handoff_ref: input.handoffRef,
      p_recipient_ref: input.binding.recipientRef,
      p_share_id: input.offer.manifest.shareId,
      p_manifest: input.offer.manifest,
      p_manifest_digest: input.offer.manifestDigest,
      p_authorization_receipt: input.offer.authorization,
      p_authorization_digest: homeownerShareSha256(input.offer.authorization),
      p_authorization_replay_key: input.offer.authorizationReplayKey,
      p_delivery_digest: input.offer.offerDigest,
      p_received_at: input.receivedAt,
    }
    const { error } = await this.#client.rpc(
      'homesrolo_receive_homeowner_handoff',
      parameters,
    )
    if (error) {
      const replay = await this.#readByShare(input.offer.manifest.shareId)
      if (replay) return replay
      throw new HomeownerApiError('unavailable')
    }
    const stored = await this.#readByShare(input.offer.manifest.shareId)
    if (!stored) throw new HomeownerApiError('unavailable')
    return stored
  }

  async readHandoff(
    grant: Parameters<HomeRecordHandoffPersistencePort['readHandoff']>[0],
    shareId: string,
  ) {
    return this.#readByShare(shareId, grant.homeRef, grant.principalRef)
  }

  async listHandoffs(
    grant: Parameters<HomeRecordHandoffPersistencePort['listHandoffs']>[0],
  ) {
    return this.#listExact(grant.homeRef, grant.principalRef)
  }

  async #listExact(homeRef: string, principalRef: string) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_handoffs')
      .select('handoff_ref')
      .eq('home_ref', homeRef)
      .eq('controller_principal_ref', principalRef)
      .order('received_at', { ascending: false })
      .limit(100)
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return Promise.all(data.map(value => this.#readByHandoff(
      text(row(value), 'handoff_ref'),
      homeRef,
      principalRef,
    ).then(recordValue => {
      if (!recordValue) throw new HomeownerApiError('unavailable')
      return recordValue
    })))
  }

  async reserveAcceptance(
    input: Parameters<HomeRecordHandoffPersistencePort['reserveAcceptance']>[0],
  ) {
    const current = await this.#readByHandoff(
      input.handoffRef,
      input.grant.homeRef,
      input.grant.principalRef,
    )
    if (!current) throw new HomeownerApiError('not_found')
    if (current.state !== 'received') return current
    const selected = new Set(input.selectedArtifactRefs)
    const reservations = current.items.map(item => selected.has(item.sourceArtifactRef)
      ? {
          sourceArtifactRef: item.sourceArtifactRef,
          decision: 'accepted',
          homeownerArtifactRef: opaque('hart'),
          storageObjectRef: opaque('hobj'),
          artifactCommandRef: opaque('hcmd'),
          displayName: item.displayName,
          projectRef: null,
        }
      : { sourceArtifactRef: item.sourceArtifactRef, decision: 'rejected' })
    const { error } = await this.#client.rpc(
      'homesrolo_reserve_homeowner_handoff_acceptance',
      {
        ...grantArguments(input.grant),
        p_command_ref: input.commandRef,
        p_command_digest: input.commandDigest,
        p_handoff_ref: input.handoffRef,
        p_reservations: reservations,
        p_consent_receipt: input.consent,
        p_consent_digest: homeownerShareSha256(input.consent),
        p_consent_replay_key: homeownerShareConsentReplayKey(input.consent),
        p_selection_digest: input.selectionDigest,
        p_acceptance_statement_digest: input.acceptanceStatementDigest,
        p_accepted_intent_at: input.acceptedAt,
        p_requested_at: input.acceptedAt,
      },
    )
    const stored = await this.#readByHandoff(
      input.handoffRef,
      input.grant.homeRef,
      input.grant.principalRef,
    )
    if (!stored) throw new HomeownerApiError('unavailable')
    if (error && stored.state === 'received') throw new HomeownerApiError('unavailable')
    return stored
  }

  async markItemStagedClean(
    input: Parameters<HomeRecordHandoffPersistencePort['markItemStagedClean']>[0],
  ) {
    const item = await this.#readExactItem(input)
    const { error } = await this.#client.rpc('homesrolo_mark_handoff_item_available', {
      ...grantArguments(input.grant),
      p_handoff_ref: input.handoffRef,
      p_command_ref: input.commandRef,
      p_command_digest: input.commandDigest,
      p_source_artifact_ref: input.sourceArtifactRef,
      p_storage_object_ref: input.storageObjectRef,
      p_verified_media_type: item.mediaType,
      p_verified_byte_length: item.byteLength,
      p_verified_payload_sha256: item.payloadSha256,
      p_scan_provider: input.scanProvider,
      p_scan_version: input.scanVersion,
      p_scanned_at: input.scannedAt,
      p_copied_at: input.copiedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    return this.#requireRecord(input.handoffRef, input.grant.homeRef, input.grant.principalRef)
  }

  async quarantineItem(
    input: Parameters<HomeRecordHandoffPersistencePort['quarantineItem']>[0],
  ) {
    const { error } = await this.#client.rpc('homesrolo_quarantine_handoff_item', {
      p_handoff_ref: input.handoffRef,
      p_controller_principal_ref: input.grant.principalRef,
      p_command_ref: input.commandRef,
      p_command_digest: input.commandDigest,
      p_source_artifact_ref: input.sourceArtifactRef,
      p_reason: input.reason,
      p_quarantined_at: input.quarantinedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
  }

  async finalizeAcceptance(
    input: Parameters<HomeRecordHandoffPersistencePort['finalizeAcceptance']>[0],
  ) {
    const { error } = await this.#client.rpc(
      'homesrolo_finalize_homeowner_handoff_accepted',
      {
        ...grantArguments(input.grant),
        p_handoff_ref: input.handoffRef,
        p_command_ref: input.commandRef,
        p_command_digest: input.commandDigest,
        p_finalized_at: input.completedAt,
      },
    )
    if (error) throw new HomeownerApiError('unavailable')
    return this.#requireRecord(input.handoffRef, input.grant.homeRef, input.grant.principalRef)
  }

  async markAcceptanceUnknown(
    input: Parameters<HomeRecordHandoffPersistencePort['markAcceptanceUnknown']>[0],
  ) {
    const { error } = await this.#client.rpc(
      'homesrolo_mark_homeowner_handoff_unknown',
      {
        p_handoff_ref: input.handoffRef,
        p_controller_principal_ref: input.controllerPrincipalRef,
        p_command_ref: input.commandRef,
        p_command_digest: input.commandDigest,
        p_failed_at: input.failedAt,
      },
    )
    if (error) throw new HomeownerApiError('unavailable')
  }

  async rejectHandoff(input: Parameters<HomeRecordHandoffPersistencePort['rejectHandoff']>[0]) {
    const { error } = await this.#client.rpc('homesrolo_reject_homeowner_handoff', {
      ...grantArguments(input.grant),
      p_handoff_ref: input.handoffRef,
      p_command_ref: input.commandRef,
      p_command_digest: input.commandDigest,
      p_reason_code: 'not_wanted',
      p_rejected_at: input.rejectedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    return this.#requireRecord(input.handoffRef, input.grant.homeRef, input.grant.principalRef)
  }

  async expireHandoff(input: Parameters<HomeRecordHandoffPersistencePort['expireHandoff']>[0]) {
    const { error } = await this.#client.rpc('homesrolo_expire_homeowner_handoff', {
      ...grantArguments(input.grant),
      p_handoff_ref: input.handoffRef,
      p_expired_at: input.expiredAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    return this.#requireRecord(input.handoffRef, input.grant.homeRef, input.grant.principalRef)
  }

  async listAcceptedForExport(
    grant: Parameters<HomeRecordHandoffPersistencePort['listAcceptedForExport']>[0],
  ) {
    const references = await boundedAcceptedHandoffRefsForExport(
      this.#client,
      grant.homeRef,
      grant.principalRef,
    )
    return Promise.all(references.map(reference => this.#readByHandoff(
      reference,
      grant.homeRef,
      grant.principalRef,
    ).then(recordValue => {
      if (!recordValue || recordValue.state !== 'accepted') {
        throw new HomeownerApiError('unavailable')
      }
      return recordValue
    })))
  }

  async stageExactObject(input: Parameters<HomeRecordHandoffObjectPort['stageExactObject']>[0]) {
    const item = await this.#readExactItem(input)
    if (item.homeownerArtifactRef !== input.homeownerArtifactRef
      || item.storageObjectRef !== input.storageObjectRef
      || item.mediaType !== input.mediaType
      || item.byteLength !== input.byteLength
      || item.payloadSha256 !== input.payloadSha256
      || input.bytes.byteLength !== input.byteLength
      || createHash('sha256').update(input.bytes).digest('hex') !== input.payloadSha256) {
      throw new HomeownerApiError('unavailable')
    }
    const key = `${input.grant.homeRef}/${input.storageObjectRef}`
    const bucket = this.#client.storage.from(this.#bucket)
    await bucket.upload(key, input.bytes, {
      contentType: input.mediaType,
      cacheControl: '0',
      upsert: false,
    })
    const downloaded = await bucket.download(key)
    if (downloaded.error || !downloaded.data) throw new HomeownerApiError('unavailable')
    const readback = new Uint8Array(await downloaded.data.arrayBuffer())
    if (readback.byteLength !== input.byteLength
      || createHash('sha256').update(readback).digest('hex') !== input.payloadSha256) {
      throw new HomeownerApiError('unavailable')
    }
  }

  async readAcceptedExactObject(
    input: Parameters<HomeRecordHandoffObjectPort['readAcceptedExactObject']>[0],
  ) {
    const recordValue = await this.#requireRecord(
      input.handoffRef,
      input.grant.homeRef,
      input.grant.principalRef,
    )
    if (recordValue.state !== 'accepted') throw new HomeownerApiError('not_found')
    const item = recordValue.items.find(candidate =>
      candidate.homeownerArtifactRef === input.homeownerArtifactRef
      && candidate.storageObjectRef === input.storageObjectRef)
    if (!item || item.copyState !== 'available'
      || item.payloadSha256 !== input.expectedSha256
      || item.byteLength > input.maximumBytes) throw new HomeownerApiError('not_found')
    const download = await this.#client.storage
      .from(this.#bucket)
      .download(`${input.grant.homeRef}/${input.storageObjectRef}`)
    if (download.error || !download.data) throw new HomeownerApiError('unavailable')
    const bytes = new Uint8Array(await download.data.arrayBuffer())
    if (bytes.byteLength !== item.byteLength
      || createHash('sha256').update(bytes).digest('hex') !== item.payloadSha256) {
      throw new HomeownerApiError('unavailable')
    }
    return bytes
  }

  async #readExactItem(input: {
    readonly grant: { readonly homeRef: string; readonly principalRef: string }
    readonly handoffRef: string
    readonly homeownerArtifactRef?: string
    readonly storageObjectRef?: string
    readonly sourceArtifactRef?: string
  }) {
    const recordValue = await this.#requireRecord(
      input.handoffRef,
      input.grant.homeRef,
      input.grant.principalRef,
    )
    const item = recordValue.items.find(candidate =>
      (input.sourceArtifactRef === undefined
        || candidate.sourceArtifactRef === input.sourceArtifactRef)
      && (input.homeownerArtifactRef === undefined
        || candidate.homeownerArtifactRef === input.homeownerArtifactRef)
      && (input.storageObjectRef === undefined
        || candidate.storageObjectRef === input.storageObjectRef))
    if (!item || item.decision !== 'accepted') throw new HomeownerApiError('not_found')
    return item
  }

  async #readByShare(shareId: string, homeRef?: string, principalRef?: string) {
    let query = this.#client
      .from('homesrolo_homeowner_handoffs')
      .select('*')
      .eq('share_id', shareId)
    if (homeRef) query = query.eq('home_ref', homeRef)
    if (principalRef) query = query.eq('controller_principal_ref', principalRef)
    const { data, error } = await query.maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data ? this.#recordFromRow(data) : null
  }

  async #readByHandoff(handoffRef: string, homeRef?: string, principalRef?: string) {
    let query = this.#client
      .from('homesrolo_homeowner_handoffs')
      .select('*')
      .eq('handoff_ref', handoffRef)
    if (homeRef) query = query.eq('home_ref', homeRef)
    if (principalRef) query = query.eq('controller_principal_ref', principalRef)
    const { data, error } = await query.maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data ? this.#recordFromRow(data) : null
  }

  async #requireRecord(handoffRef: string, homeRef: string, principalRef: string) {
    const recordValue = await this.#readByHandoff(handoffRef, homeRef, principalRef)
    if (!recordValue) throw new HomeownerApiError('not_found')
    return recordValue
  }

  async #recordFromRow(input: unknown): Promise<HomeRecordHandoffRecord> {
    const value = row(input)
    const manifest = parseHomeownerShareManifest(value.manifest)
    const authorization = parseHomeownerShareAuthorizationReceipt(value.authorization_receipt)
    const handoffRef = text(value, 'handoff_ref')
    const [{ data: itemData, error: itemError }, { data: acceptanceData, error: acceptanceError },
      { data: rejectionData, error: rejectionError }] = await Promise.all([
      this.#client.from('homesrolo_homeowner_handoff_items').select('*')
        .eq('handoff_ref', handoffRef).order('manifest_ordinal', { ascending: true }),
      this.#client.from('homesrolo_homeowner_handoff_acceptance_commands').select('*')
        .eq('handoff_ref', handoffRef).maybeSingle(),
      this.#client.from('homesrolo_homeowner_handoff_rejection_commands').select('*')
        .eq('handoff_ref', handoffRef).maybeSingle(),
    ])
    if (itemError || acceptanceError || rejectionError || !Array.isArray(itemData)) {
      throw new HomeownerApiError('unavailable')
    }
    const acceptance = acceptanceData ? row(acceptanceData) : null
    const rejection = rejectionData ? row(rejectionData) : null
    const command = acceptance ?? rejection
    const decidedAt = optionalInstant(value, 'accepted_at')
      ?? optionalInstant(value, 'rejected_at')
      ?? optionalInstant(value, 'expired_at')
    const consent = acceptance
      ? parseHomeownerShareConsentReceipt(acceptance.consent_receipt)
      : undefined
    return parseHomeRecordHandoffRecord({
      recordVersion: HOME_RECORD_HANDOFF_VERSION,
      handoffRef,
      homeRef: text(value, 'home_ref'),
      controllerPrincipalRef: text(value, 'controller_principal_ref'),
      recipientBindingRevision: integer(value, 'recipient_binding_revision'),
      manifest,
      authorization,
      manifestDigest: text(value, 'manifest_digest'),
      authorizationReplayKey: text(value, 'authorization_replay_key'),
      offerDigest: text(value, 'delivery_digest'),
      state: text(value, 'state'),
      receivedAt: instant(value, 'received_at'),
      expiresAt: instant(value, 'expires_at'),
      ...(command ? {
        commandRef: text(command, 'command_ref'),
        commandDigest: text(command, 'command_digest'),
      } : {}),
      ...(acceptance ? {
        selectionDigest: text(acceptance, 'selection_digest'),
        acceptanceStatementDigest: text(acceptance, 'acceptance_statement_digest'),
        consent,
      } : {}),
      ...(decidedAt ? { decidedAt } : {}),
      items: itemData.map(item => itemFromRow(item, manifest)),
    })
  }
}
