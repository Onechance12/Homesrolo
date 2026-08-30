import type {
  ArtifactPhotoPhase,
  HomeCheckupArea,
  HouseholdMember,
  WorkCategory,
  WorkKind,
  WorkRecord,
  WorkStatus,
} from '../api/model.ts'
import { isArtifactRef, isHomeRef, isPhotoRef, isProjectRef } from '../api/protocol.ts'
import { categoryLabel, kindLabel, statusLabel } from '../theme.ts'
import { HOME_CHECKUP_AREA_LABEL } from './checkups.ts'
import type { HomeLibraryEntry, HomePhotoAlbum } from './library.ts'

export const HOMESROLO_CARD_SCHEMA_VERSION = 1 as const
export const HOMESROLO_CARD_REF_NAMESPACE = 'homesrolo.card.v1' as const

export type HomesroloCardKind =
  | 'work'
  | 'photo'
  | 'document'
  | 'warranty'
  | 'home_watch_photo'
  | 'photo_album'
  | 'navigation'

export type HomesroloCardGroup = 'work' | 'home' | 'people' | 'saved'
export type HomesroloCardRef = `${typeof HOMESROLO_CARD_REF_NAMESPACE}:${HomesroloCardKind}:${string}`
export type HomesroloWorkSection = 'overview' | 'plan' | 'files' | 'bids' | 'updates'
export type HomesroloLibraryDestinationFilter = 'all' | 'photos' | 'documents' | 'warranties'

/** App-owned destinations only. A card can never carry a model-authored URL. */
export type HomesroloCardDestination =
  | {
      readonly kind: 'work'
      readonly homeRef: string
      readonly projectRef: string
      readonly section: HomesroloWorkSection
    }
  | {
      readonly kind: 'library'
      readonly homeRef: string
      readonly filter: HomesroloLibraryDestinationFilter
      readonly projectRef: string | null
    }
  | {
      readonly kind: 'home_watch'
      readonly homeRef: string
    }
  | {
      readonly kind: 'home_details' | 'timeline' | 'people'
      readonly homeRef: string
    }
  | {
      readonly kind: 'work_index'
      readonly homeRef: string
      readonly filter: 'all' | 'open' | 'household' | 'assigned_to_me' | 'care' | 'completed'
    }

/** Exact user actions remain separate from the card's broader navigation context. */
export type HomesroloCardAction =
  | {
      readonly kind: 'navigate'
      readonly label: string
      readonly destination: HomesroloCardDestination
    }
  | {
      readonly kind: 'preview_artifact'
      readonly label: string
      readonly homeRef: string
      readonly artifactRef: string
    }
  | {
      readonly kind: 'open_artifact'
      readonly label: string
      readonly homeRef: string
      readonly artifactRef: string
    }
  | {
      readonly kind: 'preview_home_watch_photo'
      readonly label: string
      readonly homeRef: string
      readonly photoRef: string
    }

/** Provenance identifies the source record without upgrading its verification status. */
export type HomesroloCardProvenance =
  | {
      readonly kind: 'record'
      readonly source: 'work' | 'artifact_upload' | 'home_watch'
      readonly sourceRef: string
    }
  | {
      readonly kind: 'derived'
      readonly source: 'photo_album' | 'navigation'
      readonly sourceCardRefs: readonly HomesroloCardRef[]
    }

export interface HomesroloWorkCardData {
  readonly projectRef: string
  readonly workKind: WorkKind
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn: string | null
  readonly assignedMembershipRef: string | null
  readonly dueOn: string | null
  readonly professionalLabel: string | null
  readonly archived: boolean
}

export interface HomesroloPhotoCardData {
  readonly artifactRef: string
  readonly date: string
  readonly dateSource: 'observed' | 'saved'
  readonly phase: ArtifactPhotoPhase | null
  readonly areaLabel: string | null
  readonly geoPinned: boolean
  readonly projectLabel: string
}

export interface HomesroloFileCardData {
  readonly artifactRef: string
  readonly date: string
  readonly dateSource: 'observed' | 'saved'
  readonly byteLength: number
  readonly projectLabel: string
}

export interface HomesroloHomeWatchPhotoCardData {
  readonly photoRef: string
  readonly date: string
  readonly area: HomeCheckupArea
  readonly caption: string
  readonly width: number
  readonly height: number
}

export interface HomesroloPhotoAlbumCardData {
  readonly albumId: string
  readonly count: number
  readonly firstCardRef: HomesroloCardRef
  readonly latestCardRef: HomesroloCardRef
  readonly itemCardRefs: readonly HomesroloCardRef[]
}

export type HomesroloNavigationCardRole =
  | 'home_details'
  | 'home_watch'
  | 'timeline'
  | 'people'
  | 'library'
  | 'work'

export interface HomesroloNavigationCardData {
  readonly role: HomesroloNavigationCardRole
  readonly count: number | null
}

export interface HomesroloNavigationCardInput {
  readonly homeRef: string
  readonly role: HomesroloNavigationCardRole
  readonly eyebrow: string
  readonly title: string
  readonly summary: string
  readonly meta?: readonly string[]
  readonly count?: number | null
  /** Optional exact cards whose totals or summaries support this aggregate card. */
  readonly sourceCardRefs?: readonly HomesroloCardRef[]
}

export interface HomesroloCardEnvelope<Kind extends HomesroloCardKind, Data> {
  readonly schemaVersion: typeof HOMESROLO_CARD_SCHEMA_VERSION
  readonly cardRef: HomesroloCardRef
  readonly kind: Kind
  readonly group: HomesroloCardGroup
  readonly homeRef: string
  readonly projectRef: string | null
  readonly eyebrow: string
  readonly title: string
  readonly summary: string
  readonly meta: readonly string[]
  /** Precomputed from trusted record text for deterministic, UI-independent filtering. */
  readonly searchText: string
  /** A record-order key, not a claim that the work happened on this date. */
  readonly sortKey: string
  readonly destination: HomesroloCardDestination
  readonly actions: readonly [HomesroloCardAction, ...HomesroloCardAction[]]
  readonly provenance: HomesroloCardProvenance
  readonly data: Data
}

