import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProjectQuote } from './model.ts'
import {
  homeownerProjectQuoteBody,
  projectQuoteCommandIntent,
  projectQuoteMatchesBody,
} from './homeowner-quote.ts'

const ref = (prefix: string, fill: string) => `${prefix}_${fill.repeat(43)}`
const input = {
  commandRef: ref('hcmd', 'C'),
  contractorLabel: '  Outside Company  ',
  proposalDate: '2026-08-27',
  artifactRef: ref('hart', 'A'),
  scope: {
    project_scope: { status: 'included' as const, detail: 'Written scope.' },
    exclusions: { status: 'not_stated' as const },
  },
  notes: '  Received by email.  ',
}

test('normalizes the existing strict homeowner quote request body', () => {
  assert.deepEqual(homeownerProjectQuoteBody(input), {
    ...input,
    contractorLabel: 'Outside Company',
    notes: 'Received by email.',
  })
  assert.deepEqual(homeownerProjectQuoteBody({ ...input, expectedRevision: 2 }), {
    ...input,
    contractorLabel: 'Outside Company',
    notes: 'Received by email.',
    expectedRevision: 2,
  })
})

test('rejects fake dates, foreign refs, noncanonical scope, and weak revisions', () => {
  assert.equal(homeownerProjectQuoteBody({ ...input, proposalDate: '2026-02-29' }), null)
  assert.equal(homeownerProjectQuoteBody({ ...input, artifactRef: ref('hhom', 'A') }), null)
  assert.equal(homeownerProjectQuoteBody({
    ...input, scope: { project_scope: { status: 'included', detail: ' padded ' } },
  }), null)
  assert.equal(homeownerProjectQuoteBody({ ...input, expectedRevision: 0 }), null)
  assert.equal(homeownerProjectQuoteBody({ ...input, notes: 'x'.repeat(501) }), null)
})

test('binds responses and idempotent command intent to the exact private record', () => {
  const body = homeownerProjectQuoteBody(input)
  assert.ok(body)
  const quote: ProjectQuote = {
    quoteRef: ref('hquo', 'Q'),
    homeRef: ref('hhom', 'H'),
    projectRef: ref('hprj', 'P'),
    contractorLabel: body.contractorLabel,
    proposalDate: body.proposalDate ?? null,
    artifactRef: body.artifactRef ?? null,
    scope: body.scope,
    notes: body.notes ?? '',
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
  assert.equal(projectQuoteMatchesBody(quote, body), true)
  assert.equal(projectQuoteMatchesBody({ ...quote, notes: 'Changed' }, body), false)
  const retry = { ...body, commandRef: ref('hcmd', 'D') }
  assert.equal(
    projectQuoteCommandIntent(quote.projectRef, null, body),
    projectQuoteCommandIntent(quote.projectRef, null, retry),
  )
  assert.notEqual(
    projectQuoteCommandIntent(quote.projectRef, null, body),
    projectQuoteCommandIntent(quote.projectRef, quote.quoteRef, body),
  )
})
