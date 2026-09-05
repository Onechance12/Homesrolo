import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProfessionalOrganizationBody,
  decideProfessionalProposalBody,
  inviteProfessionalBody,
  parseCreatedProfessionalOrganization,
  parseProfessionalOrganization,
  parseProfessionalProposal,
  parseProjectInvitation,
  parseProjectQuote,
  professionalDirectoryQuery,
  professionalProposalBody,
  respondToProjectInvitationBody,
  saveProfessionalProfileBody,
} from './professional.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const commandRef = ref('hcmd', 'c')
const organizationRef = ref('horg', 'o')
const membershipRef = ref('hpmr', 'm')
const invitationRef = ref('hinv', 'i')
const homeRef = ref('hhom', 'h')
const projectRef = ref('hprj', 'p')
const quoteRef = ref('hquo', 'q')
const versionRef = ref('hpvr', 'v')
const artifactRef = ref('hart', 'a')

const organization = {
  organizationRef,
  slug: 'clear-water-pools',
  displayName: 'Clear Water Pools',
  description: 'Pool design, installation, and care.',
  publicPhone: '817-555-0100',
  publicEmail: 'hello@clearwater.example',
  websiteUrl: 'https://clearwater.example/',
  trades: ['pool'],
  serviceAreas: ['Fort Worth, TX'],
  publicationState: 'published',
  provenance: 'company_self_reported',
  revision: 2,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T11:00:00.000Z',
}

const disclosure = {
  title: 'Plan a backyard pool',
  workKind: 'project',
  category: 'pool',
  trade: 'Pool professional',
  status: 'planned',
  summary: 'We want a family pool with a shallow ledge.',
  selectedArtifactRefs: [artifactRef],
}

const invitation = {
  invitationRef,
  homeRef,
  projectRef,
  professionalOrganizationRef: organizationRef,
  status: 'accepted',
  message: 'Please review the yard photos.',
  disclosure,
  expiresAt: '2026-09-10T10:00:00.000Z',
  revision: 2,
  createdAt: '2026-08-26T10:00:00.000Z',
  respondedAt: '2026-08-26T12:00:00.000Z',
}

const proposal = {
  quoteRef,
  versionRef,
  invitationRef,
  professionalOrganizationRef: organizationRef,
  homeRef,
  projectRef,
  contractorLabel: 'Clear Water Pools',
  proposalDate: '2026-08-26',
  totalAmountCents: 6_250_000,
  currencyCode: 'USD',
  summary: 'Turnkey pool construction with the listed allowances.',
  scope: {
    project_scope: { status: 'included', detail: 'Excavate and install one pool.' },
    allowances: { status: 'allowance', detail: 'Finish selections up to stated allowance.' },
  },
  state: 'submitted',
  homeownerDecision: 'shortlisted',
  decisionRevision: 2,
  revision: 1,
  createdAt: '2026-08-26T13:00:00.000Z',
  updatedAt: '2026-08-26T13:00:00.000Z',
}

test('decodes the existing professional directory and profile workspace contract exactly', () => {
  assert.deepEqual(parseProfessionalOrganization(organization), organization)
  assert.deepEqual(parseCreatedProfessionalOrganization({
    organization,
    membership: {
      membershipRef,
      organizationRef,
      role: 'owner',
      state: 'active',
      revision: 1,
      createdAt: '2026-08-26T10:00:00.000Z',
    },
  }).organization, organization)
  assert.throws(() => parseProfessionalOrganization({ ...organization, generatedRating: 5 }))
  assert.throws(() => parseProfessionalOrganization({
    ...organization, trades: [], publicationState: 'published',
  }))
  assert.throws(() => parseProfessionalOrganization({
    ...organization, websiteUrl: 'http://127.0.0.1/company',
  }))
})

test('builds bounded directory and profile requests without inventing profile facts', () => {
  assert.equal(professionalDirectoryQuery({
    trade: 'pool', serviceArea: ' Fort Worth, TX ',
  }), 'trade=pool&serviceArea=Fort+Worth%2C+TX')
  assert.equal(professionalDirectoryQuery({ serviceArea: 'x' }), null)
  assert.deepEqual(createProfessionalOrganizationBody({
    commandRef, displayName: ' Clear Water Pools ', slug: ' Clear-Water-Pools ',
  }), {
    commandRef, displayName: 'Clear Water Pools', slug: 'clear-water-pools',
  })
  assert.deepEqual(saveProfessionalProfileBody({
    commandRef,
    organizationRef,
    expectedRevision: 2,
    displayName: ' Clear Water Pools ',
    legalName: null,
    description: ' Pool design and care. ',
    publicPhone: ' 817-555-0100 ',
    publicEmail: ' HELLO@CLEARWATER.EXAMPLE ',
    websiteUrl: 'https://clearwater.example/',
    logoUrl: null,
    trades: ['pool'],
    serviceAreas: [' Fort Worth, TX '],
    publicationState: 'published',
  }), {
    commandRef,
    organizationRef,
    expectedRevision: 2,
    displayName: 'Clear Water Pools',
    legalName: null,
    description: 'Pool design and care.',
    publicPhone: '817-555-0100',
    publicEmail: 'hello@clearwater.example',
    websiteUrl: 'https://clearwater.example/',
    logoUrl: null,
    trades: ['pool'],
    serviceAreas: ['Fort Worth, TX'],
    publicationState: 'published',
  })
})

