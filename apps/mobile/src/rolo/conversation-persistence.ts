import type {
  RoloReply,
  RoloTurn,
  RoloWorkDraft,
  WorkCategory,
  WorkKind,
  WorkStatus,
} from '../api/model.ts'
import {
  isArtifactRef,
  isCalendarDate,
  isHomeRef,
  isHouseholdMembershipRef,
  isProjectRef,
} from '../api/protocol.ts'

export const ROLO_CONVERSATION_SCHEMA_VERSION = 3
export const MAX_ROLO_CONVERSATION_CHARACTERS = 24 * 1024

const PRINCIPAL_REF_PATTERN = /^hprn_[A-Za-z0-9_-]{43}$/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const WORK_KINDS: readonly WorkKind[] = ['project', 'issue', 'repair', 'service', 'incident', 'task']
const LEGACY_WORK_KINDS: readonly WorkKind[] = ['project', 'issue', 'repair', 'service', 'incident']
const WORK_STATUSES: readonly WorkStatus[] = ['planned', 'in_progress', 'completed', 'cancelled']
const WORK_CATEGORIES: readonly WorkCategory[] = [
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
]
const DESTINATIONS = ['home', 'activity', 'library', 'details', 'work'] as const
const URGENCIES = ['routine', 'prompt_attention', 'urgent'] as const
const HAZARD_SIGNALS = [
  'none',
  'visible_fire_or_smoke',
  'visible_sparking_or_exposed_electrical',
  'water_near_electrical',
  'major_displacement_or_collapse',
] as const

export interface RoloConversationScope {
  readonly principalRef: string
  readonly homeRef: string
  /** Omitted for legacy/general scope; an exact ref binds storage to one work record. */
  readonly projectRef?: string | null
}

export interface PersistedRoloPhoto {
  readonly artifactRef: string
  readonly title: string
}

export interface PersistedRoloTurn extends RoloTurn {
  readonly photo: PersistedRoloPhoto | null
}

export interface PersistedRoloSuggestion {
  readonly destination: typeof DESTINATIONS[number]
  readonly projectRef: string | null
}

export interface PersistedRoloPhotoReview {
  readonly photo: PersistedRoloPhoto
  readonly projection: NonNullable<RoloReply['photoReview']>
}

export interface PersistedRoloConversation extends RoloConversationScope {
  readonly schemaVersion: typeof ROLO_CONVERSATION_SCHEMA_VERSION
  /** The work record this exact conversation is about, when it has one. */
  readonly projectRef: string | null
  readonly turns: readonly PersistedRoloTurn[]
  readonly proposedWork: RoloWorkDraft | null
  readonly followUp: string | null
  readonly suggestion: PersistedRoloSuggestion | null
  readonly attachment: PersistedRoloPhoto | null
  readonly photoReview: PersistedRoloPhotoReview | null
}

export interface RoloConversationProjectionInput extends RoloConversationScope {
  readonly projectRef?: string | null
  readonly turns: readonly (RoloTurn & {
    readonly photoTitle?: string
    readonly photoArtifactRef?: string
  })[]
  readonly proposedWork: RoloWorkDraft | null
  readonly followUp: string | null
  readonly suggestion: Readonly<Pick<RoloReply, 'destination' | 'projectRef'>> | null
  readonly attachment: PersistedRoloPhoto | null
  readonly photoReview: RoloReply['photoReview']
  readonly photoReviewTitle: string | null
  readonly photoReviewRef: string | null
}

export type RoloHydrationPlan =
  | { readonly kind: 'prompt'; readonly input: string }
  | { readonly kind: 'stored'; readonly conversation: PersistedRoloConversation }
  | { readonly kind: 'empty' }

export function isPrincipalRef(value: unknown): value is string {
  return typeof value === 'string' && PRINCIPAL_REF_PATTERN.test(value)
}

export function isRoloConversationScope(value: RoloConversationScope): boolean {
  return isPrincipalRef(value.principalRef)
    && isHomeRef(value.homeRef)
    && (value.projectRef === undefined
      || value.projectRef === null
      || isProjectRef(value.projectRef))
}

