import type { ArtifactRecord, HomeCheckupPhoto, WorkRecord } from '../api/model.ts'
import { HOME_CHECKUP_AREA_LABEL } from './checkups.ts'
import { categoryLabel, kindLabel, statusLabel } from '../theme.ts'

export type HomeTimelineFilter = 'all' | 'work' | 'photos' | 'files'
export type HomeTimelineEntryKind = Exclude<HomeTimelineFilter, 'all'>

export type HomeTimelineDestination =
  | { readonly kind: 'work'; readonly projectRef: string }
  | { readonly kind: 'library' }
  | { readonly kind: 'home_watch' }

export interface HomeTimelineEntry {
  readonly id: string
  readonly kind: HomeTimelineEntryKind
  readonly date: string | null
  readonly title: string
  readonly eyebrow: string
  readonly detail: string
  readonly context: string
  readonly destination: HomeTimelineDestination
}

export interface HomeTimelineGroup {
  readonly label: string
  readonly entries: readonly HomeTimelineEntry[]
}

export interface HomeTimelinePage {
  readonly entries: readonly HomeTimelineEntry[]
  readonly groups: readonly HomeTimelineGroup[]
  readonly total: number
  readonly remaining: number
}

export type HomeTimelineCounts = Readonly<Record<HomeTimelineFilter, number>>

type SortableTimelineEntry = HomeTimelineEntry & {
  readonly tieDate: string
}

const KIND_ORDER: Readonly<Record<HomeTimelineEntryKind, number>> = {
  work: 0,
  photos: 1,
  files: 2,
}

function calendarDate(instant: string): string {
  return instant.slice(0, 10)
}

function compareEntries(left: SortableTimelineEntry, right: SortableTimelineEntry): number {
  if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date)
  if (left.date && !right.date) return -1
  if (!left.date && right.date) return 1
  if (left.tieDate !== right.tieDate) return right.tieDate.localeCompare(left.tieDate)
  if (left.kind !== right.kind) return KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
  const byTitle = left.title.localeCompare(right.title)
  return byTitle || left.id.localeCompare(right.id)
}

/** A read-only projection over the existing work, artifact, and Home Watch
 * records. It creates no copied timeline state. */
export function homeTimelineEntries(
  work: readonly WorkRecord[],
  artifacts: readonly ArtifactRecord[],
  checkups: readonly HomeCheckupPhoto[],
): readonly HomeTimelineEntry[] {
  const workNames = new Map(work.map(item => [item.projectRef, item.title]))
  const workEntries = work.filter(item => !item.archived).map<SortableTimelineEntry>(item => ({
    id: item.projectRef,
    kind: 'work',
    date: item.occurredOn,
    tieDate: item.updatedAt,
    title: item.title,
    eyebrow: categoryLabel[item.category],
    detail: statusLabel[item.status],
    context: item.professionalLabel || `${kindLabel[item.workKind]} record`,
    destination: { kind: 'work', projectRef: item.projectRef },
  }))
  const artifactEntries = artifacts.map<SortableTimelineEntry>(artifact => {
    const isPhoto = artifact.kind === 'photo'
    const linkedWork = artifact.projectRef ? workNames.get(artifact.projectRef) : null
    return {
      id: artifact.artifactRef,
      kind: isPhoto ? 'photos' : 'files',
      date: calendarDate(artifact.createdAt),
      tieDate: artifact.createdAt,
      title: artifact.displayName,
      eyebrow: isPhoto ? 'Photo' : artifact.kind === 'warranty' ? 'Warranty' : 'Document',
      detail: 'Added to this home',
      context: linkedWork ? `Filed with ${linkedWork}` : 'Home library',
      destination: artifact.projectRef
        ? { kind: 'work', projectRef: artifact.projectRef }
        : { kind: 'library' },
    }
  })
  const checkupEntries = checkups.map<SortableTimelineEntry>(photo => ({
    id: photo.photoRef,
    kind: 'photos',
    date: photo.observedOn,
    tieDate: photo.createdAt,
    title: photo.viewLabel,
    eyebrow: `${HOME_CHECKUP_AREA_LABEL[photo.area]} photo`,
    detail: 'Saved in Home Watch',
    context: photo.caption || 'Repeatable private home view',
    destination: { kind: 'home_watch' },
  }))

  return [...workEntries, ...artifactEntries, ...checkupEntries]
    .sort(compareEntries)
    .map(({ tieDate: _tieDate, ...entry }) => entry)
}

export function homeTimelineCounts(entries: readonly HomeTimelineEntry[]): HomeTimelineCounts {
  const work = entries.filter(entry => entry.kind === 'work').length
  const photos = entries.filter(entry => entry.kind === 'photos').length
  const files = entries.filter(entry => entry.kind === 'files').length
  return { all: entries.length, work, photos, files }
}

export function homeTimelinePage(
  entries: readonly HomeTimelineEntry[],
  filter: HomeTimelineFilter,
  limit: number,
): HomeTimelinePage {
  const matching = filter === 'all' ? entries : entries.filter(entry => entry.kind === filter)
  const boundedLimit = Math.max(0, Math.trunc(limit))
  const visible = matching.slice(0, boundedLimit)
  const groups = new Map<string, HomeTimelineEntry[]>()
  for (const entry of visible) {
    const label = entry.date ? entry.date.slice(0, 4) : 'Date not recorded'
    groups.set(label, [...(groups.get(label) ?? []), entry])
  }
  return {
    entries: visible,
    groups: [...groups.entries()].map(([label, groupedEntries]) => ({
      label,
      entries: groupedEntries,
    })),
    total: matching.length,
    remaining: Math.max(0, matching.length - visible.length),
  }
}
