import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS } from '../../../../src/homeowner/home-record-handoff.v1.ts'
import { boundedAcceptedHandoffRefsForExport } from '../server/supabase-home-record-handoff-provider.ts'

interface FakeHandoffRow {
  readonly handoff_ref: string
  readonly home_ref: string
  readonly controller_principal_ref: string
  readonly state: string
  readonly received_at: string
}

function fakeClient(
  source: readonly FakeHandoffRow[],
  options: { readonly maxRows?: number; readonly mutateResult?: boolean } = {},
) {
  let queryCalls = 0
  let requestedLimit = 0
  const client = {
    from(table: string) {
      assert.equal(table, 'homesrolo_homeowner_handoffs')
      let rows = [...source]
      const query = {
        select(columns: string, countOptions: { readonly count: string }) {
          assert.equal(columns, 'handoff_ref,received_at')
          assert.deepEqual(countOptions, { count: 'exact' })
          return query
        },
        eq(column: keyof FakeHandoffRow, value: string) {
          rows = rows.filter(candidate => candidate[column] === value)
          return query
        },
        order(column: keyof FakeHandoffRow, options: { readonly ascending: boolean }) {
          rows.sort((left, right) => {
            const comparison = String(left[column]).localeCompare(String(right[column]))
            return options.ascending ? comparison : -comparison
          })
          return query
        },
        limit(maximum: number) {
          queryCalls += 1
          requestedLimit = maximum
          const count = rows.length
          let returned = rows.slice(0, maximum)
          if (options.maxRows !== undefined) returned = returned.slice(0, options.maxRows)
          if (options.mutateResult) returned = returned.slice(0, -1)
          return Promise.resolve({
            data: returned.map(value => ({
              handoff_ref: value.handoff_ref,
              received_at: value.received_at,
            })),
            error: null,
            count,
          })
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  return {
    client,
    get queryCalls() { return queryCalls },
    get requestedLimit() { return requestedLimit },
  }
}

function row(index: number, state: string, homeRef = 'home-a'): FakeHandoffRow {
  return {
    handoff_ref: `handoff-${String(index).padStart(4, '0')}`,
    home_ref: homeRef,
    controller_principal_ref: 'principal-a',
    state,
    received_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }
}

test('accepted export lookup is filtered before paging past newer nonaccepted rows', async () => {
  const rows = [
    ...Array.from({ length: 140 }, (_, index) => row(index + 2, 'received')),
    row(1, 'accepted'),
    row(500, 'accepted', 'other-home'),
  ]
  const fake = fakeClient(rows)
  assert.deepEqual(await boundedAcceptedHandoffRefsForExport(
    fake.client,
    'home-a',
    'principal-a',
  ), ['handoff-0001'])
  assert.equal(fake.queryCalls, 1)
})

test('accepted export lookup returns more than 100 from one exact cap-plus-one query', async () => {
  const withinLimit = fakeClient(Array.from({ length: 101 }, (_, index) =>
    row(index + 1, 'accepted')))
  const references = await boundedAcceptedHandoffRefsForExport(
    withinLimit.client,
    'home-a',
    'principal-a',
  )
  assert.equal(references.length, 101)
  assert.equal(withinLimit.queryCalls, 1)
  assert.equal(withinLimit.requestedLimit, HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS + 1)
})

test('accepted export lookup fails closed on max_rows truncation, mutation, and over-cap count', async () => {
  const maxRows = fakeClient(
    Array.from({ length: 101 }, (_, index) => row(index + 1, 'accepted')),
    { maxRows: 100 },
  )
  await assert.rejects(boundedAcceptedHandoffRefsForExport(
    maxRows.client,
    'home-a',
    'principal-a',
  ), /unavailable/)

  const changed = fakeClient(
    Array.from({ length: 3 }, (_, index) => row(index + 1, 'accepted')),
    { mutateResult: true },
  )
  await assert.rejects(boundedAcceptedHandoffRefsForExport(
    changed.client,
    'home-a',
    'principal-a',
  ), /unavailable/)

  const overLimit = fakeClient(Array.from(
    { length: HOME_RECORD_HANDOFF_MAX_EXPORT_ORIGINALS + 1 },
    (_, index) => row(index + 1, 'accepted'),
  ))
  await assert.rejects(boundedAcceptedHandoffRefsForExport(
    overLimit.client,
    'home-a',
    'principal-a',
  ), /unavailable/)
  assert.equal(overLimit.queryCalls, 1,
    'the provider uses one accepted-only exact-count query')
})
