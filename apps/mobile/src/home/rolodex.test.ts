import assert from 'node:assert/strict'
import test from 'node:test'
import type { HomeCheckupPhoto, ResolvedArtifactRecord, WorkRecord } from '../api/model.ts'
import { homeLibraryEntries, homePhotoAlbums } from './library.ts'
import {
  HOMESROLO_CARD_SCHEMA_VERSION,
  filterHomesroloCards,
  homeLibraryEntryCard,
  homeLibraryEntryCards,
  homePhotoAlbumCard,
  homesroloCardRef,
  homesroloDeckPage,
  homesroloNavigationCard,
  isHomesroloCard,
  isHomesroloCardRef,
  workRecordCard,
  workRecordCards,
  type HomesroloCard,
} from './rolodex.ts'

const REF = (prefix: 'hhom' | 'hprj' | 'hart' | 'hpho', fill: string) =>
  `${prefix}_${fill.repeat(43)}`
const HOME = REF('hhom', 'h')
const WORK = REF('hprj', 'w')
const OTHER_WORK = REF('hprj', 'x')

const work: WorkRecord = {
  projectRef: WORK,
  homeRef: HOME,
  title: 'Kitchen remodel',
  workKind: 'project',
  category: 'interior',
  status: 'in_progress',
  occurredOn: '2026-07-15',
  summary: 'Replace cabinets and choose a durable countertop.',
  professionalLabel: 'Northwind Remodels',
  revision: 3,
  archived: false,
  archivedAt: null,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
}

const metadata = {
  observedOn: null,
  phase: null,
  areaLabel: null,
  geoPin: null,
  revision: 1,
  updatedAt: '2026-08-01T12:00:00.000Z',
} as const

const artifactPhoto: ResolvedArtifactRecord = {
  ...metadata,
  artifactRef: REF('hart', 'p'),
  homeRef: HOME,
  projectRef: WORK,
  kind: 'photo',
  displayName: 'Cabinets before.jpg',
  mediaType: 'image/jpeg',
  byteLength: 12,
  observedOn: '2026-07-15',
  phase: 'before',
  areaLabel: 'Kitchen',
  geoPin: {
    latitude: 32.75,
    longitude: -97.33,
    accuracyMeters: 8,
    capturedAt: '2026-07-15T12:00:00.000Z',
    provenance: 'device_confirmed',
  },
  createdAt: '2026-07-16T12:00:00.000Z',
}

const unfiledDocument: ResolvedArtifactRecord = {
  ...metadata,
  artifactRef: REF('hart', 'd'),
  homeRef: HOME,
  projectRef: null,
  kind: 'document',
  displayName: 'Tax valuation.pdf',
  mediaType: 'application/pdf',
  byteLength: 2_048,
  createdAt: '2026-08-01T12:00:00.000Z',
}

const unfiledWarranty: ResolvedArtifactRecord = {
  ...metadata,
  artifactRef: REF('hart', 'r'),
  homeRef: HOME,
  projectRef: null,
  kind: 'warranty',
  displayName: 'Water heater warranty.pdf',
  mediaType: 'application/pdf',
  byteLength: 3_000,
  createdAt: '2026-08-05T12:00:00.000Z',
}

const homeWatch: HomeCheckupPhoto = {
  photoRef: REF('hpho', 'c'),
  homeRef: HOME,
  observedOn: '2026-08-10',
  area: 'roofline',
  viewLabel: 'Garage roofline',
  caption: 'Same view after summer storms',
  fullUrl: '/private/full',
  thumbnailUrl: '/private/thumb',
  width: 1_600,
  height: 1_200,
  createdAt: '2026-08-10T12:00:00.000Z',
}

const entries = homeLibraryEntries(
  [artifactPhoto, unfiledDocument, unfiledWarranty],
  [homeWatch],
  [work],
)

test('creates canonical, versioned, collision-resistant card references', () => {
  const workRef = homesroloCardRef('work', WORK)
  const photoRef = homesroloCardRef('photo', WORK)
  const aggregateRef = homesroloCardRef('photo_album', `${HOME}:whole-home-area:Front yard`)

  assert.equal(workRef, homesroloCardRef('work', WORK), 'the same source has a stable identity')
  assert.notEqual(workRef, photoRef, 'kind namespaces prevent cross-kind collisions')
  assert.match(aggregateRef, /Front%20yard$/)
  assert.equal(isHomesroloCardRef(workRef), true)
  assert.equal(isHomesroloCardRef(aggregateRef), true)
  assert.equal(isHomesroloCardRef('homesrolo.card.v1:work:%zz'), false)
  assert.equal(isHomesroloCardRef('homesrolo.card.v2:work:anything'), false)
  assert.throws(() => homesroloCardRef('work', ' bad identity '), /invalid_homesrolo_card_identity/)
})