export type HomesroloWorkCard = HomesroloCardEnvelope<'work', HomesroloWorkCardData>
export type HomesroloPhotoCard = HomesroloCardEnvelope<'photo', HomesroloPhotoCardData>
export type HomesroloDocumentCard = HomesroloCardEnvelope<'document', HomesroloFileCardData>
export type HomesroloWarrantyCard = HomesroloCardEnvelope<'warranty', HomesroloFileCardData>
export type HomesroloHomeWatchPhotoCard = HomesroloCardEnvelope<'home_watch_photo', HomesroloHomeWatchPhotoCardData>
export type HomesroloPhotoAlbumCard = HomesroloCardEnvelope<'photo_album', HomesroloPhotoAlbumCardData>
export type HomesroloNavigationCard = HomesroloCardEnvelope<'navigation', HomesroloNavigationCardData>

export type HomesroloCard =
  | HomesroloWorkCard
  | HomesroloPhotoCard
  | HomesroloDocumentCard
  | HomesroloWarrantyCard
  | HomesroloHomeWatchPhotoCard
  | HomesroloPhotoAlbumCard
  | HomesroloNavigationCard

export type HomesroloDeckGroupFilter = 'all' | HomesroloCardGroup
export type HomesroloDeckProjectFilter = 'all' | 'unfiled' | string
export type HomesroloDeckSort = 'newest' | 'oldest' | 'title'

export interface HomesroloDeckQuery {
  readonly text?: string
  readonly group?: HomesroloDeckGroupFilter
  readonly kinds?: readonly HomesroloCardKind[]
  readonly project?: HomesroloDeckProjectFilter
  readonly sort?: HomesroloDeckSort
}

export interface HomesroloDeckPage {
  readonly cards: readonly HomesroloCard[]
  readonly total: number
  readonly remaining: number
}

const CARD_KINDS = new Set<HomesroloCardKind>([
  'work', 'photo', 'document', 'warranty', 'home_watch_photo', 'photo_album', 'navigation',
])
const CARD_GROUPS = new Set<HomesroloCardGroup>(['work', 'home', 'people', 'saved'])
const WORK_SECTIONS = new Set<HomesroloWorkSection>(['overview', 'plan', 'files', 'bids', 'updates'])
const LIBRARY_FILTERS = new Set<HomesroloLibraryDestinationFilter>(['all', 'photos', 'documents', 'warranties'])
const WORK_KINDS = new Set<WorkKind>(['project', 'issue', 'repair', 'service', 'incident', 'task'])
const WORK_CATEGORIES = new Set<WorkCategory>([
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
])
const WORK_STATUSES = new Set<WorkStatus>(['planned', 'in_progress', 'completed', 'cancelled'])
const PHOTO_PHASES = new Set<ArtifactPhotoPhase>(['before', 'during', 'after', 'reference'])
const HOME_CHECKUP_AREAS = new Set<HomeCheckupArea>([
  'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings', 'hvac',
  'water_heater', 'foundation', 'gutters', 'siding', 'windows_doors', 'drainage', 'other',
])
const NAVIGATION_ROLES = new Set<HomesroloNavigationCardRole>([
  'home_details', 'home_watch', 'timeline', 'people', 'library', 'work',
])
const NAVIGATION_ORDER: Readonly<Record<HomesroloNavigationCardRole, number>> = {
  home_details: 60,
  home_watch: 50,
  timeline: 40,
  people: 30,
  library: 20,
  work: 10,
}
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export function homesroloCardRef(
  kind: HomesroloCardKind,
  sourceIdentity: string,
): HomesroloCardRef {
  if (!CARD_KINDS.has(kind) || !validIdentity(sourceIdentity)) {
    throw new Error('invalid_homesrolo_card_identity')
  }
  return `${HOMESROLO_CARD_REF_NAMESPACE}:${kind}:${encodeURIComponent(sourceIdentity)}`
}

export function isHomesroloCardRef(value: unknown): value is HomesroloCardRef {
  if (typeof value !== 'string' || value.length > 1_024) return false
  const prefix = `${HOMESROLO_CARD_REF_NAMESPACE}:`
  if (!value.startsWith(prefix)) return false
  const rest = value.slice(prefix.length)
  const separator = rest.indexOf(':')
  if (separator < 1) return false
  const kind = rest.slice(0, separator) as HomesroloCardKind
  const encoded = rest.slice(separator + 1)
  if (!CARD_KINDS.has(kind) || !encoded) return false
  try {
    const decoded = decodeURIComponent(encoded)
    return validIdentity(decoded) && encodeURIComponent(decoded) === encoded
  } catch {
    return false
  }
}

