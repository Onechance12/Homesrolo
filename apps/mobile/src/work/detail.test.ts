import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkRecord } from '../api/model.ts'
import {
  WORK_KINDS,
  draftFromWork,
  fieldsFromDraft,
  findExactWork,
  workHasChanges,
  validOptionalWorkDate,
  workNoteIntent,
  workUpdateIntent,
} from './detail.ts'

const ref = (prefix: 'hhom' | 'hprj', fill: string) => `${prefix}_${fill.repeat(43)}`

function record(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    projectRef: ref('hprj', 'p'),
    homeRef: ref('hhom', 'h'),
    title: 'Heat-pump service',
    workKind: 'service',
    category: 'hvac',
    status: 'completed',
    occurredOn: '2026-08-20',
    assignedMembershipRef: null,
    dueOn: null,
    summary: 'Seasonal service completed.',
    professionalLabel: 'Comfort Co.',
    revision: 3,
    archived: false,
    archivedAt: null,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  }
}

test('finds only the exact work record within the requested home', () => {
  const projectRef = ref('hprj', 'p')
  const otherHome = record({ homeRef: ref('hhom', 'x') })
  const exact = record()
  assert.equal(findExactWork([otherHome, exact], exact.homeRef, projectRef), exact)
  assert.equal(findExactWork([exact], exact.homeRef, `${projectRef}extra`), null)
  assert.equal(findExactWork([exact], ref('hhom', 'z'), projectRef), null)
})

test('keeps every supported work kind in the native editor', () => {
  assert.deepEqual(WORK_KINDS, ['project', 'issue', 'repair', 'service', 'incident', 'task'])
})

test('normalizes editable text and represents cleared optional fields as null', () => {
  const work = record()
  const draft = {
    ...draftFromWork(work),
    title: '  Heat-pump tune-up  ',
    occurredOn: ' ',
    summary: '  ',
    professionalLabel: '  New Comfort Co. ',
  }
  assert.deepEqual(fieldsFromDraft(draft), {
    title: 'Heat-pump tune-up',
    workKind: 'service',
    category: 'hvac',
    status: 'completed',
    occurredOn: null,
    assignedMembershipRef: null,
    dueOn: null,
    summary: null,
    professionalLabel: 'New Comfort Co.',
  })
  assert.equal(workHasChanges(work, draft), true)
  assert.equal(workHasChanges(work, draftFromWork(work)), false)
})

test('round-trips exact-home assignment and due date through an editable task draft', () => {
  const assignedMembershipRef = `hmbr_${'m'.repeat(43)}`
  const task = record({
    workKind: 'task',
    status: 'planned',
    assignedMembershipRef,
    dueOn: '2026-09-05',
  })
  const draft = draftFromWork(task)
  assert.equal(draft.assignedMembershipRef, assignedMembershipRef)
  assert.equal(draft.dueOn, '2026-09-05')
  assert.deepEqual(fieldsFromDraft(draft), {
    title: task.title,
    workKind: 'task',
    category: 'hvac',
    status: 'planned',
    occurredOn: '2026-08-20',
    assignedMembershipRef,
    dueOn: '2026-09-05',
    summary: task.summary,
    professionalLabel: task.professionalLabel,
  })
  assert.equal(workHasChanges(task, draft), false)
  assert.equal(workHasChanges(task, { ...draft, dueOn: '2026-09-06' }), true)
})

test('accepts blank or real work dates and rejects impossible calendar dates', () => {
  assert.equal(validOptionalWorkDate(''), true)
  assert.equal(validOptionalWorkDate('  '), true)
  assert.equal(validOptionalWorkDate('2026-08-27'), true)
  assert.equal(validOptionalWorkDate('2026-02-30'), false)
  assert.equal(validOptionalWorkDate('08/27/2026'), false)
})

test('retry intents stay stable and include the optimistic revision', () => {
  const work = record()
  const fields = fieldsFromDraft(draftFromWork(work))
  assert.equal(
    workUpdateIntent(work.projectRef, work.revision, fields),
    workUpdateIntent(work.projectRef, work.revision, { ...fields }),
  )
  assert.notEqual(
    workUpdateIntent(work.projectRef, work.revision, fields),
    workUpdateIntent(work.projectRef, work.revision + 1, fields),
  )
  assert.equal(
    workNoteIntent(work.projectRef, '  Filter replaced.  '),
    workNoteIntent(work.projectRef, 'Filter replaced.'),
  )
})
