'use client'

import Link from 'next/link'
import type { HomeRecordProgress } from '../lib/home-record-progress.ts'
import type {
  DocumentSummary,
  HomeRecordProfile,
  ProjectCategory,
  ProjectSummary,
} from '../lib/port/types.ts'
import styles from './RoloHomeDashboard.module.css'

export interface RoloHomeDashboardProps {
  readonly homeId: string
  readonly label: string
  readonly locality: string
  readonly progress: HomeRecordProgress
  readonly homeRecord: HomeRecordProfile | null
  readonly projects: readonly ProjectSummary[]
  readonly documents: readonly DocumentSummary[] | null
  readonly uploadsEnabled: boolean
  readonly checkupsEnabled: boolean
  readonly assistantEnabled: boolean
  readonly synthetic: boolean
}

interface StartAction {
  readonly id: string
  readonly mark: string
  readonly title: string
  readonly detail: string
  readonly prompt: string
  readonly tone: 'urgent' | 'project' | 'care' | 'history'
}

const START_ACTIONS: readonly StartAction[] = [
  {
    id: 'fix',
    mark: '!',
    title: 'Fix a problem',
    detail: 'Broken, leaking, stopped, or just not right.',
    prompt: 'Something at my home is broken or not working. Help me think through safe first checks, ask only what you need, and help me organize the right issue or repair.',
    tone: 'urgent',
  },
  {
    id: 'plan',
    mark: '◇',
    title: 'Plan a project',
    detail: 'Turn an idea into photos, choices, and a clear plan.',
    prompt: 'I want to plan a home project. Start by asking what I want to change and what matters most. Help me organize photos, ideas, and choices, then prepare a planned project for my approval.',
    tone: 'project',
  },
  {
    id: 'care',
    mark: '↻',
    title: 'Get routine help',
    detail: 'Yard care, pest control, tune-ups, and service.',
    prompt: 'I need routine help at my home. Ask what service I need and whether this is one time or recurring. Help me create a service request I can use to organize photos and the person or company doing the work.',
    tone: 'care',
  },
  {
    id: 'past',
    mark: '✓',
    title: 'Add past work',
    detail: 'Save an old repair, replacement, or project.',
    prompt: 'I want to add work that already happened at my home. Ask what was done, roughly when, who did it if I know, and what photos, receipts, or warranties I still have.',
    tone: 'history',
  },
]

const QUICK_STARTS = [
  {
    label: 'Pool & outdoor',
    prompt: 'I am thinking about a pool or outdoor-living project. Help me describe the vision, organize yard photos, and start a pool project where I can keep materials and choices.',
  },
  {
    label: 'Yard work',
    prompt: 'I need help with my yard or landscaping. Ask whether this is a one-time job or routine service and what a professional would need to see.',
  },
  {
    label: 'AC or heat',
    prompt: 'I need help with heating or cooling at my home. Help me check only what is safe, gather the useful details, and decide the right next step.',
  },
  {
    label: 'Remodel a room',
    prompt: 'I want to remodel a room. Help me turn the idea into a project with inspiration photos, products, decisions, and questions for professionals.',
  },
] as const

const CATEGORY_MARK: Readonly<Record<ProjectCategory, string>> = {
  roofing: '⌂',
  exterior: '▱',
  interior: '◇',
  electrical: 'ϟ',
  plumbing: '≈',
  hvac: '↻',
  landscaping: '✿',
  appliances: '□',
  pest: '•',
  pool: '≋',
  new_construction: '+',
  other: '·',
}

const CATEGORY_LABEL: Readonly<Record<ProjectCategory, string>> = {
  roofing: 'Roof',
  exterior: 'Exterior',
  interior: 'Interior',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  landscaping: 'Yard & landscape',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Whole home',
}

function workKindLabel(project: ProjectSummary): string {
  if (project.workKind === 'service') return 'Service'
  if (project.workKind === 'repair') return 'Repair'
  if (project.workKind === 'issue') return 'Problem'
  if (project.workKind === 'incident') return 'Home event'
  return 'Project'
}

function nextMove(project: ProjectSummary): string {
  if (project.status === 'in_progress') return 'Add an update or photo'
  if (project.workKind === 'service') return 'Add details or the pro helping'
  if (project.workKind === 'issue' || project.workKind === 'repair') return 'Document what you see next'
  return 'Add photos, ideas, or choices'
}