test('projects one work record without creating a second source of truth', () => {
  const card = workRecordCard(work)

  assert.equal(card.schemaVersion, HOMESROLO_CARD_SCHEMA_VERSION)
  assert.equal(card.kind, 'work')
  assert.equal(card.group, 'work')
  assert.equal(card.title, work.title)
  assert.equal(card.summary, work.summary)
  assert.equal(card.sortKey, work.updatedAt)
  assert.deepEqual(card.destination, {
    kind: 'work', homeRef: HOME, projectRef: WORK, section: 'overview',
  })
  assert.deepEqual(card.provenance, { kind: 'record', source: 'work', sourceRef: WORK })
  assert.equal(card.data.projectRef, WORK)
  assert.equal(card.searchText.includes('northwind remodels'), true)
  assert.equal(isHomesroloCard(card), true)

  const archived = { ...work, projectRef: OTHER_WORK, archived: true }
  assert.equal(workRecordCard(archived).data.archived, true)
  assert.deepEqual(workRecordCards([archived, work]).map(item => item.cardRef), [card.cardRef])
  assert.equal(work.title, 'Kitchen remodel', 'projection does not mutate the record')
})

test('projects uploaded photos and files into exact typed actions and safe contexts', () => {
  const photo = homeLibraryEntryCard(entries[0]!)
  const document = homeLibraryEntryCard(entries[1]!)
  const warranty = homeLibraryEntryCard(entries[2]!)

  assert.equal(photo.kind, 'photo')
  if (photo.kind !== 'photo') throw new Error('expected_photo')
  assert.deepEqual(photo.destination, {
    kind: 'work', homeRef: HOME, projectRef: WORK, section: 'files',
  })
  assert.deepEqual(photo.actions[0], {
    kind: 'preview_artifact', label: 'Open photo', homeRef: HOME, artifactRef: artifactPhoto.artifactRef,
  })
  assert.equal(photo.data.phase, 'before')
  assert.equal(photo.data.geoPinned, true)
  assert.equal(photo.searchText.includes('location pinned'), true)

  assert.equal(document.kind, 'document')
  assert.deepEqual(document.destination, {
    kind: 'library', homeRef: HOME, filter: 'documents', projectRef: null,
  })
  assert.equal(document.actions[0].kind, 'open_artifact')
  assert.equal(warranty.kind, 'warranty')
  assert.deepEqual(warranty.destination, {
    kind: 'library', homeRef: HOME, filter: 'warranties', projectRef: null,
  })
  assert.equal(homeLibraryEntryCards(entries).every(isHomesroloCard), true)
})

test('keeps Home Watch provenance and exact-photo action distinct from uploads', () => {
  const card = homeLibraryEntryCard(entries[3]!)

  assert.equal(card.kind, 'home_watch_photo')
  if (card.kind !== 'home_watch_photo') throw new Error('expected_home_watch_photo')
  assert.deepEqual(card.provenance, {
    kind: 'record', source: 'home_watch', sourceRef: homeWatch.photoRef,
  })
  assert.deepEqual(card.destination, { kind: 'home_watch', homeRef: HOME })
  assert.equal(card.actions[0].kind, 'preview_home_watch_photo')
  assert.equal(card.data.area, 'roofline')
  assert.equal(card.searchText.includes('summer storms'), true)
  assert.equal(isHomesroloCard(card), true)
})

test('builds aggregate photo cards as transparent projections of existing card refs', () => {
  const secondPhoto: ResolvedArtifactRecord = {
    ...artifactPhoto,
    artifactRef: REF('hart', 'q'),
    displayName: 'Cabinets after.jpg',
    observedOn: '2026-08-15',
    phase: 'after',
    createdAt: '2026-08-15T12:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
  }
  const albumEntries = homeLibraryEntries([artifactPhoto, secondPhoto], [], [work])
  const album = homePhotoAlbums(albumEntries)[0]!
  const card = homePhotoAlbumCard(album)

  assert.equal(card.kind, 'photo_album')
  assert.equal(card.data.count, 2)
  assert.equal(card.data.itemCardRefs.length, 2)
  assert.equal(card.data.itemCardRefs.includes(card.data.firstCardRef), true)
  assert.equal(card.data.itemCardRefs.includes(card.data.latestCardRef), true)
  assert.deepEqual(card.provenance, {
    kind: 'derived', source: 'photo_album', sourceCardRefs: card.data.itemCardRefs,
  })
  assert.deepEqual(card.destination, {
    kind: 'work', homeRef: HOME, projectRef: WORK, section: 'files',
  })
  assert.equal(isHomesroloCard(card), true)

  const inconsistent = { ...album, projectRef: OTHER_WORK }
  assert.throws(() => homePhotoAlbumCard(inconsistent), /inconsistent_homesrolo_photo_album/)
})

