import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArtifactRecord, HomeCheckupPhoto, WorkRecord } from '../api/model.ts'
import {
  homeLibraryEntries,
  homeLibraryPage,
  visibleHomeArtifacts,
  visibleHomeLibraryEntries,
} from './library.ts'

const homeRef = `hhom_${'A'.repeat(43)}`
const projectRef = `hprj_${'B'.repeat(43)}`
const work = [{ projectRef, homeRef, title: 'Kitchen remodel' }] as WorkRecord[]
const artifacts: ArtifactRecord[] = [
  { artifactRef: `hart_${'C'.repeat(43)}`, homeRef, projectRef, kind: 'photo', displayName: 'Cabinet sample.jpg', mediaType: 'image/jpeg', byteLength: 10, createdAt: '2026-01-01T00:00:00.000Z' },
  { artifactRef: `hart_${'D'.repeat(43)}`, homeRef, projectRef: null, kind: 'warranty', displayName: 'Water heater warranty.pdf', mediaType: 'application/pdf', byteLength: 10, createdAt: '2026-02-01T00:00:00.000Z' },
  { artifactRef: `hart_${'E'.repeat(43)}`, homeRef, projectRef: null, kind: 'document', displayName: 'Tax receipt.pdf', mediaType: 'application/pdf', byteLength: 10, createdAt: '2026-03-01T00:00:00.000Z' },
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
