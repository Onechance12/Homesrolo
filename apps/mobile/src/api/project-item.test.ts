import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROJECT_ITEM_KIND_LABELS,
  PROJECT_ITEM_STATE_LABELS,
  parseProjectItem,
  projectItemBody,
  projectItemIntent,
} from './project-item.ts'

const homeRef = `hhom_${'a'.repeat(43)}`
const projectRef = `hprj_${'b'.repeat(43)}`
const itemRef = `hpit_${'c'.repeat(43)}`
const commandRef = `hcmd_${'d'.repeat(43)}`

const valid = Object.freeze({
  itemRef,
  homeRef,
  projectRef,
  kind: 'material',
  label: 'GAF Timberline HDZ · Charcoal',
  detail: 'Compare the actual sample outside before choosing.',
  state: 'considering',
  source: 'homeowner_entry',
  revision: 2,
  createdAt: '2026-08-26T14:30:00.000Z',
  updatedAt: '2026-08-27T14:30:00.000Z',
} as const)

test('strictly decodes the existing project item projection', () => {
  assert.deepEqual(parseProjectItem(valid), valid)
  assert.equal(parseProjectItem({ ...valid, kind: 'decision', state: 'chosen' }).kind, 'decision')
  assert.equal(parseProjectItem({ ...valid, detail: '' }).detail, '')
  assert.deepEqual(PROJECT_ITEM_KIND_LABELS, {
    material: 'Product or material', decision: 'Decision', wishlist: 'Wish list',
  })
  assert.equal(PROJECT_ITEM_STATE_LABELS.declined, 'Not using')
})

test('rejects expanded, malformed, cross-type, and noncanonical project items', () => {
  const malformed: readonly unknown[] = [
    null,
    [],
    { ...valid, extra: true },
    { ...valid, itemRef: `hart_${'c'.repeat(43)}` },
    { ...valid, homeRef: `hprj_${'a'.repeat(43)}` },
    { ...valid, projectRef: `hhom_${'b'.repeat(43)}` },
    { ...valid, kind: 'product' },
    { ...valid, state: 'selected' },
    { ...valid, label: '' },
    { ...valid, label: ' padded ' },
    { ...valid, label: 'x'.repeat(161) },
    { ...valid, detail: ' padded ' },
    { ...valid, detail: 'x'.repeat(2_001) },
    { ...valid, source: 'professional_entry' },
    { ...valid, revision: 0 },
    { ...valid, createdAt: '2026-08-26T14:30:00Z' },
    { ...valid, updatedAt: '2026-02-30T14:30:00.000Z' },
    { ...valid, updatedAt: '2026-08-25T14:30:00.000Z' },
  ]
  for (const value of malformed) assert.throws(() => parseProjectItem(value), /invalid_wire_data/)
})

test('builds only exact create and revision-save commands', () => {
  assert.deepEqual(projectItemBody({
    commandRef,
    kind: 'wishlist',
    label: '  Pool finish sample  ',
    detail: '  See sample in daylight.  ',
    state: 'considering',
  }), {
    commandRef,
    kind: 'wishlist',
    label: 'Pool finish sample',
    detail: 'See sample in daylight.',
    state: 'considering',
  })
  assert.deepEqual(projectItemBody({
    commandRef,
    itemRef,
    expectedRevision: 2,
    kind: 'decision',
    label: 'Channel drain at the back step',
    state: 'chosen',
  }), {
    commandRef,
    itemRef,
    expectedRevision: 2,
    kind: 'decision',
    label: 'Channel drain at the back step',
    state: 'chosen',
  })
  assert.equal(projectItemBody({
    commandRef, itemRef, kind: 'decision', label: 'Missing revision', state: 'chosen',
  }), null)
  assert.equal(projectItemBody({
    commandRef, expectedRevision: 2, kind: 'decision', label: 'Missing ref', state: 'chosen',
  }), null)
  assert.equal(projectItemBody({
    commandRef, kind: 'material', label: 'A', detail: '   ', state: 'considering',
  }), null)
  assert.equal(projectItemBody({
    commandRef: 'hcmd_short', kind: 'material', label: 'A', state: 'considering',
  }), null)
})

test('makes a stable retry intent without carrying the command ref', () => {
  const first = projectItemIntent(projectRef, {
    kind: 'material', label: '  White oak flooring  ', detail: '  5 inch plank  ', state: 'chosen',
  })
  const second = projectItemIntent(projectRef, {
    kind: 'material', label: 'White oak flooring', detail: '5 inch plank', state: 'chosen',
  })
  assert.equal(first, second)
  assert.doesNotMatch(first, /hcmd_/)
  assert.notEqual(first, projectItemIntent(projectRef, {
    kind: 'material', label: 'White oak flooring', detail: '5 inch plank', state: 'purchased',
  }))
})
