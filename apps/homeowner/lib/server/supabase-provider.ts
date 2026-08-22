import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  homeownerArtifactMetadataSchema,
  homeownerMembershipSchema,
  homeownerPrincipalSchema,
  homeownerProjectCommandIntent,
  homeownerProjectSchema,
  homeownerPropertyFactsSchema,
  homeownerSystemSchema,
  privateHomeProfileSchema,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerCommandPort,
  type HomeownerIdentityPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerPrivateObjectPort,
  type HomeownerProject,
  type HomeownerRepositoryPort,
  type HomeownerSystem,
  type PrivateHomeProfile,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import type { HomeownerRuntimeConfiguration } from './config.ts'
import {
  type HomeownerProjectReviewPersistencePort,
  type HomeownerProjectReviewReservation,
} from '../../../../src/homeowner/homeowner-project-review.v1.ts'
import { homesroloJobroloProjectIntakeReceiptSchema } from '../../../../src/contracts/homesrolo-jobrolo-project-intake.v1.ts'
import {
  HOMEOWNER_PROJECT_QUOTE_VERSION,
  homeownerProjectQuoteCommandIntent,
  homeownerProjectQuoteSchema,
  type HomeownerProjectQuote,
  type HomeownerProjectQuotePort,
} from '../../../../src/homeowner/homeowner-project-quotes.v1.ts'
import {
  HOMEOWNER_CHECKUP_PHOTO_VERSION,
  homeownerCheckupPhotoCommandIntent,
  homeownerCheckupPhotoMetadataSchema,
  homeownerCheckupPhotoReservationSchema,
  type HomeownerCheckupPhotoMetadata,
  type HomeownerCheckupPhotoPort,
} from '../../../../src/homeowner/homeowner-checkup-photos.v1.ts'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HomeownerApiError('unavailable')
  }
  return value as JsonRecord
}

