import type {
  HomeRecordProfile,
  HomeSystemKind,
  HomeType,
  UpdateHomeRecordInput,
} from '../api/model.ts'
import { HOME_SYSTEM_KINDS } from '../api/home-record.ts'

export interface HomeSystemDraft {
  readonly present: 'yes' | 'no' | 'unknown'
  readonly year: string
  readonly approximate: boolean
}

export interface HomeDetailsDraft {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly regionCode: string
  readonly postalCode: string
  readonly homeType: HomeType
  readonly yearBuilt: string
  readonly yearBuiltApproximate: boolean
  readonly systems: Readonly<Record<HomeSystemKind, HomeSystemDraft>>
}

export function detailsDraft(profile: HomeRecordProfile): HomeDetailsDraft {
  return {
    line1: profile.address?.line1 ?? '',
    line2: profile.address?.line2 ?? '',
    city: profile.address?.city ?? '',
    regionCode: profile.address?.regionCode ?? '',
    postalCode: profile.address?.postalCode ?? '',
    homeType: profile.homeType,
    yearBuilt: profile.yearBuilt ? String(profile.yearBuilt.value) : '',
    yearBuiltApproximate: profile.yearBuilt?.precision === 'approximate',
    systems: Object.fromEntries(HOME_SYSTEM_KINDS.map(kind => {
      const saved = profile.systems.find(system => system.kind === kind)
      return [kind, {
        present: saved?.present ?? 'unknown',
        year: saved?.installedOrReplacedYear
          ? String(saved.installedOrReplacedYear.value)
          : '',
        approximate: saved?.installedOrReplacedYear?.precision === 'approximate',
      }]
    })) as Record<HomeSystemKind, HomeSystemDraft>,
  }
}

function validYear(value: string, currentYear: number): boolean {
  if (!value) return true
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= currentYear
}

export function homeDetailsUpdate(
  profile: HomeRecordProfile,
  draft: HomeDetailsDraft,
  commandRef: string,
  currentYear = new Date().getFullYear(),
): { readonly ok: true; readonly input: UpdateHomeRecordInput }
  | { readonly ok: false; readonly message: string } {
  const line1 = draft.line1.trim()
  const line2 = draft.line2.trim()
  const city = draft.city.trim()
  const regionCode = draft.regionCode.trim().toUpperCase()
  const postalCode = draft.postalCode.trim()
  if (!line1 || !city || !/^[A-Z]{2}$/.test(regionCode)
    || !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    return { ok: false, message: 'Add the street, city, two-letter state, and ZIP code.' }
  }
  if (!validYear(draft.yearBuilt, currentYear)
    || HOME_SYSTEM_KINDS.some(kind => !validYear(draft.systems[kind].year, currentYear))) {
    return { ok: false, message: `Use a year from 1800 through ${currentYear}, or leave it blank.` }
  }
  return {
    ok: true,
    input: {
      commandRef,
      expectedRevision: profile.revision,
      address: { line1, line2: line2 || null, city, regionCode, postalCode, countryCode: 'US' },
      homeType: draft.homeType,
      yearBuilt: draft.yearBuilt ? {
        value: Number(draft.yearBuilt),
        precision: draft.yearBuiltApproximate ? 'approximate' : 'exact',
      } : null,
      systems: HOME_SYSTEM_KINDS.map(kind => {
        const system = draft.systems[kind]
        return {
          kind,
          present: system.present,
          installedOrReplacedYear: system.present === 'yes' && system.year ? {
            value: Number(system.year),
            precision: system.approximate ? 'approximate' as const : 'exact' as const,
          } : null,
        }
      }),
    },
  }
}