/**
 * The ordinary Rolo tab is always a clean front door. A work route may restore
 * only that work record's thread; its canned prompt is merely a fallback for a
 * project that has no saved conversation yet.
 */
export function planRoloHydration(
  prompt: string | undefined,
  stored: PersistedRoloConversation | null,
  requestedProjectRef?: string,
): RoloHydrationPlan {
  if (requestedProjectRef === undefined) {
    return prompt === undefined
      ? { kind: 'empty' }
      : { kind: 'prompt', input: prompt.slice(0, 1_600) }
  }
  if (stored?.projectRef === requestedProjectRef) {
    return { kind: 'stored', conversation: stored }
  }
  if (prompt !== undefined) return { kind: 'prompt', input: prompt.slice(0, 1_600) }
  return { kind: 'empty' }
}

/**
 * Projects screen state into the only fields that may survive locally. This is
 * deliberately an allow-list: picker files, blob URLs, consent, credentials,
 * addresses, and arbitrary API payloads have nowhere to be serialized.
 */
export function projectRoloConversation(
  input: RoloConversationProjectionInput,
): PersistedRoloConversation | null {
  if (!isRoloConversationScope(input)) return null
  const projectRef = input.projectRef === undefined || input.projectRef === null
    ? null
    : isProjectRef(input.projectRef) ? input.projectRef : null
  if (input.projectRef !== undefined && input.projectRef !== null && projectRef === null) return null
  let remaining = 12_000
  const turns: PersistedRoloTurn[] = []
  for (const turn of input.turns.slice(-16).reverse()) {
    if (turn.role !== 'user' && turn.role !== 'assistant') continue
    const text = boundedProjectionText(turn.text, Math.min(900, remaining), false)
    if (text === null || !text) continue
    const photo = parsePhoto({
      artifactRef: turn.photoArtifactRef,
      title: turn.photoTitle,
    })
    turns.unshift({ role: turn.role, text, photo })
    remaining -= text.length
    if (remaining === 0) break
  }

  const proposedWork = parseWorkDraft(input.proposedWork, ROLO_CONVERSATION_SCHEMA_VERSION)
  const followUp = input.followUp === null
    ? null
    : boundedProjectionText(input.followUp, 240, true)
  const suggestion = parseSuggestion(input.suggestion)
  const attachment = parsePhoto(input.attachment)
  const photo = parsePhoto({
    artifactRef: input.photoReviewRef,
    title: input.photoReviewTitle,
  })
  const projection = parsePhotoReviewProjection(input.photoReview)
  const photoReview = photo && projection ? { photo, projection } : null

  const conversation: PersistedRoloConversation = {
    schemaVersion: ROLO_CONVERSATION_SCHEMA_VERSION,
    principalRef: input.principalRef,
    homeRef: input.homeRef,
    projectRef,
    turns,
    proposedWork,
    followUp,
    suggestion,
    attachment,
    photoReview,
  }
  if (!hasPersistableRoloConversation(conversation)) return null
  return conversation
}

export function hasPersistableRoloConversation(value: PersistedRoloConversation): boolean {
  return value.turns.length > 0
    || value.proposedWork !== null
    || value.followUp !== null
    || value.suggestion !== null
    || value.attachment !== null
    || value.photoReview !== null
}

export function serializeRoloConversation(value: PersistedRoloConversation): string {
  const candidate = JSON.stringify(value)
  const parsed = parseRoloConversation(candidate, value)
  if (!parsed) throw new Error('invalid_rolo_conversation_persistence')
  return JSON.stringify(parsed)
}

