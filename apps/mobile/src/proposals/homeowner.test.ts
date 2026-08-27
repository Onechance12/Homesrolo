import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArtifactRecord, ProjectQuote, WorkRecord } from '../api/model.ts'
import {
  GENERAL_SCOPE_ROWS,
  emptyScopeDraft,
  homeownerEnteredQuotes,
  isCalendarDate,
  projectPdfArtifacts,
  proposalRequestText,
  reviewedScopeCount,
  ROOF_SCOPE_ROWS,
  scopeDraftForQuote,
  scopeFromDraft,
  scopeOutsideRows,
  scopeRowsFor,
} from './homeowner.ts'

const ref = (prefix: string, fill: string) => `${prefix}_${fill.repeat(43)}`
const HOME = ref('hhom', 'H')
const PROJECT = ref('hprj', 'P')

const work: WorkRecord = {
  projectRef: PROJECT,
  homeRef: HOME,
  title: 'Build a backyard pool',
  workKind: 'project',
  category: 'pool',
  status: 'planned',
  occurredOn: null,
  summary: 'A simple pool with room for a shallow play area.',
  professionalLabel: null,
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
}

const artifact = (
  fill: string,
  kind: ArtifactRecord['kind'],
  mediaType: ArtifactRecord['mediaType'],
  projectRef: string | null = PROJECT,
): ArtifactRecord => ({
  artifactRef: ref('hart', fill),
  homeRef: HOME,
  projectRef,
  kind,
  displayName: `${fill}.pdf`,
  mediaType,
  byteLength: 200,
  createdAt: '2026-08-27T10:00:00.000Z',
})

const entered: ProjectQuote = {
  quoteRef: ref('hquo', 'Q'),
  homeRef: HOME,
  projectRef: PROJECT,
  contractorLabel: 'Outside Pool Company',
  proposalDate: '2026-08-20',
  artifactRef: ref('hart', 'A'),
  scope: {
    project_scope: { status: 'included', detail: 'Excavation and pool shell.' },
    decking: { status: 'allowance', detail: 'Preserved after category correction.' },
  },
  notes: 'Saved from a proposal received by email.',
  source: 'homeowner_entry',
  professionalOrganizationRef: null,
  invitationRef: null,
  totalAmountCents: null,
  currencyCode: null,
  professionalSummary: '',
  proposalState: null,
  homeownerDecision: 'undecided',
  decisionRevision: null,
  revision: 1,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
}

test('uses whole-home scope rows except for the roof-specific comparison', () => {
  assert.equal(scopeRowsFor('roofing'), ROOF_SCOPE_ROWS)
  assert.equal(scopeRowsFor('pool'), GENERAL_SCOPE_ROWS)
  assert.equal(ROOF_SCOPE_ROWS.length, 18)
  assert.equal(GENERAL_SCOPE_ROWS.length, 15)
})

test('builds a strict scope and preserves rows hidden by a later category change', () => {
  const rows = GENERAL_SCOPE_ROWS
  const draft = scopeDraftForQuote(entered, rows)
  assert.deepEqual(draft.project_scope, {
    status: 'included', detail: 'Excavation and pool shell.',
  })
  const hidden = scopeOutsideRows(entered, rows)
  assert.deepEqual(hidden, {
    decking: { status: 'allowance', detail: 'Preserved after category correction.' },
  })
  const changed = {
    ...draft,
    project_scope: { status: 'included' as const, detail: '  Pool shell and plumbing.  ' },
    schedule: { status: 'not_stated' as const, detail: ' ' },
  }
  assert.deepEqual(scopeFromDraft(changed, rows, hidden), {
    decking: { status: 'allowance', detail: 'Preserved after category correction.' },
    project_scope: { status: 'included', detail: 'Pool shell and plumbing.' },
    schedule: { status: 'not_stated' },
  })
  assert.equal(scopeFromDraft({
    ...emptyScopeDraft(rows),
    project_scope: { status: 'included', detail: 'x'.repeat(161) },
  }, rows), null)
})

test('validates real proposal calendar dates', () => {
  assert.equal(isCalendarDate('2026-08-27'), true)
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('08/27/2026'), false)
})

test('links only PDFs already attached to this exact work record', () => {
  const pdf = artifact('A', 'document', 'application/pdf')
  const otherProject = artifact('B', 'document', 'application/pdf', ref('hprj', 'O'))
  const photo = artifact('C', 'photo', 'image/jpeg')
  assert.deepEqual(projectPdfArtifacts([pdf, otherProject, photo], PROJECT), [pdf])
})

test('shares a private, address-free project request and never implies files are attached', () => {
  const request = proposalRequestText(work, [
    artifact('A', 'photo', 'image/jpeg'),
    artifact('B', 'document', 'application/pdf'),
  ])
  assert.match(request, /Build a backyard pool/)
  assert.match(request, /1 private photo is organized/)
  assert.match(request, /Nothing is attached/)
  assert.match(request, /does not grant access/)
  assert.doesNotMatch(request, /123 Main|homeRef|artifactRef/)
})

test('keeps homeowner-entered records separate from company submissions', () => {
  const professional: ProjectQuote = {
    ...entered,
    quoteRef: ref('hquo', 'R'),
    source: 'professional_submission',
    professionalOrganizationRef: ref('horg', 'O'),
    invitationRef: ref('hinv', 'I'),
    totalAmountCents: 250_000,
    currencyCode: 'USD',
    professionalSummary: 'Submitted scope.',
    proposalState: 'submitted',
    decisionRevision: 1,
  }
  assert.deepEqual(homeownerEnteredQuotes([professional, entered]), [entered])
  assert.equal(reviewedScopeCount(entered.scope), 2)
})
