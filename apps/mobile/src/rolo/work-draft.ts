import type { CreateWorkInput, RoloWorkDraft } from '../api/model.ts'

export type RoloWorkCreateFields = Omit<CreateWorkInput, 'commandRef'>

/** Converts an approved Rolo draft without manufacturing dates for historical work. */
export function workCreateFieldsFromRoloDraft(
  draft: RoloWorkDraft,
  localToday: string,
): RoloWorkCreateFields {
  const occurredOn = draft.occurredOn
    ?? (draft.kind !== 'task' && (draft.status === 'planned' || draft.status === 'in_progress')
      ? localToday
      : null)

  return {
    title: draft.title,
    workKind: draft.kind,
    category: draft.category,
    status: draft.status,
    ...(occurredOn ? { occurredOn } : {}),
    ...(draft.assignedMembershipRef
      ? { assignedMembershipRef: draft.assignedMembershipRef }
      : {}),
    ...(draft.dueOn ? { dueOn: draft.dueOn } : {}),
    ...(draft.summary ? { summary: draft.summary } : {}),
    ...(draft.professionalLabel ? { professionalLabel: draft.professionalLabel } : {}),
    ...(draft.firstUpdate
      ? { initialActivity: { kind: 'note', body: draft.firstUpdate } }
      : {}),
  }
}
