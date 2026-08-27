import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PROFESSIONAL_ACCESS_RULE,
  createProfessionalOrganizationInputSchema,
  createProjectInvitationInputSchema,
  professionalCommandIntent,
  professionalOrganizationSchema,
  professionalProposalSchema,
  projectInvitationSchema,
  saveProfessionalProfileInputSchema,
} from '../homesrolo-professional.v1.ts'

const body = (character: string) => character.repeat(43)
const now = '2026-08-26T17:00:00.000Z'
const later = '2026-09-02T17:00:00.000Z'

const organization = {
  recordVersion: 'homesrolo-professional.v1' as const,
  organizationRef: `horg_${body('o')}`,
  slug: 'northside-home-services',
  displayName: 'Northside Home Services',
  description: 'Roofing, HVAC, and repair documentation for homeowners.',
  publicPhone: '(817) 555-0100',
  publicEmail: 'hello@example.com',
  websiteUrl: 'https://example.com',
  trades: ['roofing', 'hvac'] as const,
  serviceAreas: ['Fort Worth, TX', 'Norman, OK'],
  publicationState: 'published' as const,
  provenance: 'company_self_reported' as const,
  revision: 1,
  createdAt: now,
  updatedAt: now,
}

test('a professional profile is self-reported and needs coverage before publication', () => {
  assert.equal(professionalOrganizationSchema.safeParse(organization).success, true)
  for (const unsafeUrl of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://localhost/logo.png',
    'https://127.0.0.1/logo.png',
    'https://192.168.1.10/logo.png',
  ]) {
    assert.equal(professionalOrganizationSchema.safeParse({
      ...organization,
      websiteUrl: unsafeUrl,
    }).success, false, unsafeUrl)
  }
  assert.equal(professionalOrganizationSchema.safeParse({
    ...organization,
    provenance: 'verified',
  }).success, false)
  assert.equal(professionalOrganizationSchema.safeParse({
    ...organization,
    trades: [],
  }).success, false)
  assert.equal(professionalOrganizationSchema.safeParse({
    ...organization,
    serviceAreas: ['Fort Worth, TX', 'fort worth, tx'],
  }).success, false)
  assert.equal(saveProfessionalProfileInputSchema.safeParse({
    commandRef: `hcmd_${body('c')}`,
    organizationRef: organization.organizationRef,
    expectedRevision: 1,
    displayName: organization.displayName,
    legalName: null,
    description: organization.description,
    publicPhone: organization.publicPhone,
    publicEmail: organization.publicEmail,
    websiteUrl: organization.websiteUrl,
    logoUrl: null,
    trades: organization.trades,
    serviceAreas: organization.serviceAreas,
    publicationState: 'published',
  }).success, true)
})

test('organization creation and project invitations carry no browser authority', () => {
  const createOrganization = createProfessionalOrganizationInputSchema.parse({
    commandRef: `hcmd_${body('c')}`,
    displayName: organization.displayName,
    slug: organization.slug,
  })
  assert.deepEqual(Object.keys(createOrganization).sort(), [
    'commandRef', 'displayName', 'slug',
  ])

  const command = createProjectInvitationInputSchema.parse({
    commandRef: `hcmd_${body('i')}`,
    projectRef: `hprj_${body('p')}`,
    professionalOrganizationRef: organization.organizationRef,
    message: 'Please review the saved scope and tell me when you can visit.',
    selectedArtifactRefs: [`hart_${body('a')}`],
    expiresInDays: 7,
    requestedAt: now,
  })
  assert.deepEqual(
    professionalCommandIntent(command),
    professionalCommandIntent({ ...command, requestedAt: '2026-08-26T17:05:00.000Z' }),
  )
  for (const forbidden of ['principalRef', 'membershipRef', 'homeRef', 'address', 'role']) {
    assert.equal(Object.hasOwn(command, forbidden), false, forbidden)
  }
  assert.match(PROFESSIONAL_ACCESS_RULE, /never creates Home Record membership/i)
})

test('an invitation exposes one immutable project disclosure, not a home', () => {
  const invitation = {
    recordVersion: 'homesrolo-professional.v1' as const,
    invitationRef: `hinv_${body('i')}`,
    homeRef: `hhom_${body('h')}`,
    projectRef: `hprj_${body('p')}`,
    controllerPrincipalRef: `hprn_${body('c')}`,
    invitedByPrincipalRef: `hprn_${body('c')}`,
    professionalOrganizationRef: organization.organizationRef,
    status: 'pending' as const,
    disclosure: {
      title: 'Replace upstairs HVAC',
      workKind: 'project' as const,
      category: 'hvac' as const,
      trade: 'HVAC',
      status: 'planned' as const,
      summary: 'Existing unit is not cooling the upstairs.',
      selectedArtifactRefs: [`hart_${body('a')}`],
    },
    disclosureDigest: 'd'.repeat(64),
    expiresAt: later,
    revision: 1,
    createdAt: now,
  }
  assert.equal(projectInvitationSchema.safeParse(invitation).success, true)
  assert.equal(projectInvitationSchema.safeParse({
    ...invitation,
    disclosure: { ...invitation.disclosure, address: '123 Main Street' },
  }).success, false)
  assert.equal(projectInvitationSchema.safeParse({
    ...invitation,
    status: 'accepted',
  }).success, false, 'accepted invitations must record the response time')
})

test('a contractor proposal is a sourced bid, never a Homesrolo price opinion', () => {
  const proposal = {
    recordVersion: 'homesrolo-professional.v1' as const,
    quoteRef: `hquo_${body('q')}`,
    versionRef: `hpvr_${body('v')}`,
    invitationRef: `hinv_${body('i')}`,
    professionalOrganizationRef: organization.organizationRef,
    submittedByPrincipalRef: `hprn_${body('s')}`,
    homeRef: `hhom_${body('h')}`,
    projectRef: `hprj_${body('p')}`,
    controllerPrincipalRef: `hprn_${body('c')}`,
    contractorLabel: organization.displayName,
    proposalDate: '2026-08-26',
    totalAmountCents: 1_250_000,
    currencyCode: 'USD' as const,
    summary: 'Replace the upstairs system using the attached written scope.',
    scope: {
      project_scope: { status: 'included' as const, detail: 'Equipment and installation.' },
      warranty: { status: 'included' as const, detail: 'Registered manufacturer warranty.' },
    },
    state: 'submitted' as const,
    homeownerDecision: 'undecided' as const,
    decisionRevision: 1,
    revision: 1,
    contentDigest: 'e'.repeat(64),
    createdAt: now,
    updatedAt: now,
  }
  assert.equal(professionalProposalSchema.safeParse(proposal).success, true)
  assert.equal(professionalProposalSchema.safeParse({
    ...proposal,
    fairPrice: true,
  }).success, false)
  assert.equal(professionalProposalSchema.safeParse({
    ...proposal,
    state: 'withdrawn',
    homeownerDecision: 'selected',
  }).success, false)
})
