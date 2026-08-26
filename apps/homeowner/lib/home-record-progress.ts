import type {
  DocumentSummary,
  HomeViewEntry,
  PhotoCheckup,
  ProjectSummary,
} from './port/types.ts'
import { homeLocality } from './port/types.ts'

export type HomeProgressTrackId = 'know' | 'protect' | 'care' | 'remember'

export interface HomeProgressTrack {
  readonly id: HomeProgressTrackId
  readonly label: string
  readonly summary: string
  readonly completed: number
  readonly total: number
  readonly evidence: readonly string[]
}

export interface HomeMission {
  readonly label: string
  readonly detail: string
  readonly href: string
  readonly minutes: string
}

export interface HomeMilestone {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly earned: boolean
}

export interface RoloCard {
  readonly id: string
  readonly eyebrow: string
  readonly title: string
  readonly detail: string
  readonly metric: string
  readonly href: string
  readonly tone: 'lime' | 'blue' | 'mint' | 'plain'
}

export interface HomeChapter {
  readonly id: string
  readonly on: string | null
  readonly title: string
  readonly detail: string
  readonly href: string
  readonly kind: 'project' | 'file'
}

export interface HomeRecordProgress {
  readonly tracks: readonly HomeProgressTrack[]
  readonly missions: readonly HomeMission[]
  readonly milestones: readonly HomeMilestone[]
  readonly cards: readonly RoloCard[]
  readonly chapters: readonly HomeChapter[]
  readonly documentedSteps: number
  readonly totalSteps: number
  readonly counts: {
    readonly projects: number
    readonly completedProjects: number
    readonly plannedProjects: number
    readonly files: number
    readonly warranties: number
    readonly projectPhotos: number
    readonly checkups: number
    readonly representedAreas: number
  }
}

interface HomeRecordProgressInput {
  readonly home: HomeViewEntry
  readonly projects: readonly ProjectSummary[]
  /** Null means the file index was not offered by this runtime. */
  readonly documents: readonly DocumentSummary[] | null
  /** Null means private photo checkups were not offered by this runtime. */
  readonly checkups: readonly PhotoCheckup[] | null
  readonly uploadsEnabled: boolean
  readonly checkupsEnabled: boolean
}

function truthyLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 && !normalized.includes('not recorded') && !normalized.includes('not added')
}

function buildTrack(
  id: HomeProgressTrackId,
  label: string,
  summary: string,
  criteria: readonly { readonly complete: boolean; readonly evidence: string }[],
): HomeProgressTrack {
  return {
    id,
    label,
    summary,
    completed: criteria.filter(item => item.complete).length,
    total: criteria.length,
    evidence: criteria.filter(item => item.complete).map(item => item.evidence),
  }
}

/**
 * A transparent record-progress projection. It measures only saved evidence;
 * it never scores the home's condition, safety, value, or insurability.
 */
