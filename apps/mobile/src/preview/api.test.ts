import assert from 'node:assert/strict'
import test from 'node:test'
import { PreviewHomesroloApi, PREVIEW_PRIMARY_HOME_REF } from './api.ts'

test('serves representative homes, work, people sources, and artifacts entirely in memory', async () => {
  const api = new PreviewHomesroloApi()
  const homes = await api.listHomes()
  const work = await api.listWork(PREVIEW_PRIMARY_HOME_REF)
  const artifacts = await api.listArtifacts(PREVIEW_PRIMARY_HOME_REF)

  assert.equal(homes.length, 2)
  assert.ok(work.some(item => item.status === 'planned'))
  assert.ok(work.some(item => item.status === 'in_progress'))
  assert.ok(work.filter(item => item.professionalLabel).length >= 4)
  assert.ok(new Set(work.map(item => item.category)).size >= 4)
  assert.ok(artifacts.some(item => item.kind === 'photo'))
  assert.ok(artifacts.some(item => item.kind === 'document'))
  assert.ok(artifacts.some(item => item.kind === 'warranty'))
})

test('keeps preview Rolo and writes deterministic and isolated', async () => {
  const first = new PreviewHomesroloApi()
  const second = new PreviewHomesroloApi()
  const before = (await first.listWork(PREVIEW_PRIMARY_HOME_REF)).length
  const reply = await first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'My AC is not cooling', [], {
    pendingWork: null,
    unansweredFollowUpQuestion: null,
  })
  const proposed = reply.proposedWork

  assert.equal(proposed?.category, 'hvac')
  assert.match(reply.disclosure, /no network request/)
  assert.ok(proposed)
  const continued = await first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'The upstairs unit.', [
    { role: 'user', text: 'My AC is not cooling' },
    { role: 'assistant', text: reply.answer },
  ], {
    pendingWork: proposed,
    unansweredFollowUpQuestion: reply.followUpQuestions[0] ?? null,
  })
  assert.equal(continued.proposedWork?.title, proposed.title)
  assert.match(continued.proposedWork?.summary ?? '', /Follow-up: The upstairs unit\./)
  assert.deepEqual(continued.followUpQuestions, [])
  await first.createWork(PREVIEW_PRIMARY_HOME_REF, {
    commandRef: await first.newCommandRef(),
    title: proposed.title,
    workKind: proposed.kind,
    category: proposed.category,
    status: proposed.status,
  })
  assert.equal((await first.listWork(PREVIEW_PRIMARY_HOME_REF)).length, before + 1)
  assert.equal((await second.listWork(PREVIEW_PRIMARY_HOME_REF)).length, before)
})

test('cannot perform an upload', async () => {
  const api = new PreviewHomesroloApi()
  await assert.rejects(
    api.uploadArtifact(PREVIEW_PRIMARY_HOME_REF, 'photo', {
      uri: 'file:///preview.jpg',
      name: 'preview.jpg',
      mediaType: 'image/jpeg',
      byteLength: 12,
      lifecycle: 'external-source',
    }),
    /preview_upload_disabled/,
  )
})

test('reviews one saved preview photo deterministically without transport or upload', async () => {
  const first = new PreviewHomesroloApi()
  const second = new PreviewHomesroloApi()
  const photo = (await first.listArtifacts(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.kind === 'photo')
  assert.ok(photo)
  const selection = {
    source: 'artifact' as const,
    artifactRef: photo.artifactRef,
    consentToAnalyze: true as const,
  }
  const state = { pendingWork: null, unansweredFollowUpQuestion: null }
  const firstReply = await first.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, selection,
  )
  const secondReply = await second.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, selection,
  )

  assert.deepEqual(firstReply.photoReview, secondReply.photoReview)
  assert.equal(firstReply.photoReview?.hazardSignal, 'none')
  assert.equal(firstReply.photoReview?.urgency, 'routine')
  assert.match(firstReply.disclosure, /no network request/)
  const refusal = await first.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'Decide my insurance coverage.', [], state, selection,
  )
  assert.equal(refusal.photoReview, null)
  assert.equal(refusal.proposedWork, null)
  assert.match(refusal.answer, /did not open the attached photo/i)
  await assert.rejects(
    first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'Review this.', [], state, {
      ...selection,
      artifactRef: `hart_${'x'.repeat(43)}`,
    }),
    /preview_artifact_not_found/,
  )
})
