import type { ArtifactRecord, HomeCheckupPhoto, WorkRecord } from '../api/model.ts'
import { HOME_CHECKUP_AREA_LABEL } from './checkups.ts'

export type HomeLibraryFilter = 'all' | 'photos' | 'documents' | 'warranties' | 'unfiled'
export type HomeLibrarySource = 'all' | 'uploads' | 'home_watch'
export type HomeLibrarySort = 'newest' | 'oldest' | 'name'
export type HomeLibraryEntry = {
  readonly id: string
  readonly source: 'uploads'
  readonly kind: ArtifactRecord['kind']
  readonly title: string
  readonly date: string
  readonly projectRef: string | null
  readonly projectLabel: string
  readonly searchText: string
  readonly artifact: ArtifactRecord
} | {
  readonly id: string
  readonly source: 'home_watch'
  readonly kind: 'photo'
  readonly title: string
  readonly date: string
  readonly projectRef: null
  readonly projectLabel: 'Whole home'
  readonly searchText: string
  readonly checkup: HomeCheckupPhoto
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

export function homeLibraryEntries(
  artifacts: readonly ArtifactRecord[],
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
      date: artifact.createdAt,
      projectRef: artifact.projectRef,
      projectLabel,
      searchText: `${artifact.displayName} ${artifact.kind} ${artifact.createdAt} ${projectLabel}`,
      artifact,
    }
  })
  const watched = checkups.map<HomeLibraryEntry>(checkup => ({
    id: checkup.photoRef,
    source: 'home_watch',
    kind: 'photo',
    title: checkup.viewLabel,
    date: checkup.observedOn,
    projectRef: null,
    projectLabel: 'Whole home',
    searchText: `${checkup.viewLabel} ${HOME_CHECKUP_AREA_LABEL[checkup.area]} ${checkup.caption} ${checkup.observedOn} Home Watch checkup`,
    checkup,
  }))
  return [...uploads, ...watched]
}

export function visibleHomeLibraryEntries(
  entries: readonly HomeLibraryEntry[],
  query: string,
  filter: HomeLibraryFilter,
  source: HomeLibrarySource,
  project: string,
  sort: HomeLibrarySort,
): readonly HomeLibraryEntry[] {
  const needle = query.trim().toLocaleLowerCase('en-US')
  return [...entries].filter(item => {
    if (source !== 'all' && item.source !== source) return false
    if (filter === 'photos' && item.kind !== 'photo') return false
    if (filter === 'documents' && item.kind !== 'document') return false
    if (filter === 'warranties' && item.kind !== 'warranty') return false
    if (filter === 'unfiled' && item.projectRef !== null) return false
    if (filter === 'unfiled' && item.projectRef !== null) return false
    if (project === 'unfiled' && item.projectRef !== null) return false
    if (project !== 'all' && project !== 'unfiled' && item.projectRef !== project) return false
    return !needle || item.searchText.toLocaleLowerCase('en-US').includes(needle)
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
  const needle = query.trim().toLocaleLowerCase('en-US')
  return [...artifacts].filter(item => {
    if (filter === 'photos' && item.kind !== 'photo') return false
    if (filter === 'documents' && item.kind !== 'document') return false
    if (filter === 'warranties' && item.kind !== 'warranty') return false
    if (!needle) return true
    const projectName = item.projectRef ? projectNames.get(item.projectRef) ?? '' : 'whole home'
    return `${item.displayName} ${item.kind} ${projectName}`
      .toLocaleLowerCase('en-US').includes(needle)
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)
    || left.displayName.localeCompare(right.displayName))
}
