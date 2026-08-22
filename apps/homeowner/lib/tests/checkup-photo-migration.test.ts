import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { homeownerCheckupPhotoCommandIntent } from '../../../../src/homeowner/homeowner-checkup-photos.v1.ts'
import { SupabaseHomeownerProvider } from '../server/supabase-provider.ts'

const root = path.resolve(process.cwd(), '../..')
const migration = readFileSync(path.join(
  root,
  'supabase/migrations/202608210003_homeowner_checkup_photos.sql',
), 'utf8')
const provider = readFileSync(path.join(
  root,
  'apps/homeowner/lib/server/supabase-provider.ts',
), 'utf8')

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

test('photo migration is private, atomic, capped, leased, and independently receipt-backed', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.homesrolo_homeowner_checkup_photos from public, anon, authenticated/)
  assert.match(migration, /photo_checkup\.upload/)
  assert.match(migration, /homesrolo:photo-checkups:global/)
  assert.match(migration, /lease_token text/)
  assert.match(migration, /upload_in_progress/)
  assert.match(migration, /state = 'failed' and objects_cleaned_at is null/)
  for (const cap of [
    'v_home_count >= 100',
    'v_principal_count >= 200',
    'v_global_count >= 500',
    '157286400',
    '262144000',
    '524288000',
    '>= 1000',
    '>= 5000',
  ]) assert.ok(migration.includes(cap), cap)
  assert.match(migration, /role = 'workspace_controller'/)
  assert.match(migration, /input_payload_sha256, media_type, full_storage_object_ref/)
  assert.match(migration, /p_input_payload_sha256, 'image\/jpeg', p_full_storage_object_ref/)
  assert.match(migration, /homesrolo_homeowner_checkup_photo_upload_attempts/)
  assert.match(migration, /attempted_at < least\(/)
  assert.match(migration, /attempted_at >= p_requested_at - interval '1 hour'/)
  assert.match(migration, /v_principal_count >= 20 or v_home_count >= 12 or v_global_count >= 120/)
  assert.match(migration, /v_principal_output_bytes \+ 1638400 > 268435456/)
  assert.match(migration, /v_global_output_bytes \+ 1638400 > 536870912/)
  assert.match(migration, /reserved_output_bytes integer not null default 1638400/)
  assert.match(migration, /if v_photo\.home_ref <> p_home_ref then\s+raise exception 'command_scope_mismatch'/)
  const retryMarker = migration.indexOf('v_is_retry := true')
  const sharedAdmission = migration.indexOf(
    'delete from public.homesrolo_homeowner_checkup_photo_upload_attempts',
    retryMarker,
  )
  assert.ok(retryMarker >= 0 && sharedAdmission > retryMarker,
    'retry and first-attempt admission share one atomic rolling ledger')
  assert.doesNotMatch(migration, /jobrolo/i)
})

test('cleaned retries share rolling admission, concurrency, and active storage caps', () => {
  const retryMarker = migration.indexOf('v_is_retry := true')
  const prune = migration.indexOf(
    'delete from public.homesrolo_homeowner_checkup_photo_upload_attempts',
    retryMarker,
  )
  const rate = migration.indexOf('v_principal_count >= 20', prune)
  const concurrency = migration.indexOf("state = 'processing') >= 1", rate)
  const activeQuota = migration.indexOf('v_home_count >= 100', concurrency)
  const attempt = migration.indexOf(
    'insert into public.homesrolo_homeowner_checkup_photo_upload_attempts',
    activeQuota,
  )
  const mutation = migration.indexOf('if v_is_retry then', attempt)
  assert.ok(retryMarker >= 0 && retryMarker < prune)
  assert.ok(prune < rate && rate < concurrency && concurrency < activeQuota)
  assert.ok(activeQuota < attempt && attempt < mutation)
})

test('view labels and captions are repeatable, bounded, and control-character safe in SQL', () => {
  assert.match(migration, /view_label = btrim\(view_label\)/)
  assert.match(migration, /length\(view_label\) between 1 and 80/)
  assert.match(migration, /view_label !~ '\[\[:cntrl:\]\]'/)
  assert.match(migration, /length\(caption\) <= 240/)
  assert.match(migration, /caption !~ '\[\[:cntrl:\]\]'/)
})

