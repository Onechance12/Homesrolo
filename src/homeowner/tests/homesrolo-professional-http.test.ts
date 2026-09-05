import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createHomesroloProfessionalHttpHandler,
  type HomesroloProfessionalHttpRequest,
} from '../homesrolo-professional-http.v1.ts'
import type { HomesroloProfessionalService } from '../homesrolo-professional-service.v1.ts'

const body = (character: string) => character.repeat(43)
const refs = {
  principal: `hprn_${body('p')}`,
  controller: `hprn_${body('c')}`,
  home: `hhom_${body('h')}`,
  project: `hprj_${body('j')}`,
  organization: `horg_${body('o')}`,
  invitation: `hinv_${body('i')}`,
  artifact: `hart_${body('a')}`,
  quote: `hquo_${body('q')}`,
  version: `hpvr_${body('v')}`,
}
const now = '2026-08-26T17:00:00.000Z'

const organization = {
  recordVersion: 'homesrolo-professional.v1' as const,
  organizationRef: refs.organization,
  slug: 'northside-home-services',
  displayName: 'Northside Home Services',
  trades: ['hvac'] as const,
  serviceAreas: ['Fort Worth, TX'],
  publicationState: 'published' as const,
  provenance: 'company_self_reported' as const,
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

const invitation = {
  recordVersion: 'homesrolo-professional.v1' as const,
  invitationRef: refs.invitation,
  homeRef: refs.home,
  projectRef: refs.project,
  controllerPrincipalRef: refs.controller,
  invitedByPrincipalRef: refs.controller,
  professionalOrganizationRef: refs.organization,
  professionalDisplayLabel: organization.displayName,
  status: 'pending' as const,
  disclosure: {
    title: 'Upstairs cooling problem',
    workKind: 'issue' as const,
    category: 'hvac' as const,
    trade: 'Heating & cooling',
    status: 'active' as const,
    summary: 'The upstairs unit is running but not cooling.',
    selectedArtifactRefs: [refs.artifact],
  },
  disclosureDigest: 'd'.repeat(64),
  expiresAt: '2026-09-02T17:00:00.000Z',
  revision: 1,
  createdAt: now,
}

const proposal = {
  recordVersion: 'homesrolo-professional.v1' as const,
  quoteRef: refs.quote,
  versionRef: refs.version,
  invitationRef: refs.invitation,
  professionalOrganizationRef: refs.organization,
  submittedByPrincipalRef: refs.principal,
  homeRef: refs.home,
  projectRef: refs.project,
  controllerPrincipalRef: refs.controller,
  contractorLabel: organization.displayName,
  proposalDate: '2026-08-26',
  totalAmountCents: 850_000,
  currencyCode: 'USD' as const,
  summary: 'Replace the upstairs system and register its warranty.',
  scope: {
    project_scope: { status: 'included' as const, detail: 'Equipment and installation.' },
  },
  state: 'submitted' as const,
  homeownerDecision: 'undecided' as const,
  decisionRevision: 1,
  revision: 1,
  contentDigest: 'e'.repeat(64),
  createdAt: now,
  updatedAt: now,
}

function request(overrides: Partial<HomesroloProfessionalHttpRequest> = {}) {
  return {
    method: 'GET',
    pathname: '/api/v1/professionals',
    search: '',
    hasBody: false,
    jsonBody: undefined,
    sessionHandle: null,
    ...overrides,
  }
}

test('the public directory is filter-bounded and projects only self-reported profile facts', async () => {
  let received: unknown
  const service = {
    async listPublishedOrganizations(input: unknown) {
      received = input
      return [organization]
    },
  } as unknown as HomesroloProfessionalService
  const handler = createHomesroloProfessionalHttpHandler(service)
  const response = await handler(request({ search: '?trade=hvac&serviceArea=Fort+Worth%2C+TX' }))
  assert.equal(response.status, 200)
  assert.deepEqual(received, { trade: 'hvac', serviceArea: 'Fort Worth, TX' })
  const encoded = JSON.stringify(response.body)
  assert.doesNotMatch(encoded, /recordVersion|principalRef|membershipRef/)
  assert.match(encoded, /company_self_reported/)

  const invalid = await handler(request({ search: '?sort=paid' }))
  assert.equal(invalid.status, 400)
})

test('a professional invitation view cannot expose homeowner principal authority', async () => {
  const service = {
    async listMyInvitations() { return [invitation] },
  } as unknown as HomesroloProfessionalService
  const handler = createHomesroloProfessionalHttpHandler(service)
  const response = await handler(request({
    pathname: '/api/v1/professional/invitations',
    sessionHandle: 'opaque-session-handle',
  }))
  assert.equal(response.status, 200)
  const encoded = JSON.stringify(response.body)
  assert.match(encoded, /Upstairs cooling problem/)
  assert.match(encoded, /"professionalDisplayLabel":"Northside Home Services"/)
  assert.match(encoded, new RegExp(refs.artifact))
  assert.doesNotMatch(encoded, /controllerPrincipalRef|invitedByPrincipalRef|disclosureDigest/)
  assert.doesNotMatch(encoded, new RegExp(refs.controller))
})

test('a contractor can reload only its safe proposal projection for the exact invitation', async () => {
  let received: unknown
  const service = {
    async readMyProposal(...input: unknown[]) {
      received = input
      return proposal
    },
  } as unknown as HomesroloProfessionalService
  const handler = createHomesroloProfessionalHttpHandler(service)
  const response = await handler(request({
    pathname: `/api/v1/professional/invitations/${refs.invitation}/proposals`,
    sessionHandle: 'opaque-session-handle',
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(received, [
    { sessionHandle: 'opaque-session-handle' },
    refs.invitation,
  ])
  const encoded = JSON.stringify(response.body)
  assert.match(encoded, new RegExp(refs.quote))
  assert.doesNotMatch(encoded, /submittedByPrincipalRef|controllerPrincipalRef|contentDigest/)
  assert.doesNotMatch(encoded, new RegExp(refs.principal))
  assert.doesNotMatch(encoded, new RegExp(refs.controller))

  const emptyService = {
    async readMyProposal() { return null },
  } as unknown as HomesroloProfessionalService
  const empty = await createHomesroloProfessionalHttpHandler(emptyService)(request({
    pathname: `/api/v1/professional/invitations/${refs.invitation}/proposals`,
    sessionHandle: 'opaque-session-handle',
  }))
  assert.deepEqual(empty.body, { data: null })
})

test('exact-project invitation creation is the only homeowner invitation write', async () => {
  let received: unknown
  const service = {
    async createInvitation(...input: unknown[]) {
      received = input
      return invitation
    },
  } as unknown as HomesroloProfessionalService
  const handler = createHomesroloProfessionalHttpHandler(service)
  const pathname = `/api/v1/homes/${refs.home}/projects/${refs.project}/invitations`
  const command = {
    commandRef: `hcmd_${body('m')}`,
    professionalOrganizationRef: refs.organization,
    selectedArtifactRefs: [refs.artifact],
    expiresInDays: 7,
  }
  const response = await handler(request({
    method: 'POST',
    pathname,
    hasBody: true,
    jsonBody: command,
    sessionHandle: 'opaque-session-handle',
  }))
  assert.equal(response.status, 201)
  assert.deepEqual(received, [
    { sessionHandle: 'opaque-session-handle' },
    refs.home,
    refs.project,
    command,
  ])

  const wrongMethod = await handler(request({ method: 'DELETE', pathname }))
  assert.equal(wrongMethod.status, 405)
})

test('professional routes remain unavailable behind the independent release gate', async () => {
  const handler = createHomesroloProfessionalHttpHandler(null)
  assert.equal((await handler(request())).status, 503)
})