export function workRecordCard(
  work: WorkRecord,
  householdMembers: readonly HouseholdMember[] = [],
): HomesroloWorkCard {
  assertHomeRef(work.homeRef)
  assertProjectRef(work.projectRef)
  const destination: HomesroloCardDestination = {
    kind: 'work', homeRef: work.homeRef, projectRef: work.projectRef, section: 'overview',
  }
  const meta = compactText([
    work.assignedMembershipRef
      ? `Assigned to ${householdMemberLabel(work.homeRef, work.assignedMembershipRef, householdMembers)}`
      : work.workKind === 'task' ? 'Unassigned' : null,
    work.dueOn ? `Due ${cardDateLabel(work.dueOn)}` : null,
    statusLabel[work.status],
    work.occurredOn ? cardDateLabel(work.occurredOn) : null,
    work.professionalLabel,
  ])
  return {
    schemaVersion: HOMESROLO_CARD_SCHEMA_VERSION,
    cardRef: homesroloCardRef('work', work.projectRef),
    kind: 'work',
    group: 'work',
    homeRef: work.homeRef,
    projectRef: work.projectRef,
    eyebrow: `${categoryLabel[work.category]} · ${kindLabel[work.workKind]}`,
    title: usefulText(work.title, 'Untitled work'),
    summary: usefulText(work.summary, `${kindLabel[work.workKind]} saved to this home.`),
    meta,
    searchText: searchText([
      work.title, work.summary, work.professionalLabel, work.workKind, kindLabel[work.workKind],
      work.category, categoryLabel[work.category], work.status, statusLabel[work.status], work.occurredOn,
      work.assignedMembershipRef, work.dueOn,
      work.assignedMembershipRef
        ? householdMemberLabel(work.homeRef, work.assignedMembershipRef, householdMembers)
        : null,
    ]),
    sortKey: work.updatedAt,
    destination,
    actions: [{ kind: 'navigate', label: 'Open work', destination }],
    provenance: { kind: 'record', source: 'work', sourceRef: work.projectRef },
    data: {
      projectRef: work.projectRef,
      workKind: work.workKind,
      category: work.category,
      status: work.status,
      occurredOn: work.occurredOn,
      assignedMembershipRef: work.assignedMembershipRef,
      dueOn: work.dueOn,
      professionalLabel: work.professionalLabel,
      archived: work.archived,
    },
  }
}

/** The default deck excludes archived work while preserving the single-record projector. */
export function workRecordCards(
  work: readonly WorkRecord[],
  householdMembers: readonly HouseholdMember[] = [],
): readonly HomesroloWorkCard[] {
  return work.filter(item => !item.archived).map(item => workRecordCard(item, householdMembers))
}

function householdMemberLabel(
  homeRef: string,
  membershipRef: string,
  members: readonly HouseholdMember[],
): string {
  const member = members.find(item => item.homeRef === homeRef
    && item.membershipRef === membershipRef && item.state === 'active')
  return member?.isCurrentPrincipal ? 'you' : member?.displayLabel ?? 'household'
}

export function homeLibraryEntryCard(entry: HomeLibraryEntry): HomesroloPhotoCard
  | HomesroloDocumentCard
  | HomesroloWarrantyCard
  | HomesroloHomeWatchPhotoCard {
  if (entry.source === 'home_watch') return homeWatchEntryCard(entry)

  const artifact = entry.artifact
  assertHomeRef(artifact.homeRef)
  assertArtifactRef(artifact.artifactRef)
  if (entry.id !== artifact.artifactRef
    || entry.kind !== artifact.kind
    || entry.projectRef !== artifact.projectRef) {
    throw new Error('inconsistent_homesrolo_library_entry')
  }
  if (artifact.projectRef !== null) assertProjectRef(artifact.projectRef)

  const filter: HomesroloLibraryDestinationFilter = artifact.kind === 'photo'
    ? 'photos'
    : artifact.kind === 'warranty' ? 'warranties' : 'documents'
  const destination: HomesroloCardDestination = artifact.projectRef
    ? { kind: 'work', homeRef: artifact.homeRef, projectRef: artifact.projectRef, section: 'files' }
    : { kind: 'library', homeRef: artifact.homeRef, filter, projectRef: null }
  const common = {
    schemaVersion: HOMESROLO_CARD_SCHEMA_VERSION,
    group: 'saved' as const,
    homeRef: artifact.homeRef,
    projectRef: artifact.projectRef,
    title: usefulText(entry.title, artifact.kind === 'photo' ? 'Untitled photo' : 'Untitled file'),
    sortKey: entry.date,
    destination,
    provenance: {
      kind: 'record' as const,
      source: 'artifact_upload' as const,
      sourceRef: artifact.artifactRef,
    },
  }

  if (artifact.kind === 'photo') {
    const meta = compactText([
      entry.projectLabel,
      artifact.phase ? photoPhaseLabel(artifact.phase) : 'Unsorted',
      artifact.areaLabel,
      cardDateLabel(entry.date),
      artifact.geoPin ? 'Location pinned' : null,
    ])
    return {
      ...common,
      cardRef: homesroloCardRef('photo', artifact.artifactRef),
      kind: 'photo',
      eyebrow: 'Photo',
      summary: usefulText(artifact.areaLabel, `Filed with ${entry.projectLabel}.`),
      meta,
      searchText: searchText([entry.searchText, ...meta, 'photo', artifact.artifactRef]),
      actions: [
        { kind: 'preview_artifact', label: 'Open photo', homeRef: artifact.homeRef, artifactRef: artifact.artifactRef },
        { kind: 'navigate', label: destination.kind === 'work' ? 'Open work' : 'Open library', destination },
      ],
      data: {
        artifactRef: artifact.artifactRef,
        date: entry.date,
        dateSource: entry.dateSource,
        phase: artifact.phase,
        areaLabel: artifact.areaLabel,
        geoPinned: artifact.geoPin !== null,
        projectLabel: entry.projectLabel,
      },
    }
  }

  const kind = artifact.kind
  const meta = compactText([entry.projectLabel, cardDateLabel(entry.date), cardFileSizeLabel(artifact.byteLength)])
  const fileBase = {
    ...common,
    eyebrow: kind === 'warranty' ? 'Warranty' : 'Document',
    summary: `Filed with ${entry.projectLabel}.`,
    meta,
    searchText: searchText([entry.searchText, ...meta, kind, artifact.artifactRef]),
    actions: [
      { kind: 'open_artifact' as const, label: 'Open file', homeRef: artifact.homeRef, artifactRef: artifact.artifactRef },
      { kind: 'navigate' as const, label: destination.kind === 'work' ? 'Open work' : 'Open library', destination },
    ] as const,
    data: {
      artifactRef: artifact.artifactRef,
      date: entry.date,
      dateSource: entry.dateSource,
      byteLength: Math.max(0, artifact.byteLength),
      projectLabel: entry.projectLabel,
    },
  }
  return kind === 'warranty'
    ? { ...fileBase, cardRef: homesroloCardRef('warranty', artifact.artifactRef), kind: 'warranty' }
    : { ...fileBase, cardRef: homesroloCardRef('document', artifact.artifactRef), kind: 'document' }
}

