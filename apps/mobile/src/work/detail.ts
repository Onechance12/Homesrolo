import type {
  WorkCategory,
  WorkKind,
  WorkRecord,
  WorkStatus,
} from '../api/model.ts'

export const WORK_KINDS: readonly WorkKind[] = [
  'project',
  'issue',
  'repair',
  'service',
  'incident',
  'task',
]

export const WORK_CATEGORIES: readonly WorkCategory[] = [
  'roofing',
  'hvac',
  'plumbing',
  'electrical',
  'interior',
  'exterior',
  'appliances',
  'landscaping',
  'pest',
  'pool',
  'new_construction',
  'other',
]

export const WORK_STATUSES: readonly WorkStatus[] = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
]

export interface WorkDraft {
  readonly title: string
  readonly workKind: WorkKind
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn: string
  readonly assignedMembershipRef: string | null
  readonly dueOn: string
  readonly summary: string
  readonly professionalLabel: string
}

export interface WorkUpdateFields {
  readonly title: string
  readonly workKind: WorkKind
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn: string | null
  readonly assignedMembershipRef: string | null
  readonly dueOn: string | null
  readonly summary: string | null
  readonly professionalLabel: string | null
}

export function findExactWork(
  records: readonly WorkRecord[],
  homeRef: string,
  projectRef: string,
): WorkRecord | null {
  return records.find(record => record.homeRef === homeRef && record.projectRef === projectRef) ?? null
}

export function draftFromWork(work: WorkRecord): WorkDraft {
  return {
    title: work.title,
    workKind: work.workKind,
    category: work.category,
    status: work.status,
    occurredOn: work.occurredOn ?? '',
    assignedMembershipRef: work.assignedMembershipRef,
    dueOn: work.dueOn ?? '',
    summary: work.summary,
    professionalLabel: work.professionalLabel ?? '',
  }
}

export function fieldsFromDraft(draft: WorkDraft): WorkUpdateFields {
  const occurredOn = draft.occurredOn.trim()
  const dueOn = draft.dueOn.trim()
  const summary = draft.summary.trim()
  const professionalLabel = draft.professionalLabel.trim()
  return {
    title: draft.title.trim(),
    workKind: draft.workKind,
    category: draft.category,
    status: draft.status,
    occurredOn: occurredOn || null,
    assignedMembershipRef: draft.assignedMembershipRef,
    dueOn: dueOn || null,
    summary: summary || null,
    professionalLabel: professionalLabel || null,
  }
}

export function validOptionalWorkDate(value: string): boolean {
  const clean = value.trim()
  if (!clean) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false
  const parsed = new Date(`${clean}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === clean
}

export function workHasChanges(work: WorkRecord, draft: WorkDraft): boolean {
  const fields = fieldsFromDraft(draft)
  return fields.title !== work.title
    || fields.workKind !== work.workKind
    || fields.category !== work.category
    || fields.status !== work.status
    || fields.occurredOn !== work.occurredOn
    || fields.assignedMembershipRef !== work.assignedMembershipRef
    || fields.dueOn !== work.dueOn
    || (fields.summary ?? '') !== work.summary
    || fields.professionalLabel !== work.professionalLabel
}

/**
 * A deterministic client-side key for deciding whether a retry is the same
 * optimistic update and must therefore reuse its command reference.
 */
export function workUpdateIntent(
  projectRef: string,
  expectedRevision: number,
  fields: WorkUpdateFields,
): string {
  return JSON.stringify({ projectRef, expectedRevision, ...fields })
}

export function workNoteIntent(projectRef: string, body: string): string {
  return JSON.stringify({ projectRef, kind: 'note', body: body.trim() })
}
