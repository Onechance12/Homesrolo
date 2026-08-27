import assert from 'node:assert/strict'
import test from 'node:test'
import { PreviewHomesroloApi, PREVIEW_PRIMARY_HOME_REF } from './api.ts'

test('serves representative homes, work, people sources, and artifacts entirely in memory', async () => {
  const api = new PreviewHomesroloApi()
  const homes = await api.listHomes()
  const work = await api.listWork(PREVIEW_PRIMARY_HOME_REF)
  const artifacts = await api.listArtifacts(PREVIEW_PRIMARY_HOME_REF)
  const professionals = await api.listProfessionals()
  const homeRecord = await api.getHomeRecord(PREVIEW_PRIMARY_HOME_REF)
  const checkups = await api.listHomeCheckups(PREVIEW_PRIMARY_HOME_REF)

  assert.equal(homes.length, 2)
  assert.ok(work.some(item => item.status === 'planned'))
  assert.ok(work.some(item => item.status === 'in_progress'))
  assert.ok(work.filter(item => item.professionalLabel).length >= 4)
  assert.ok(new Set(work.map(item => item.category)).size >= 4)
  assert.ok(artifacts.some(item => item.kind === 'photo'))
  assert.ok(artifacts.some(item => item.kind === 'document'))
  assert.ok(artifacts.some(item => item.kind === 'warranty'))
  assert.equal(new Set(professionals.map(item => item.organizationRef)).size, professionals.length)
  assert.equal(homeRecord.address?.regionCode, 'TX')
  assert.ok(checkups.length >= 2)
  assert.ok(checkups.filter(item => item.viewLabel === 'Garage roofline').length >= 2)
})