export function homeLibraryEntryCards(
  entries: readonly HomeLibraryEntry[],
): readonly (HomesroloPhotoCard | HomesroloDocumentCard | HomesroloWarrantyCard | HomesroloHomeWatchPhotoCard)[] {
  return entries.map(homeLibraryEntryCard)
}

export function homePhotoAlbumCard(album: HomePhotoAlbum): HomesroloPhotoAlbumCard {
  if (!validIdentity(album.id) || album.items.length < 1) throw new Error('invalid_homesrolo_photo_album')
  if (album.projectRef !== null) assertProjectRef(album.projectRef)
  const itemCards = album.items.map(homeLibraryEntryCard)
  if (itemCards.some(card => card.kind !== 'photo' && card.kind !== 'home_watch_photo')) {
    throw new Error('invalid_homesrolo_photo_album')
  }
  const homeRef = itemCards[0]!.homeRef
  if (itemCards.some(card => card.homeRef !== homeRef
    || card.projectRef !== album.projectRef
    || card.provenance.kind !== 'record')) {
    throw new Error('inconsistent_homesrolo_photo_album')
  }
  const firstCard = homeLibraryEntryCard(album.first)
  const latestCard = homeLibraryEntryCard(album.latest)
  const itemRefs = new Set(itemCards.map(card => card.cardRef))
  if (!itemRefs.has(firstCard.cardRef) || !itemRefs.has(latestCard.cardRef)) {
    throw new Error('inconsistent_homesrolo_photo_album')
  }
  const sourceKinds = new Set(itemCards.map(card => card.kind))
  if (sourceKinds.size !== 1) throw new Error('inconsistent_homesrolo_photo_album')

  const destination: HomesroloCardDestination = album.projectRef
    ? { kind: 'work', homeRef, projectRef: album.projectRef, section: 'files' }
    : itemCards[0]!.kind === 'home_watch_photo'
      ? { kind: 'home_watch', homeRef }
      : { kind: 'library', homeRef, filter: 'photos', projectRef: null }
  const sourceCardRefs = itemCards.map(card => card.cardRef)
  return {
    schemaVersion: HOMESROLO_CARD_SCHEMA_VERSION,
    cardRef: homesroloCardRef('photo_album', `${homeRef}:${album.id}`),
    kind: 'photo_album',
    group: 'saved',
    homeRef,
    projectRef: album.projectRef,
    eyebrow: 'Photo album',
    title: usefulText(album.title, 'Untitled photo album'),
    summary: usefulText(album.detail, `${itemCards.length} saved photos.`),
    meta: [`${itemCards.length} ${itemCards.length === 1 ? 'photo' : 'photos'}`, cardDateLabel(album.latest.date)],
    searchText: searchText([
      album.title, album.detail, album.id, ...itemCards.map(card => card.searchText),
    ]),
    sortKey: album.latest.date,
    destination,
    actions: [{ kind: 'navigate', label: 'Open album', destination }],
    provenance: { kind: 'derived', source: 'photo_album', sourceCardRefs },
    data: {
      albumId: album.id,
      count: itemCards.length,
      firstCardRef: firstCard.cardRef,
      latestCardRef: latestCard.cardRef,
      itemCardRefs: sourceCardRefs,
    },
  }
}

export function homePhotoAlbumCards(albums: readonly HomePhotoAlbum[]): readonly HomesroloPhotoAlbumCard[] {
  return albums.map(homePhotoAlbumCard)
}

/**
 * Builds the fixed aggregate cards used by the global Rolo without inventing a
 * persisted source object or accepting a raw route. The role owns both group
 * and destination, so callers can change copy/counts but cannot misroute it.
 */
export function homesroloNavigationCard(input: HomesroloNavigationCardInput): HomesroloNavigationCard {
  assertHomeRef(input.homeRef)
  if (!NAVIGATION_ROLES.has(input.role)
    || !validText(input.eyebrow, 160, true)
    || !validText(input.title, 240, true)
    || !validText(input.summary, 2_000, true)
    || input.meta?.some(item => !validText(item, 240, true))
    || (input.count !== undefined && input.count !== null
      && (!Number.isInteger(input.count) || input.count < 0))
    || input.sourceCardRefs?.some(ref => !isHomesroloCardRef(ref))) {
    throw new Error('invalid_homesrolo_navigation_card')
  }
  const destination = navigationDestination(input.homeRef, input.role)
  const group = navigationGroup(input.role)
  const meta = input.meta ? [...input.meta] : []
  const sourceCardRefs = input.sourceCardRefs ? [...input.sourceCardRefs] : []
  return {
    schemaVersion: HOMESROLO_CARD_SCHEMA_VERSION,
    cardRef: homesroloCardRef('navigation', `${input.homeRef}:${input.role}`),
    kind: 'navigation',
    group,
    homeRef: input.homeRef,
    projectRef: null,
    eyebrow: input.eyebrow.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    meta,
    searchText: searchText([
      input.role, input.eyebrow, input.title, input.summary, ...meta,
    ]),
    sortKey: `navigation:${String(NAVIGATION_ORDER[input.role]).padStart(2, '0')}`,
    destination,
    actions: [{ kind: 'navigate', label: navigationActionLabel(input.role), destination }],
    provenance: { kind: 'derived', source: 'navigation', sourceCardRefs },
    data: { role: input.role, count: input.count ?? null },
  }
}

