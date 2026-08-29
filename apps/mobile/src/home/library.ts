import type { ArtifactRecord, HomeCheckupPhoto, ResolvedArtifactRecord, WorkRecord } from '../api/model.ts'
import { HOME_CHECKUP_AREA_LABEL } from './checkups.ts'

export type HomeLibraryFilter = 'all' | 'photos' | 'documents' | 'warranties' | 'unfiled'
export type HomeLibrarySource = 'all' | 'uploads' | 'home_watch'
export type HomeLibrarySort = 'newest' | 'oldest' | 'name'
export type HomeLibraryEntry = {
  readonly id: string
  readonly source: 'uploads'
  readonly kind: ResolvedArtifactRecord['kind']
  readonly title: string
  readonly date: string
  readonly dateSource: 'observed' | 'saved'
  readonly projectRef: string | null
  readonly projectLabel: string
  readonly searchText: string
  readonly artifact: ResolvedArtifactRecord
} | {
  readonly id: string
  readonly source: 'home_watch'
  readonly kind: 'photo'
  readonly title: string
  readonly date: string
  readonly dateSource: 'observed'
  readonly projectRef: null
  readonly projectLabel: 'Whole home'
  readonly searchText: string
  readonly checkup: HomeCheckupPhoto
}

export interface HomePhotoAlbum {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly projectRef: string | null
  readonly items: readonly HomeLibraryEntry[]
  readonly first: HomeLibraryEntry
  readonly latest: HomeLibraryEntry
}

export interface HomeLibraryPage<T> {
  readonly items: readonly T[]
  readonly remaining: number
}

export function homeLibraryPage<T>(items: readonly T[], limit: number): HomeLibraryPage<T> {
  const boundedLimit = Math.max(0, Math.trunc(limit))
  return {
    items: items.slice(0, boundedLimit),
    remaining: Math.max(0, items.length - boundedLimit),
  }
}

/** Keeps long-lived homes from turning every project chooser into a giant strip. */
export function matchingWorkChoices(
  work: readonly WorkRecord[],
  query: string,
  selectedProjectRef: string | null,
  limit = 8,
): readonly WorkRecord[] {
  const needles = searchTokens(query)
  const matches = work.filter(item => {
    const haystack = `${item.title} ${item.category} ${item.status}`.toLocaleLowerCase('en-US')
    return needles.every(needle => haystack.includes(needle))
  })
  const boundedLimit = Math.max(1, Math.trunc(limit))
  const selected = selectedProjectRef
    ? work.find(item => item.projectRef === selectedProjectRef)
    : undefined
  const choices = selected
    ? [selected, ...matches.filter(item => item.projectRef !== selected.projectRef)]
    : matches
  return choices.filter((item, index, items) => (
    items.findIndex(candidate => candidate.projectRef === item.projectRef) === index
  )).slice(0, boundedLimit)
}

export function homeLibraryEntries(
  artifacts: readonly ResolvedArtifactRecord[],
  checkups: readonly HomeCheckupPhoto[],
  work: readonly WorkRecord[],
): readonly HomeLibraryEntry[] {
  const projectNames = new Map(work.map(item => [item.projectRef, item.title]))
  const uploads = artifacts.map<HomeLibraryEntry>(artifact => {
    const projectLabel = artifact.projectRef
      ? projectNames.get(artifact.projectRef) ?? 'Saved work'
      : 'Whole home'
    return {
      id: artifact.artifactRef,
      source: 'uploads',
      kind: artifact.kind,
      title: artifact.displayName,
      date: artifact.observedOn ?? artifact.createdAt,
      dateSource: artifact.observedOn ? 'observed' : 'saved',
      projectRef: artifact.projectRef,
      projectLabel,
      searchText: [
        artifact.displayName,
        artifact.kind,
        artifact.createdAt,
        artifact.observedOn ?? '',
        artifact.phase ?? '',
        artifact.areaLabel ?? '',
        artifact.geoPin ? 'location pinned geo pin' : '',
        projectLabel,
      ].join(' '),
      artifact,
    }
  })
  const watched = checkups.map<HomeLibraryEntry>(checkup => ({
    id: checkup.photoRef,
    source: 'home_watch',
    kind: 'photo',
    title: checkup.viewLabel,
    date: checkup.observedOn,
    dateSource: 'observed',
    projectRef: null,
    projectLabel: 'Whole home',
    searchText: `${checkup.viewLabel} ${HOME_CHECKUP_AREA_LABEL[checkup.area]} ${checkup.caption} ${checkup.observedOn} Home Watch checkup`,
    checkup,
  }))
  return [...uploads, ...watched]
}

/**
 * Turns an unbounded stream of private photos into useful homeowner albums.
 * Project photos stay with their existing Work record, Home Watch views stay
 * comparable by repeatable view, and unfiled uploads remain easy to find.
 */
