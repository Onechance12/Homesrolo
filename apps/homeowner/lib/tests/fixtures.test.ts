import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FIXTURE_HOMES, FIXTURE_HOME_DOCUMENTS, FIXTURE_MAINTENANCE, FIXTURE_PROJECTS,
  FIXTURE_WARRANTIES, BIRCH_REF, allDocuments, timelineFor,
} from '../fixtures/homes.ts'

/** Fixture integrity: the demo data must obey the same honesty rules as code. */

test('every fixture is marked synthetic', () => {
  const everything = [
    ...FIXTURE_HOMES, ...FIXTURE_PROJECTS, ...FIXTURE_HOME_DOCUMENTS,
    ...FIXTURE_WARRANTIES, ...FIXTURE_MAINTENANCE,
    ...FIXTURE_PROJECTS.flatMap(p => [...p.photos, ...p.documents]),
  ]
  for (const record of everything) {
    assert.equal(record.isSynthetic, true, 'every fixture record must carry isSynthetic: true')
  }
})

test('no fixture carries a postal address or a real-looking company', () => {
  const text = JSON.stringify([FIXTURE_HOMES, FIXTURE_PROJECTS, FIXTURE_HOME_DOCUMENTS])
  // Street-address shapes: "123 Main St" etc.
  assert.doesNotMatch(text, /\d{2,5}\s+[A-Z][a-z]+\s+(Street|St\.|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct)\b/,
    'a home file fixture must never contain an address shape')
  for (const project of FIXTURE_PROJECTS) {
    assert.match(project.contractor, /synthetic/i, `${project.title} contractor must be marked synthetic`)
  }
})

test('fixture dates are real calendar dates, and timelines are ordered', () => {
  const isReal = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  for (const project of FIXTURE_PROJECTS) {
    assert.ok(isReal(project.performedOn), `${project.title} performedOn`)
    for (const photo of project.photos) assert.ok(isReal(photo.takenOn), photo.caption)
  }
  for (const warranty of FIXTURE_WARRANTIES) {
    assert.ok(isReal(warranty.startsOn) && isReal(warranty.endsOn))
    assert.ok(warranty.startsOn < warranty.endsOn, 'coverage must end after it starts')
  }
  const timeline = timelineFor(BIRCH_REF)
  const dates = timeline.map(entry => entry.on)
  assert.deepEqual(dates, [...dates].sort().reverse(), 'timeline is newest first')
})

test('documents sort newest first and count both project and home papers', () => {
  const documents = allDocuments()
  assert.ok(documents.length >= 5)
  const dates = documents.map(d => d.addedOn)
  assert.deepEqual(dates, [...dates].sort().reverse())
  assert.ok(documents.some(d => d.projectRef === null), 'home-level documents exist')
  assert.ok(documents.some(d => d.projectRef !== null), 'project documents exist')
})

test('every timeline link stays inside the app', () => {
  for (const entry of timelineFor(BIRCH_REF)) {
    if (entry.href === null) continue
    assert.match(entry.href, /^\/home\//, `timeline href must be app-internal: ${entry.href}`)
  }
})