/** Deterministic AND-token filtering over card projections; inputs are never reordered. */
export function filterHomesroloCards(
  cards: readonly HomesroloCard[],
  query: HomesroloDeckQuery = {},
): readonly HomesroloCard[] {
  const group = query.group ?? 'all'
  if (group !== 'all' && !CARD_GROUPS.has(group)) throw new Error('invalid_homesrolo_deck_group')
  const kinds = query.kinds ?? []
  if (kinds.some(kind => !CARD_KINDS.has(kind))) throw new Error('invalid_homesrolo_deck_kind')
  const kindSet = new Set(kinds)
  const project = query.project ?? 'all'
  if (project !== 'all' && project !== 'unfiled' && !isProjectRef(project)) {
    throw new Error('invalid_homesrolo_deck_project')
  }
  const sort = query.sort ?? 'newest'
  if (sort !== 'newest' && sort !== 'oldest' && sort !== 'title') {
    throw new Error('invalid_homesrolo_deck_sort')
  }
  const tokens = searchTokens(query.text ?? '')
  return cards.filter(card => {
    if (!isHomesroloCard(card)) throw new Error('invalid_homesrolo_card')
    if (group !== 'all' && card.group !== group) return false
    if (kindSet.size > 0 && !kindSet.has(card.kind)) return false
    if (project === 'unfiled' && card.projectRef !== null) return false
    if (project !== 'all' && project !== 'unfiled' && card.projectRef !== project) return false
    return tokens.every(token => card.searchText.includes(token))
  }).sort((left, right) => {
    if (sort === 'title') {
      return left.title.localeCompare(right.title) || left.cardRef.localeCompare(right.cardRef)
    }
    const ordered = sort === 'oldest'
      ? left.sortKey.localeCompare(right.sortKey)
      : right.sortKey.localeCompare(left.sortKey)
    return ordered || left.cardRef.localeCompare(right.cardRef)
  })
}

export function homesroloDeckPage(
  cards: readonly HomesroloCard[],
  query: HomesroloDeckQuery,
  limit: number,
): HomesroloDeckPage {
  const filtered = filterHomesroloCards(cards, query)
  const boundedLimit = Math.max(0, Math.trunc(limit))
  return {
    cards: filtered.slice(0, boundedLimit),
    total: filtered.length,
    remaining: Math.max(0, filtered.length - boundedLimit),
  }
}

/** Strict runtime guard for persisted/transported card envelopes if that is added later. */
export function isHomesroloCard(value: unknown): value is HomesroloCard {
  const card = exactObject(value, [
    'schemaVersion', 'cardRef', 'kind', 'group', 'homeRef', 'projectRef', 'eyebrow',
    'title', 'summary', 'meta', 'searchText', 'sortKey', 'destination', 'actions',
    'provenance', 'data',
  ])
  if (!card
    || card.schemaVersion !== HOMESROLO_CARD_SCHEMA_VERSION
    || !CARD_KINDS.has(card.kind as HomesroloCardKind)
    || !CARD_GROUPS.has(card.group as HomesroloCardGroup)
    || !isHomesroloCardRef(card.cardRef)
    || !isHomeRef(card.homeRef)
    || (card.projectRef !== null && !isProjectRef(card.projectRef))
    || !validText(card.eyebrow, 160, true)
    || !validText(card.title, 240, true)
    || !validText(card.summary, 2_000, true)
    || !Array.isArray(card.meta)
    || card.meta.length > 8
    || card.meta.some(item => !validText(item, 240, true))
    || !validText(card.searchText, 12_000, true)
    || !validText(card.sortKey, 80, true)
    || !isCardDestination(card.destination)
    || !Array.isArray(card.actions)
    || card.actions.length < 1
    || card.actions.length > 4
    || card.actions.some(action => !isCardAction(action))
    || !isCardProvenance(card.provenance)) return false

  const kind = card.kind as HomesroloCardKind
  if ((kind === 'work' && card.group !== 'work')
    || (kind !== 'work' && kind !== 'navigation' && card.group !== 'saved')) return false
  if (!destinationMatchesEnvelope(card.destination, card.homeRef, card.projectRef)) return false
  if (!actionsMatchEnvelope(card.actions, card.homeRef)) return false
  const validData = kind === 'work'
    ? isWorkCardData(card.data, card.projectRef)
    : kind === 'photo'
      ? isPhotoCardData(card.data)
      : kind === 'document' || kind === 'warranty'
        ? isFileCardData(card.data)
        : kind === 'home_watch_photo'
          ? isHomeWatchCardData(card.data)
          : kind === 'photo_album'
            ? isPhotoAlbumCardData(card.data)
            : isNavigationCardData(card.data, card.group, card.destination)
  return validData && cardRelationsMatch(card, kind)
}

function homeWatchEntryCard(
  entry: Extract<HomeLibraryEntry, { source: 'home_watch' }>,
): HomesroloHomeWatchPhotoCard {
  const photo = entry.checkup
  assertHomeRef(photo.homeRef)
  assertPhotoRef(photo.photoRef)
  if (entry.id !== photo.photoRef || entry.kind !== 'photo' || entry.projectRef !== null) {
    throw new Error('inconsistent_homesrolo_library_entry')
  }
  const destination: HomesroloCardDestination = { kind: 'home_watch', homeRef: photo.homeRef }
  const meta = compactText([HOME_CHECKUP_AREA_LABEL[photo.area], cardDateLabel(entry.date), 'Home Watch'])
  return {
    schemaVersion: HOMESROLO_CARD_SCHEMA_VERSION,
    cardRef: homesroloCardRef('home_watch_photo', photo.photoRef),
    kind: 'home_watch_photo',
    group: 'saved',
    homeRef: photo.homeRef,
    projectRef: null,
    eyebrow: `${HOME_CHECKUP_AREA_LABEL[photo.area]} · Home Watch`,
    title: usefulText(entry.title, 'Untitled Home Watch view'),
    summary: usefulText(photo.caption, 'Repeatable private home view.'),
    meta,
    searchText: searchText([entry.searchText, ...meta, photo.area, photo.photoRef]),
    sortKey: entry.date,
    destination,
    actions: [
      { kind: 'preview_home_watch_photo', label: 'Open photo', homeRef: photo.homeRef, photoRef: photo.photoRef },
      { kind: 'navigate', label: 'Open Home Watch', destination },
    ],
    provenance: { kind: 'record', source: 'home_watch', sourceRef: photo.photoRef },
    data: {
      photoRef: photo.photoRef,
      date: entry.date,
      area: photo.area,
      caption: photo.caption,
      width: photo.width,
      height: photo.height,
    },
  }
}

