import assert from 'node:assert/strict'
import test from 'node:test'
import { PreviewHomesroloApi, PREVIEW_PRIMARY_HOME_REF } from './api.ts'

test('serves representative homes, work, people sources, and artifacts entirely in memory', async () => {
  const api = new PreviewHomesroloApi()
  const homes = await api.listHomes()
  const work = await api.listWork(PREVIEW_PRIMARY_HOME_REF)
  const artifacts = await api.listArtifacts(PREVIEW_PRIMARY_HOME_REF)
  const professionals = await api.listProfessionals()

  assert.equal(homes.length, 2)
  assert.ok(work.some(item => item.status === 'planned'))
  assert.ok(work.some(item => item.status === 'in_progress'))
  assert.ok(work.filter(item => item.professionalLabel).length >= 4)
  assert.ok(new Set(work.map(item => item.category)).size >= 4)
  assert.ok(artifacts.some(item => item.kind === 'photo'))
  assert.ok(artifacts.some(item => item.kind === 'document'))
  assert.ok(artifacts.some(item => item.kind === 'warranty'))
  assert.equal(new Set(professionals.map(item => item.organizationRef)).size, professionals.length)
})

test('keeps preview Rolo and writes deterministic and isolated', async () => {
  const first = new PreviewHomesroloApi()
  const second = new PreviewHomesroloApi()
  const before = (await first.listWork(PREVIEW_PRIMARY_HOME_REF)).length
  const reply = await first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'My AC is not cooling', [], {
    pendingWork: null,
    unansweredFollowUpQuestion: null,
  })
  const proposed = reply.proposedWork

  assert.equal(proposed?.category, 'hvac')
  assert.match(reply.disclosure, /no network request/)
  assert.ok(proposed)
  const continued = await first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'The upstairs unit.', [
    { role: 'user', text: 'My AC is not cooling' },
    { role: 'assistant', text: reply.answer },
  ], {
    pendingWork: proposed,
    unansweredFollowUpQuestion: reply.followUpQuestions[0] ?? null,
  })
  assert.equal(continued.proposedWork?.title, proposed.title)
  assert.match(continued.proposedWork?.summary ?? '', /Follow-up: The upstairs unit\./)
  assert.deepEqual(continued.followUpQuestions, [])
  await first.createWork(PREVIEW_PRIMARY_HOME_REF, {
    commandRef: await first.newCommandRef(),
    title: proposed.title,
    workKind: proposed.kind,
    category: proposed.category,
    status: proposed.status,
  })
  assert.equal((await first.listWork(PREVIEW_PRIMARY_HOME_REF)).length, before + 1)
  assert.equal((await second.listWork(PREVIEW_PRIMARY_HOME_REF)).length, before)
})

