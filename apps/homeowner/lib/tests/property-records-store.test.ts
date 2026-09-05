import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { emptyPropertyFacts, type HomePropertySnapshot } from '../../../../src/homeowner/property-research.v1.ts'
import { SupabasePropertyRecordsStore, type SavePropertySnapshotInput } from '../server/property-records-store.ts'

const principalRef = `hprn_${'p'.repeat(43)}`
const homeRef = `hhom_${'h'.repeat(43)}`
const snapshot: HomePropertySnapshot = {
  version: 'home-property-snapshot.v1', homeRef,
  address: { line1: '123 Synthetic Lane', line2: null, city: 'Fort Worth', regionCode: 'TX', postalCode: '76102', countryCode: 'US' },
  facts: { ...emptyPropertyFacts(), squareFeet: 1800, bathrooms: 2.5 },
  lookup: null, reviewedAt: '2026-09-05T12:00:00.000Z',
}
const input: SavePropertySnapshotInput = {
  principalRef, homeRef, commandRef: `hcmd_${'c'.repeat(43)}`, commandDigest: 'a'.repeat(64),
  address: snapshot.address, facts: snapshot.facts, lookup: snapshot.lookup, reviewedAt: snapshot.reviewedAt,
}

function fixture(data: unknown, message: string | null = null) {
  const calls: { name: string; args: unknown }[] = []
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args })
      return { data, error: message === null ? null : { message } }
    },
  } as unknown as Pick<SupabaseClient, 'rpc'>
  return { store: new SupabasePropertyRecordsStore(client), calls }
}

function code(expected: string) {
  return (error: unknown) => error instanceof HomeownerApiError && error.code === expected
}

test('property lookup spends only a principal-scoped atomic allowance, never a home write', async () => {
  const { store, calls } = fixture(true)
  assert.equal(await store.consumeLookup(principalRef), true)
  assert.deepEqual(calls, [{ name: 'homesrolo_consume_property_lookup', args: { p_principal_ref: principalRef } }])
  assert.equal(await fixture(false).store.consumeLookup(principalRef), false)
  for (const invalid of [null, undefined, 1, 'true', {}]) {
    await assert.rejects(fixture(invalid).store.consumeLookup(principalRef), code('unavailable'))
  }
  await assert.rejects(fixture(true, 'database offline').store.consumeLookup(principalRef), code('unavailable'))
})

test('property snapshot read accepts only an exact-home strict projection', async () => {
  const { store, calls } = fixture(snapshot)
  assert.deepEqual(await store.read(principalRef, homeRef), snapshot)
  assert.deepEqual(calls, [{ name: 'homesrolo_read_property_snapshot', args: { p_principal_ref: principalRef, p_home_ref: homeRef } }])
  assert.equal(await fixture(null).store.read(principalRef, homeRef), null)
  for (const invalid of [
    { ...snapshot, homeRef: `hhom_${'x'.repeat(43)}` },
    { ...snapshot, principalRef },
    { ...snapshot, facts: { ...snapshot.facts, ownerName: 'Must not cross' } },
    { ...snapshot, facts: { ...snapshot.facts, bathrooms: 1.2 } },
  ]) await assert.rejects(fixture(invalid).store.read(principalRef, homeRef), code('unavailable'))
})

test('property snapshot save sends reviewed values and original provenance through one RPC', async () => {
  const { store, calls } = fixture(snapshot)
  assert.deepEqual(await store.save(input), snapshot)
  assert.deepEqual(calls, [{ name: 'homesrolo_save_property_snapshot', args: {
    p_principal_ref: principalRef, p_home_ref: homeRef,
    p_command_ref: input.commandRef, p_command_digest: input.commandDigest,
    p_address: input.address, p_facts: input.facts, p_lookup: null, p_reviewed_at: input.reviewedAt,
  } }])
  const retryTime = '2026-09-05T12:01:00.000Z'
  assert.equal((await store.save({ ...input, reviewedAt: retryTime })).reviewedAt, snapshot.reviewedAt,
    'idempotent retry preserves first execution time returned by the database')
})

test('malformed property identities and snapshots fail before the RPC', async () => {
  const { store, calls } = fixture(snapshot)
  await assert.rejects(store.consumeLookup('bad'), code('invalid_request'))
  await assert.rejects(store.read(principalRef, 'bad'), code('invalid_request'))
  for (const bad of [
    { ...input, commandRef: 'bad' }, { ...input, commandDigest: 'bad' },
    { ...input, facts: { ...input.facts, squareFeet: 0 } },
    { ...input, reviewedAt: 'yesterday' },
  ]) await assert.rejects(store.save(bad), code('invalid_request'))
  assert.deepEqual(calls, [])
})

test('property persistence errors disclose only bounded application codes', async () => {
  for (const message of ['property_command_conflict', 'property_snapshot_exists', 'property_address_mismatch']) {
    await assert.rejects(fixture(null, message).store.save(input), code('conflict'))
  }
  for (const message of ['property_not_authorized', 'property_home_not_found']) {
    await assert.rejects(fixture(null, message).store.save(input), code('not_found'))
  }
  await assert.rejects(fixture(null, 'property_invalid_snapshot').store.save(input), code('invalid_request'))
  await assert.rejects(fixture(null, 'private database internal detail').store.save(input), code('unavailable'))
  await assert.rejects(fixture(null).store.save(input), code('unavailable'))
})