function photoPhaseLabel(phase: ArtifactPhotoPhase): string {
  if (phase === 'before') return 'Before'
  if (phase === 'during') return 'During'
  if (phase === 'after') return 'After'
  return 'Reference'
}

function cardDateLabel(value: string): string {
  const calendar = value.slice(0, 10)
  const parsed = new Date(`${calendar}T12:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return calendar
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(parsed)
}

function cardFileSizeLabel(value: number): string {
  if (value >= 1024 * 1024) return `${Math.max(0.1, Math.round((value / (1024 * 1024)) * 10) / 10)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

function navigationDestination(
  homeRef: string,
  role: HomesroloNavigationCardRole,
): HomesroloCardDestination {
  if (role === 'home_details') return { kind: 'home_details', homeRef }
  if (role === 'home_watch') return { kind: 'home_watch', homeRef }
  if (role === 'timeline') return { kind: 'timeline', homeRef }
  if (role === 'people') return { kind: 'people', homeRef }
  if (role === 'library') return { kind: 'library', homeRef, filter: 'all', projectRef: null }
  return { kind: 'work_index', homeRef, filter: 'all' }
}

function navigationGroup(role: HomesroloNavigationCardRole): HomesroloCardGroup {
  if (role === 'people') return 'people'
  if (role === 'library') return 'saved'
  if (role === 'work') return 'work'
  return 'home'
}

function navigationActionLabel(role: HomesroloNavigationCardRole): string {
  if (role === 'home_details') return 'Open home details'
  if (role === 'home_watch') return 'Open Home Watch'
  if (role === 'timeline') return 'Open timeline'
  if (role === 'people') return 'Open people'
  if (role === 'library') return 'Open library'
  return 'Open work'
}

function searchTokens(value: string): readonly string[] {
  return value.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean).slice(0, 12)
}

function searchText(values: readonly (string | null | undefined)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim()
    .toLocaleLowerCase('en-US')
    .slice(0, 12_000)
}

function compactText(values: readonly (string | null | undefined)[]): readonly string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim())
}

function usefulText(value: string | null | undefined, fallback: string): string {
  const clean = value?.trim()
  return clean ? clean : fallback
}

function validIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 600
    && value.trim() === value
    && !CONTROL_CHARACTERS.test(value)
}

function validText(value: unknown, maximum: number, nonempty: boolean): value is string {
  if (typeof value !== 'string' || value.length > maximum || CONTROL_CHARACTERS.test(value)) return false
  return !nonempty || value.trim().length > 0
}

function assertHomeRef(value: unknown): asserts value is string {
  if (!isHomeRef(value)) throw new Error('invalid_homesrolo_home_ref')
}

function assertProjectRef(value: unknown): asserts value is string {
  if (!isProjectRef(value)) throw new Error('invalid_homesrolo_project_ref')
}

function assertArtifactRef(value: unknown): asserts value is string {
  if (!isArtifactRef(value)) throw new Error('invalid_homesrolo_artifact_ref')
}

function assertPhotoRef(value: unknown): asserts value is string {
  if (!isPhotoRef(value)) throw new Error('invalid_homesrolo_photo_ref')
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  return Object.keys(object).sort().join(',') === [...keys].sort().join(',') ? object : null
}

function isCardDestination(value: unknown): value is HomesroloCardDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'work') {
    const object = exactObject(candidate, ['kind', 'homeRef', 'projectRef', 'section'])
    return Boolean(object && isHomeRef(object.homeRef) && isProjectRef(object.projectRef)
      && WORK_SECTIONS.has(object.section as HomesroloWorkSection))
  }
  if (candidate.kind === 'library') {
    const object = exactObject(candidate, ['kind', 'homeRef', 'filter', 'projectRef'])
    return Boolean(object && isHomeRef(object.homeRef)
      && LIBRARY_FILTERS.has(object.filter as HomesroloLibraryDestinationFilter)
      && (object.projectRef === null || isProjectRef(object.projectRef)))
  }
  if (candidate.kind === 'work_index') {
    const object = exactObject(candidate, ['kind', 'homeRef', 'filter'])
    return Boolean(object && isHomeRef(object.homeRef)
      && ['all', 'open', 'household', 'assigned_to_me', 'care', 'completed'].includes(String(object.filter)))
  }
  if (candidate.kind === 'home_details' || candidate.kind === 'timeline' || candidate.kind === 'people') {
    const object = exactObject(candidate, ['kind', 'homeRef'])
    return Boolean(object && isHomeRef(object.homeRef))
  }
  const object = exactObject(candidate, ['kind', 'homeRef'])
  return Boolean(object && object.kind === 'home_watch' && isHomeRef(object.homeRef))
}

function isCardAction(value: unknown): value is HomesroloCardAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (!validText(candidate.label, 80, true)) return false
  if (candidate.kind === 'navigate') {
    const object = exactObject(candidate, ['kind', 'label', 'destination'])
    return Boolean(object && isCardDestination(object.destination))
  }
  if (candidate.kind === 'preview_artifact' || candidate.kind === 'open_artifact') {
    const object = exactObject(candidate, ['kind', 'label', 'homeRef', 'artifactRef'])
    return Boolean(object && isHomeRef(object.homeRef) && isArtifactRef(object.artifactRef))
  }
  const object = exactObject(candidate, ['kind', 'label', 'homeRef', 'photoRef'])
  return Boolean(object && object.kind === 'preview_home_watch_photo'
    && isHomeRef(object.homeRef) && isPhotoRef(object.photoRef))
}