test('keeps project activity scoped, append-only, and immediately readable', async () => {
  const api = new PreviewHomesroloApi()
  const untouched = new PreviewHomesroloApi()
  const project = (await api.listWork(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.title === 'Watch flashing above the garage')
  assert.ok(project)
  const originalSummary = project.summary
  const before = await api.listProjectActivity(PREVIEW_PRIMARY_HOME_REF, project.projectRef)
  assert.ok(before.some(entry => entry.kind === 'milestone'))

  const added = await api.addWorkNote(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    '  Contractor visit scheduled for Friday.  ',
    await api.newCommandRef(),
  )
  const after = await api.listProjectActivity(PREVIEW_PRIMARY_HOME_REF, project.projectRef)
  assert.equal(added.body, 'Contractor visit scheduled for Friday.')
  assert.equal(added.homeRef, PREVIEW_PRIMARY_HOME_REF)
  assert.equal(added.projectRef, project.projectRef)
  assert.equal(after.length, before.length + 1)
  assert.equal(after.at(-1)?.activityRef, added.activityRef)
  assert.equal((await api.listWork(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.projectRef === project.projectRef)?.summary, originalSummary)
  assert.equal((await untouched.listProjectActivity(
    PREVIEW_PRIMARY_HOME_REF, project.projectRef,
  )).length, before.length)
  await assert.rejects(
    api.listProjectActivity(PREVIEW_PRIMARY_HOME_REF, `hprj_${'x'.repeat(43)}`),
    /preview_work_not_found/,
  )
  await assert.rejects(
    api.addWorkNote(PREVIEW_PRIMARY_HOME_REF, project.projectRef, '   '),
    /preview_activity_invalid/,
  )
})

test('cannot perform an upload', async () => {
  const api = new PreviewHomesroloApi()
  await assert.rejects(
    api.uploadArtifact(PREVIEW_PRIMARY_HOME_REF, 'photo', {
      uri: 'file:///preview.jpg',
      name: 'preview.jpg',
      mediaType: 'image/jpeg',
      byteLength: 12,
      lifecycle: 'external-source',
    }),
    /preview_upload_disabled/,
  )
})

test('opens private content only through the exact home or accepted invitation', async () => {
  const api = new PreviewHomesroloApi()
  const document = (await api.listArtifacts(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.kind === 'document')
  assert.ok(document)
  const homeContent = await api.readArtifactContent(PREVIEW_PRIMARY_HOME_REF, document)
  assert.equal(homeContent.artifactRef, document.artifactRef)
  assert.equal(homeContent.mediaType, 'application/pdf')
  assert.equal(new TextDecoder().decode(homeContent.bytes.slice(0, 8)), '%PDF-1.4')
  await assert.rejects(api.readArtifactContent(PREVIEW_PRIMARY_HOME_REF, {
    ...document,
    homeRef: `hhom_${'x'.repeat(43)}`,
  }), /preview_artifact_not_found/)

  const invitations = await api.listProfessionalInvitations()
  const accepted = invitations.find(item => item.status === 'accepted')
  const pending = invitations.find(item => item.status === 'pending')
  assert.ok(accepted)
  assert.ok(pending)
  const sharedRef = accepted.disclosure.selectedArtifactRefs[0]
  assert.ok(sharedRef)
  const shared = await api.readProfessionalArtifactContent(accepted.invitationRef, sharedRef)
  assert.equal(shared.artifactRef, sharedRef)
  await assert.rejects(api.readProfessionalArtifactContent(
    pending.invitationRef, pending.disclosure.selectedArtifactRefs[0] ?? sharedRef,
  ), /preview_artifact_not_shared/)
})

test('reviews one saved preview photo deterministically without transport or upload', async () => {
  const first = new PreviewHomesroloApi()
  const second = new PreviewHomesroloApi()
  const photo = (await first.listArtifacts(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.kind === 'photo')
  assert.ok(photo)
  const selection = {
    source: 'artifact' as const,
    artifactRef: photo.artifactRef,
    consentToAnalyze: true as const,
  }
  const state = { pendingWork: null, unansweredFollowUpQuestion: null }
  const firstReply = await first.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, selection,
  )
  const secondReply = await second.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, selection,
  )

  assert.deepEqual(firstReply.photoReview, secondReply.photoReview)
  assert.equal(firstReply.photoReview?.hazardSignal, 'none')
  assert.equal(firstReply.photoReview?.urgency, 'routine')
  assert.match(firstReply.disclosure, /no network request/)
  const refusal = await first.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'Decide my insurance coverage.', [], state, selection,
  )
  assert.equal(refusal.photoReview, null)
  assert.equal(refusal.proposedWork, null)
  assert.match(refusal.answer, /did not open the attached photo/i)
  await assert.rejects(
    first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'Review this.', [], state, {
      ...selection,
      artifactRef: `hart_${'x'.repeat(43)}`,
    }),
    /preview_artifact_not_found/,
  )
})

