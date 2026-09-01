import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const indexSource = readFileSync(new URL('../../app/home/[homeId]/work/index.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../../app/home/[homeId]/work/[projectRef].tsx', import.meta.url), 'utf8')
const deckSource = readFileSync(new URL('../components/RoloDeck.tsx', import.meta.url), 'utf8')
const choicesSource = readFileSync(new URL('../components/ProjectChoices.tsx', import.meta.url), 'utf8')

test('Work presents household and exact-current-member assignment filters without guessing from principal refs', () => {
  assert.match(indexSource, /label: 'Household'/)
  assert.match(indexSource, /label: 'Assigned to me'/)
  assert.match(indexSource, /currentHouseholdMembershipRef\(householdMembers\)/)
  assert.match(indexSource, /card\.data\.assignedMembershipRef === currentMembershipRef/)
  assert.doesNotMatch(indexSource, /assignedMembershipRef === .*principalRef/)
})

test('task create and edit surfaces use only assignable household members, due dates, and quick completion', () => {
  assert.match(indexSource, /Who is responsible\?/)
  assert.match(indexSource, /assignableHouseholdMembers/)
  assert.match(indexSource, /assignableMembers\.map/)
  assert.match(indexSource, /label="Due date \(optional\)"/)
  assert.match(indexSource, /onQuickComplete=\{completeTaskCard\}/)
  assert.match(indexSource, /canQuickComplete=\{card => canChangeWork/)
  assert.match(deckSource, /canQuickComplete/)
  assert.match(detailSource, /label=\{completing \? 'Finishing…' : 'Mark complete'\}/)
  assert.match(detailSource, /member\.isCurrentPrincipal \? 'Me' : member\.displayLabel/)
})

test('task detail keeps overview, evidence, and updates while removing project-only planning and bids', () => {
  assert.match(detailSource, /const TASK_DETAIL_TABS = WORK_DETAIL_TABS\.filter/)
  assert.match(detailSource, /tab\.value === 'overview' \|\| tab\.value === 'files' \|\| tab\.value === 'updates'/)
  assert.match(detailSource, /if \(!canChangeWork\) return VIEW_ONLY_DETAIL_TABS/)
  assert.match(detailSource, /work\.workKind === 'task' \? TASK_DETAIL_TABS : WORK_DETAIL_TABS/)
  assert.match(detailSource, /entry\.actorDisplayLabel/)
})

test('view-only household members get read-only work controls and evidence', () => {
  assert.match(indexSource, /canCurrentHouseholdMemberUpdate/)
  assert.match(indexSource, /\{canChangeWork \? \(/)
  assert.match(detailSource, /editing && canChangeWork/)
  assert.ok((detailSource.match(/readOnly=\{!canChangeWork\}/g) ?? []).length >= 2)
  assert.match(detailSource, /if \(!canChangeWork \|\| noteLock\.current/)
  assert.match(choicesSource, /readonly readOnly\?: boolean/)
  assert.match(choicesSource, /if \(readOnly \|\| saveLock\.current/)
  assert.match(choicesSource, /!readOnly && !formOpen/)
  assert.match(choicesSource, /\{!readOnly \? \(/)
})
