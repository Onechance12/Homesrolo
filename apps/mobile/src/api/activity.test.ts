import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProjectActivity } from './activity.ts'

const valid = Object.freeze({
  activityRef: `hact_${'a'.repeat(43)}`,
  homeRef: `hhom_${'b'.repeat(43)}`,
  projectRef: `hprj_${'c'.repeat(43)}`,
  kind: 'note',
  body: 'Contractor visit scheduled for Friday.',
  source: 'homeowner_entry',
  actorDisplayLabel: 'Alex',
  createdAt: '2026-08-27T14:30:00.000Z',
})

test('strictly decodes an exact project activity record', () => {
  assert.deepEqual(parseProjectActivity(valid), valid)
  assert.equal(parseProjectActivity({ ...valid, kind: 'milestone' }).kind, 'milestone')
})

test('rejects malformed, unscoped, or expanded project activity records', () => {
  const malformed: readonly unknown[] = [
    null,
    [],
    { ...valid, extra: 'not in the contract' },
    { ...valid, activityRef: `hprj_${'a'.repeat(43)}` },
    { ...valid, homeRef: `hhom_${'b'.repeat(42)}` },
    { ...valid, projectRef: `hprj_${'c'.repeat(44)}` },
    { ...valid, kind: 'status' },
    { ...valid, body: '' },
    { ...valid, body: ' padded ' },
    { ...valid, body: 'x'.repeat(2_001) },
    { ...valid, source: 'professional_entry' },
    { ...valid, actorDisplayLabel: '' },
    { ...valid, actorDisplayLabel: ' Alex ' },
    { ...valid, actorDisplayLabel: `Alex\u0000` },
    { ...valid, createdAt: '2026-08-27T14:30:00Z' },
    { ...valid, createdAt: '2026-02-30T14:30:00.000Z' },
  ]
  for (const value of malformed) assert.throws(() => parseProjectActivity(value), /invalid_wire_data/)
})