test('egress is reserved before Storage reads with byte, rate, row, and retention caps', () => {
  assert.match(migration, /homesrolo:photo-egress:global/)
  assert.match(migration, /homesrolo_homeowner_checkup_photo_egress/)
  assert.match(migration,
    /reserved_at < least\(\s*date_trunc\('month', p_requested_at\),\s*p_requested_at - interval '24 hours'\s*\)/)
  for (const cap of ['134217728', '536870912', '2147483648', '>= 25000']) {
    assert.ok(migration.includes(cap), cap)
  }
  assert.match(migration, /reserved_at >= p_requested_at - interval '1 minute'\) >= 120/)
  assert.match(migration, /variant = 'full'[\s\S]+interval '1 minute'\) >= 12/)
  const reserve = provider.indexOf("'homesrolo_reserve_checkup_photo_egress'")
  const download = provider.indexOf('.download(storageKey)', reserve)
  assert.ok(reserve >= 0 && download > reserve)
})

test('deletion redacts active metadata and receipts while retaining a bounded tombstone', () => {
  for (const field of [
    'observed_on = null',
    'view_label = null',
    'caption = null',
    'input_payload_sha256 = null',
    'full_storage_key = null',
    'full_payload_sha256 = null',
    'thumbnail_payload_sha256 = null',
    'available_at = null',
  ]) assert.ok(migration.includes(field), field)
  assert.match(migration, /jsonb_build_object\('photo_ref', [^)]+, 'state', 'available'\)/)
  assert.match(migration, /state', 'deleted'/)
  assert.match(migration, /interval '30 days'/)
  assert.match(migration, /interval '1 day'/)
  assert.match(migration, /homesrolo_service_reconcile_checkup_photo_objects/)
  assert.match(migration, /homesrolo_service_expire_stale_checkup_photo_uploads/)
  assert.match(migration, /grant execute on function public\.homesrolo_service_reconcile_checkup_photo_objects/)
  const expire = provider.indexOf("'homesrolo_service_expire_stale_checkup_photo_uploads'")
  const scan = provider.indexOf(".in('state', ['failed', 'deleting'])", expire)
  assert.ok(expire >= 0 && scan > expire, 'list/write reconciliation expires leases before scanning')
})

test('one unrelated cleanup failure does not brick an available photo list', async () => {
  const homeRef = `hhom_${'h'.repeat(43)}`
  const principalRef = `hprn_${'p'.repeat(43)}`
  const available = {
    photo_ref: `hpho_${'a'.repeat(43)}`,
    home_ref: homeRef,
    controller_principal_ref: principalRef,
    observed_on: '2026-08-20',
    area: 'front_exterior',
    view_label: 'Front door from the walkway',
    caption: '',
    media_type: 'image/jpeg',
    full_storage_object_ref: `hobj_${'f'.repeat(43)}`,
    full_storage_key: `${homeRef}/checkup-photos/hobj_${'f'.repeat(43)}`,
    full_byte_length: 1000,
    full_payload_sha256: 'a'.repeat(64),
    thumbnail_storage_object_ref: `hobj_${'t'.repeat(43)}`,
    thumbnail_storage_key: `${homeRef}/checkup-photos/hobj_${'t'.repeat(43)}`,
    thumbnail_byte_length: 200,
    thumbnail_payload_sha256: 'b'.repeat(64),
    width: 1200,
    height: 800,
    created_at: '2026-08-21T12:00:00.000Z',
  }
  const stuck = {
    ...available,
    photo_ref: `hpho_${'s'.repeat(43)}`,
    state: 'failed',
    objects_cleaned_at: null,
  }
  class Query {
    reconciliation = false
    available = false
    select() { return this }
    in(name: string) { if (name === 'state') this.reconciliation = true; return this }
    is() { return this }
    eq(name: string, value: string) {
      if (name === 'state' && value === 'available') this.available = true
      return this
    }
    order() { return this }
    limit() { return this }
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({
        data: this.reconciliation ? [stuck] : this.available ? [available] : [],
        error: null,
      }).then(resolve)
    }
  }
  const client = {
    from() { return new Query() },
    storage: {
      from() {
        return { async remove() { return { data: null, error: new Error('stuck object') } } }
      },
    },
    async rpc() { return { data: null, error: null } },
  } as unknown as SupabaseClient
  const providerInstance = new SupabaseHomeownerProvider(client)
  const photos = await providerInstance.listCheckupPhotos({
    authorized: true,
    principalRef,
    homeRef,
    membershipRef: `hmbr_${'m'.repeat(43)}`,
    membershipRevision: 1,
    action: 'workspace.read',
    recheckedAt: '2026-08-21T12:00:00.000Z',
  })
  assert.equal(photos.length, 1)
  assert.equal(photos[0]?.photoRef, available.photo_ref)
})

