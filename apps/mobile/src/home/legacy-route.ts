import { normalizedProfessionalSlug } from '../api/professional.ts'
import { isHomeRef, isProjectRef } from '../api/protocol.ts'
import { PROFESSIONAL_TRADES } from '../professional/presentation.ts'
import type { WorkCategory } from '../api/model.ts'

export function oneRouteParam(value: string | readonly string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
}

export function legacyHomeRef(value: string | readonly string[] | undefined): string | null {
  const candidate = oneRouteParam(value)
  return candidate && isHomeRef(candidate) ? candidate : null
}

export function legacyProjectRef(value: string | readonly string[] | undefined): string | null {
  const candidate = oneRouteParam(value)
  return candidate && isProjectRef(candidate) ? candidate : null
}

export function legacyProfessionalSlug(value: string | readonly string[] | undefined): string | null {
  const candidate = oneRouteParam(value)
  return candidate ? normalizedProfessionalSlug(candidate) : null
}

export function legacyProfessionalTrade(value: string | readonly string[] | undefined): WorkCategory | null {
  const candidate = oneRouteParam(value)
  return PROFESSIONAL_TRADES.some(([trade]) => trade === candidate)
    ? candidate as WorkCategory
    : null
}
