import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const component = readFileSync(
  new URL('../components/ProjectOutsideProposalWorkspace.tsx', import.meta.url),
  'utf8',
)
const professionalWorkspace = readFileSync(
  new URL('../components/ProjectProfessionalWorkspace.tsx', import.meta.url),
  'utf8',
)
const workDetail = readFileSync(
  new URL('../../app/home/[homeId]/work/[projectRef].tsx', import.meta.url),
  'utf8',
)

test('outside proposal UI keeps sharing explicit and homeowner-controlled', () => {
  assert.match(component, /Share\.share/)
  assert.match(component, /No photo, file, address, or home access was attached/)
  assert.match(component, /Nothing from your private Home Record is attached/)
  assert.doesNotMatch(component, /navigator\.clipboard|Jobrolo/)
})

test('outside proposal UI calls the existing manual quote contract without replacing pro submissions', () => {
  assert.match(component, /api\.createProjectQuote/)
  assert.match(component, /api\.saveProjectQuote/)
  assert.match(component, /homeownerEnteredQuotes/)
  assert.match(component, /Company-submitted proposals stay in the private invitation comparison/)
  assert.match(professionalWorkspace, /quote\.source === 'professional_submission'/)
  assert.match(professionalWorkspace, /submittedQuotes\.map/)
  assert.doesNotMatch(component, /totalAmountCents|priceScore|recommended proposal|best price/i)
})

test('outside proposal controls are accessible and phone-sized', () => {
  assert.match(component, /accessibilityRole="radio"/)
  assert.match(component, /accessibilityState=\{\{ checked: selected \}\}/)
  assert.match(component, /accessibilityState=\{\{ expanded \}\}/)
  assert.match(component, /minHeight: 52/)
  assert.match(component, /minHeight: 54/)
})

test('saving a visit preserves the calendar handoff while updating the visible timeline', () => {
  assert.match(component, /const created = await api\.addWorkMilestone/)
  assert.match(component, /onVisitSaved\?\.\(created\)/)
  assert.match(workDetail, /onVisitSaved=\{created => setActivity/)
  assert.doesNotMatch(workDetail, /onVisitSaved=\{onReload\}/)
})