export function buildHomeRecordProgress(input: HomeRecordProgressInput): HomeRecordProgress {
  const { home, projects, documents, checkups, uploadsEnabled, checkupsEnabled } = input
  const completedProjects = projects.filter(project => project.status === 'completed')
  const plannedProjects = projects.filter(project => project.status === 'planned')
  const activeProjects = projects.filter(project => project.status === 'in_progress')
  const syntheticProjectCounters = projects.some(project => project.isSynthetic)
  const linkedDocuments = documents?.filter(document => document.projectRef !== null) ?? []
  const projectPhotos = documents === null || syntheticProjectCounters
    ? projects.reduce((sum, project) => sum + project.photoCount, 0)
    : linkedDocuments.filter(document => document.kind === 'photo_set').length
  const projectDocuments = documents === null || syntheticProjectCounters
    ? projects.reduce((sum, project) => sum + project.documentCount, 0)
    : linkedDocuments.filter(document => document.kind !== 'photo_set').length
  const representedAreas = new Set(projects.map(project => project.trade.trim().toLowerCase()).filter(Boolean)).size
  const loadedFiles = documents?.length ?? 0
  const loadedWarranties = documents?.filter(document => document.kind === 'warranty').length ?? 0
  const serverFiles = home.source === 'server' ? home.documentCount : 0
  const serverWarranties = home.source === 'server' ? home.warrantyCount : 0
  const files = Math.max(loadedFiles, serverFiles, projectDocuments)
  const warranties = Math.max(loadedWarranties, serverWarranties)
  const checkupCount = checkups?.length ?? 0
  const repeatViews = new Set<string>()
  const seenViews = new Set<string>()
  for (const checkup of checkups ?? []) {
    const key = `${checkup.area}:${checkup.viewLabel.trim().toLowerCase()}`
    if (seenViews.has(key)) repeatViews.add(key)
    seenViews.add(key)
  }
  const hasDatedProject = projects.some(project => project.performedOn !== null)
  const hasProjectEvidence = documents === null || syntheticProjectCounters
    ? projects.some(project => project.photoCount + project.documentCount > 0)
    : linkedDocuments.length > 0

  const tracks = [
    buildTrack('know', 'Know it', 'The basic facts and parts represented in this record.', [
      { complete: true, evidence: 'Home Record started' },
      { complete: truthyLabel(homeLocality(home)), evidence: 'Home location labeled' },
      { complete: representedAreas >= 3, evidence: 'Three home areas represented' },
    ]),
    buildTrack('protect', 'Protect it', 'Paperwork and visual evidence kept with the home.', [
      { complete: files > 0, evidence: 'A home file is saved' },
      { complete: warranties > 0, evidence: 'A warranty is saved' },
      { complete: projectPhotos + checkupCount > 0, evidence: 'Photo evidence is saved' },
    ]),
    buildTrack('care', 'Care for it', 'Completed work and repeatable checkups recorded over time.', [
      { complete: completedProjects.length > 0, evidence: 'Completed work recorded' },
      { complete: checkupCount > 0, evidence: 'A home checkup is saved' },
      { complete: repeatViews.size > 0, evidence: 'The same view was photographed again' },
    ]),
    buildTrack('remember', 'Remember it', 'Chapters that future you can actually find again.', [
      { complete: projects.length > 0, evidence: 'A project chapter exists' },
      { complete: hasDatedProject, evidence: 'A project has a date' },
      { complete: hasProjectEvidence, evidence: 'A project has supporting evidence' },
    ]),
  ] as const

  const missionCandidates: HomeMission[] = []
  if (projects.length === 0) {
    missionCandidates.push({
      label: 'Add one thing your home should remember',
      detail: 'A repair, remodel, service visit, or project from any year is enough.',
      href: `/home/${home.homeRef}/projects`,
      minutes: '2 min',
    })
  }
  if (completedProjects.length === 0) {
    missionCandidates.push({
      label: 'Remember one completed project',
      detail: 'An approximate year is fine when the exact date is gone.',
      href: `/home/${home.homeRef}/projects`,
      minutes: '3 min',
    })
  }
  if (uploadsEnabled && files === 0) {
    missionCandidates.push({
      label: 'Save one useful home file',
      detail: 'Start with a warranty, receipt, manual, contract, or inspection.',
      href: `/home/${home.homeRef}/documents`,
      minutes: '2 min',
    })
  }
  if (uploadsEnabled && projectPhotos === 0) {
    missionCandidates.push({
      label: 'Give the record its first photo',
      detail: 'A system label, finished project, or condition photo is useful evidence.',
      href: `/home/${home.homeRef}/documents`,
      minutes: '2 min',
    })
  }
  if (checkupsEnabled && checkupCount === 0) {
    missionCandidates.push({
      label: 'Create a repeatable photo baseline',
      detail: 'Choose one view you can photograph again next season.',
      href: `/home/${home.homeRef}/checkups`,
      minutes: '4 min',
    })
  } else if (checkupsEnabled && repeatViews.size === 0) {
    missionCandidates.push({
      label: 'Repeat one saved home view',
      detail: 'A second photo makes a real side-by-side comparison possible.',
      href: `/home/${home.homeRef}/checkups`,
      minutes: '4 min',
    })
  }
  if (representedAreas < 3 && projects.length > 0) {
    missionCandidates.push({
      label: 'Add a chapter from another part of the home',
      detail: 'Roofing is one chapter. HVAC, interior, plumbing, electrical, yard, and more belong here too.',
      href: `/home/${home.homeRef}/projects`,
      minutes: '3 min',
    })
  }
  if (activeProjects.length > 0) {
    missionCandidates.push({
      label: 'Open the project already in motion',
      detail: 'Keep its decisions and supporting records with the chapter while work is active.',
      href: `/home/${home.homeRef}/projects/${activeProjects[0]!.projectRef}`,
      minutes: '2 min',
    })
  }
  if (files > 0) {
    missionCandidates.push({
      label: 'Check the paper trail',
      detail: 'Make sure the useful warranty, receipt, permit, or manual is easy to recognize.',
      href: `/home/${home.homeRef}/documents`,
      minutes: '2 min',
    })
  }
  if (completedProjects.length > 0) {
    missionCandidates.push({
      label: 'Revisit a completed chapter',
      detail: 'Confirm the title and date will still make sense years from now.',
      href: `/home/${home.homeRef}/projects/${completedProjects[0]!.projectRef}`,
      minutes: '2 min',
    })
  }
  if (missionCandidates.length < 3) {
    missionCandidates.push({
      label: plannedProjects.length > 0 ? 'Open a planned project' : 'Add another home chapter',
      detail: plannedProjects.length > 0
        ? 'Keep decisions and supporting records together before work starts.'
        : 'Continue the history with anything this home has been through.',
      href: plannedProjects[0]
        ? `/home/${home.homeRef}/projects/${plannedProjects[0].projectRef}`
        : `/home/${home.homeRef}/projects`,
      minutes: '3 min',
    })
  }

  const milestones: readonly HomeMilestone[] = [
    { id: 'record-started', label: 'Home Record started', detail: 'This home has somewhere to remember.', earned: true },
    { id: 'first-chapter', label: 'First chapter', detail: 'At least one project is recorded.', earned: projects.length > 0 },
    { id: 'paper-trail', label: 'Paper trail', detail: 'At least one supporting file is saved.', earned: files > 0 },
    { id: 'visual-baseline', label: 'Visual baseline', detail: 'At least one project or checkup photo is saved.', earned: projectPhotos + checkupCount > 0 },
    { id: 'warranty-keeper', label: 'Warranty keeper', detail: 'A warranty is filed with the home.', earned: warranties > 0 },
    { id: 'project-remembered', label: 'Project remembered', detail: 'Completed work is part of the history.', earned: completedProjects.length > 0 },
    { id: 'whole-home-story', label: 'Whole-home story', detail: 'Three different parts of the home are represented.', earned: representedAreas >= 3 },
  ]

  const cards: readonly RoloCard[] = [
    {
      id: 'projects', eyebrow: 'Project chapters', title: 'Work on this home',
      detail: `${completedProjects.length} completed · ${activeProjects.length} active`,
      metric: String(projects.length), href: `/home/${home.homeRef}/projects`, tone: 'lime',
    },
    {
      id: 'files', eyebrow: 'Home papers', title: 'Files and warranties',
      detail: `${warranties} ${warranties === 1 ? 'warranty' : 'warranties'} kept with the record`,
      metric: String(files), href: `/home/${home.homeRef}/documents`, tone: 'blue',
    },
    {
      id: 'photos', eyebrow: 'Visual history', title: 'Photos over time',
      detail: checkupsEnabled ? `${checkupCount} repeatable checkup ${checkupCount === 1 ? 'view' : 'views'}` : 'Project photos kept with their chapters',
      metric: String(projectPhotos + checkupCount),
      href: checkupsEnabled ? `/home/${home.homeRef}/checkups` : `/home/${home.homeRef}/documents`, tone: 'mint',
    },
    {
      id: 'plans', eyebrow: 'Decisions ahead', title: 'Planned work',
      detail: plannedProjects.length > 0 ? 'Keep options and records together before work begins.' : 'Nothing is waiting on a decision.',
      metric: String(plannedProjects.length), href: `/home/${home.homeRef}/projects`, tone: 'plain',
    },
  ]

  const chapters: HomeChapter[] = [
    ...projects.map(project => ({
      id: `project:${project.projectRef}`,
      on: project.performedOn,
      title: project.title,
      detail: `${project.trade} · ${project.status.replace('_', ' ')}`,
      href: `/home/${home.homeRef}/projects/${project.projectRef}`,
      kind: 'project' as const,
    })),
    ...(documents ?? []).map(document => ({
      id: `file:${document.documentRef}`,
      on: document.addedOn,
      title: document.title,
      detail: `${document.kind.replace('_', ' ')} added to the Home Record`,
      href: `/home/${home.homeRef}/documents`,
      kind: 'file' as const,
    })),
  ].sort((a, b) => {
    if (a.on === b.on) return a.title.localeCompare(b.title)
    if (a.on === null) return 1
    if (b.on === null) return -1
    return a.on < b.on ? 1 : -1
  }).slice(0, 6)

  return {
    tracks,
    missions: missionCandidates.slice(0, 3),
    milestones,
    cards,
    chapters,
    documentedSteps: tracks.reduce((sum, track) => sum + track.completed, 0),
    totalSteps: tracks.reduce((sum, track) => sum + track.total, 0),
    counts: {
      projects: projects.length,
      completedProjects: completedProjects.length,
      plannedProjects: plannedProjects.length,
      files,
      warranties,
      projectPhotos,
      checkups: checkupCount,
      representedAreas,
    },
  }
}