export function parseRoloConversation(
  raw: string,
  expected: RoloConversationScope,
): PersistedRoloConversation | null {
  if (!isRoloConversationScope(expected)
    || raw.length < 2
    || raw.length > MAX_ROLO_CONVERSATION_CHARACTERS) return null
  let source: unknown
  try { source = JSON.parse(raw) } catch { return null }
  const object = exactObject(source, [
    'schemaVersion', 'principalRef', 'homeRef', 'projectRef', 'turns', 'proposedWork',
    'followUp', 'suggestion', 'attachment', 'photoReview',
  ])
  if (!object
    || (object.schemaVersion !== 2 && object.schemaVersion !== ROLO_CONVERSATION_SCHEMA_VERSION)
    || object.principalRef !== expected.principalRef
    || object.homeRef !== expected.homeRef
    || (object.projectRef !== null && !isProjectRef(object.projectRef))
    || (expected.projectRef !== undefined
      && object.projectRef !== (expected.projectRef ?? null))
    || !Array.isArray(object.turns)
    || object.turns.length > 16) return null

  const turns: PersistedRoloTurn[] = []
  let totalText = 0
  for (const value of object.turns) {
    const turn = exactObject(value, ['role', 'text', 'photo'])
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant')) return null
    const text = strictText(turn.text, 900, false)
    const photo = turn.photo === null ? null : parsePhoto(turn.photo)
    if (text === null || (turn.photo !== null && photo === null)) return null
    totalText += text.length
    if (totalText > 12_000) return null
    turns.push({ role: turn.role, text, photo })
  }

  const storedSchemaVersion = object.schemaVersion as 2 | typeof ROLO_CONVERSATION_SCHEMA_VERSION
  const proposedWork = object.proposedWork === null
    ? null
    : parseWorkDraft(object.proposedWork, storedSchemaVersion)
  const followUp = object.followUp === null ? null : strictText(object.followUp, 240, true)
  const suggestion = object.suggestion === null ? null : parseSuggestion(object.suggestion)
  const attachment = object.attachment === null ? null : parsePhoto(object.attachment)
  const review = object.photoReview === null
    ? null
    : parsePhotoReview(object.photoReview)
  if ((object.proposedWork !== null && proposedWork === null)
    || (object.followUp !== null && followUp === null)
    || (object.suggestion !== null && suggestion === null)
    || (object.attachment !== null && attachment === null)
    || (object.photoReview !== null && review === null)) return null

  return {
    schemaVersion: ROLO_CONVERSATION_SCHEMA_VERSION,
    principalRef: expected.principalRef,
    homeRef: expected.homeRef,
    projectRef: object.projectRef as string | null,
    turns,
    proposedWork,
    followUp,
    suggestion,
    attachment,
    photoReview: review,
  }
}

function parsePhotoReview(value: unknown): PersistedRoloPhotoReview | null {
  const object = exactObject(value, ['photo', 'projection'])
  if (!object) return null
  const photo = parsePhoto(object.photo)
  const projection = parsePhotoReviewProjection(object.projection)
  return photo && projection ? { photo, projection } : null
}

function parsePhotoReviewProjection(value: unknown): NonNullable<RoloReply['photoReview']> | null {
  const object = exactObject(value, [
    'visibleObservations', 'cannotConfirm', 'urgency', 'suggestedTrade', 'hazardSignal',
  ])
  if (!object
    || !Array.isArray(object.visibleObservations)
    || object.visibleObservations.length < 1
    || object.visibleObservations.length > 5
    || !Array.isArray(object.cannotConfirm)
    || object.cannotConfirm.length < 1
    || object.cannotConfirm.length > 4
    || !URGENCIES.includes(object.urgency as typeof URGENCIES[number])
    || !HAZARD_SIGNALS.includes(object.hazardSignal as typeof HAZARD_SIGNALS[number])
    || (object.suggestedTrade !== null
      && !WORK_CATEGORIES.includes(object.suggestedTrade as WorkCategory))) return null
  const visibleObservations = strictTextArray(object.visibleObservations, 240)
  const cannotConfirm = strictTextArray(object.cannotConfirm, 240)
  if (!visibleObservations || !cannotConfirm) return null
  return {
    visibleObservations,
    cannotConfirm,
    urgency: object.urgency as NonNullable<RoloReply['photoReview']>['urgency'],
    suggestedTrade: object.suggestedTrade as WorkCategory | null,
    hazardSignal: object.hazardSignal as NonNullable<RoloReply['photoReview']>['hazardSignal'],
  }
}

