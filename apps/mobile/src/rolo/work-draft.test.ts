import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RoloWorkDraft } from '../api/model.ts'
import { workCreateFieldsFromRoloDraft } from './work-draft.ts'

const BASE_DRAFT: RoloWorkDraft = {
  kind: 'issue',
  title: 'Upstairs AC is not cooling',
  category: 'hvac',
  status: 'planned',
  occurredOn: null,
  assignedMembershipRef: null,
  dueOn: null,
  summary: 'Homeowner reported the upstairs AC is not cooling.',
  professionalLabel: null,
  firstUpdate: 'Homeowner-reported location: upstairs hallway unit.',
}

test('current Rolo drafts receive local today and preserve their useful notes', () => {
  for (const status of ['planned', 'in_progress'] as const) {
    const fields = workCreateFieldsFromRoloDraft({ ...BASE_DRAFT, status }, '2026-08-28')
    assert.equal(fields.occurredOn, '2026-08-28')
    assert.equal(fields.summary, BASE_DRAFT.summary)
    assert.deepEqual(fields.initialActivity, {
      kind: 'note',
      body: BASE_DRAFT.firstUpdate,
    })
  }
})

test('historical Rolo drafts never receive an invented date', () => {
  for (const status of ['completed', 'cancelled'] as const) {
    const fields = workCreateFieldsFromRoloDraft({ ...BASE_DRAFT, status }, '2026-08-28')
    assert.equal(Object.hasOwn(fields, 'occurredOn'), false)
  }

  const dated = workCreateFieldsFromRoloDraft({
    ...BASE_DRAFT,
    status: 'completed',
    occurredOn: '2024-05-12',
  }, '2026-08-28')
  assert.equal(dated.occurredOn, '2024-05-12')
})

test('assigned task drafts preserve household assignment and due date without inventing occurredOn', () => {
  const membershipRef = `hmbr_${'M'.repeat(43)}`
  const fields = workCreateFieldsFromRoloDraft({
    ...BASE_DRAFT,
    kind: 'task',
    title: 'Patch the hallway wall',
    assignedMembershipRef: membershipRef,
    dueOn: '2026-08-29',
  }, '2026-08-28')
  assert.equal(Object.hasOwn(fields, 'occurredOn'), false)
  assert.equal(fields.assignedMembershipRef, membershipRef)
  assert.equal(fields.dueOn, '2026-08-29')
})
