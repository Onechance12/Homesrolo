import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syntheticPort, BIRCH_REF, COTTAGE_REF } from '../port/synthetic.ts'
import { PORT_IMPLEMENTATION_STATUS, SYNTHETIC_NOTICE } from '../port/types.ts'

/**
 * The mock adapter's behavioural contract. These tests define what Codex's
 * real implementation must also satisfy: session-gated reads, not_found on
 * unknown refs, and results that are values, not exceptions.
 */

test('nothing behind the port claims to be implemented', () => {
  for (const [flag, value] of Object.entries(PORT_IMPLEMENTATION_STATUS)) {
    assert.equal(value, false, `PORT_IMPLEMENTATION_STATUS.${flag} must stay false until the runtime exists`)
  }
  assert.match(SYNTHETIC_NOTICE, /synthetic/i)
  assert.match(SYNTHETIC_NOTICE, /not built/i)
})

test('every read is session-gated and fails closed when signed out', async () => {
  await syntheticPort.signOut()
  const reads = [
    syntheticPort.listHomes(),
    syntheticPort.getHome(BIRCH_REF),
    syntheticPort.listProjects(BIRCH_REF),
    syntheticPort.listDocuments(BIRCH_REF),
    syntheticPort.listWarranties(BIRCH_REF),
    syntheticPort.listTimeline(BIRCH_REF),
    syntheticPort.listMaintenance(BIRCH_REF),
  ] as const
  for (const read of await Promise.all(reads)) {
    assert.equal(read.ok, false, 'a signed-out read must not return data')
    if (!read.ok) assert.equal(read.error, 'not_signed_in')
  }
})

test('the demo journey: sign in, list homes, open one project end to end', async () => {
  const session = await syntheticPort.enterDemoSession('Test homeowner')
  assert.equal(session.isSynthetic, true)
  assert.equal(session.displayName, 'Test homeowner')

  const homes = await syntheticPort.listHomes()
  assert.ok(homes.ok)
  if (!homes.ok) return
  assert.ok(homes.value.length >= 2, 'both fixture homes are listed')
  assert.ok(homes.value.every(h => h.isSynthetic === true))

  const projects = await syntheticPort.listProjects(BIRCH_REF)
  assert.ok(projects.ok)
  if (!projects.ok) return
  assert.ok(projects.value.length >= 3)

  const first = projects.value[0]
  assert.ok(first)
  const project = await syntheticPort.getProject(BIRCH_REF, first.projectRef)
  assert.ok(project.ok)
  if (!project.ok) return
  assert.equal(project.value.isSynthetic, true)
  assert.ok(project.value.contractor.includes('synthetic'),
    'a fixture contractor must name itself synthetic')
})

test('unknown refs are not_found, never fabricated', async () => {
  await syntheticPort.enterDemoSession('Test homeowner')
  const missingHome = await syntheticPort.getHome('hhom_' + 'x'.repeat(43))
  assert.deepEqual(missingHome, { ok: false, error: 'not_found' })
  const missingProject = await syntheticPort.getProject(BIRCH_REF, 'hprj_' + 'x'.repeat(43))
  assert.deepEqual(missingProject, { ok: false, error: 'not_found' })
  const wrongHomeLists = await syntheticPort.listDocuments('hhom_' + 'y'.repeat(43))
  assert.deepEqual(wrongHomeLists, { ok: false, error: 'not_found' })
})

test('a created home and project exist in memory and feed the timeline', async () => {
  await syntheticPort.enterDemoSession('Test homeowner')
  const created = await syntheticPort.createHome({
    alias: 'Test Bungalow', locality: 'Sample Metro — West', homeType: 'house', yearBuilt: 1975,
  })
  assert.ok(created.ok)
  if (!created.ok) return

  const added = await syntheticPort.addProject(created.value.homeRef, {
    title: 'Water heater replacement', trade: 'Plumbing',
    performedOn: '2026-08-05', contractor: 'Test Plumbing Co', summary: '50-gallon replacement.',
  })
  assert.ok(added.ok)
  if (!added.ok) return
  assert.equal(added.value.status, 'completed')

  const timeline = await syntheticPort.listTimeline(created.value.homeRef)
  assert.ok(timeline.ok)
  if (!timeline.ok) return
  assert.ok(timeline.value.some(entry => entry.title === 'Water heater replacement'),
    'a recorded project must appear on the home timeline')

  const project = await syntheticPort.getProject(created.value.homeRef, added.value.projectRef)
  assert.ok(project.ok)
  if (!project.ok) return
  assert.ok(project.value.contractor.includes('(synthetic)'),
    'even user-entered contractors are stamped synthetic in the demo')
})

test('the empty fixture home renders the empty states, not errors', async () => {
  await syntheticPort.enterDemoSession('Test homeowner')
  const projects = await syntheticPort.listProjects(COTTAGE_REF)
  assert.ok(projects.ok && projects.value.length === 0)
  const documents = await syntheticPort.listDocuments(COTTAGE_REF)
  assert.ok(documents.ok && documents.value.length === 0)
  const warranties = await syntheticPort.listWarranties(COTTAGE_REF)
  assert.ok(warranties.ok && warranties.value.length === 0)
  const timeline = await syntheticPort.listTimeline(COTTAGE_REF)
  assert.ok(timeline.ok && timeline.value.length === 1, 'only the file-opened entry')
})

test('minted refs use the runtime boundary vocabulary', async () => {
  const session = await syntheticPort.enterDemoSession('Prefix check')
  assert.match(session.principalRef, /^hprn_[A-Za-z0-9_-]{43}$/,
    'sessions carry principal refs in the homeowner-runtime.v1 shape')

  const home = await syntheticPort.createHome({
    alias: 'Prefix House', locality: 'Sample Metro', homeType: 'house', yearBuilt: null,
  })
  assert.ok(home.ok)
  if (!home.ok) return
  assert.match(home.value.homeRef, /^hhom_[A-Za-z0-9_-]{43}$/)

  const project = await syntheticPort.addProject(home.value.homeRef, {
    title: 'Prefix project', trade: 'General', performedOn: '2026-08-01',
    contractor: 'Prefix Co', summary: 'Prefix check.',
  })
  assert.ok(project.ok)
  if (!project.ok) return
  assert.match(project.value.projectRef, /^hprj_[A-Za-z0-9_-]{43}$/,
    'projects mint hprj_ to match homeownerProjectSchema, never hwrk_')
  assert.equal(project.value.status, 'completed',
    'a demo-recorded past project lands as the runtime status "completed"')
})

test('signing out ends the session', async () => {
  await syntheticPort.enterDemoSession('Test homeowner')
  await syntheticPort.signOut()
  const session = await syntheticPort.getSession()
  assert.equal(session.kind, 'signed_out')
})
