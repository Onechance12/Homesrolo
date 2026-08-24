import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeRecordProgress } from '../home-record-progress.ts'
import {
  FIXTURE_HOMES,
  allDocuments,
  projectSummaries,
} from '../fixtures/homes.ts'

test('record progress is derived from saved evidence and exposes every reason', () => {
  const progress = buildHomeRecordProgress({
    home: { ...FIXTURE_HOMES[0]!, source: 'synthetic' },
    projects: projectSummaries(),
    documents: allDocuments(),
    checkups: [],
    uploadsEnabled: true,
    checkupsEnabled: false,
  })

  assert.equal(progress.totalSteps, 12)
  assert.equal(progress.documentedSteps, 10)
  assert.deepEqual(progress.counts, {
    projects: 3,
    completedProjects: 2,
    plannedProjects: 0,
    files: 8,
    warranties: 1,
    projectPhotos: 5,
    checkups: 0,
    representedAreas: 3,
  })
  assert.deepEqual(
    progress.tracks.find(track => track.id === 'protect')?.evidence,
    ['A home file is saved', 'A warranty is saved', 'Photo evidence is saved'],
  )
  assert.equal(progress.cards.find(card => card.id === 'projects')?.detail, '2 completed · 1 active')
  assert.equal(progress.missions.length, 3)
  assert.ok(progress.milestones.find(item => item.id === 'whole-home-story')?.earned)
  assert.equal(progress.chapters.length, 6)
})

test('an empty record offers only feasible, bounded next actions', () => {
  const home = { ...FIXTURE_HOMES[1]!, source: 'synthetic' as const }
  const progress = buildHomeRecordProgress({
    home,
    projects: [],
    documents: null,
    checkups: null,
    uploadsEnabled: false,
    checkupsEnabled: false,
  })

  assert.equal(progress.missions.length, 3)
  assert.equal(progress.missions[0]?.label, 'Add one thing your home should remember')
  assert.ok(progress.missions.every(mission => mission.href === `/home/${home.homeRef}/projects`))
  assert.ok(progress.missions.every(mission => !/file|photo/i.test(mission.label)))
  assert.equal(progress.cards.find(card => card.id === 'files')?.metric, '0')
  assert.deepEqual(
    progress.milestones.filter(milestone => milestone.earned).map(milestone => milestone.id),
    ['record-started'],
  )
})

test('progress never rewards cancelled work as active or complete', () => {
  const project = projectSummaries()[0]!
  const progress = buildHomeRecordProgress({
    home: { ...FIXTURE_HOMES[0]!, source: 'synthetic' },
    projects: [{ ...project, status: 'cancelled' }],
    documents: [],
    checkups: [],
    uploadsEnabled: true,
    checkupsEnabled: false,
  })

  assert.equal(progress.counts.completedProjects, 0)
  assert.equal(progress.cards.find(card => card.id === 'projects')?.detail, '0 completed · 0 active')
  assert.equal(progress.milestones.find(item => item.id === 'project-remembered')?.earned, false)
})
