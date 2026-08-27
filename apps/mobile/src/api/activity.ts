import type { ProjectActivityRecord } from './model.ts'

type JsonRecord = Record<string, unknown>

const ACTIVITY_KEYS = [
  'activityRef', 'body', 'createdAt', 'homeRef', 'kind', 'projectRef', 'source',
] as const
const ACTIVITY_REF = /^hact_[A-Za-z0-9_-]{43}$/
const HOME_REF = /^hhom_[A-Za-z0-9_-]{43}$/
const PROJECT_REF = /^hprj_[A-Za-z0-9_-]{43}$/
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

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

/** Strictly decodes the server's bounded project-activity view. */
export function parseProjectActivity(value: unknown): ProjectActivityRecord {
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== [...ACTIVITY_KEYS].sort().join(',')
    || typeof source.activityRef !== 'string' || !ACTIVITY_REF.test(source.activityRef)
    || typeof source.homeRef !== 'string' || !HOME_REF.test(source.homeRef)
    || typeof source.projectRef !== 'string' || !PROJECT_REF.test(source.projectRef)
    || (source.kind !== 'note' && source.kind !== 'milestone')
    || typeof source.body !== 'string' || source.body.length < 1 || source.body.length > 2_000
    || source.body.trim() !== source.body
    || source.source !== 'homeowner_entry'
    || !canonicalUtcInstant(source.createdAt)) {
    throw new Error('invalid_wire_data')
  }
  return {
    activityRef: source.activityRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    kind: source.kind,
    body: source.body,
    source: 'homeowner_entry',
    createdAt: source.createdAt,
  }
}