/** The action-first front door over the existing canonical home records. */
export function RoloHomeDashboard({
  homeId,
  label,
  locality,
  progress,
  homeRecord,
  projects,
  documents,
  uploadsEnabled,
  checkupsEnabled,
  assistantEnabled,
  synthetic,
}: RoloHomeDashboardProps) {
  const activeWork = [...projects]
    .filter(project => !project.archived && (project.status === 'planned' || project.status === 'in_progress'))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'in_progress' ? -1 : 1
      return (right.performedOn ?? '').localeCompare(left.performedOn ?? '')
    })
  const finishedCount = projects.filter(project => !project.archived && project.status === 'completed').length
  const exactLocation = homeRecord?.address
    ? `${homeRecord.address.city}, ${homeRecord.address.regionCode}`
    : locality

  function openAssistant(prompt?: string) {
    window.dispatchEvent(new CustomEvent('homesrolo:open-assistant', {
      detail: { homeId, ...(prompt ? { prompt } : {}) },
    }))
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.todayHead}>
        <div>
          <p className={styles.kicker}>{synthetic ? 'Example home' : `Today at ${label}`}</p>
          <h1>What do you need done?</h1>
          <p>Start with the problem or idea. The home history builds quietly while you handle it.</p>
        </div>
        {assistantEnabled ? (
          <button type="button" className={styles.roloReady} onClick={() => openAssistant()}>
            <span aria-hidden="true">R</span>
            <span><strong>Rolo is ready</strong><small>Talk it through</small></span>
          </button>
        ) : null}
      </header>

      <section className={styles.startSection} aria-labelledby="start-title">
        <h2 id="start-title" className={styles.srOnly}>Start something</h2>
        <div className={styles.actionGrid}>
          {START_ACTIONS.map(action => assistantEnabled ? (
            <button
              type="button"
              key={action.id}
              className={`${styles.actionCard} ${styles[action.tone]}`}
              onClick={() => openAssistant(action.prompt)}
            >
              <span className={styles.actionMark} aria-hidden="true">{action.mark}</span>
              <span><strong>{action.title}</strong><small>{action.detail}</small></span>
              <span className={styles.actionArrow} aria-hidden="true">→</span>
            </button>
          ) : (
            <Link key={action.id} className={`${styles.actionCard} ${styles[action.tone]}`} href={`/home/${homeId}/projects`}>
              <span className={styles.actionMark} aria-hidden="true">{action.mark}</span>
              <span><strong>{action.title}</strong><small>{action.detail}</small></span>
              <span className={styles.actionArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
        {assistantEnabled ? (
          <div className={styles.quickStarts} aria-label="Quick starts">
            <span>Quick start</span>
            <div>
              {QUICK_STARTS.map(item => (
                <button type="button" key={item.label} onClick={() => openAssistant(item.prompt)}>{item.label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.workSection} aria-labelledby="in-motion-title">
        <header className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>IN MOTION</p>
            <h2 id="in-motion-title">Pick up where you left off.</h2>
          </div>
          <Link href={`/home/${homeId}/projects`}>All plans</Link>
        </header>
        {activeWork.length > 0 ? (
          <div className={styles.workList}>
            {activeWork.slice(0, 4).map(project => (
              <Link key={project.projectRef} href={`/home/${homeId}/projects/${project.projectRef}`} className={styles.workCard}>
                <span className={styles.workMark} aria-hidden="true">{CATEGORY_MARK[project.category]}</span>
                <span className={styles.workBody}>
                  <span className={styles.workMeta}>{CATEGORY_LABEL[project.category]} · {workKindLabel(project)}</span>
                  <strong>{project.title}</strong>
                  <small>{nextMove(project)}</small>
                </span>
                <span className={project.status === 'in_progress' ? styles.liveStatus : styles.plannedStatus}>
                  {project.status === 'in_progress' ? 'In progress' : 'Planned'}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyWork}>
            <span aria-hidden="true">+</span>
            <div><strong>Nothing needs your attention here yet.</strong><p>Start with one problem, service need, or project idea.</p></div>
            {assistantEnabled
              ? <button type="button" onClick={() => openAssistant(START_ACTIONS[0]?.prompt)}>Start with Rolo</button>
              : <Link href={`/home/${homeId}/projects`}>Add work</Link>}
          </div>
        )}
      </section>

      <section className={styles.toolsSection} aria-labelledby="home-tools-title">
        <header className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>THE HOUSE</p>
            <h2 id="home-tools-title">Everything else is one tap away.</h2>
          </div>
        </header>
        <nav className={styles.toolGrid} aria-label="Home tools">
          <Link href={`/home/${homeId}/documents`}>
            <span aria-hidden="true">▣</span><strong>Photos &amp; files</strong><small>{uploadsEnabled ? 'Capture, upload, and organize' : 'Open the private library'}</small>
          </Link>
          {checkupsEnabled ? (
            <Link href={`/home/${homeId}/checkups`}>
              <span aria-hidden="true">◎</span><strong>Home Watch</strong><small>Roof Watch and whole-home checkups</small>
            </Link>
          ) : null}
          <Link href={`/home/${homeId}/rolo`}>
            <span aria-hidden="true">⌂</span><strong>My Home</strong><small>Systems, people, work, and saved proof</small>
          </Link>
          <Link href={`/home/${homeId}/timeline`}>
            <span aria-hidden="true">↗</span><strong>Activity</strong><small>See what happened and when</small>
          </Link>
        </nav>
      </section>

      <section className={styles.memoryCard} aria-labelledby="memory-title">
        <div>
          <p className={styles.kicker}>MY HOME</p>
          <h2 id="memory-title">The record happens underneath the work.</h2>
          <p>{exactLocation} · {projects.length} work {projects.length === 1 ? 'entry' : 'entries'} · {progress.counts.files} saved {progress.counts.files === 1 ? 'file' : 'files'}</p>
        </div>
        <dl>
          <div><dt>Active</dt><dd>{activeWork.length}</dd></div>
          <div><dt>Finished</dt><dd>{finishedCount}</dd></div>
          <div><dt>Saved</dt><dd>{documents?.length ?? progress.counts.files}</dd></div>
        </dl>
        <Link href={`/home/${homeId}/rolo`}>Open My Home →</Link>
      </section>
    </div>
  )
}
