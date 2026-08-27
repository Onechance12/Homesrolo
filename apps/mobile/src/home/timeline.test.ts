import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { ArtifactRecord, HomeCheckupPhoto, WorkRecord } from '../api/model.ts'
import {
  homeTimelineCounts,
  homeTimelineEntries,
  homeTimelinePage,
} from './timeline.ts'

const REF = (prefix: 'hhom' | 'hprj' | 'hart' | 'hpho', fill: string) =>
  `${prefix}_${fill.repeat(43)}`
const HOME = REF('hhom', 'h')
const WORK = REF('hprj', 'w')

const work: readonly WorkRecord[] = [{
  projectRef: WORK,
  homeRef: HOME,
  title: 'Replace upstairs air conditioner',
  workKind: 'project',
  category: 'hvac',
  status: 'completed',
  occurredOn: '2025-06-14',
  summary: '',
  professionalLabel: 'Northwind Heating',
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2025-06-15T12:00:00.000Z',
  updatedAt: '2025-06-15T12:00:00.000Z',
}, {
  projectRef: REF('hprj', 'a'),
  homeRef: HOME,
  title: 'Old archived idea',
  workKind: 'project',
  category: 'other',
  status: 'cancelled',
  occurredOn: null,
  summary: '',
  professionalLabel: null,
  revision: 2,
  archived: true,
  archivedAt: '2026-01-01T12:00:00.000Z',
  createdAt: '2025-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
}, {
  projectRef: REF('hprj', 'u'),
  homeRef: HOME,
  title: 'Undated plumbing note',
  workKind: 'issue',
  category: 'plumbing',
  status: 'planned',
  occurredOn: null,
  summary: '',
  professionalLabel: null,
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
}]

const artifacts: readonly ArtifactRecord[] = [{
  artifactRef: REF('hart', 'p'), homeRef: HOME, projectRef: WORK, kind: 'photo',
  displayName: 'Completed system.jpg', mediaType: 'image/jpeg', byteLength: 12,
  createdAt: '2025-06-16T12:00:00.000Z',
}, {
  artifactRef: REF('hart', 'd'), homeRef: HOME, projectRef: null, kind: 'warranty',
  displayName: 'Manufacturer warranty.pdf', mediaType: 'application/pdf', byteLength: 42,
  createdAt: '2024-03-02T12:00:00.000Z',
}]

const checkups: readonly HomeCheckupPhoto[] = [{
  photoRef: REF('hpho', 'c'), homeRef: HOME, observedOn: '2026-08-20',
  area: 'roofline', viewLabel: 'Garage roofline', caption: 'Same view after the storm',
  fullUrl: '/private/full', thumbnailUrl: '/private/thumb', width: 1600, height: 1200,
  createdAt: '2026-08-21T12:00:00.000Z',
}]

test('timeline is a deterministic projection over existing work, uploads, and Home Watch', () => {
  const entries = homeTimelineEntries(work, artifacts, checkups)

  assert.deepEqual(entries.map(entry => entry.title), [
    'Garage roofline',
    'Completed system.jpg',
    'Replace upstairs air conditioner',
    'Manufacturer warranty.pdf',
    'Undated plumbing note',
  ])
  assert.equal(entries.some(entry => entry.title === 'Old archived idea'), false)
  assert.deepEqual(entries[0]?.destination, { kind: 'home_watch' })
  assert.deepEqual(entries[1]?.destination, { kind: 'work', projectRef: WORK })
  assert.deepEqual(entries[3]?.destination, { kind: 'library' })
  assert.equal(entries[4]?.date, null, 'unknown work dates stay honest instead of using save time')
  assert.deepEqual(homeTimelineCounts(entries), { all: 5, work: 2, photos: 2, files: 1 })
})

test('filtering and Show more paging stay bounded without disturbing chronological order', () => {
  const entries = homeTimelineEntries(work, artifacts, checkups)
  const firstPage = homeTimelinePage(entries, 'all', 3)
  assert.deepEqual(firstPage.entries.map(entry => entry.title), [
    'Garage roofline', 'Completed system.jpg', 'Replace upstairs air conditioner',
  ])
  assert.deepEqual(firstPage.groups.map(group => group.label), ['2026', '2025'])
  assert.equal(firstPage.total, 5)
  assert.equal(firstPage.remaining, 2)

  const photosOnly = homeTimelinePage(entries, 'photos', 20)
  assert.deepEqual(photosOnly.entries.map(entry => entry.kind), ['photos', 'photos'])
  assert.equal(photosOnly.remaining, 0)
  assert.deepEqual(homeTimelinePage(entries, 'all', -10).entries, [])
})

test('the Expo screen reuses exact-home sources and keeps optional Home Watch capability-gated', () => {
  const screen = readFileSync(
    new URL('../../app/home/[homeId]/timeline.tsx', import.meta.url),
    'utf8',
  )
  assert.match(screen, /api\.listWork\(homeId\)/)
  assert.match(screen, /api\.listArtifacts\(homeId\)/)
  assert.match(screen, /checkupsEnabled[\s\S]*api\.listHomeCheckups\(homeId\)/)
  assert.doesNotMatch(screen, /listTimeline|createTimeline|saveTimeline/,
    'timeline must remain a projection instead of copied persistence')
  assert.match(screen, /const PAGE_SIZE = 18[\s\S]*homeTimelinePage\(entries, filter, limit\)/)
  assert.match(screen, /label={`Show \$\{Math\.min\(PAGE_SIZE, page\.remaining\)\} more`}/)
  assert.match(screen, /router\.replace\(\{ pathname: '\/home\/\[homeId\]\/care'/,
    'back and library navigation must return deterministically to the Home tab')
  assert.match(screen, /accessibilityRole="link"/)
})
