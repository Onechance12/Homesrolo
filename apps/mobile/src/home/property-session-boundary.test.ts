import assert from 'node:assert/strict'
import test from 'node:test'
import type { HomesroloApi } from '../api/contract.ts'
import type { HomeRecordAddress, HomeRecordProfile, HomeSummary, ServerSession } from '../api/model.ts'
import type { SaveHomePropertyInput } from '../api/property.ts'
import { SessionCheckRequired, SessionFence, sessionBoundApi } from '../auth/session-fence.ts'
import { PreviewHomesroloApi } from '../preview/api.ts'
import { FirstHomePropertySaveFailed, firstHomeAttempt, reviewFirstHome } from './first-run.ts'
import { emptyPropertyFacts, initialPropertySnapshotAttempt } from './property-review.ts'

const HOME = `hhom_${'h'.repeat(43)}`
const ADDRESS: HomeRecordAddress = {
  line1: '123 Synthetic Street', line2: null, city: 'Fort Worth',
  regionCode: 'TX', postalCode: '76102', countryCode: 'US',
}
const SESSION_A: Extract<ServerSession, { kind: 'signed_in' }> = {
  apiVersion: 'homeowner-api.v1-draft', kind: 'signed_in', principalRef: `hprn_${'a'.repeat(43)}`,
  capabilities: {
    emailCodeSignIn: true, magicLinkSignIn: false, persistence: true, projectQuotes: false,
    homeResearch: false, homeAssistant: false, homeAssistantVision: false, uploads: false,
    photoCheckups: false, projectReview: false, projectReviewAttachments: false,
    homeRecordHandoffs: false, invitations: false, sharing: false,
  },
}
const SESSION_B = { ...SESSION_A, principalRef: `hprn_${'b'.repeat(43)}` }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

type Flow = 'first-home third command' | 'existing-home recovery command'

/** Actual attempt helpers and session fence; only API/storage effects are fake. */
function harness(flow: Flow) {
  const fence = new SessionFence()
  assert.equal(fence.confirm(0, SESSION_A), true)
  const entered = deferred<void>()
  const release = deferred<string>()
  const heldCommand = flow === 'first-home third command' ? 3 : 1
  const propertyCommand = `hcmd_${'p'.repeat(43)}`
  const createCalls: string[] = []
  const homes = new Map<string, HomeSummary>()
  const saves: { homeRef: string; input: SaveHomePropertyInput }[] = []
  let minted = 0
  let recordWrites = 0
  let profile: HomeRecordProfile = {
    homeRef: HOME, revision: 1, address: null, homeType: 'unknown', yearBuilt: null,
    systems: [], source: 'homeowner_recollection', updatedAt: '2026-09-05T12:00:00.000Z',
  }
  const operations = {
    async newCommandRef() {
      minted += 1
      if (minted === heldCommand) { entered.resolve(); return release.promise }
      return `hcmd_${String(minted).padStart(43, 'r')}`
    },
    async createHome(label, location, commandRef) {
      assert.ok(commandRef)
      createCalls.push(commandRef)
      let home = homes.get(commandRef)
      if (!home) {
        home = { homeRef: HOME, displayLabel: label, privateLocationLabel: location, relationshipLabel: 'claimed_unverified' }
        homes.set(commandRef, home)
      }
      return home
    },
    async getHomeRecord() { return profile },
    async updateHomeRecord(_homeRef, input) {
      recordWrites += 1
      profile = { ...profile, address: input.address, revision: profile.revision + 1 }
      return profile
    },
    async saveHomeProperty(homeRef, input) {
      saves.push(structuredClone({ homeRef, input }))
      return { version: 'home-property-snapshot.v1' as const, homeRef, address: input.address,
        facts: input.facts, lookup: null, reviewedAt: '2026-09-05T12:00:00.000Z' }
    },
  } satisfies Partial<HomesroloApi>
  // The memory-only preview supplies the full contract without asserting that
  // these five focused overrides implement every HomesroloApi method.
  const raw: HomesroloApi = Object.assign(new PreviewHomesroloApi(), operations)
  const api = sessionBoundApi(raw, fence, SESSION_A.principalRef, true)
  const property = { facts: { ...emptyPropertyFacts(), squareFeet: 1850, rooms: null }, receipt: null }
  const reviewed = reviewFirstHome('Synthetic home', { ...ADDRESS, line2: '' })
  assert.ok(reviewed.ok)
  const attempt = flow === 'first-home third command'
    ? firstHomeAttempt(reviewed.value, property)
    : initialPropertySnapshotAttempt(HOME, ADDRESS, property)
  return { fence, api, attempt, entered, release, propertyCommand, createCalls, homes, saves,
    heldCommand, minted: () => minted, recordWrites: () => recordWrites }
}

for (const flow of ['first-home third command', 'existing-home recovery command'] as const) {
  for (const transition of ['uncertain', 'A to B', 'A to B to A'] as const) {
    test(`${flow}: ${transition} while minting cannot dispatch a stale property save`, async () => {
      const state = harness(flow)
      const pending = state.attempt.run(state.api)
      const rejected = assert.rejects(pending, (error: unknown) => {
        if (flow === 'first-home third command') {
          assert.ok(error instanceof FirstHomePropertySaveFailed)
          assert.ok(error.cause instanceof SessionCheckRequired)
          assert.match(error.message, /home may already be created/)
          assert.match(error.message, /Leaving or reloading discards/)
        } else assert.ok(error instanceof SessionCheckRequired)
        return true
      })
      await state.entered.promise
      assert.equal(state.saves.length, 0)
      assert.equal(state.homes.size, flow === 'first-home third command' ? 1 : 0)
      assert.equal(state.recordWrites(), flow === 'first-home third command' ? 1 : 0)
      if (transition === 'uncertain') state.fence.invalidate()
      else {
        assert.equal(state.fence.confirm(state.fence.invalidate(), SESSION_B), true)
        if (transition === 'A to B to A') {
          assert.equal(state.fence.confirm(state.fence.invalidate(), SESSION_A), true)
        }
      }
      state.release.resolve(state.propertyCommand)
      await rejected
      assert.equal(state.saves.length, 0, 'blocking a response would be too late; the save must not dispatch')
      assert.equal(state.minted(), state.heldCommand)

      if (transition === 'uncertain') {
        assert.equal(state.fence.confirm(state.fence.invalidate(), SESSION_A), true)
        await Promise.resolve()
        assert.equal(state.saves.length, 0, 'verification alone must not replay a mutation')
        await state.attempt.run(state.api)
        assert.equal(state.saves.length, 1)
        assert.equal(state.saves[0]!.homeRef, HOME)
        assert.equal(state.saves[0]!.input.commandRef, state.propertyCommand)
        assert.deepEqual(state.saves[0]!.input.address, ADDRESS)
        assert.equal(state.saves[0]!.input.facts.squareFeet, 1850)
        assert.equal(state.saves[0]!.input.facts.rooms, null)
        assert.equal(state.minted(), state.heldCommand, 'explicit retry retains every previously minted ref')
        if (flow === 'first-home third command') {
          assert.equal(state.homes.size, 1)
          assert.equal(state.createCalls.length, 2)
          assert.equal(state.createCalls[0], state.createCalls[1], 'same create receipt, never a second home')
          assert.equal(state.recordWrites(), 1, 'the already-saved address is not rewritten')
        } else assert.equal(state.createCalls.length, 0, 'recovery only saves the missing snapshot')
        await state.attempt.run(state.api)
        assert.equal(state.saves.length, 1, 'a completed attempt cannot dispatch again')
      }
    })
  }
}
