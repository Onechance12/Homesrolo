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
  const reply = await first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'My AC is not cooling', [])
  const proposed = reply.proposedWork

  assert.equal(proposed?.category, 'hvac')
  assert.match(reply.disclosure, /no network request/)
  assert.ok(proposed)
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