test('gives a newly added preview home the same revisioned Home Record used in production', async () => {
  const api = new PreviewHomesroloApi()
  const created = await api.createHome('Lake house', '18 Shoreline Road · Kingston, OK 73439')
  const initial = await api.getHomeRecord(created.homeRef)
  assert.equal(initial.revision, 1)
  assert.equal(initial.address, null)
  const saved = await api.updateHomeRecord(created.homeRef, {
    commandRef: await api.newCommandRef(),
    expectedRevision: initial.revision,
    address: {
      line1: '18 Shoreline Road', line2: null, city: 'Kingston', regionCode: 'OK',
      postalCode: '73439', countryCode: 'US',
    },
    homeType: initial.homeType,
    yearBuilt: initial.yearBuilt,
    systems: initial.systems,
  })
  assert.equal(saved.revision, 2)
  assert.equal(saved.address?.city, 'Kingston')
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

test('saves outside proposals beside company submissions without merging their provenance', async () => {
  const api = new PreviewHomesroloApi()
  const work = await api.listWork(PREVIEW_PRIMARY_HOME_REF)
  const project = work.find(item => item.title === 'Quarterly pest service')
  assert.ok(project)
  const commandRef = await api.newCommandRef()
  const input = {
    commandRef,
    contractorLabel: 'Outside Pest Company',
    proposalDate: '2026-08-27',
    scope: {
      project_scope: { status: 'included' as const, detail: 'Exterior treatment.' },
      exclusions: { status: 'not_stated' as const },
    },
    notes: 'Received by email.',
  }
  const created = await api.createProjectQuote(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    input,
  )
  const retried = await api.createProjectQuote(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    input,
  )
  assert.equal(retried.quoteRef, created.quoteRef)
  assert.equal(created.source, 'homeowner_entry')
  const comparison = await api.listProjectQuotes(PREVIEW_PRIMARY_HOME_REF, project.projectRef)
  assert.ok(comparison.some(item => item.source === 'professional_submission'))
  assert.ok(comparison.some(item => item.quoteRef === created.quoteRef
    && item.source === 'homeowner_entry'))

  const revised = await api.saveProjectQuote(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    created.quoteRef,
    {
      ...input,
      commandRef: await api.newCommandRef(),
      expectedRevision: created.revision,
      notes: 'Corrected after rereading the PDF.',
    },
  )
  assert.equal(revised.revision, 2)
  assert.equal(revised.notes, 'Corrected after rereading the PDF.')
  const professional = comparison.find(item => item.source === 'professional_submission')
  assert.ok(professional)
  const prohibitedEditCommand = await api.newCommandRef()
  await assert.rejects(() => api.saveProjectQuote(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    professional.quoteRef,
    {
      ...input,
      commandRef: prohibitedEditCommand,
      expectedRevision: professional.revision,
    },
  ), /preview_quote_not_found/)
})

test('saves estimate visits as idempotent milestones before calendar handoff', async () => {
  const api = new PreviewHomesroloApi()
  const project = (await api.listWork(PREVIEW_PRIMARY_HOME_REF))[0]
  assert.ok(project)
  const commandRef = await api.newCommandRef()
  const body = 'Estimate or service visit with ABC Company — 8/28/2026, 2:30:00 PM'
  const first = await api.addWorkMilestone(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    body,
    commandRef,
  )
  const retry = await api.addWorkMilestone(
    PREVIEW_PRIMARY_HOME_REF,
    project.projectRef,
    body,
    commandRef,
  )
  assert.equal(retry.activityRef, first.activityRef)
  assert.equal(first.kind, 'milestone')
  const activity = await api.listProjectActivity(PREVIEW_PRIMARY_HOME_REF, project.projectRef)
  assert.equal(activity.filter(item => item.activityRef === first.activityRef).length, 1)
})

test('keeps Rolo suggestions specific to planning, care, and home-history intent', async () => {
  const api = new PreviewHomesroloApi()
  const emptyConversation = { pendingWork: null, unansweredFollowUpQuestion: null }

  const pool = await api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'I want to add a pool. Help me organize the idea, budget, and next steps.',
    [],
    emptyConversation,
  )
  assert.equal(pool.proposedWork?.kind, 'project')
  assert.equal(pool.proposedWork?.category, 'pool')
  assert.match(pool.answer, /how you want to use the pool/i)
  assert.match(pool.followUpQuestions[0] ?? '', /family use|entertaining|exercise/i)
  assert.doesNotMatch(pool.followUpQuestions.join(' '), /leaking|sparking/i)

  const continuedPool = await api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'Mostly family use, with low maintenance.',
    [{ role: 'user', text: 'Help me plan a pool.' }, { role: 'assistant', text: pool.answer }],
    {
      pendingWork: pool.proposedWork,
      unansweredFollowUpQuestion: pool.followUpQuestions[0] ?? null,
    },
  )
  assert.equal(continuedPool.proposedWork?.category, 'pool')
  assert.match(continuedPool.proposedWork?.summary ?? '', /Follow-up: Mostly family use/)
  assert.match(continuedPool.answer, /kept that with the pool plan/i)
  assert.doesNotMatch(continuedPool.answer, /repeatable walk-through/i)

  const maintenance = await api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'What maintenance is due?',
    [],
    emptyConversation,
  )
  assert.equal(maintenance.proposedWork?.kind, 'service')
  assert.match(maintenance.followUpQuestions[0] ?? '', /outside|inside|system/i)

  const history = await api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'Find something in my home history.',
    [],
    emptyConversation,
  )
  assert.equal(history.proposedWork, null)
  assert.equal(history.destination, null)
  assert.match(history.answer, /saved work, companies, photos, files, and warranties/i)
  assert.match(history.followUpQuestions[0] ?? '', /date, company, product, warranty/i)
})