export function homePhotoAlbums(
  entries: readonly HomeLibraryEntry[],
  sort: HomeLibrarySort = 'newest',
): readonly HomePhotoAlbum[] {
  const groups = new Map<string, {
    title: string
    detail: string
    projectRef: string | null
    items: HomeLibraryEntry[]
  }>()

  for (const entry of entries) {
    if (entry.kind !== 'photo') continue
    const identity = photoAlbumIdentity(entry)
    const existing = groups.get(identity.id)
    if (existing) {
      existing.items.push(entry)
      continue
    }
    groups.set(identity.id, {
      title: identity.title,
      detail: identity.detail,
      projectRef: identity.projectRef,
      items: [entry],
    })
  }

  return [...groups.entries()].map(([id, group]) => {
    const chronological = [...group.items].sort((left, right) => (
      left.date.localeCompare(right.date) || left.title.localeCompare(right.title)
    ))
    const items = sort === 'name'
      ? [...group.items].sort((left, right) => left.title.localeCompare(right.title))
      : sort === 'oldest'
        ? chronological
        : [...chronological].reverse()
    return {
      id,
      title: group.title,
      detail: group.detail,
      projectRef: group.projectRef,
      items,
      first: chronological[0]!,
      latest: chronological[chronological.length - 1]!,
    }
  }).sort((left, right) => (
    sort === 'name'
      ? left.title.localeCompare(right.title)
      : sort === 'oldest'
        ? left.first.date.localeCompare(right.first.date) || left.title.localeCompare(right.title)
        : right.latest.date.localeCompare(left.latest.date) || left.title.localeCompare(right.title)
  ))
}

function photoAlbumIdentity(entry: HomeLibraryEntry): {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly projectRef: string | null
} {
  if (entry.source === 'home_watch') {
    const normalizedView = entry.checkup.viewLabel.trim().toLocaleLowerCase('en-US')
    return {
      id: `home-watch:${entry.checkup.area}:${normalizedView}`,
      title: entry.checkup.viewLabel,
      detail: `Home Watch · ${HOME_CHECKUP_AREA_LABEL[entry.checkup.area]}`,
      projectRef: null,
    }
  }
  if (entry.projectRef) {
    return {
      id: `work:${entry.projectRef}`,
      title: entry.projectLabel,
      detail: 'Work photos',
      projectRef: entry.projectRef,
    }
  }
  const areaLabel = entry.artifact.areaLabel?.trim()
  if (areaLabel) {
    return {
      id: `whole-home-area:${areaLabel.toLocaleLowerCase('en-US')}`,
      title: areaLabel,
      detail: 'Whole-home photos',
      projectRef: null,
    }
  }
  return {
    id: 'whole-home-unfiled',
    title: 'Unfiled photos',
    detail: 'Add an area or file these with work when you are ready',
    projectRef: null,
  }
}

export function visibleHomeLibraryEntries(
  entries: readonly HomeLibraryEntry[],
  query: string,
  filter: HomeLibraryFilter,
  source: HomeLibrarySource,
  project: string,
  sort: HomeLibrarySort,
): readonly HomeLibraryEntry[] {
  const needles = searchTokens(query)
  return [...entries].filter(item => {
    if (source !== 'all' && item.source !== source) return false
    if (filter === 'photos' && item.kind !== 'photo') return false
    if (filter === 'documents' && item.kind !== 'document') return false
    if (filter === 'warranties' && item.kind !== 'warranty') return false
    if (filter === 'unfiled' && item.projectRef !== null) return false
    if (project === 'unfiled' && item.projectRef !== null) return false
    if (project !== 'all' && project !== 'unfiled' && item.projectRef !== project) return false
    return needles.length === 0 || needles.every(needle => (
      item.searchText.toLocaleLowerCase('en-US').includes(needle)
    ))
  }).sort((left, right) => {
    if (sort === 'name') return left.title.localeCompare(right.title)
    return sort === 'oldest'
      ? left.date.localeCompare(right.date)
      : right.date.localeCompare(left.date)
  })
}

export function visibleHomeArtifacts(
  artifacts: readonly ArtifactRecord[],
  work: readonly WorkRecord[],
  query: string,
  filter: HomeLibraryFilter,
): readonly ArtifactRecord[] {
  const projectNames = new Map(work.map(item => [item.projectRef, item.title]))
  const needles = searchTokens(query)
  return [...artifacts].filter(item => {
    if (filter === 'photos' && item.kind !== 'photo') return false
    if (filter === 'documents' && item.kind !== 'document') return false
    if (filter === 'warranties' && item.kind !== 'warranty') return false
    if (needles.length === 0) return true
    const projectName = item.projectRef ? projectNames.get(item.projectRef) ?? '' : 'whole home'
    const haystack = `${item.displayName} ${item.kind} ${projectName} ${item.observedOn ?? ''} ${item.phase ?? ''} ${item.areaLabel ?? ''}`
      .toLocaleLowerCase('en-US')
    return needles.every(needle => haystack.includes(needle))
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)
    || left.displayName.localeCompare(right.displayName))
}

function searchTokens(value: string): readonly string[] {
  return value.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean).slice(0, 12)
}