test('successful derivative persistence performs zero readbacks and upload errors never finalize', async () => {
  const homeRef = `hhom_${'h'.repeat(43)}`
  const principalRef = `hprn_${'p'.repeat(43)}`
  const photoRef = `hpho_${'o'.repeat(43)}`
  const commandRef = `hcmd_${'c'.repeat(43)}`
  const fullObjectRef = `hobj_${'f'.repeat(43)}`
  const thumbnailObjectRef = `hobj_${'t'.repeat(43)}`
  const leaseToken = `hles_${'l'.repeat(43)}`
  const inputBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  const fullBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  const thumbnailBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  const command = {
    commandRef,
    observedOn: '2026-08-20',
    area: 'front_exterior' as const,
    viewLabel: 'Front door from the walkway',
    caption: '',
    inputMediaType: 'image/jpeg' as const,
    inputByteLength: inputBytes.byteLength,
    inputPayloadSha256: sha256(inputBytes),
    requestedAt: '2026-08-21T12:00:00.000Z',
  }
  const commandDigest = sha256(stableJson(homeownerCheckupPhotoCommandIntent(command)))
  const reservation = {
    photoRef,
    homeRef,
    controllerPrincipalRef: principalRef,
    commandRef,
    commandDigest,
    leaseToken,
    fullStorageObjectRef: fullObjectRef,
    thumbnailStorageObjectRef: thumbnailObjectRef,
  }
  const processing = {
    photo_ref: photoRef,
    home_ref: homeRef,
    controller_principal_ref: principalRef,
    command_ref: commandRef,
    command_digest: commandDigest,
    lease_token: leaseToken,
    state: 'processing',
    full_storage_object_ref: fullObjectRef,
    full_storage_key: `${homeRef}/checkup-photos/${fullObjectRef}`,
    thumbnail_storage_object_ref: thumbnailObjectRef,
    thumbnail_storage_key: `${homeRef}/checkup-photos/${thumbnailObjectRef}`,
  }
  const available = {
    ...processing,
    observed_on: command.observedOn,
    area: command.area,
    view_label: command.viewLabel,
    caption: command.caption,
    media_type: 'image/jpeg',
    full_byte_length: fullBytes.byteLength,
    full_payload_sha256: sha256(fullBytes),
    thumbnail_byte_length: thumbnailBytes.byteLength,
    thumbnail_payload_sha256: sha256(thumbnailBytes),
    width: 1,
    height: 1,
    created_at: command.requestedAt,
    state: 'available',
  }
  const grant = {
    authorized: true as const,
    principalRef,
    homeRef,
    membershipRef: `hmbr_${'m'.repeat(43)}`,
    membershipRevision: 1,
    action: 'workspace.update' as const,
    recheckedAt: command.requestedAt,
  }
  const photo = {
    fullBytes,
    fullPayloadSha256: sha256(fullBytes),
    thumbnailBytes,
    thumbnailPayloadSha256: sha256(thumbnailBytes),
    width: 1,
    height: 1,
  }

  const run = async (failedUpload: number | null) => {
    let uploadCalls = 0
    let downloadCalls = 0
    let finalizeCalls = 0
    class ExactReservationQuery {
      select() { return this }
      eq() { return this }
      async maybeSingle() { return { data: processing, error: null } }
    }
    const client = {
      from() { return new ExactReservationQuery() },
      storage: {
        from() {
          return {
            async upload() {
              uploadCalls += 1
              return failedUpload === uploadCalls
                ? { data: null, error: new Error('ambiguous upload') }
                : { data: {}, error: null }
            },
            async download() {
              downloadCalls += 1
              throw new Error('unmetered upload readback is forbidden')
            },
          }
        },
      },
      async rpc(name: string) {
        if (name === 'homesrolo_finalize_checkup_photo_upload') {
          finalizeCalls += 1
          return { data: available, error: null }
        }
        return { data: null, error: null }
      },
    } as unknown as SupabaseClient
    const instance = new SupabaseHomeownerProvider(client)
    const operation = instance.completeCheckupPhotoUpload({ grant, command, reservation, photo })
    if (failedUpload === null) {
      assert.equal((await operation).photoRef, photoRef)
    } else {
      await assert.rejects(operation, error => error instanceof HomeownerApiError)
    }
    return { uploadCalls, downloadCalls, finalizeCalls }
  }

  assert.deepEqual(await run(null), { uploadCalls: 2, downloadCalls: 0, finalizeCalls: 1 })
  assert.deepEqual(await run(2), { uploadCalls: 2, downloadCalls: 0, finalizeCalls: 0 })
})
