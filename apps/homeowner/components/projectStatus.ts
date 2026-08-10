import type { ProjectStatus } from '../lib/port/types.ts'

/** One vocabulary for the four runtime-aligned statuses, shared by list and detail. */

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const STATUS_PILL: Record<ProjectStatus, string> = {
  planned: 'pill pill--muted',
  in_progress: 'pill pill--progress',
  completed: 'pill pill--recorded',
  cancelled: 'pill pill--muted',
}