function isCardProvenance(value: unknown): value is HomesroloCardProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'derived') {
    const object = exactObject(candidate, ['kind', 'source', 'sourceCardRefs'])
    return Boolean(object && (object.source === 'photo_album' || object.source === 'navigation')
      && Array.isArray(object.sourceCardRefs)
      && (object.source === 'navigation' || object.sourceCardRefs.length >= 1)
      && object.sourceCardRefs.every(isHomesroloCardRef))
  }
  const object = exactObject(candidate, ['kind', 'source', 'sourceRef'])
  if (!object || object.kind !== 'record') return false
  if (object.source === 'work') return isProjectRef(object.sourceRef)
  if (object.source === 'artifact_upload') return isArtifactRef(object.sourceRef)
  return object.source === 'home_watch' && isPhotoRef(object.sourceRef)
}

function destinationMatchesEnvelope(value: unknown, homeRef: unknown, projectRef: unknown): boolean {
  if (!isCardDestination(value) || value.homeRef !== homeRef) return false
  if (value.kind === 'work') return value.projectRef === projectRef
  return value.kind === 'library' ? value.projectRef === projectRef : projectRef === null
}

function actionsMatchEnvelope(value: unknown, homeRef: unknown): boolean {
  return Array.isArray(value) && value.every(action => {
    if (!isCardAction(action)) return false
    return action.kind === 'navigate'
      ? action.destination.homeRef === homeRef
      : action.homeRef === homeRef
  })
}

function cardRelationsMatch(
  card: Record<string, unknown>,
  kind: HomesroloCardKind,
): boolean {
  const homeRef = card.homeRef as string
  const projectRef = card.projectRef as string | null
  const cardRef = card.cardRef as HomesroloCardRef
  const destination = card.destination as HomesroloCardDestination
  const actions = card.actions as readonly HomesroloCardAction[]
  const provenance = card.provenance as HomesroloCardProvenance

  if (kind === 'work') {
    const data = card.data as HomesroloWorkCardData
    const expected: HomesroloCardDestination = {
      kind: 'work', homeRef, projectRef: data.projectRef, section: 'overview',
    }
    return cardRef === homesroloCardRef('work', data.projectRef)
      && recordProvenanceMatches(provenance, 'work', data.projectRef)
      && destinationEquals(destination, expected)
      && actionsMatchCard(actions, expected, null, null)
  }

  if (kind === 'photo' || kind === 'document' || kind === 'warranty') {
    const data = card.data as HomesroloPhotoCardData | HomesroloFileCardData
    const expected = artifactDestination(kind, homeRef, projectRef)
    const primary = kind === 'photo' ? 'preview_artifact' : 'open_artifact'
    return cardRef === homesroloCardRef(kind, data.artifactRef)
      && recordProvenanceMatches(provenance, 'artifact_upload', data.artifactRef)
      && destinationEquals(destination, expected)
      && actionsMatchCard(actions, expected, primary, data.artifactRef)
  }

  if (kind === 'home_watch_photo') {
    const data = card.data as HomesroloHomeWatchPhotoCardData
    const expected: HomesroloCardDestination = { kind: 'home_watch', homeRef }
    return cardRef === homesroloCardRef('home_watch_photo', data.photoRef)
      && recordProvenanceMatches(provenance, 'home_watch', data.photoRef)
      && destinationEquals(destination, expected)
      && actionsMatchCard(actions, expected, 'preview_home_watch_photo', data.photoRef)
  }

  if (kind === 'photo_album') {
    const data = card.data as HomesroloPhotoAlbumCardData
    const sourceKinds = new Set(data.itemCardRefs.map(homesroloCardKindFromRef))
    if (sourceKinds.size !== 1 || new Set(data.itemCardRefs).size !== data.itemCardRefs.length) return false
    const sourceKind = [...sourceKinds][0]
    if (sourceKind !== 'photo' && sourceKind !== 'home_watch_photo') return false
    const expected: HomesroloCardDestination = projectRef
      ? { kind: 'work', homeRef, projectRef, section: 'files' }
      : sourceKind === 'home_watch_photo'
        ? { kind: 'home_watch', homeRef }
        : { kind: 'library', homeRef, filter: 'photos', projectRef: null }
    return cardRef === homesroloCardRef('photo_album', `${homeRef}:${data.albumId}`)
      && provenance.kind === 'derived'
      && provenance.source === 'photo_album'
      && sameCardRefs(provenance.sourceCardRefs, data.itemCardRefs)
      && destinationEquals(destination, expected)
      && actionsMatchCard(actions, expected, null, null)
  }

  const data = card.data as HomesroloNavigationCardData
  const expected = navigationDestination(homeRef, data.role)
  return cardRef === homesroloCardRef('navigation', `${homeRef}:${data.role}`)
    && provenance.kind === 'derived'
    && provenance.source === 'navigation'
    && destinationEquals(destination, expected)
    && actionsMatchCard(actions, expected, null, null)
}

function artifactDestination(
  kind: 'photo' | 'document' | 'warranty',
  homeRef: string,
  projectRef: string | null,
): HomesroloCardDestination {
  if (projectRef) return { kind: 'work', homeRef, projectRef, section: 'files' }
  const filter: HomesroloLibraryDestinationFilter = kind === 'photo'
    ? 'photos'
    : kind === 'document' ? 'documents' : 'warranties'
  return { kind: 'library', homeRef, filter, projectRef: null }
}

function recordProvenanceMatches(
  provenance: HomesroloCardProvenance,
  source: Extract<HomesroloCardProvenance, { kind: 'record' }>['source'],
  sourceRef: string,
): boolean {
  return provenance.kind === 'record'
    && provenance.source === source
    && provenance.sourceRef === sourceRef
}

function actionsMatchCard(
  actions: readonly HomesroloCardAction[],
  destination: HomesroloCardDestination,
  primaryKind: 'preview_artifact' | 'open_artifact' | 'preview_home_watch_photo' | null,
  sourceRef: string | null,
): boolean {
  if (actions.length !== (primaryKind ? 2 : 1)) return false
  const navigation = actions.filter(action => action.kind === 'navigate')
  if (navigation.length !== 1 || !destinationEquals(navigation[0]!.destination, destination)) return false
  if (!primaryKind || !sourceRef) return true
  const primary = actions.find(action => action.kind !== 'navigate')
  if (!primary || primary.kind !== primaryKind || primary.homeRef !== destination.homeRef) return false
  return primary.kind === 'preview_home_watch_photo'
    ? primary.photoRef === sourceRef
    : primary.artifactRef === sourceRef
}