test('builds fixed global navigation cards without raw routes or synthetic source records', () => {
  const sourceCard = workRecordCard(work)
  const timeline = homesroloNavigationCard({
    homeRef: HOME,
    role: 'timeline',
    eyebrow: 'Home history',
    title: 'Timeline',
    summary: 'Everything this home remembers in date order.',
    meta: ['5 entries'],
    count: 5,
    sourceCardRefs: [sourceCard.cardRef],
  })
  const people = homesroloNavigationCard({
    homeRef: HOME,
    role: 'people',
    eyebrow: 'Home Rolodex',
    title: 'People',
    summary: 'Companies and people connected to this home.',
  })

  assert.equal(timeline.kind, 'navigation')
  assert.equal(timeline.group, 'home')
  assert.deepEqual(timeline.destination, { kind: 'timeline', homeRef: HOME })
  assert.deepEqual(timeline.provenance, {
    kind: 'derived', source: 'navigation', sourceCardRefs: [sourceCard.cardRef],
  })
  assert.equal(timeline.data.count, 5)
  assert.equal(people.group, 'people')
  assert.deepEqual(people.destination, { kind: 'people', homeRef: HOME })
  assert.equal(isHomesroloCard(timeline), true)
  assert.equal(isHomesroloCard(people), true)
  assert.throws(() => homesroloNavigationCard({
    homeRef: HOME,
    role: 'timeline',
    eyebrow: 'Home history',
    title: 'Timeline',
    summary: 'Everything this home remembers.',
    count: -1,
  }), /invalid_homesrolo_navigation_card/)
})

test('filters with AND tokens, typed facets, project scope, and deterministic sort order', () => {
  const cards: readonly HomesroloCard[] = [
    workRecordCard(work),
    ...homeLibraryEntryCards(entries),
  ]
  const before = cards.map(card => card.cardRef)

  assert.deepEqual(filterHomesroloCards(cards, { text: 'kitchen before' }).map(card => card.kind), ['photo'])
  assert.deepEqual(filterHomesroloCards(cards, { group: 'work' }).map(card => card.kind), ['work'])
  assert.deepEqual(filterHomesroloCards(cards, { kinds: ['document', 'warranty'], sort: 'title' })
    .map(card => card.title), ['Tax valuation.pdf', 'Water heater warranty.pdf'])
  assert.deepEqual(filterHomesroloCards(cards, { project: WORK }).map(card => card.kind), ['work', 'photo'])
  assert.deepEqual(filterHomesroloCards(cards, { project: 'unfiled', sort: 'oldest' })
    .map(card => card.kind), ['document', 'warranty', 'home_watch_photo'])
  assert.deepEqual(cards.map(card => card.cardRef), before, 'sorting never mutates the caller list')
  assert.throws(() => filterHomesroloCards(cards, { project: 'not-a-project-ref' }), /invalid_homesrolo_deck_project/)
})

test('pages after filtering and reports total and remaining cards honestly', () => {
  const cards: readonly HomesroloCard[] = [workRecordCard(work), ...homeLibraryEntryCards(entries)]
  const page = homesroloDeckPage(cards, { group: 'saved', sort: 'newest' }, 2)

  assert.equal(page.cards.length, 2)
  assert.equal(page.total, 4)
  assert.equal(page.remaining, 2)
  assert.deepEqual(homesroloDeckPage(cards, {}, -10).cards, [])
})

test('strict envelope validation rejects extra fields, arbitrary URLs, and mismatched scope', () => {
  const card = workRecordCard(work)
  assert.equal(isHomesroloCard({ ...card, unexpected: true }), false)
  assert.equal(isHomesroloCard({ ...card, schemaVersion: 2 }), false)
  assert.equal(isHomesroloCard({
    ...card,
    actions: [{ kind: 'navigate', label: 'Unsafe', destination: 'https://example.com' }],
  }), false)
  assert.equal(isHomesroloCard({
    ...card,
    destination: { ...card.destination, homeRef: REF('hhom', 'z') },
  }), false)
  assert.equal(isHomesroloCard({
    ...card,
    actions: [{
      ...card.actions[0],
      destination: { ...card.destination, section: 'files' },
    }],
  }), false)

  const photo = homeLibraryEntryCard(entries[0]!)
  if (photo.kind !== 'photo') throw new Error('expected_photo_card')
  const otherArtifactRef = REF('hart', 'z')
  assert.equal(isHomesroloCard({ ...photo, cardRef: homesroloCardRef('photo', otherArtifactRef) }), false)
  assert.equal(isHomesroloCard({
    ...photo,
    provenance: { ...photo.provenance, sourceRef: otherArtifactRef },
  }), false)
  assert.equal(isHomesroloCard({
    ...photo,
    data: { ...photo.data, artifactRef: otherArtifactRef },
  }), false)
  assert.equal(isHomesroloCard({
    ...photo,
    actions: photo.actions.map(action => action.kind === 'preview_artifact'
      ? { ...action, artifactRef: otherArtifactRef }
      : action),
  }), false)

  const brokenEntry = {
    ...entries[0]!,
    id: REF('hart', 'z'),
  }
  assert.throws(() => homeLibraryEntryCard(brokenEntry), /inconsistent_homesrolo_library_entry/)
})