function requiredString(row: JsonRecord, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function throwCheckupPhotoReserveError(error: { readonly message: string }): never {
  if (error.message.includes('photo_rate_limited')
    || error.message.includes('photo_concurrency_limited')
    || error.message.includes('upload_in_progress')) {
    throw new HomeownerApiError('rate_limited')
  }
  if (error.message.includes('photo_quota_exceeded')
    || error.message.includes('photo_output_limited')
    || error.message.includes('command_digest_mismatch')
    || error.message.includes('command_scope_mismatch')
    || error.message.includes('photo_deleted')) {
    throw new HomeownerApiError('conflict')
  }
  throw new HomeownerApiError('unavailable')
}

function nullableString(row: JsonRecord, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function requiredNumber(row: JsonRecord, key: string): number {
  const value = row[key]
  if (typeof value !== 'number') throw new HomeownerApiError('unavailable')
  return value
}

function canonicalInstant(row: JsonRecord, key: string): string {
  const value = requiredString(row, key)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new HomeownerApiError('unavailable')
  return date.toISOString()
}

function approximateYear(row: JsonRecord, valueKey: string, precisionKey: string) {
  const value = row[valueKey]
  const precision = row[precisionKey]
  if (value === null && precision === null) return null
  if (typeof value !== 'number' || (precision !== 'exact' && precision !== 'approximate')) {
    throw new HomeownerApiError('unavailable')
  }
  return { value, precision }
}

function principalFromRow(input: unknown): HomeownerPrincipal {
  const row = record(input)
  return homeownerPrincipalSchema.parse({
    principalRef: requiredString(row, 'principal_ref'),
    status: requiredString(row, 'status'),
    emailVerified: row.email_verified,
    sessionVersion: requiredNumber(row, 'session_version'),
  })
}

function membershipFromRow(input: unknown): HomeownerMembership {
  const row = record(input)
  return homeownerMembershipSchema.parse({
    membershipRef: requiredString(row, 'membership_ref'),
    principalRef: requiredString(row, 'principal_ref'),
    homeRef: requiredString(row, 'home_ref'),
    role: requiredString(row, 'role'),
    basis: requiredString(row, 'basis'),
    state: requiredString(row, 'state'),
    relationshipLabel: requiredString(row, 'relationship_label'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    ...(row.revoked_at === null ? {} : { revokedAt: canonicalInstant(row, 'revoked_at') }),
  })
}

function homeFromRow(input: unknown): PrivateHomeProfile {
  const row = record(input)
  return privateHomeProfileSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    homeRef: requiredString(row, 'home_ref'),
    createdByPrincipalRef: requiredString(row, 'created_by_principal_ref'),
    displayLabel: requiredString(row, 'display_label'),
    privateLocationLabel: requiredString(row, 'private_location_label'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function propertyFactsFromRow(input: unknown) {
  const row = record(input)
  return homeownerPropertyFactsSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    propertyFactsRef: requiredString(row, 'property_facts_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    homeType: requiredString(row, 'home_type'),
    yearBuilt: approximateYear(row, 'year_built_value', 'year_built_precision'),
    source: requiredString(row, 'source'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function systemFromRow(input: unknown): HomeownerSystem {
  const row = record(input)
  return homeownerSystemSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    systemRef: requiredString(row, 'system_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    kind: requiredString(row, 'kind'),
    present: requiredString(row, 'present'),
    installedOrReplacedYear: approximateYear(
      row,
      'installed_or_replaced_year_value',
      'installed_or_replaced_year_precision',
    ),
    source: requiredString(row, 'source'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function projectFromRow(input: unknown): HomeownerProject {
  const row = record(input)
  return homeownerProjectSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    projectRef: requiredString(row, 'project_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    title: requiredString(row, 'title'),
    category: requiredString(row, 'category'),
    status: requiredString(row, 'status'),
    ...(row.occurred_on === null ? {} : { occurredOn: requiredString(row, 'occurred_on') }),
    ...(row.summary === null ? {} : { summary: requiredString(row, 'summary') }),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function artifactFromRow(input: unknown) {
  const row = record(input)
  return homeownerArtifactMetadataSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    artifactRef: requiredString(row, 'artifact_ref'),
    homeRef: requiredString(row, 'home_ref'),
    ...(row.project_ref === null ? {} : { projectRef: requiredString(row, 'project_ref') }),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    kind: requiredString(row, 'kind'),
    displayName: requiredString(row, 'display_name'),
    mediaType: requiredString(row, 'media_type'),
    byteLength: requiredNumber(row, 'byte_length'),
    payloadSha256: requiredString(row, 'payload_sha256'),
    storageObjectRef: requiredString(row, 'storage_object_ref'),
    contentClass: requiredString(row, 'content_class'),
    createdAt: canonicalInstant(row, 'created_at'),
  })
}

function checkupPhotoFromRow(input: unknown): HomeownerCheckupPhotoMetadata {
  const row = record(input)
  return homeownerCheckupPhotoMetadataSchema.parse({
    recordVersion: HOMEOWNER_CHECKUP_PHOTO_VERSION,
    photoRef: requiredString(row, 'photo_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    observedOn: requiredString(row, 'observed_on'),
    area: requiredString(row, 'area'),
    viewLabel: requiredString(row, 'view_label'),
    caption: requiredString(row, 'caption'),
    mediaType: requiredString(row, 'media_type'),
    fullStorageObjectRef: requiredString(row, 'full_storage_object_ref'),
    fullByteLength: requiredNumber(row, 'full_byte_length'),
    fullPayloadSha256: requiredString(row, 'full_payload_sha256'),
    thumbnailStorageObjectRef: requiredString(row, 'thumbnail_storage_object_ref'),
    thumbnailByteLength: requiredNumber(row, 'thumbnail_byte_length'),
    thumbnailPayloadSha256: requiredString(row, 'thumbnail_payload_sha256'),
    width: requiredNumber(row, 'width'),
    height: requiredNumber(row, 'height'),
    createdAt: canonicalInstant(row, 'created_at'),
  })
}

function quoteFromRow(input: unknown): HomeownerProjectQuote {
  const row = record(input)
  return homeownerProjectQuoteSchema.parse({
    recordVersion: HOMEOWNER_PROJECT_QUOTE_VERSION,
    quoteRef: requiredString(row, 'quote_ref'),
    homeRef: requiredString(row, 'home_ref'),
    projectRef: requiredString(row, 'project_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    contractorLabel: requiredString(row, 'contractor_label'),
    ...(row.proposal_date === null ? {} : { proposalDate: requiredString(row, 'proposal_date') }),
    ...(row.artifact_ref === null ? {} : { artifactRef: requiredString(row, 'artifact_ref') }),
    scope: row.scope,
    ...(row.notes === null || row.notes === '' ? {} : { notes: requiredString(row, 'notes') }),
    source: requiredString(row, 'source'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function hashSessionHandle(handle: string): string {
  return createHash('sha256').update(handle, 'utf8').digest('hex')
}

export function mintOpaqueRef(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function createSupabaseClients(configuration: HomeownerRuntimeConfiguration) {
  const common = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  } as const
  return {
    auth: createClient(configuration.supabaseUrl, configuration.publishableKey, common),
    service: createClient(configuration.supabaseUrl, configuration.secretKey, common),
  }
}

/** One server-only adapter implements identity, exact-home reads, and commands. */
export class SupabaseHomeownerProvider implements
  HomeownerIdentityPort, HomeownerRepositoryPort, HomeownerCommandPort,
  HomeownerPrivateObjectPort, HomeownerProjectQuotePort,
  HomeownerProjectReviewPersistencePort, HomeownerCheckupPhotoPort {
  readonly #client: SupabaseClient
  readonly #now: () => string
  readonly #supabaseOrigin: string | null

  constructor(
    client: SupabaseClient,
    now: () => string = () => new Date().toISOString(),
    supabaseOrigin: string | null = null,
  ) {
    this.#client = client
    this.#now = now
    this.#supabaseOrigin = supabaseOrigin
  }

  async resolvePrincipal(sessionHandle: string): Promise<HomeownerPrincipal | null> {
    const { data, error } = await this.#client.rpc('homesrolo_resolve_homeowner_principal', {
      p_session_hash: hashSessionHandle(sessionHandle),
      p_now: this.#now(),
    })
    if (error) throw new HomeownerApiError('unavailable')
    if (data === null) return null
    try { return principalFromRow(data) } catch { return null }
  }

  async listMemberships(authorization: AuthorizedHomeownerPrincipal) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_memberships')
      .select('*')
      .eq('principal_ref', authorization.principalRef)
      .eq('state', 'active')
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(membershipFromRow)
  }

  async readMembership(principalRef: string, homeRef: string) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_memberships')
      .select('*')
      .eq('principal_ref', principalRef)
      .eq('home_ref', homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : membershipFromRow(data)
  }

  async readHome(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_private_homes')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : homeFromRow(data)
  }

  async readPropertyFacts(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_property_facts')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : propertyFactsFromRow(data)
  }

  async listSystems(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_systems')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .order('kind', { ascending: true })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(systemFromRow)
  }

  async listProjects(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_projects')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .order('updated_at', { ascending: false })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(projectFromRow)
  }
  async listProjectQuotes(grant: AuthorizedHomeownerWorkspace, projectRef: string) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_project_quotes')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .eq('project_ref', projectRef)
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(quoteFromRow)
  }
  async listArtifactMetadata(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_artifacts')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .eq('state', 'available')
      .order('created_at', { ascending: false })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(artifactFromRow)
  }
  async listCheckupPhotos(grant: AuthorizedHomeownerWorkspace) {
    await this.#reconcileCheckupPhotoObjects()
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_checkup_photos')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .eq('state', 'available')
      .order('observed_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(101)
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(checkupPhotoFromRow)
  }

  async #removeCheckupPhotoObjects(row: JsonRecord): Promise<void> {
    const keys = [
      requiredString(row, 'full_storage_key'),
      requiredString(row, 'thumbnail_storage_key'),
    ]
    const { error } = await this.#client.storage
      .from('homesrolo-homeowner-private')
      .remove(keys)
    if (error) throw new HomeownerApiError('unavailable')
  }

  /**
   * No paid scheduler is required for the capped beta. Every photo write cleans
   * exact server-selected opaque keys left by a rejected/stale upload or an
   * interrupted delete, even if the old membership was later revoked. The
   * environment capability remains the immediate kill switch.
   */
  async #reconcileCheckupPhotoObjects(requiredPhotoRef?: string): Promise<void> {
    // List requests must be able to expose expired leases to the same bounded
    // cleanup scan even when no later upload reservation is ever attempted.
    // This global maintenance step is best effort for unrelated work.
    try {
      await this.#client.rpc('homesrolo_service_expire_stale_checkup_photo_uploads', {
        p_requested_at: this.#now(),
      })
    } catch {
      // Existing failed/deleting rows can still be scanned. A transient global
      // maintenance error must not brick an unrelated homeowner request.
    }
    const reconcileRow = async (input: unknown) => {
      const row = record(input)
      await this.#removeCheckupPhotoObjects(row)
      const state = requiredString(row, 'state')
      const { error: cleanupError } = await this.#client.rpc(
        'homesrolo_service_reconcile_checkup_photo_objects',
        {
          p_photo_ref: requiredString(row, 'photo_ref'),
          p_expected_state: state,
          p_cleaned_at: this.#now(),
        },
      )
      if (cleanupError) throw new HomeownerApiError('unavailable')
    }

    if (requiredPhotoRef) {
      const { data: required, error: requiredError } = await this.#client
        .from('homesrolo_homeowner_checkup_photos')
        .select('*')
        .eq('photo_ref', requiredPhotoRef)
        .in('state', ['failed', 'deleting'])
        .is('objects_cleaned_at', null)
        .maybeSingle()
      if (requiredError || !required) throw new HomeownerApiError('unavailable')
      await reconcileRow(required)
    }

    const { data, error } = await this.#client
      .from('homesrolo_homeowner_checkup_photos')
      .select('*')
      .in('state', ['failed', 'deleting'])
      .is('objects_cleaned_at', null)
      .order('state_changed_at', { ascending: true })
      .limit(20)
    if (error || !Array.isArray(data)) return
    for (const input of data) {
      try {
        await reconcileRow(input)
      } catch {
        // This row remains quarantined and counted. An unrelated corrupt row
        // must not brick every homeowner request.
      }
    }
  }

  async reserveCheckupPhotoUpload(
    input: Parameters<HomeownerCheckupPhotoPort['reserveCheckupPhotoUpload']>[0],
  ) {
    await this.#reconcileCheckupPhotoObjects()
    const commandDigest = digest(homeownerCheckupPhotoCommandIntent(input.command))
    const photoRef = mintOpaqueRef('hpho')
    const fullStorageObjectRef = mintOpaqueRef('hobj')
    const thumbnailStorageObjectRef = mintOpaqueRef('hobj')
    const leaseToken = mintOpaqueRef('hles')
    const rpcInput = {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: commandDigest,
      p_photo_ref: photoRef,
      p_observed_on: input.command.observedOn,
      p_area: input.command.area,
      p_view_label: input.command.viewLabel,
      p_caption: input.command.caption,
      p_input_media_type: input.command.inputMediaType,
      p_input_byte_length: input.command.inputByteLength,
      p_input_payload_sha256: input.command.inputPayloadSha256,
      p_full_storage_object_ref: fullStorageObjectRef,
      p_full_storage_key: `${input.grant.homeRef}/checkup-photos/${fullStorageObjectRef}`,
      p_thumbnail_storage_object_ref: thumbnailStorageObjectRef,
      p_thumbnail_storage_key: `${input.grant.homeRef}/checkup-photos/${thumbnailStorageObjectRef}`,
      p_lease_token: leaseToken,
      p_requested_at: input.command.requestedAt,
    }
    let { data, error } = await this.#client.rpc(
      'homesrolo_reserve_checkup_photo_upload',
      rpcInput,
    )
    if (error) {
      throwCheckupPhotoReserveError(error)
    }
    const row = record(data)
    let state = requiredString(row, 'state')
    if (state === 'failed') {
      // The reservation RPC commits expired-lease transition before returning
      // it. Clean the old exact keys, then make one bounded retry.
      await this.#reconcileCheckupPhotoObjects(requiredString(row, 'photo_ref'))
      ;({ data, error } = await this.#client.rpc('homesrolo_reserve_checkup_photo_upload', rpcInput))
      if (error) throwCheckupPhotoReserveError(error)
      const retriedRow = record(data)
      state = requiredString(retriedRow, 'state')
      if (state === 'available') {
        return { state: 'available' as const, photo: checkupPhotoFromRow(retriedRow) }
      }
      if (state !== 'processing') throw new HomeownerApiError('unavailable')
      Object.assign(row, retriedRow)
    }
    if (state === 'available') return { state: 'available' as const, photo: checkupPhotoFromRow(row) }
    if (state !== 'processing') throw new HomeownerApiError('unavailable')
    const reservation = homeownerCheckupPhotoReservationSchema.parse({
      photoRef: requiredString(row, 'photo_ref'),
      homeRef: requiredString(row, 'home_ref'),
      controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
      commandRef: requiredString(row, 'command_ref'),
      commandDigest: requiredString(row, 'command_digest'),
      leaseToken: requiredString(row, 'lease_token'),
      fullStorageObjectRef: requiredString(row, 'full_storage_object_ref'),
      thumbnailStorageObjectRef: requiredString(row, 'thumbnail_storage_object_ref'),
    })
    // Clean stale objects made visible by the reservation RPC without touching
    // this still-processing reservation.
    await this.#reconcileCheckupPhotoObjects()
    return { state: 'reserved' as const, reservation }
  }

  async completeCheckupPhotoUpload(
    input: Parameters<HomeownerCheckupPhotoPort['completeCheckupPhotoUpload']>[0],
  ) {
    if (digest(homeownerCheckupPhotoCommandIntent(input.command))
      !== input.reservation.commandDigest) {
      throw new HomeownerApiError('conflict')
    }
    const fullHash = createHash('sha256').update(input.photo.fullBytes).digest('hex')
    const thumbnailHash = createHash('sha256').update(input.photo.thumbnailBytes).digest('hex')
    if (fullHash !== input.photo.fullPayloadSha256
      || thumbnailHash !== input.photo.thumbnailPayloadSha256
      || input.photo.fullBytes[0] !== 0xff || input.photo.fullBytes[1] !== 0xd8
      || input.photo.thumbnailBytes[0] !== 0xff || input.photo.thumbnailBytes[1] !== 0xd8) {
      throw new HomeownerApiError('invalid_request')
    }
    const { data: reservationData, error: reservationError } = await this.#client
      .from('homesrolo_homeowner_checkup_photos')
      .select('*')
      .eq('photo_ref', input.reservation.photoRef)
      .eq('home_ref', input.grant.homeRef)
      .eq('controller_principal_ref', input.grant.principalRef)
      .eq('command_ref', input.command.commandRef)
      .eq('command_digest', input.reservation.commandDigest)
      .eq('lease_token', input.reservation.leaseToken)
      .eq('state', 'processing')
      .maybeSingle()
    if (reservationError || !reservationData) throw new HomeownerApiError('unavailable')
    const row = record(reservationData)
    const fullKey = requiredString(row, 'full_storage_key')
    const thumbnailKey = requiredString(row, 'thumbnail_storage_key')
    if (requiredString(row, 'full_storage_object_ref')
        !== input.reservation.fullStorageObjectRef
      || requiredString(row, 'thumbnail_storage_object_ref')
        !== input.reservation.thumbnailStorageObjectRef) {
      throw new HomeownerApiError('unavailable')
    }

    const bucket = this.#client.storage.from('homesrolo-homeowner-private')
    for (const [key, bytes] of [
      [fullKey, input.photo.fullBytes],
      [thumbnailKey, input.photo.thumbnailBytes],
    ] as const) {
      const { error: uploadError } = await bucket.upload(key, bytes, {
        contentType: 'image/jpeg',
        cacheControl: '0',
        upsert: false,
      })
      // An error may be an ambiguous remote success. Never spend unmetered
      // egress to probe it: fail closed and let exact-key cleanup reconcile.
      if (uploadError) throw new HomeownerApiError('unavailable')
    }

    const { data, error } = await this.#client.rpc(
      'homesrolo_finalize_checkup_photo_upload',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_command_ref: input.command.commandRef,
        p_command_digest: input.reservation.commandDigest,
        p_photo_ref: input.reservation.photoRef,
        p_lease_token: input.reservation.leaseToken,
        p_full_storage_object_ref: input.reservation.fullStorageObjectRef,
        p_full_byte_length: input.photo.fullBytes.byteLength,
        p_full_payload_sha256: input.photo.fullPayloadSha256,
        p_thumbnail_storage_object_ref: input.reservation.thumbnailStorageObjectRef,
        p_thumbnail_byte_length: input.photo.thumbnailBytes.byteLength,
        p_thumbnail_payload_sha256: input.photo.thumbnailPayloadSha256,
        p_width: input.photo.width,
        p_height: input.photo.height,
        p_completed_at: this.#now(),
      },
    )
    if (error) throw new HomeownerApiError('unavailable')
    return checkupPhotoFromRow(data)
  }

  async rejectCheckupPhotoUpload(
    input: Parameters<HomeownerCheckupPhotoPort['rejectCheckupPhotoUpload']>[0],
  ) {
    const { error } = await this.#client.rpc('homesrolo_reject_checkup_photo_upload', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_photo_ref: input.reservation.photoRef,
      p_lease_token: input.reservation.leaseToken,
      p_rejected_at: input.rejectedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    await this.#reconcileCheckupPhotoObjects()
  }

  async readCheckupPhotoVariant(
    input: Parameters<HomeownerCheckupPhotoPort['readCheckupPhotoVariant']>[0],
  ) {
    // The transactional egress ledger runs before Storage download. The RPC
    // derives byte length from the available row, never from browser input.
    const { data, error } = await this.#client.rpc(
      'homesrolo_reserve_checkup_photo_egress',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_photo_ref: input.photoRef,
        p_variant: input.variant,
        p_egress_ref: mintOpaqueRef('hegr'),
        p_requested_at: this.#now(),
      },
    )
    if (error) {
      if (error.message.includes('photo_egress_rate_limited')
        || error.message.includes('photo_egress_limited')) {
        throw new HomeownerApiError('rate_limited')
      }
      if (error.message.includes('photo_not_found')) throw new HomeownerApiError('not_found')
      throw new HomeownerApiError('unavailable')
    }
    const row = record(data)
    const photo = checkupPhotoFromRow(row)
    const storageKey = input.variant === 'full'
      ? requiredString(row, 'full_storage_key')
      : requiredString(row, 'thumbnail_storage_key')
    const expectedLength = input.variant === 'full'
      ? photo.fullByteLength
      : photo.thumbnailByteLength
    const expectedHash = input.variant === 'full'
      ? photo.fullPayloadSha256
      : photo.thumbnailPayloadSha256
    const download = await this.#client.storage
      .from('homesrolo-homeowner-private')
      .download(storageKey)
    if (download.error || !download.data) throw new HomeownerApiError('unavailable')
    const bytes = new Uint8Array(await download.data.arrayBuffer())
    if (bytes.byteLength !== expectedLength
      || createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
      throw new HomeownerApiError('unavailable')
    }
    return { photo, bytes }
  }

  async deleteCheckupPhoto(
    input: Parameters<HomeownerCheckupPhotoPort['deleteCheckupPhoto']>[0],
  ) {
    await this.#reconcileCheckupPhotoObjects()
    const { data, error } = await this.#client.rpc('homesrolo_begin_checkup_photo_delete', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_photo_ref: input.photoRef,
      p_deleted_at: input.deletedAt,
    })
    if (error) {
      if (error.message.includes('photo_not_found')) throw new HomeownerApiError('not_found')
      if (error.message.includes('photo_not_available')) throw new HomeownerApiError('conflict')
      throw new HomeownerApiError('unavailable')
    }
    const row = record(data)
    if (requiredString(row, 'state') === 'deleted') {
      return { photoRef: input.photoRef, state: 'deleted' as const }
    }
    await this.#removeCheckupPhotoObjects(row)
    const { data: finalized, error: finalizeError } = await this.#client.rpc(
      'homesrolo_finalize_checkup_photo_delete',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_photo_ref: input.photoRef,
        p_deleted_at: input.deletedAt,
      },
    )
    if (finalizeError || requiredString(record(finalized), 'state') !== 'deleted') {
      throw new HomeownerApiError('unavailable')
    }
    return { photoRef: input.photoRef, state: 'deleted' as const }
  }
  async listWarranties() { return [] }
  async listMaintenance() { return [] }

  async createPrivateHomeWorkspace(input: Parameters<HomeownerCommandPort['createPrivateHomeWorkspace']>[0]) {
    const homeRef = mintOpaqueRef('hhom')
    const membershipRef = mintOpaqueRef('hmbr')
    const { data, error } = await this.#client.rpc('homesrolo_create_private_home_workspace', {
      p_principal_ref: input.authorization.principalRef,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(input.command),
      p_home_ref: homeRef,
      p_membership_ref: membershipRef,
      p_display_label: input.command.displayLabel,
      p_private_location_label: input.command.privateLocationLabel,
      p_requested_at: input.command.requestedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    const result = record(data)
    return { home: homeFromRow(result.home), membership: membershipFromRow(result.membership) }
  }

  async createProject(input: Parameters<HomeownerCommandPort['createProject']>[0]) {
    const projectRef = mintOpaqueRef('hprj')
    const { data, error } = await this.#client.rpc('homesrolo_create_homeowner_project', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(homeownerProjectCommandIntent(input.command)),
      p_project_ref: projectRef,
      p_title: input.command.title,
      p_category: input.command.category,
      p_status: input.command.status,
      p_occurred_on: input.command.occurredOn ?? null,
      p_summary: input.command.summary ?? '',
      p_requested_at: input.command.requestedAt,
    })
    if (error) {
      if (error.message.includes('command_digest_mismatch')) {
        throw new HomeownerApiError('conflict')
      }
      throw new HomeownerApiError('unavailable')
    }
    return projectFromRow(data)
  }

  async createProjectQuote(input: Parameters<HomeownerProjectQuotePort['createProjectQuote']>[0]) {
    const quoteRef = mintOpaqueRef('hquo')
    const { data, error } = await this.#client.rpc('homesrolo_create_homeowner_project_quote', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_project_ref: input.command.projectRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(homeownerProjectQuoteCommandIntent(input.command)),
      p_quote_ref: quoteRef,
      p_contractor_label: input.command.contractorLabel,
      p_proposal_date: input.command.proposalDate ?? null,
      p_artifact_ref: input.command.artifactRef ?? null,
      p_scope: input.command.scope,
      p_notes: input.command.notes ?? '',
      p_requested_at: input.command.requestedAt,
    })
    if (error) {
      if (error.message.includes('command_digest_mismatch')) {
        throw new HomeownerApiError('conflict')
      }
      throw new HomeownerApiError('unavailable')
    }
    return quoteFromRow(data)
  }

  async saveProjectQuote(input: Parameters<HomeownerProjectQuotePort['saveProjectQuote']>[0]) {
    const { data, error } = await this.#client.rpc('homesrolo_save_homeowner_project_quote', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_project_ref: input.command.projectRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(homeownerProjectQuoteCommandIntent(input.command)),
      p_quote_ref: input.command.quoteRef,
      p_expected_revision: input.command.expectedRevision,
      p_contractor_label: input.command.contractorLabel,
      p_proposal_date: input.command.proposalDate ?? null,
      p_artifact_ref: input.command.artifactRef ?? null,
      p_scope: input.command.scope,
      p_notes: input.command.notes ?? '',
      p_requested_at: input.command.requestedAt,
    })
    if (error) {
      if (error.message.includes('quote_revision_conflict')
        || error.message.includes('command_digest_mismatch')) {
        throw new HomeownerApiError('conflict')
      }
      throw new HomeownerApiError('unavailable')
    }
    return quoteFromRow(data)
  }

  async recordInitialIntake(input: Parameters<HomeownerCommandPort['recordInitialIntake']>[0]) {
    const propertyFactsRef = mintOpaqueRef('hfac')
    const systems = input.command.systems.map(system => ({
      ...system,
      systemRef: mintOpaqueRef('hsys'),
    }))
    const { data, error } = await this.#client.rpc('homesrolo_record_initial_intake', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(input.command),
      p_property_facts_ref: propertyFactsRef,
      p_home_type: input.command.homeType,
      p_year_built_value: input.command.yearBuilt?.value ?? null,
      p_year_built_precision: input.command.yearBuilt?.precision ?? null,
      p_systems: systems.map(system => ({
        system_ref: system.systemRef,
        kind: system.kind,
        present: system.present,
        installed_or_replaced_year_value: system.installedOrReplacedYear?.value ?? null,
        installed_or_replaced_year_precision: system.installedOrReplacedYear?.precision ?? null,
      })),
      p_requested_at: input.command.requestedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    const result = record(data)
    if (!Array.isArray(result.systems)) throw new HomeownerApiError('unavailable')
    return {
      propertyFacts: propertyFactsFromRow(result.property_facts),
      systems: result.systems.map(systemFromRow),
    }
  }

  async storeArtifact(input: Parameters<HomeownerPrivateObjectPort['storeArtifact']>[0]) {
    const artifactRef = mintOpaqueRef('hart')
    const storageObjectRef = mintOpaqueRef('hobj')
    const storageKey = `${input.grant.homeRef}/${storageObjectRef}`
    const commandDigest = digest(input.command)
    const { data: reservedData, error: reserveError } = await this.#client.rpc(
      'homesrolo_reserve_homeowner_artifact_upload',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_command_ref: input.command.commandRef,
        p_command_digest: commandDigest,
        p_artifact_ref: artifactRef,
        p_project_ref: input.command.projectRef ?? null,
        p_kind: input.command.kind,
        p_display_name: input.command.displayName,
        p_media_type: input.command.mediaType,
        p_byte_length: input.command.byteLength,
        p_payload_sha256: input.command.payloadSha256,
        p_storage_object_ref: storageObjectRef,
        p_storage_key: storageKey,
        p_requested_at: input.command.requestedAt,
      },
    )
    if (reserveError) throw new HomeownerApiError('unavailable')
    const reservedRow = record(reservedData)
    const reserved = artifactFromRow(reservedRow)
    const reservedState = requiredString(reservedRow, 'state')
    const reservedStorageKey = requiredString(reservedRow, 'storage_key')
    const coherent = requiredString(reservedRow, 'command_digest') === commandDigest
      && reserved.homeRef === input.grant.homeRef
      && reserved.controllerPrincipalRef === input.grant.principalRef
      && reserved.projectRef === input.command.projectRef
      && reserved.kind === input.command.kind
      && reserved.displayName === input.command.displayName
      && reserved.mediaType === input.command.mediaType
      && reserved.byteLength === input.command.byteLength
      && reserved.payloadSha256 === input.command.payloadSha256
      && reservedStorageKey === `${input.grant.homeRef}/${reserved.storageObjectRef}`
    if (!coherent || !['uploading', 'available'].includes(reservedState)) {
      throw new HomeownerApiError('unavailable')
    }
    if (reservedState === 'available') return reserved

    const bucket = this.#client.storage.from('homesrolo-homeowner-private')
    const upload = await bucket.upload(reservedStorageKey, input.bytes, {
      contentType: input.command.mediaType,
      cacheControl: '0',
      upsert: false,
    })
    if (upload.error) {
      // A retry may find the exact object from an earlier interrupted request.
      // Reconciliation is content-based; no error string is trusted.
    }
    const downloaded = await bucket.download(reservedStorageKey)
    if (downloaded.error || !downloaded.data) throw new HomeownerApiError('unavailable')
    const readback = new Uint8Array(await downloaded.data.arrayBuffer())
    if (readback.byteLength !== input.command.byteLength
      || createHash('sha256').update(readback).digest('hex') !== input.command.payloadSha256) {
      throw new HomeownerApiError('unavailable')
    }

    const { data: finalizedData, error: finalizeError } = await this.#client.rpc(
      'homesrolo_finalize_homeowner_artifact_upload',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_command_ref: input.command.commandRef,
        p_command_digest: commandDigest,
        p_artifact_ref: reserved.artifactRef,
        p_storage_object_ref: reserved.storageObjectRef,
        p_completed_at: this.#now(),
      },
    )
    if (finalizeError) throw new HomeownerApiError('unavailable')
    return artifactFromRow(finalizedData)
  }

  async readExactObject(input: Parameters<HomeownerPrivateObjectPort['readExactObject']>[0]) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_artifacts')
      .select('*')
      .eq('home_ref', input.grant.homeRef)
      .eq('storage_object_ref', input.storageObjectRef)
      .eq('state', 'available')
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    if (data === null) throw new HomeownerApiError('not_found')
    const row = record(data)
    const artifact = artifactFromRow(row)
    if (artifact.payloadSha256 !== input.expectedSha256
      || artifact.byteLength > input.maximumBytes) {
      throw new HomeownerApiError('unavailable')
    }
    const download = await this.#client.storage
      .from('homesrolo-homeowner-private')
      .download(requiredString(row, 'storage_key'))
    if (download.error || !download.data) throw new HomeownerApiError('unavailable')
    const bytes = new Uint8Array(await download.data.arrayBuffer())
    if (bytes.byteLength !== artifact.byteLength
      || createHash('sha256').update(bytes).digest('hex') !== artifact.payloadSha256) {
      throw new HomeownerApiError('unavailable')
    }
    return bytes
  }

  async readCanonicalEmail(
    grant: Parameters<HomeownerProjectReviewPersistencePort['readCanonicalEmail']>[0],
  ) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_principals')
      .select('principal_ref,email_canonical,status,email_verified')
      .eq('principal_ref', grant.principalRef)
      .eq('status', 'active')
      .eq('email_verified', true)
      .maybeSingle()
    if (error || !data || data.principal_ref !== grant.principalRef
      || typeof data.email_canonical !== 'string') {
      throw new HomeownerApiError('unavailable')
    }
    const email = data.email_canonical.trim().toLowerCase()
    if (email !== data.email_canonical || email.length < 3 || email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HomeownerApiError('unavailable')
    }
    return email
  }

  async reserveSubmission(
    input: Parameters<HomeownerProjectReviewPersistencePort['reserveSubmission']>[0],
  ): Promise<HomeownerProjectReviewReservation> {
    const { data, error } = await this.#client.rpc(
      'homesrolo_reserve_project_review_submission',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_project_ref: input.projectRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_command_ref: input.commandRef,
        p_command_digest: input.commandDigest,
        p_submission_ref: input.submissionRef,
        p_disclosure_digest: input.disclosureDigest,
        p_disclosure: input.disclosure,
        p_consent_accepted_at: input.consentAcceptedAt,
      },
    )
    if (error) throw new HomeownerApiError('unavailable')
    const row = record(data)
    const submissionRef = requiredString(row, 'submission_ref')
    const existingCommandRef = requiredString(row, 'command_ref')
    const digestValue = requiredString(row, 'command_digest')
    const disclosureDigest = requiredString(row, 'disclosure_digest')
    const state = requiredString(row, 'state')
    const submittedAt = canonicalInstant(row, 'consent_accepted_at')
    if ((existingCommandRef === input.commandRef && digestValue !== input.commandDigest)
      || disclosureDigest !== input.disclosureDigest
      || requiredString(row, 'home_ref') !== input.grant.homeRef
      || requiredString(row, 'project_ref') !== input.projectRef
      || requiredString(row, 'controller_principal_ref') !== input.grant.principalRef) {
      throw new HomeownerApiError('unavailable')
    }
    if (state === 'awaiting_chance_review') {
      return {
        state,
        submissionRef,
        submittedAt,
        receipt: homesroloJobroloProjectIntakeReceiptSchema.parse(row.jobrolo_receipt),
      }
    }
    if (state === 'reconciliation_required') {
      return { state, submissionRef, submittedAt }
    }
    if (state !== 'executing') throw new HomeownerApiError('unavailable')
    if (submissionRef !== input.submissionRef) {
      // An exact command replay may legitimately return its earlier minted
      // submission reference; it is no longer a fresh reservation to execute.
      return { state: 'reconciliation_required', submissionRef, submittedAt }
    }
    return {
      state: 'reserved',
      submissionRef,
      commandDigest: digestValue,
      disclosureDigest,
    }
  }

  async createArtifactTransfer(
    input: Parameters<HomeownerProjectReviewPersistencePort['createArtifactTransfer']>[0],
  ) {
    if (!this.#supabaseOrigin || input.artifact.homeRef !== input.grant.homeRef
      || input.artifact.controllerPrincipalRef !== input.grant.principalRef
      || !input.artifact.projectRef) {
      throw new HomeownerApiError('unavailable')
    }
    const expiresIn = Math.floor((Date.parse(input.expiresAt) - Date.parse(this.#now())) / 1000)
    if (expiresIn < 1 || expiresIn > 300) throw new HomeownerApiError('unavailable')
    const storageKey = `${input.grant.homeRef}/${input.artifact.storageObjectRef}`
    const { data, error } = await this.#client.storage
      .from('homesrolo-homeowner-private')
      // This URL is consumed by the exact Jobrolo server adapter, not offered
      // as a browser download. A token-only query lets the receiver reject all
      // extra query authority.
      .createSignedUrl(storageKey, expiresIn)
    if (error || !data?.signedUrl) throw new HomeownerApiError('unavailable')
    const url = new URL(data.signedUrl, this.#supabaseOrigin)
    if (url.origin !== this.#supabaseOrigin || url.protocol !== 'https:') {
      throw new HomeownerApiError('unavailable')
    }
    return { downloadUrl: url.href, downloadExpiresAt: input.expiresAt }
  }

  async markSubmissionReceived(
    input: Parameters<HomeownerProjectReviewPersistencePort['markSubmissionReceived']>[0],
  ) {
    const receipt = homesroloJobroloProjectIntakeReceiptSchema.parse(input.receipt)
    if (receipt.submissionRef !== input.submissionRef) throw new HomeownerApiError('unavailable')
    const { error } = await this.#client.rpc(
      'homesrolo_complete_project_review_submission',
      {
        p_principal_ref: input.grant.principalRef,
        p_home_ref: input.grant.homeRef,
        p_project_ref: input.projectRef,
        p_membership_ref: input.grant.membershipRef,
        p_membership_revision: input.grant.membershipRevision,
        p_command_ref: input.commandRef,
        p_command_digest: input.commandDigest,
        p_submission_ref: input.submissionRef,
        p_receipt: receipt,
        p_received_at: input.receivedAt,
      },
    )
    if (error) throw new HomeownerApiError('unavailable')
  }

  async markSubmissionUnknown(
    input: Parameters<HomeownerProjectReviewPersistencePort['markSubmissionUnknown']>[0],
  ) {
    const { error } = await this.#client.rpc('homesrolo_mark_project_review_unknown', {
      p_principal_ref: input.grant.principalRef,
      p_command_ref: input.commandRef,
      p_command_digest: input.commandDigest,
      p_submission_ref: input.submissionRef,
      p_failed_at: input.failedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
  }
}

export function databaseValueForTesting(value: unknown) {
  return {
    principalFromRow,
    membershipFromRow,
    homeFromRow,
    propertyFactsFromRow,
    systemFromRow,
    artifactFromRow,
    stableJson: stableJson(value),
    nullableString,
  }
}