function destinationEquals(
  left: HomesroloCardDestination,
  right: HomesroloCardDestination,
): boolean {
  if (left.kind !== right.kind || left.homeRef !== right.homeRef) return false
  if (left.kind === 'work') {
    return right.kind === 'work'
      && left.projectRef === right.projectRef
      && left.section === right.section
  }
  if (left.kind === 'library') {
    return right.kind === 'library'
      && left.filter === right.filter
      && left.projectRef === right.projectRef
  }
  if (left.kind === 'work_index') {
    return right.kind === 'work_index' && left.filter === right.filter
  }
  return true
}

function homesroloCardKindFromRef(value: HomesroloCardRef): HomesroloCardKind | null {
  const prefix = `${HOMESROLO_CARD_REF_NAMESPACE}:`
  const rest = value.slice(prefix.length)
  const separator = rest.indexOf(':')
  if (separator < 1) return null
  const kind = rest.slice(0, separator) as HomesroloCardKind
  return CARD_KINDS.has(kind) ? kind : null
}

function sameCardRefs(
  left: readonly HomesroloCardRef[],
  right: readonly HomesroloCardRef[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isWorkCardData(value: unknown, projectRef: unknown): value is HomesroloWorkCardData {
  const data = exactObject(value, [
    'projectRef', 'workKind', 'category', 'status', 'occurredOn', 'assignedMembershipRef', 'dueOn',
    'professionalLabel', 'archived',
  ])
  return Boolean(data
    && data.projectRef === projectRef
    && isProjectRef(data.projectRef)
    && WORK_KINDS.has(data.workKind as WorkKind)
    && WORK_CATEGORIES.has(data.category as WorkCategory)
    && WORK_STATUSES.has(data.status as WorkStatus)
    && (data.occurredOn === null || validText(data.occurredOn, 10, true))
    && (data.assignedMembershipRef === null
      || (typeof data.assignedMembershipRef === 'string'
        && /^hmbr_[A-Za-z0-9_-]{43}$/.test(data.assignedMembershipRef)))
    && (data.dueOn === null || validText(data.dueOn, 10, true))
    && (data.professionalLabel === null || validText(data.professionalLabel, 160, true))
    && typeof data.archived === 'boolean')
}

function isPhotoCardData(value: unknown): value is HomesroloPhotoCardData {
  const data = exactObject(value, [
    'artifactRef', 'date', 'dateSource', 'phase', 'areaLabel', 'geoPinned', 'projectLabel',
  ])
  return Boolean(data
    && isArtifactRef(data.artifactRef)
    && validText(data.date, 40, true)
    && (data.dateSource === 'observed' || data.dateSource === 'saved')
    && (data.phase === null || PHOTO_PHASES.has(data.phase as ArtifactPhotoPhase))
    && (data.areaLabel === null || validText(data.areaLabel, 120, true))
    && typeof data.geoPinned === 'boolean'
    && validText(data.projectLabel, 240, true))
}

function isFileCardData(value: unknown): value is HomesroloFileCardData {
  const data = exactObject(value, ['artifactRef', 'date', 'dateSource', 'byteLength', 'projectLabel'])
  return Boolean(data
    && isArtifactRef(data.artifactRef)
    && validText(data.date, 40, true)
    && (data.dateSource === 'observed' || data.dateSource === 'saved')
    && typeof data.byteLength === 'number'
    && Number.isFinite(data.byteLength)
    && data.byteLength >= 0
    && validText(data.projectLabel, 240, true))
}

function isHomeWatchCardData(value: unknown): value is HomesroloHomeWatchPhotoCardData {
  const data = exactObject(value, ['photoRef', 'date', 'area', 'caption', 'width', 'height'])
  return Boolean(data
    && isPhotoRef(data.photoRef)
    && validText(data.date, 40, true)
    && HOME_CHECKUP_AREAS.has(data.area as HomeCheckupArea)
    && validText(data.caption, 2_000, false)
    && typeof data.width === 'number' && Number.isFinite(data.width) && data.width > 0
    && typeof data.height === 'number' && Number.isFinite(data.height) && data.height > 0)
}

function isPhotoAlbumCardData(value: unknown): value is HomesroloPhotoAlbumCardData {
  const data = exactObject(value, [
    'albumId', 'count', 'firstCardRef', 'latestCardRef', 'itemCardRefs',
  ])
  return Boolean(data
    && validIdentity(data.albumId)
    && typeof data.count === 'number'
    && Number.isInteger(data.count)
    && data.count > 0
    && isHomesroloCardRef(data.firstCardRef)
    && isHomesroloCardRef(data.latestCardRef)
    && Array.isArray(data.itemCardRefs)
    && data.itemCardRefs.length === data.count
    && data.itemCardRefs.every(isHomesroloCardRef)
    && data.itemCardRefs.includes(data.firstCardRef as HomesroloCardRef)
    && data.itemCardRefs.includes(data.latestCardRef as HomesroloCardRef))
}

function isNavigationCardData(
  value: unknown,
  group: unknown,
  destination: unknown,
): value is HomesroloNavigationCardData {
  const data = exactObject(value, ['role', 'count'])
  if (!data
    || !NAVIGATION_ROLES.has(data.role as HomesroloNavigationCardRole)
    || (data.count !== null
      && (typeof data.count !== 'number' || !Number.isInteger(data.count) || data.count < 0))
    || !isCardDestination(destination)) return false
  const role = data.role as HomesroloNavigationCardRole
  return group === navigationGroup(role) && destination.kind === navigationDestination(
    destination.homeRef,
    role,
  ).kind
}
