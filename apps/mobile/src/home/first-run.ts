import type { HomesroloApi } from '../api/contract.ts'
import type { HomeSummary, ProfessionalOrganization, ProfessionalTrade } from '../api/model.ts'
import { publicRoofingPrompt, type PublicRoofingIntent } from '../auth/entry-intent.ts'
import { PROFESSIONAL_TRADES, slugFor } from '../professional/presentation.ts'
import { createReviewedHome } from './create-home.ts'
import { reviewNewHomeAddress, type NewHomeAddressDraft, type ReviewedNewHomeAddress } from './onboarding.ts'

export type FirstRunWorkspace = 'home' | 'pro'
export type HomeIntent = 'attention' | 'plan' | 'care' | 'organize'
export type FirstRunStep = 'welcome' | 'reason' | 'home-details' | 'home-review' | 'home-ready'
  | 'pro-details' | 'pro-review' | 'pro-ready'

export const HOME_INTENTS = [
  { value: 'attention', icon: 'construct-outline', label: 'Something needs attention', detail: 'Make sense of a problem or repair.' },
  { value: 'plan', icon: 'color-wand-outline', label: 'I’m planning something', detail: 'Turn an idea into a clearer next step.' },
  { value: 'care', icon: 'leaf-outline', label: 'Keep up with my home', detail: 'Sort out maintenance and routine care.' },
  { value: 'organize', icon: 'file-tray-full-outline', label: 'Get things organized', detail: 'Keep useful history, files, and people together.' },
] as const

const ROLO_PROMPTS: Readonly<Record<HomeIntent, string>> = Object.freeze({
  attention: 'Something at my home needs attention. Help me figure out the safest next step.',
  plan: 'I am planning work at my home. Help me turn the idea into a clear plan.',
  care: 'Help me decide what routine care or maintenance should come first for this home.',
  organize: 'Help me start organizing the useful history and details for this home.',
})

export function initialHomeIntent(intent: PublicRoofingIntent | null): HomeIntent | null {
  return intent === null ? null : intent === 'replacement' ? 'plan' : 'attention'
}

/** Only a fixed, validated starter travels to Rolo. Rolo leaves it unsent for review. */
export function firstRunRoloPrompt(intent: HomeIntent, roofingIntent: PublicRoofingIntent | null): string {
  return roofingIntent && intent === initialHomeIntent(roofingIntent)
    ? publicRoofingPrompt(roofingIntent)
    : ROLO_PROMPTS[intent]
}

export function firstRunProgress(step: FirstRunStep, workspace: FirstRunWorkspace | null) {
  const steps: readonly FirstRunStep[] = workspace === 'pro'
    ? ['welcome', 'pro-details', 'pro-review', 'pro-ready']
    : ['welcome', 'reason', 'home-details', 'home-review', 'home-ready']
  return { current: Math.max(1, steps.indexOf(step) + 1), total: steps.length }
}

export function previousFirstRunStep(step: FirstRunStep): FirstRunStep | null {
  return ({
    welcome: null,
    reason: 'welcome',
    'home-details': 'reason',
    'home-review': 'home-details',
    'home-ready': null,
    'pro-details': 'welcome',
    'pro-review': 'pro-details',
    'pro-ready': null,
  } as const)[step]
}

export interface ReviewedFirstHome {
  readonly label: string
  readonly address: ReviewedNewHomeAddress
}

export interface ReviewedFirstCompany {
  readonly displayName: string
  readonly slug: string
  readonly trade: ProfessionalTrade
  readonly serviceArea: string
}

type Review<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

export function reviewFirstHome(label: string, address: NewHomeAddressDraft): Review<ReviewedFirstHome> {
  const cleanLabel = label.trim() || 'My home'
  if (cleanLabel.length > 80) return { ok: false, message: 'Keep your home name to 80 characters or fewer.' }
  const reviewed = reviewNewHomeAddress(address)
  if (!reviewed.ok) return reviewed
  return { ok: true, value: Object.freeze({ label: cleanLabel, address: reviewed.value }) }
}

export function reviewFirstCompany(
  name: string, trade: ProfessionalTrade, serviceArea: string,
): Review<ReviewedFirstCompany> {
  const displayName = name.trim()
  if (!displayName || displayName.length > 120) {
    return { ok: false, message: 'Add a company name between 1 and 120 characters.' }
  }
  const slug = slugFor(displayName)
  if (slug.length < 3) return { ok: false, message: 'Use a more complete company name.' }
  const area = serviceArea.trim()
  if (area.length < 2 || area.length > 80) {
    return { ok: false, message: 'Add a city, metro, or region between 2 and 80 characters.' }
  }
  if (!PROFESSIONAL_TRADES.some(([value]) => value === trade)) {
    return { ok: false, message: 'Choose the main service your company provides.' }
  }
  return { ok: true, value: Object.freeze({ displayName, slug, trade, serviceArea: area }) }
}

export interface FirstRunAttempt<T> {
  /** An attempt owns one reviewed payload and two command refs for its entire lifetime. */
  run(api: HomesroloApi): Promise<T>
}

export class FirstCompanyNameConflict extends Error {
  constructor() {
    super('That company page name is already in use. Add your city or another distinguishing word to the company name.')
  }
}

function firstRunAttempt<T>(save: (api: HomesroloApi, refs: readonly [string, string]) => Promise<T>): FirstRunAttempt<T> {
  let commandRefs: readonly [string, string] | null = null
  let pending: Promise<T> | null = null
  let completed: { readonly value: T } | null = null
  return {
    run(api) {
      if (completed) return Promise.resolve(completed.value)
      if (pending) return pending
      pending = (async () => {
        // No write begins unless both refs exist. Retries after a partial write
        // use the same refs and payload; concurrent taps share one promise.
        commandRefs ??= [await api.newCommandRef(), await api.newCommandRef()]
        const value = await save(api, commandRefs)
        completed = { value }
        return value
      })().finally(() => { pending = null })
      return pending
    },
  }
}

export function firstHomeAttempt(review: ReviewedFirstHome): FirstRunAttempt<HomeSummary> {
  // Copy the reviewed values so an input object can never alter a retry.
  const label = review.label
  const reviewedAddress = { ...review.address, address: { ...review.address.address } }
  return firstRunAttempt((api, [createCommandRef, recordCommandRef]) => createReviewedHome(api, {
    label, reviewedAddress, createCommandRef, recordCommandRef,
  }))
}

export function firstCompanyAttempt(review: ReviewedFirstCompany): FirstRunAttempt<ProfessionalOrganization> {
  const { displayName, slug, trade, serviceArea } = review
  return firstRunAttempt(async (api, [createCommandRef, profileCommandRef]) => {
    const created = await api.createProfessionalOrganization({ commandRef: createCommandRef, displayName, slug })
      .catch((error: unknown) => {
        // Only a confirmed conflict on the creation command permits editing
        // the name. An uncertain response or later profile failure keeps the
        // original attempt intact so a retry cannot create another company.
        if (error && typeof error === 'object' && 'status' in error && 'code' in error
          && error.status === 409 && error.code === 'conflict') throw new FirstCompanyNameConflict()
        throw error
      })
    return api.saveProfessionalProfile({
      commandRef: profileCommandRef,
      organizationRef: created.organization.organizationRef,
      expectedRevision: created.organization.revision,
      displayName,
      legalName: null,
      description: null,
      publicPhone: null,
      publicEmail: null,
      websiteUrl: null,
      logoUrl: null,
      trades: [trade],
      serviceAreas: [serviceArea],
      publicationState: 'draft',
    })
  })
}
