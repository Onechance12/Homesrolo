import assert from 'node:assert/strict'
import test from 'node:test'
import type { HomeCheckupPhoto, ResolvedArtifactRecord, WorkRecord } from '../api/model.ts'
import {
  homeLibraryEntries,
  homeLibraryPage,
  homePhotoAlbums,
  matchingWorkChoices,
  visibleHomeArtifacts,
  visibleHomeLibraryEntries,
} from './library.ts'

const homeRef = `hhom_${'A'.repeat(43)}`
const projectRef = `hprj_${'B'.repeat(43)}`
const work = [{ projectRef, homeRef, title: 'Kitchen remodel' }] as WorkRecord[]
const metadata = {
  observedOn: null,
  phase: null,
  areaLabel: null,
  geoPin: null,
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const
const artifacts: ResolvedArtifactRecord[] = [
  { ...metadata, artifactRef: `hart_${'C'.repeat(43)}`, homeRef, projectRef, kind: 'photo', displayName: 'Cabinet sample.jpg', mediaType: 'image/jpeg', byteLength: 10, observedOn: '2026-01-01', phase: 'before', areaLabel: 'Kitchen', createdAt: '2026-01-01T00:00:00.000Z' },
  { ...metadata, artifactRef: `hart_${'D'.repeat(43)}`, homeRef, projectRef: null, kind: 'warranty', displayName: 'Water heater warranty.pdf', mediaType: 'application/pdf', byteLength: 10, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
  { ...metadata, artifactRef: `hart_${'E'.repeat(43)}`, homeRef, projectRef: null, kind: 'document', displayName: 'Tax receipt.pdf', mediaType: 'application/pdf', byteLength: 10, createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' },
]
const checkups: HomeCheckupPhoto[] = [{
  photoRef: `hpho_${'F'.repeat(43)}`,
  homeRef,
  observedOn: '2026-04-01',
  area: 'roofline',
  viewLabel: 'Garage roofline',
  caption: 'After spring storms',
  fullUrl: `/api/v1/homes/${homeRef}/photo-checkups/hpho_${'F'.repeat(43)}/full`,
  thumbnailUrl: `/api/v1/homes/${homeRef}/photo-checkups/hpho_${'F'.repeat(43)}/thumbnail`,
  width: 1200,
  height: 900,
  createdAt: '2026-04-01T12:00:00.000Z',
}]

test('searches every saved item by file or linked work without truncation', () => {
  assert.equal(visibleHomeArtifacts(artifacts, work, '', 'all').length, 3)
  assert.equal(visibleHomeArtifacts(artifacts, work, 'kitchen', 'all')[0]?.kind, 'photo')
  assert.equal(visibleHomeArtifacts(artifacts, work, '', 'documents')[0]?.displayName, 'Tax receipt.pdf')
  assert.equal(visibleHomeArtifacts(artifacts, work, 'water', 'warranties').length, 1)
})

test('unifies uploads and Home Watch with useful search, source, work, and sort filters', () => {
  const entries = homeLibraryEntries(artifacts, checkups, work)
  assert.equal(entries.length, 4)
  assert.equal(visibleHomeLibraryEntries(entries, 'spring storm', 'photos', 'home_watch', 'all', 'newest')[0]?.title, 'Garage roofline')
  assert.equal(visibleHomeLibraryEntries(entries, '', 'all', 'uploads', projectRef, 'newest').length, 1)
  assert.equal(visibleHomeLibraryEntries(entries, 'kitchen before', 'photos', 'uploads', projectRef, 'newest').length, 1)
  assert.deepEqual(
    visibleHomeLibraryEntries(entries, '', 'unfiled', 'all', 'all', 'oldest').map(item => item.title),
    ['Water heater warranty.pdf', 'Tax receipt.pdf', 'Garage roofline'],
  )
})

test('pages large matching sets without making later records unreachable', () => {
  const entries = homeLibraryEntries(artifacts, checkups, work)
  const first = homeLibraryPage(entries, 2)
  const all = homeLibraryPage(entries, 20)
  assert.equal(first.items.length, 2)
  assert.equal(first.remaining, 2)
  assert.equal(all.items.length, 4)
  assert.equal(all.remaining, 0)
})

test('groups photos by work, Home Watch view, and whole-home uploads', () => {
  const entries = homeLibraryEntries([
    ...artifacts,
    { ...metadata, artifactRef: `hart_${'G'.repeat(43)}`, homeRef, projectRef, kind: 'photo', displayName: 'Finished cabinets.jpg', mediaType: 'image/jpeg', byteLength: 10, observedOn: '2026-05-01', phase: 'after', areaLabel: 'Kitchen', createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' },
    { ...metadata, artifactRef: `hart_${'H'.repeat(43)}`, homeRef, projectRef: null, kind: 'photo', displayName: 'Front elevation.jpg', mediaType: 'image/jpeg', byteLength: 10, observedOn: '2026-02-15', areaLabel: 'Front yard', createdAt: '2026-02-15T00:00:00.000Z', updatedAt: '2026-02-15T00:00:00.000Z' },
  ], checkups, work)

  const albums = homePhotoAlbums(entries)
  assert.deepEqual(albums.map(album => album.title), ['Kitchen remodel', 'Garage roofline', 'Front yard'])
  assert.equal(albums[0]?.items.length, 2)
  assert.equal(albums[0]?.first.title, 'Cabinet sample.jpg')
  assert.equal(albums[0]?.latest.title, 'Finished cabinets.jpg')
  assert.equal(albums[1]?.detail, 'Home Watch · Roofline')
  assert.deepEqual(homePhotoAlbums(entries, 'name').map(album => album.title), [
    'Front yard', 'Garage roofline', 'Kitchen remodel',
  ])
  assert.deepEqual(homePhotoAlbums(entries, 'oldest').map(album => album.title), [
    'Kitchen remodel', 'Front yard', 'Garage roofline',
  ])
})

test('pages a home with many photo albums before image previews are mounted', () => {
  const manyPhotos = Array.from({ length: 40 }, (_, index): ResolvedArtifactRecord => ({
    ...metadata,
    artifactRef: `hart_${String(index).padStart(43, '0')}`,
    homeRef,
    projectRef: null,
    kind: 'photo',
    displayName: `Room ${index}.jpg`,
    mediaType: 'image/jpeg',
    byteLength: 10,
    observedOn: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    phase: 'reference',
    areaLabel: `Room ${index}`,
    createdAt: '2026-01-01T00:00:00.000Z',
  }))
  const albums = homePhotoAlbums(homeLibraryEntries(manyPhotos, [], []))
  const page = homeLibraryPage(albums, 8)
  assert.equal(albums.length, 40)
  assert.equal(page.items.length, 8)
  assert.equal(page.remaining, 32)
})

test('project choosers search and bound long work histories while retaining a selected result', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    ...work[0]!,
    projectRef: `hprj_${String(index).padStart(43, '0')}`,
    title: index === 17 ? 'Back patio paint' : `Work ${index}`,
    updatedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }))
  assert.equal(matchingWorkChoices(history, '', null, 8).length, 8)
  assert.equal(matchingWorkChoices(history, '', history[17]!.projectRef, 8)[0]?.title, 'Back patio paint')
  assert.equal(matchingWorkChoices(history, 'patio paint', null, 8)[0]?.title, 'Back patio paint')
  assert.equal(matchingWorkChoices(history, 'no match', history[17]!.projectRef, 8)[0]?.title, 'Back patio paint')
})