test('keeps project-launched Rolo on the existing work record', async () => {
  const api = new PreviewHomesroloApi()
  const project = (await api.listWork(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.title === 'Improve patio drainage')
  assert.ok(project)
  const reply = await api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'Help me review this work record. What looks incomplete or worth deciding next?',
    [],
    { pendingWork: null, unansweredFollowUpQuestion: null },
    project.projectRef,
  )
  assert.equal(reply.projectRef, project.projectRef)
  assert.equal(reply.proposedWork, null)
  assert.match(reply.answer, /Improve patio drainage/)
  assert.match(reply.answer, /without creating another copy/i)
  await assert.rejects(api.askRolo(
    PREVIEW_PRIMARY_HOME_REF,
    'Review this work.',
    [],
    { pendingWork: null, unansweredFollowUpQuestion: null },
    `hprj_${'x'.repeat(43)}`,
  ), /preview_work_not_found/)
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

test('keeps project choices scoped, revisioned, idempotent, and isolated', async () => {
  const api = new PreviewHomesroloApi()
  const untouched = new PreviewHomesroloApi()
  const project = (await api.listWork(PREVIEW_PRIMARY_HOME_REF))
    .find(item => item.title === 'Improve patio drainage')
  assert.ok(project)
  const before = await api.listProjectItems(PREVIEW_PRIMARY_HOME_REF, project.projectRef)
  assert.ok(before.some(item => item.kind === 'decision'))

  const createCommandRef = await api.newCommandRef()
  const created = await api.saveProjectItem(PREVIEW_PRIMARY_HOME_REF, project.projectRef, {
    commandRef: createCommandRef,
    kind: 'material',
    label: '  Sandstone channel grate  ',
    detail: '  Check the sample next to the existing patio.  ',
    state: 'considering',
  })
  assert.equal(created.label, 'Sandstone channel grate')
  assert.equal(created.detail, 'Check the sample next to the existing patio.')
  assert.equal(created.revision, 1)
  assert.equal((await api.listProjectItems(
    PREVIEW_PRIMARY_HOME_REF, project.projectRef,
  )).length, before.length + 1)

  const replay = await api.saveProjectItem(PREVIEW_PRIMARY_HOME_REF, project.projectRef, {
    commandRef: createCommandRef,
    kind: 'material',
    label: 'Sandstone channel grate',
    detail: 'Check the sample next to the existing patio.',
    state: 'considering',
  })
  assert.equal(replay.itemRef, created.itemRef)
  assert.equal((await api.listProjectItems(
    PREVIEW_PRIMARY_HOME_REF, project.projectRef,
  )).length, before.length + 1)

  const updated = await api.saveProjectItem(PREVIEW_PRIMARY_HOME_REF, project.projectRef, {
    commandRef: await api.newCommandRef(),
    itemRef: created.itemRef,
    expectedRevision: created.revision,
    kind: 'material',
    label: created.label,
    detail: created.detail,
    state: 'chosen',
  })
  assert.equal(updated.state, 'chosen')
  assert.equal(updated.revision, 2)
  await assert.rejects(api.saveProjectItem(PREVIEW_PRIMARY_HOME_REF, project.projectRef, {
    commandRef: await api.newCommandRef(),
    itemRef: created.itemRef,
    expectedRevision: created.revision,
    kind: 'material',
    label: created.label,
    state: 'declined',
  }), /conflict/)
  assert.equal((await untouched.listProjectItems(
    PREVIEW_PRIMARY_HOME_REF, project.projectRef,
  )).length, before.length)
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
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, undefined, selection,
  )
  const secondReply = await second.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'What can you see here?', [], state, undefined, selection,
  )

  assert.deepEqual(firstReply.photoReview, secondReply.photoReview)
  assert.equal(firstReply.photoReview?.hazardSignal, 'none')
  assert.equal(firstReply.photoReview?.urgency, 'routine')
  assert.equal(firstReply.proposedWork, null)
  assert.equal(firstReply.destination, null)
  assert.match(firstReply.disclosure, /no network request/)
  const refusal = await first.askRolo(
    PREVIEW_PRIMARY_HOME_REF, 'Decide my insurance coverage.', [], state, undefined, selection,
  )
  assert.equal(refusal.photoReview, null)
  assert.equal(refusal.proposedWork, null)
  assert.match(refusal.answer, /did not open the attached photo/i)
  await assert.rejects(
    first.askRolo(PREVIEW_PRIMARY_HOME_REF, 'Review this.', [], state, undefined, {
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
