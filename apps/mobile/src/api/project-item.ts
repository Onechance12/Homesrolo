import type {
  ProjectItem,
  ProjectItemKind,
  ProjectItemState,
  SaveProjectItemInput,
} from './model.ts'
import { isHomeRef, isProjectRef } from './protocol.ts'

type JsonRecord = Record<string, unknown>

export const PROJECT_ITEM_KINDS = [
  'material', 'decision', 'wishlist',
] as const satisfies readonly ProjectItemKind[]

export const PROJECT_ITEM_STATES = [
  'considering', 'chosen', 'purchased', 'declined',
] as const satisfies readonly ProjectItemState[]

export const PROJECT_ITEM_KIND_LABELS: Readonly<Record<ProjectItemKind, string>> = Object.freeze({
  material: 'Product or material',
  decision: 'Decision',
  wishlist: 'Wish list',
})

export const PROJECT_ITEM_STATE_LABELS: Readonly<Record<ProjectItemState, string>> = Object.freeze({
  considering: 'Considering',
  chosen: 'Chosen',
  purchased: 'Purchased',
  declined: 'Not using',
})

const ITEM_KEYS = [
  'createdAt', 'detail', 'homeRef', 'itemRef', 'kind', 'label', 'projectRef',
  'revision', 'source', 'state', 'updatedAt',
] as const
const ITEM_REF = /^hpit_[A-Za-z0-9_-]{43}$/
const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const KIND_SET = new Set<ProjectItemKind>(PROJECT_ITEM_KINDS)
const STATE_SET = new Set<ProjectItemState>(PROJECT_ITEM_STATES)

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_wire_data')
  }
  return value as JsonRecord
}

function canonicalUtcInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function exactText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string'
    && value.length <= maximum
    && (allowEmpty || value.length >= 1)
    && value.trim() === value
}

/** Strictly decodes the existing project-item projection without widening it. */
export function parseProjectItem(value: unknown): ProjectItem {
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== [...ITEM_KEYS].sort().join(',')
    || typeof source.itemRef !== 'string' || !ITEM_REF.test(source.itemRef)
    || !isHomeRef(source.homeRef)
    || !isProjectRef(source.projectRef)
    || typeof source.kind !== 'string' || !KIND_SET.has(source.kind as ProjectItemKind)
    || !exactText(source.label, 160)
    || !exactText(source.detail, 2_000, true)
    || typeof source.state !== 'string' || !STATE_SET.has(source.state as ProjectItemState)
    || source.source !== 'homeowner_entry'
    || typeof source.revision !== 'number' || !Number.isInteger(source.revision)
    || source.revision < 1
    || !canonicalUtcInstant(source.createdAt)
    || !canonicalUtcInstant(source.updatedAt)
    || source.updatedAt < source.createdAt) {
    throw new Error('invalid_wire_data')
  }
  return {
    itemRef: source.itemRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    kind: source.kind as ProjectItemKind,
    label: source.label,
    detail: source.detail,
    state: source.state as ProjectItemState,
    source: 'homeowner_entry',
    revision: source.revision,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

/** Returns the exact revisioned server command, or null before transport. */
export function projectItemBody(input: SaveProjectItemInput): SaveProjectItemInput | null {
  const label = input.label.trim()
  const detail = input.detail?.trim()
  const editing = input.itemRef !== undefined || input.expectedRevision !== undefined
  if (!COMMAND_REF.test(input.commandRef)
    || (input.itemRef === undefined) !== (input.expectedRevision === undefined)
    || (editing && (typeof input.itemRef !== 'string' || !ITEM_REF.test(input.itemRef)))
    || (editing && (!Number.isInteger(input.expectedRevision) || (input.expectedRevision ?? 0) < 1))
    || !KIND_SET.has(input.kind)
    || !STATE_SET.has(input.state)
    || !exactText(label, 160)
    || (detail !== undefined && !exactText(detail, 2_000))) return null

  return {
    commandRef: input.commandRef,
    ...(input.itemRef === undefined ? {} : {
      itemRef: input.itemRef,
      expectedRevision: input.expectedRevision,
    }),
    kind: input.kind,
    label,
    ...(detail === undefined ? {} : { detail }),
    state: input.state,
  }
}

export function projectItemIntent(
  projectRef: string,
  input: Omit<SaveProjectItemInput, 'commandRef'>,
): string {
  return JSON.stringify({
    projectRef,
    ...(input.itemRef === undefined ? {} : {
      itemRef: input.itemRef,
      expectedRevision: input.expectedRevision,
    }),
    kind: input.kind,
    label: input.label.trim(),
    ...(input.detail?.trim() ? { detail: input.detail.trim() } : {}),
    state: input.state,
  })
}
