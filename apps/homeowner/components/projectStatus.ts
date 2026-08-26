import type { HomeownerWorkKind, ProjectCategory, ProjectStatus } from '../lib/port/types.ts'

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

export const PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = {
  interior: 'Interior & remodel',
  hvac: 'Heating & cooling',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  appliances: 'Appliances',
  exterior: 'Exterior & gutters',
  roofing: 'Roof',
  landscaping: 'Yard & landscaping',
  pest: 'Pest control',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Whole home',
}

export const PROJECT_CATEGORY_OPTIONS = (Object.entries(PROJECT_CATEGORY_LABEL) as [
  ProjectCategory,
  string,
][]).map(([value, label]) => ({ value, label }))
