import type { HomeownerWorkKind, ProjectStatus } from '../lib/port/types.ts'

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

/** Human labels for the discriminator on the one existing work-record model. */
export const WORK_KIND_LABEL: Record<HomeownerWorkKind, string> = {
  project: 'Project',
  issue: 'Issue',
  repair: 'Repair',
  service: 'Service visit',
  incident: 'Home event',
}

export const WORK_KIND_OPTIONS = (Object.entries(WORK_KIND_LABEL) as [
  HomeownerWorkKind,
  string,
][]).map(([value, label]) => ({ value, label }))