test('runs the complete homeowner to professional proposal loop in memory', async () => {
  const api = new PreviewHomesroloApi()
  const untouched = new PreviewHomesroloApi()
  const project = (await api.listWork(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.title === 'Improve patio drainage')
  const artifacts = await api.listArtifacts(PREVIEW_PRIMARY_HOME_REF)
  const sharedPhoto = artifacts
    .find(item => item.kind === 'photo' && item.projectRef === project?.projectRef)
  const homeLibraryPhoto = artifacts
    .find(item => item.kind === 'photo' && item.projectRef === null)
  const privateRoofPhoto = artifacts
    .find(item => item.kind === 'photo' && item.projectRef !== null
      && item.projectRef !== project?.projectRef)
  assert.ok(project)
  assert.ok(sharedPhoto)
  assert.ok(homeLibraryPhoto)
  assert.ok(privateRoofPhoto)

  const created = await api.createProfessionalOrganization({
    commandRef: await api.newCommandRef(),
    displayName: 'Garden Gate Drainage',
    slug: 'garden-gate-drainage',
  })
  const published = await api.saveProfessionalProfile({
    commandRef: await api.newCommandRef(),
    organizationRef: created.organization.organizationRef,
    expectedRevision: created.organization.revision,
    displayName: created.organization.displayName,
    legalName: null,
    description: 'Drainage and grading work explained in plain language.',
    publicPhone: '817-555-0188',
    publicEmail: 'hello@gardengate.example',
    websiteUrl: null,
    logoUrl: null,
    trades: ['landscaping'],
    serviceAreas: ['Fort Worth, TX'],
    publicationState: 'published',
  })
  assert.equal(published.revision, 2)
  assert.equal((await api.getProfessionalProfile()).memberships.some(item => (
    item.organizationRef === published.organizationRef
  )), true)
  assert.equal((await api.listProfessionals({
    trade: 'landscaping', serviceArea: 'Fort Worth',
  })).some(item => item.organizationRef === published.organizationRef), true)
  assert.equal((await api.getProfessional(published.slug)).displayName, published.displayName)

  await assert.rejects(api.inviteProfessional(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    {
      commandRef: await api.newCommandRef(),
      professionalOrganizationRef: published.organizationRef,
      selectedArtifactRefs: [homeLibraryPhoto.artifactRef],
      expiresInDays: 14,
    },
  ), /preview_invitation_invalid/)

  const invitation = await api.inviteProfessional(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    {
      commandRef: await api.newCommandRef(),
      professionalOrganizationRef: published.organizationRef,
      message: 'Please explain the first drainage step and what is not included.',
      selectedArtifactRefs: [sharedPhoto.artifactRef],
      expiresInDays: 14,
    },
  )
  assert.equal(invitation.status, 'pending')
  assert.deepEqual(invitation.disclosure.selectedArtifactRefs, [sharedPhoto.artifactRef])
  assert.equal((await api.listProjectInvitations(
    PREVIEW_PRIMARY_HOME_REF, project.projectRef,
  )).some(item => item.invitationRef === invitation.invitationRef), true)
  assert.equal((await api.listProfessionalInvitations())
    .some(item => item.invitationRef === invitation.invitationRef), true)

  const accepted = await api.respondToProjectInvitation(invitation.invitationRef, {
    commandRef: await api.newCommandRef(),
    expectedRevision: invitation.revision,
    response: 'accepted',
  })
  assert.equal(accepted.status, 'accepted')
  assert.match(api.professionalArtifactPreviewSource(
    accepted.invitationRef, sharedPhoto.artifactRef,
  ).uri, /^data:image\/svg\+xml/)
  assert.throws(() => api.professionalArtifactPreviewSource(
    accepted.invitationRef, privateRoofPhoto.artifactRef,
  ), /preview_artifact_not_shared/)

  const submitted = await api.submitProfessionalProposal(accepted.invitationRef, {
    commandRef: await api.newCommandRef(),
    proposalDate: '2026-08-27',
    totalAmountCents: 485_000,
    summary: 'Correct the grade and add one surface drain after utility marking.',
    scope: {
      project_scope: { status: 'included', detail: 'Regrade the patio edge and add one drain.' },
      schedule: { status: 'included', detail: 'Two working days after utility marking.' },
      exclusions: { status: 'excluded', detail: 'Concrete replacement is not included.' },
    },
  })
  assert.equal(submitted.homeownerDecision, 'undecided')
  assert.equal((await api.getProfessionalProposal(accepted.invitationRef))?.quoteRef,
    submitted.quoteRef)
  let comparison = (await api.listProjectQuotes(PREVIEW_PRIMARY_HOME_REF, project.projectRef))
    .find(item => item.quoteRef === submitted.quoteRef)
  assert.equal(comparison?.source, 'professional_submission')
  assert.equal(comparison?.professionalSummary, submitted.summary)

  const revised = await api.reviseProfessionalProposal(
    accepted.invitationRef,
    submitted.quoteRef,
    {
      commandRef: await api.newCommandRef(),
      expectedRevision: submitted.revision,
      proposalDate: submitted.proposalDate,
      totalAmountCents: 465_000,
      summary: 'Updated after confirming the discharge location.',
      scope: submitted.scope,
    },
  )
  assert.equal(revised.revision, submitted.revision + 1)
  assert.notEqual(revised.versionRef, submitted.versionRef)

  const selected = await api.decideProfessionalProposal(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    submitted.quoteRef,
    {
      commandRef: await api.newCommandRef(),
      expectedDecisionRevision: revised.decisionRevision,
      decision: 'selected',
    },
  )
  assert.equal(selected.homeownerDecision, 'selected')
  comparison = (await api.listProjectQuotes(PREVIEW_PRIMARY_HOME_REF, project.projectRef))
    .find(item => item.quoteRef === selected.quoteRef)
  assert.equal(comparison?.homeownerDecision, 'selected')
  assert.equal(comparison?.totalAmountCents, 465_000)
  await assert.rejects(api.reviseProfessionalProposal(
    accepted.invitationRef,
    selected.quoteRef,
    {
      commandRef: await api.newCommandRef(),
      expectedRevision: selected.revision,
      proposalDate: selected.proposalDate,
      scope: selected.scope,
    },
  ), /preview_proposal_conflict/)

  assert.equal((await untouched.listProfessionals())
    .some(item => item.slug === 'garden-gate-drainage'), false)
})