function parsePhoto(value: unknown): PersistedRoloPhoto | null {
  const object = exactObject(value, ['artifactRef', 'title'])
  if (!object || !isArtifactRef(object.artifactRef)) return null
  const title = strictText(object.title, 160, true)
  return title === null ? null : { artifactRef: object.artifactRef, title }
}

function parseSuggestion(value: unknown): PersistedRoloSuggestion | null {
  const object = exactObject(value, ['destination', 'projectRef'])
  if (!object || !DESTINATIONS.includes(object.destination as typeof DESTINATIONS[number])) return null
  const projectRef = object.projectRef === null
    ? null
    : isProjectRef(object.projectRef) ? object.projectRef : null
  if (object.projectRef !== null && projectRef === null) return null
  if (projectRef !== null && object.destination !== 'work') return null
  return {
    destination: object.destination as PersistedRoloSuggestion['destination'],
    projectRef,
  }
}

function parseWorkDraft(value: unknown, schemaVersion: 2 | 3): RoloWorkDraft | null {
  const object = exactObject(value, [
    'kind', 'title', 'category', 'status', 'occurredOn', 'summary',
    'professionalLabel', 'firstUpdate',
    ...(schemaVersion === 3 ? ['assignedMembershipRef', 'dueOn'] : []),
  ])
  if (!object
    || !(schemaVersion === 2 ? LEGACY_WORK_KINDS : WORK_KINDS).includes(object.kind as WorkKind)
    || !WORK_CATEGORIES.includes(object.category as WorkCategory)
    || !WORK_STATUSES.includes(object.status as WorkStatus)
    || (object.occurredOn !== null && !isCalendarDate(object.occurredOn))
    || (schemaVersion === 3 && object.assignedMembershipRef !== null
      && !isHouseholdMembershipRef(object.assignedMembershipRef))
    || (schemaVersion === 3 && object.dueOn !== null && !isCalendarDate(object.dueOn))) return null
  const title = strictText(object.title, 120, true)
  const summary = strictText(object.summary, 2_000, false)
  const professionalLabel = object.professionalLabel === null
    ? null
    : strictText(object.professionalLabel, 160, true)
  const firstUpdate = object.firstUpdate === null
    ? null
    : strictText(object.firstUpdate, 2_000, true)
  if (title === null || summary === null
    || (object.professionalLabel !== null && professionalLabel === null)
    || (object.firstUpdate !== null && firstUpdate === null)) return null
  return {
    kind: object.kind as WorkKind,
    title,
    category: object.category as WorkCategory,
    status: object.status as WorkStatus,
    occurredOn: object.occurredOn as string | null,
    assignedMembershipRef: schemaVersion === 3
      ? object.assignedMembershipRef as string | null
      : null,
    dueOn: schemaVersion === 3 ? object.dueOn as string | null : null,
    summary,
    professionalLabel,
    firstUpdate,
  }
}

function strictText(value: unknown, maximum: number, requireNonempty: boolean): string | null {
  if (typeof value !== 'string' || value.length > maximum || CONTROL_CHARACTERS.test(value)) return null
  const clean = value.trim()
  if (requireNonempty && clean.length < 1) return null
  return clean
}

function boundedProjectionText(value: unknown, maximum: number, requireNonempty: boolean): string | null {
  if (typeof value !== 'string' || maximum < 1 || CONTROL_CHARACTERS.test(value)) return null
  const clean = value.trim().slice(0, maximum)
  if (requireNonempty && clean.length < 1) return null
  return clean
}

function strictTextArray(value: readonly unknown[], maximum: number): string[] | null {
  const output: string[] = []
  for (const item of value) {
    const text = strictText(item, maximum, true)
    if (text === null) return null
    output.push(text)
  }
  return output
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  const actual = Object.keys(object).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return null
  return object
}