test('keeps invitations scoped to one project and exact selected artifacts', () => {
  assert.deepEqual(parseProjectInvitation(invitation), invitation)
  const retained = { ...invitation, professionalDisplayLabel: 'Clear Water Pools' }
  assert.deepEqual(parseProjectInvitation(retained), retained,
    'a private invitation retains its label without a public-directory response')
  for (const professionalDisplayLabel of ['', null, 'x'.repeat(121)]) {
    assert.throws(() => parseProjectInvitation({ ...invitation, professionalDisplayLabel }))
  }
  assert.throws(() => parseProjectInvitation({
    ...invitation,
    disclosure: { ...disclosure, selectedArtifactRefs: [artifactRef, artifactRef] },
  }))
  assert.throws(() => parseProjectInvitation({
    ...invitation, status: 'pending', respondedAt: invitation.respondedAt,
  }))
  assert.deepEqual(inviteProfessionalBody({
    commandRef,
    professionalOrganizationRef: organizationRef,
    message: ' Please review the yard photos. ',
    selectedArtifactRefs: [artifactRef],
    expiresInDays: 14,
  }), {
    commandRef,
    professionalOrganizationRef: organizationRef,
    message: 'Please review the yard photos.',
    selectedArtifactRefs: [artifactRef],
    expiresInDays: 14,
  })
  assert.equal(inviteProfessionalBody({
    commandRef,
    professionalOrganizationRef: organizationRef,
    selectedArtifactRefs: [artifactRef, artifactRef],
    expiresInDays: 14,
  }), null)
  assert.deepEqual(respondToProjectInvitationBody({
    commandRef, expectedRevision: 1, response: 'accepted',
  }), { commandRef, expectedRevision: 1, response: 'accepted' })
})

test('decodes contractor proposals and the homeowner comparison view as separate contracts', () => {
  assert.deepEqual(parseProfessionalProposal(proposal), proposal)
  assert.throws(() => parseProfessionalProposal({
    ...proposal, state: 'withdrawn', homeownerDecision: 'selected',
  }))
  const comparison = {
    quoteRef,
    homeRef,
    projectRef,
    contractorLabel: proposal.contractorLabel,
    proposalDate: proposal.proposalDate,
    artifactRef: null,
    scope: proposal.scope,
    notes: '',
    source: 'professional_submission',
    professionalOrganizationRef: organizationRef,
    invitationRef,
    totalAmountCents: proposal.totalAmountCents,
    currencyCode: 'USD',
    professionalSummary: proposal.summary,
    proposalState: 'submitted',
    homeownerDecision: 'shortlisted',
    decisionRevision: 2,
    revision: 1,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  }
  assert.deepEqual(parseProjectQuote(comparison), comparison)
  assert.throws(() => parseProjectQuote({ ...comparison, notes: 'hidden professional note' }))
  assert.throws(() => parseProjectQuote({
    ...comparison, source: 'homeowner_entry', professionalOrganizationRef: organizationRef,
  }))
})

test('normalizes proposal writes and preserves optimistic concurrency', () => {
  assert.deepEqual(professionalProposalBody({
    commandRef,
    proposalDate: '2026-08-26',
    totalAmountCents: 6_250_000,
    summary: ' Turnkey pool construction. ',
    scope: { project_scope: { status: 'included', detail: 'Pool installation.' } },
  }), {
    commandRef,
    proposalDate: '2026-08-26',
    totalAmountCents: 6_250_000,
    summary: 'Turnkey pool construction.',
    scope: { project_scope: { status: 'included', detail: 'Pool installation.' } },
  })
  assert.deepEqual(professionalProposalBody({
    commandRef,
    proposalDate: '2026-08-26',
    scope: { project_scope: { status: 'included' } },
    expectedRevision: 3,
  }), {
    commandRef,
    proposalDate: '2026-08-26',
    scope: { project_scope: { status: 'included' } },
    expectedRevision: 3,
  })
  assert.equal(professionalProposalBody({
    commandRef,
    proposalDate: '2026-02-30',
    scope: {},
  }), null)
  assert.deepEqual(decideProfessionalProposalBody({
    commandRef, expectedDecisionRevision: 2, decision: 'selected',
  }), { commandRef, expectedDecisionRevision: 2, decision: 'selected' })
})
