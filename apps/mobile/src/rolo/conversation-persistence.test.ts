import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ROLO_CONVERSATION_CHARACTERS,
  parseRoloConversation,
  planRoloHydration,
  projectRoloConversation,
  serializeRoloConversation,
  type PersistedRoloConversation,
  type RoloConversationScope,
} from './conversation-persistence.ts'

const scope: RoloConversationScope = {
  principalRef: `hprn_${'P'.repeat(43)}`,
  homeRef: `hhom_${'H'.repeat(43)}`,
}
const artifactRef = `hart_${'A'.repeat(43)}`
const reviewArtifactRef = `hart_${'R'.repeat(43)}`
const projectRef = `hprj_${'J'.repeat(43)}`

function completeProjection() {
  return projectRoloConversation({
    ...scope,
    projectRef,
    turns: [
      { role: 'user' as const, text: 'The upstairs AC is warm.', photoTitle: 'Vent.jpg', photoArtifactRef: artifactRef },
      { role: 'assistant' as const, text: 'Check the thermostat and filter first.' },
    ],
    proposedWork: {
      kind: 'repair',
      title: 'Check upstairs AC',
      category: 'hvac',
      status: 'planned',
      occurredOn: null,
      assignedMembershipRef: `hmbr_${'M'.repeat(43)}`,
      dueOn: '2026-08-29',
      summary: 'The upstairs is not cooling.',
      professionalLabel: null,
      firstUpdate: 'Started with safe homeowner checks.',
    },
    followUp: 'Is air moving from the upstairs vents?',
    suggestion: { destination: 'work', projectRef },
    attachment: { artifactRef, title: 'Vent.jpg' },
    photoReview: {
      visibleObservations: ['The grille appears dusty.'],
      cannotConfirm: ['Airflow cannot be measured from a photo.'],
      urgency: 'routine',
      suggestedTrade: 'hvac',
      hazardSignal: 'none',
    },
    photoReviewTitle: 'Return vent.jpg',
    photoReviewRef: reviewArtifactRef,
  })
}

test('projects and parses only the bounded Rolo continuity allow-list', () => {
  const projected = completeProjection()
  assert.ok(projected)
  const serialized = serializeRoloConversation(projected)
  const parsed = parseRoloConversation(serialized, scope)
  assert.deepEqual(parsed, projected)
  assert.equal(parsed?.turns[0]?.photo?.artifactRef, artifactRef)
  assert.equal(parsed?.followUp, 'Is air moving from the upstairs vents?')
  assert.equal(parsed?.projectRef, projectRef)
  assert.equal(parsed?.photoReview?.projection.suggestedTrade, 'hvac')
  assert.equal(parsed?.proposedWork?.assignedMembershipRef, `hmbr_${'M'.repeat(43)}`)
  assert.equal(parsed?.proposedWork?.dueOn, '2026-08-29')
})

test('migrates safe version-two drafts and fails closed on malformed assignment fields', () => {
  const projected = completeProjection()!
  const versionTwo = {
    ...projected,
    schemaVersion: 2,
    proposedWork: projected.proposedWork ? {
      kind: projected.proposedWork.kind,
      title: projected.proposedWork.title,
      category: projected.proposedWork.category,
      status: projected.proposedWork.status,
      occurredOn: projected.proposedWork.occurredOn,
      summary: projected.proposedWork.summary,
      professionalLabel: projected.proposedWork.professionalLabel,
      firstUpdate: projected.proposedWork.firstUpdate,
    } : null,
  }
  const migrated = parseRoloConversation(JSON.stringify(versionTwo), scope)
  assert.equal(migrated?.schemaVersion, 3)
  assert.equal(migrated?.proposedWork?.assignedMembershipRef, null)
  assert.equal(migrated?.proposedWork?.dueOn, null)

  assert.equal(parseRoloConversation(JSON.stringify({
    ...projected,
    proposedWork: { ...projected.proposedWork, assignedMembershipRef: 'hmbr_not-safe' },
  }), scope), null)
  assert.equal(parseRoloConversation(JSON.stringify({
    ...projected,
    proposedWork: { ...projected.proposedWork, dueOn: '2026-02-31' },
  }), scope), null)
})

