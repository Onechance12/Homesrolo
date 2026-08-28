import type { HomeCheckupArea, HomeCheckupPhoto } from '../api/model.ts'
import { HOME_CHECKUP_AREAS } from '../api/home-checkup.ts'

export const HOME_CHECKUP_AREA_LABEL: Readonly<Record<HomeCheckupArea, string>> = Object.freeze({
  front_exterior: 'Front exterior', rear_exterior: 'Rear exterior', roofline: 'Roofline',
  attic: 'Attic', ceilings: 'Ceilings', hvac: 'HVAC', water_heater: 'Water heater',
  foundation: 'Foundation', gutters: 'Gutters', siding: 'Siding',
  windows_doors: 'Windows & doors', drainage: 'Drainage', other: 'Other',
})

export interface HomeCheckupGroup {
  readonly key: string
  readonly area: HomeCheckupArea
  readonly areaLabel: string
  readonly viewLabel: string
  readonly photos: readonly HomeCheckupPhoto[]
}

export function normalizeHomeCheckupViewLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function validHomeCheckupDate(value: string, today = localCalendarDate()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function groupedHomeCheckups(photos: readonly HomeCheckupPhoto[]): readonly HomeCheckupGroup[] {
  const order = new Map(HOME_CHECKUP_AREAS.map((area, index) => [area, index]))
  const groups = new Map<string, {
    key: string
    area: HomeCheckupArea
    areaLabel: string
    viewLabel: string
    photos: HomeCheckupPhoto[]
  }>()
  for (const photo of photos) {
    const displayLabel = normalizeHomeCheckupViewLabel(photo.viewLabel)
    const key = `${photo.area}\u0000${displayLabel.toLocaleLowerCase('en-US')}`
    const group = groups.get(key) ?? {
      key,
      area: photo.area,
      areaLabel: HOME_CHECKUP_AREA_LABEL[photo.area],
      viewLabel: displayLabel,
      photos: [],
    }
    group.photos.push(photo)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    photos: [...group.photos].sort((left, right) => (
      right.observedOn.localeCompare(left.observedOn) || right.createdAt.localeCompare(left.createdAt)
    )),
  })).sort((left, right) => (order.get(left.area) ?? 99) - (order.get(right.area) ?? 99)
    || left.viewLabel.localeCompare(right.viewLabel))
}

export function localCalendarDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
