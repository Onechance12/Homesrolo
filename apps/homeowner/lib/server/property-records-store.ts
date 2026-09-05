import type { SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  homePropertySnapshotSchema,
  type HomePropertySnapshot,
  type PropertyAddress,
  type PropertyFacts,
  type PropertyLookup,
} from '../../../../src/homeowner/property-research.v1.ts'

export interface SavePropertySnapshotInput {
  readonly principalRef: string
  readonly homeRef: string
  readonly commandRef: string
  /** Server-calculated digest of the exact reviewed payload, not a browser assertion. */
  readonly commandDigest: string
  readonly address: PropertyAddress
  readonly facts: PropertyFacts
  /** Original server-verified lookup; homeowner corrections live only in facts. */
  readonly lookup: PropertyLookup | null
  readonly reviewedAt: string
}

export interface PropertyRecordsStore {
  consumeLookup(principalRef: string): Promise<boolean>
  read(principalRef: string, homeRef: string): Promise<HomePropertySnapshot | null>
  save(input: SavePropertySnapshotInput): Promise<HomePropertySnapshot>
}

const PRINCIPAL_REF = /^hprn_[A-Za-z0-9_-]{43}$/
const HOME_REF = /^hhom_[A-Za-z0-9_-]{43}$/
const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const COMMAND_DIGEST = /^[a-f0-9]{64}$/

function validIdentity(principalRef: string, homeRef?: string) {
  if (!PRINCIPAL_REF.test(principalRef) || (homeRef !== undefined && !HOME_REF.test(homeRef))) {
    throw new HomeownerApiError('invalid_request')
  }
}

function mappedStoreError(error: { readonly message: string }): never {
  if (/property_(?:command_conflict|snapshot_exists|address_mismatch)/.test(error.message)) {
    throw new HomeownerApiError('conflict')
  }
  if (/property_(?:not_authorized|home_not_found)/.test(error.message)) {
    throw new HomeownerApiError('not_found')
  }
  if (/property_invalid_/.test(error.message)) throw new HomeownerApiError('invalid_request')
  throw new HomeownerApiError('unavailable')
}

/**
 * A server-only persistence boundary. RPCs repeat fresh principal/membership
 * checks under database locks; possessing a home reference is never a grant.
 * Lookup consumption touches only shared counters, never a home or receipt.
 */
export class SupabasePropertyRecordsStore implements PropertyRecordsStore {
  readonly #client: Pick<SupabaseClient, 'rpc'>

  constructor(client: Pick<SupabaseClient, 'rpc'>) {
    this.#client = client
  }

  async consumeLookup(principalRef: string): Promise<boolean> {
    validIdentity(principalRef)
    const { data, error } = await this.#client.rpc('homesrolo_consume_property_lookup', {
      p_principal_ref: principalRef,
    })
    if (error) mappedStoreError(error)
    // Transport failures and malformed/null results never grant a paid lookup.
    if (typeof data !== 'boolean') throw new HomeownerApiError('unavailable')
    return data
  }

  async read(principalRef: string, homeRef: string): Promise<HomePropertySnapshot | null> {
    validIdentity(principalRef, homeRef)
    const { data, error } = await this.#client.rpc('homesrolo_read_property_snapshot', {
      p_principal_ref: principalRef,
      p_home_ref: homeRef,
    })
    if (error) mappedStoreError(error)
    if (data === null) return null
    const parsed = homePropertySnapshotSchema.safeParse(data)
    if (!parsed.success || parsed.data.homeRef !== homeRef) throw new HomeownerApiError('unavailable')
    return parsed.data
  }

  async save(input: SavePropertySnapshotInput): Promise<HomePropertySnapshot> {
    validIdentity(input.principalRef, input.homeRef)
    const reviewed = homePropertySnapshotSchema.safeParse({
      version: 'home-property-snapshot.v1',
      homeRef: input.homeRef,
      address: input.address,
      facts: input.facts,
      lookup: input.lookup,
      reviewedAt: input.reviewedAt,
    })
    if (!COMMAND_REF.test(input.commandRef) || !COMMAND_DIGEST.test(input.commandDigest)
      || !reviewed.success) throw new HomeownerApiError('invalid_request')
    const { data, error } = await this.#client.rpc('homesrolo_save_property_snapshot', {
      p_principal_ref: input.principalRef,
      p_home_ref: input.homeRef,
      p_command_ref: input.commandRef,
      p_command_digest: input.commandDigest,
      p_address: reviewed.data.address,
      p_facts: reviewed.data.facts,
      p_lookup: reviewed.data.lookup,
      p_reviewed_at: reviewed.data.reviewedAt,
    })
    if (error) mappedStoreError(error)
    const parsed = homePropertySnapshotSchema.safeParse(data)
    if (!parsed.success || parsed.data.homeRef !== input.homeRef) {
      throw new HomeownerApiError('unavailable')
    }
    return parsed.data
  }
}
