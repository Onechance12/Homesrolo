import type { HomesroloApi } from '../api/contract.ts'
import type { HomeSummary } from '../api/model.ts'
import {
  sameHomeRecordAddress,
  type ReviewedNewHomeAddress,
} from './onboarding.ts'

export interface CreateReviewedHomeInput {
  readonly label: string
  readonly reviewedAddress: ReviewedNewHomeAddress
  readonly createCommandRef: string
  readonly recordCommandRef: string
}

/**
 * Create a home and attach its structured address through the same revisioned
 * record contract used everywhere else. Keeping this transaction here prevents
 * first-run onboarding and the later "add home" flow from drifting apart.
 */
export async function createReviewedHome(
  api: HomesroloApi,
  input: CreateReviewedHomeInput,
): Promise<HomeSummary> {
  const displayLabel = input.label.trim() || 'My home'
  const home = await api.createHome(
    displayLabel,
    input.reviewedAddress.privateLocationLabel,
    input.createCommandRef,
  )
  const profile = await api.getHomeRecord(home.homeRef)
  if (!sameHomeRecordAddress(profile.address, input.reviewedAddress.address)) {
    await api.updateHomeRecord(home.homeRef, {
      commandRef: input.recordCommandRef,
      expectedRevision: profile.revision,
      address: input.reviewedAddress.address,
      homeType: profile.homeType,
      yearBuilt: profile.yearBuilt,
      systems: profile.systems,
    })
  }
  return home
}
