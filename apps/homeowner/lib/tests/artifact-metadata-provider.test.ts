import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import type { AuthorizedHomeownerAction } from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import type { UpdateHomeownerArtifactMetadataInput } from '../../../../src/homeowner/homeowner-artifact-metadata.v1.ts'
import { SupabaseHomeownerProvider } from '../server/supabase-provider.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principalRef = ref('hprn', 'p')
const memberPrincipalRef = ref('hprn', 'u')
const homeRef = ref('hhom', 'h')
const artifactRef = ref('hart', 'a')
const projectRef = ref('hprj', 'j')
const commandRef = ref('hcmd', 'c')
const createdAt = '2026-08-27T12:00:00.000Z'
const requestedAt = '2026-08-28T12:00:00.000Z'

const grant: AuthorizedHomeownerAction<'artifact.update_metadata'> = {
  authorized: true,
  principalRef,
  homeRef,
  membershipRef: ref('hmbr', 'm'),
  membershipRevision: 4,
  action: 'artifact.update_metadata',
  recheckedAt: requestedAt,
}

const command: UpdateHomeownerArtifactMetadataInput = {
  commandRef,
  artifactRef,
  expectedRevision: 1,
  projectRef,
  observedOn: '2026-08-27',
  phase: 'before',
  areaLabel: 'Rear patio',
  geoPin: {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracyMeters: 8,
    capturedAt: '2026-08-27T17:30:00.000Z',
    provenance: 'device_confirmed',
  },
  requestedAt,
}

function artifactRow(input: Record<string, unknown>) {
  return {
    artifact_ref: artifactRef,
    home_ref: homeRef,
    project_ref: input.p_project_ref,
    controller_principal_ref: memberPrincipalRef,
    kind: 'photo',
    display_name: 'Rear patio before.jpg',
    media_type: 'image/jpeg',
    byte_length: 1_024,
    payload_sha256: 'a'.repeat(64),
    storage_object_ref: ref('hobj', 's'),
    content_class: 'homeowner_private',
    observed_on: input.p_observed_on,
    photo_phase: input.p_photo_phase,
    area_label: input.p_area_label,
    geo_latitude: input.p_geo_latitude,
    geo_longitude: input.p_geo_longitude,
    geo_accuracy_meters: input.p_geo_accuracy_meters,
    geo_captured_at: input.p_geo_captured_at,
    geo_provenance: input.p_geo_provenance,
    revision: 2,
    created_at: createdAt,
    updated_at: input.p_requested_at,
  }
}

test('Supabase artifact metadata command binds exact authority, safe fields, and stable intent', async () => {
  const calls: Record<string, unknown>[] = []
  const provider = new SupabaseHomeownerProvider({
    async rpc(name: string, input: Record<string, unknown>) {
      assert.equal(name, 'homesrolo_update_homeowner_artifact_metadata')
      calls.push(input)
      return { data: artifactRow(input), error: null }
    },
  } as unknown as SupabaseClient)

  const updated = await provider.updateArtifactMetadata({ grant, command })
  assert.equal(updated.controllerPrincipalRef, memberPrincipalRef,
    'the authenticated controller does not replace the original uploader')
  assert.equal(updated.revision, 2)
  assert.deepEqual(updated.geoPin, command.geoPin)
  assert.equal(calls[0]?.p_principal_ref, principalRef)
  assert.equal(calls[0]?.p_membership_revision, 4)
  assert.equal(calls[0]?.p_home_ref, homeRef)
  assert.equal(calls[0]?.p_artifact_ref, artifactRef)
  assert.equal(calls[0]?.p_expected_revision, 1)
  assert.equal(calls[0]?.p_geo_provenance, 'device_confirmed')

  await provider.updateArtifactMetadata({
    grant,
    command: { ...command, requestedAt: '2026-08-28T12:05:00.000Z' },
  })
  assert.equal(calls[0]?.p_command_digest, calls[1]?.p_command_digest,
    'server execution time is excluded from retry intent')
})

test('Supabase artifact metadata provider fails closed on partial geo and maps bounded errors', async () => {
  const partialGeo = new SupabaseHomeownerProvider({
    async rpc(_name: string, input: Record<string, unknown>) {
      return {
        data: { ...artifactRow(input), geo_latitude: null },
        error: null,
      }
    },
  } as unknown as SupabaseClient)
  await assert.rejects(
    partialGeo.updateArtifactMetadata({ grant, command }),
    (error: unknown) => error instanceof HomeownerApiError && error.code === 'unavailable',
  )

  for (const [message, code] of [
    ['artifact_metadata_revision_conflict', 'conflict'],
    ['project_not_in_home', 'not_found'],
    ['invalid_artifact_geo_pin', 'invalid_request'],
  ] as const) {
    const provider = new SupabaseHomeownerProvider({
      async rpc() { return { data: null, error: { message } } },
    } as unknown as SupabaseClient)
    await assert.rejects(
      provider.updateArtifactMetadata({ grant, command }),
      (error: unknown) => error instanceof HomeownerApiError && error.code === code,
    )
  }
})