test('projection cannot carry credentials, addresses, picker data, consent, or opaque fields', () => {
  const input = {
    ...scope,
    turns: [{ role: 'user' as const, text: 'Please review the attached vent.' }],
    proposedWork: null,
    followUp: null,
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
    bearer: 'secret-session-token',
    address: { line1: '123 Main Street' },
    consentToAnalyze: true,
    pendingPicker: { uri: 'blob:private-photo', bytes: 'raw-image' },
    opaqueOtherHomeData: { homeRef: `hhom_${'X'.repeat(43)}` },
  }
  const serialized = serializeRoloConversation(projectRoloConversation(input)!)
  assert.equal(serialized.includes('secret-session-token'), false)
  assert.equal(serialized.includes('123 Main Street'), false)
  assert.equal(serialized.includes('consentToAnalyze'), false)
  assert.equal(serialized.includes('blob:private-photo'), false)
  assert.equal(serialized.includes('raw-image'), false)
  assert.equal(serialized.includes('opaqueOtherHomeData'), false)
})

test('strict parsing rejects extra fields and a different principal or home', () => {
  const projected = completeProjection()!
  const withBearer = JSON.stringify({ ...projected, bearer: 'not-allowed' })
  assert.equal(parseRoloConversation(withBearer, scope), null)
  assert.equal(parseRoloConversation(JSON.stringify(projected), {
    ...scope,
    homeRef: `hhom_${'X'.repeat(43)}`,
  }), null)
  assert.equal(parseRoloConversation(JSON.stringify(projected), {
    ...scope,
    principalRef: `hprn_${'Q'.repeat(43)}`,
  }), null)
  assert.deepEqual(parseRoloConversation(JSON.stringify(projected), {
    ...scope,
    projectRef,
  }), projected)
  assert.equal(parseRoloConversation(JSON.stringify(projected), {
    ...scope,
    projectRef: `hprj_${'K'.repeat(43)}`,
  }), null)
})

test('project scope is optional, validated, and bound to the persisted thread', () => {
  const general = projectRoloConversation({
    ...scope,
    turns: [{ role: 'user', text: 'What maintenance is due?' }],
    proposedWork: null,
    followUp: null,
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
  })
  assert.equal(general?.projectRef, null)
  assert.equal(projectRoloConversation({
    ...scope,
    projectRef: 'not-a-project-ref',
    turns: [{ role: 'user', text: 'Review this project.' }],
    proposedWork: null,
    followUp: null,
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
  }), null)

  const invalidStored = { ...completeProjection(), projectRef: 'not-a-project-ref' }
  assert.equal(parseRoloConversation(JSON.stringify(invalidStored), scope), null)
})

test('corrupt and oversized serialized state fail closed', () => {
  assert.equal(parseRoloConversation('{broken', scope), null)
  assert.equal(parseRoloConversation('x'.repeat(MAX_ROLO_CONVERSATION_CHARACTERS + 1), scope), null)
})

test('projection retains only sixteen recent turns, one follow-up, and bounded text', () => {
  const projected = projectRoloConversation({
    ...scope,
    turns: Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 ? 'assistant' as const : 'user' as const,
      text: `${index}:${'x'.repeat(1_200)}`,
    })),
    proposedWork: null,
    followUp: 'f'.repeat(400),
    suggestion: null,
    attachment: null,
    photoReview: null,
    photoReviewTitle: null,
    photoReviewRef: null,
  })
  assert.ok(projected)
  assert.equal(projected.turns.length, 14)
  assert.equal(projected.turns.at(-1)?.text.length, 900)
  assert.equal(projected.turns.reduce((sum, turn) => sum + turn.text.length, 0), 12_000)
  assert.equal(projected.followUp?.length, 240)
})

test('the base Rolo route is blank unless it receives a fresh prompt', () => {
  const stored = completeProjection() as PersistedRoloConversation
  assert.deepEqual(planRoloHydration('Help me plan a pool', stored), {
    kind: 'prompt',
    input: 'Help me plan a pool',
  })
  assert.deepEqual(planRoloHydration(undefined, stored), { kind: 'empty' })
  assert.deepEqual(planRoloHydration(undefined, null), { kind: 'empty' })
})

test('an exact project restores its thread before considering a canned entry prompt', () => {
  const stored = completeProjection() as PersistedRoloConversation
  const otherProjectRef = `hprj_${'K'.repeat(43)}`

  assert.deepEqual(planRoloHydration(undefined, stored), { kind: 'empty' })
  assert.deepEqual(planRoloHydration(undefined, stored, projectRef), {
    kind: 'stored',
    conversation: stored,
  })
  assert.deepEqual(planRoloHydration('Review this work', stored, projectRef), {
    kind: 'stored',
    conversation: stored,
  })
  assert.deepEqual(planRoloHydration(undefined, stored, otherProjectRef), { kind: 'empty' })
  assert.deepEqual(planRoloHydration('Review this other work', stored, otherProjectRef), {
    kind: 'prompt',
    input: 'Review this other work',
  })
  assert.deepEqual(planRoloHydration(undefined, {
    ...stored,
    projectRef: null,
  }, projectRef), { kind: 'empty' })
})
