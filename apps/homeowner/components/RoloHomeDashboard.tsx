'use client'

import Link from 'next/link'
import { useRef } from 'react'
import type { HomeRecordProgress } from '../lib/home-record-progress.ts'
import type {
  DocumentSummary,
  HomeRecordProfile,
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

type CardTone = 'signal' | 'blue' | 'mint' | 'paper'

interface RoloCardView {
  readonly id: string
  readonly tab: string
  readonly eyebrow: string
  readonly title: string
  readonly detail: string
  readonly meta: string
  readonly href: string
  readonly tone: CardTone
}

interface ActivityView {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly detail: string
  readonly on: string | null
  readonly href: string
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function readableDate(value: string | null): string {
  if (!value) return 'Date open'
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.valueOf()) ? value : DATE_FORMAT.format(parsed)
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function knownProfessional(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0
    && normalized !== 'not recorded'
    && normalized !== 'not added'
    && normalized !== 'unknown'
}

function sortByDate<T extends { readonly id: string; readonly on: string | null }>(left: T, right: T): number {
  if (left.on === right.on) return left.id.localeCompare(right.id)
  if (left.on === null) return 1
  if (right.on === null) return -1
  return left.on < right.on ? 1 : -1
}

/**
 * A concise front door assembled entirely from records the homeowner already
 * has. Every card and activity row links back to its canonical workspace; this
 * component creates no parallel copy of project, file, or home data.
 */
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
  const cardDeck = useRef<HTMLUListElement | null>(null)
  const sortedProjects = [...projects].sort((left, right) => {
    if (left.performedOn === right.performedOn) return left.title.localeCompare(right.title)
    if (left.performedOn === null) return 1
    if (right.performedOn === null) return -1
    return left.performedOn < right.performedOn ? 1 : -1
  })
  const professionalNames = [...new Set(
    projects
      .map(project => project.professionalLabel.trim())
      .filter(knownProfessional),
  )]
  const completedCount = projects.filter(project => project.status === 'completed').length
  const activeCount = projects.filter(project => project.status === 'in_progress').length
  const earnedMilestones = progress.milestones.filter(milestone => milestone.earned).slice(0, 3)
  const exactAddress = homeRecord?.address
  const addressDetail = exactAddress
    ? `${exactAddress.city}, ${exactAddress.regionCode} ${exactAddress.postalCode}`
    : locality
  const homeFacts = [
    homeRecord?.yearBuilt
      ? `${homeRecord.yearBuilt.precision === 'approximate' ? 'About ' : ''}${homeRecord.yearBuilt.value}`
      : null,
    homeRecord && homeRecord.homeType !== 'unknown' ? humanize(homeRecord.homeType) : null,
  ].filter((value): value is string => value !== null)

  const cards: readonly RoloCardView[] = [
    {
      id: 'home',
      tab: 'HOME',
      eyebrow: 'The home',
      title: label,
      detail: exactAddress?.line1 ?? 'Open the facts that identify this home.',
      meta: [addressDetail, ...homeFacts].filter(Boolean).join(' · '),
      href: `/home/${homeId}/details`,
      tone: 'signal',
    },
    ...sortedProjects.slice(0, 3).map((project, index): RoloCardView => ({
      id: `work:${project.projectRef}`,
      tab: `WORK ${String(index + 1).padStart(2, '0')}`,
      eyebrow: humanize(project.category),
      title: project.title,
      detail: project.professionalLabel && knownProfessional(project.professionalLabel)
        ? project.professionalLabel
        : `${humanize(project.status)} work`,
      meta: `${readableDate(project.performedOn)} · ${humanize(project.status)}`,
      href: `/home/${homeId}/projects/${project.projectRef}`,
      tone: index % 2 === 0 ? 'blue' : 'mint',
    })),
    {
      id: 'library',
      tab: 'LIBRARY',
      eyebrow: 'Files, photos & warranties',
      title: progress.counts.files === 0 ? 'Start the paper trail' : `${progress.counts.files} saved ${progress.counts.files === 1 ? 'file' : 'files'}`,
      detail: progress.counts.warranties > 0
        ? `${progress.counts.warranties} ${progress.counts.warranties === 1 ? 'warranty' : 'warranties'} kept with this home.`
        : 'Keep the useful proof where you can find it again.',
      meta: documents === null ? 'Open the private library' : `${documents.length} indexed in this view`,
      href: `/home/${homeId}/documents`,
      tone: 'paper',
    },
    ...(professionalNames.length > 0 ? [{
      id: 'people',
      tab: 'PEOPLE',
      eyebrow: 'People who know this home',
      title: `${professionalNames.length} ${professionalNames.length === 1 ? 'professional' : 'professionals'}`,
      detail: professionalNames.slice(0, 3).join(' · '),
      meta: 'Drawn from saved work records',
      href: `/home/${homeId}/projects`,
      tone: 'mint' as const,
    }] : []),
    ...(checkupsEnabled ? [{
      id: 'watch',
      tab: 'HOME WATCH',
      eyebrow: 'Repeatable checkups',
      title: `${progress.counts.checkups} saved ${progress.counts.checkups === 1 ? 'checkup' : 'checkups'}`,
      detail: 'Photograph the same places over time and keep the comparisons together.',
      meta: 'Part of this home\u2019s visual history',
      href: `/home/${homeId}/checkups`,
      tone: 'blue' as const,
    }] : []),
  ]

  const activity: readonly ActivityView[] = [
    ...projects.map(project => ({
      id: `work:${project.projectRef}`,
      kind: 'Work',
      title: project.title,
      detail: `${humanize(project.category)} · ${humanize(project.status)}`,
      on: project.performedOn,
      href: `/home/${homeId}/projects/${project.projectRef}`,
    })),
    ...(documents ?? []).map(document => ({
      id: `file:${document.documentRef}`,
      kind: 'Library',
      title: document.title,
      detail: humanize(document.kind),
      on: document.addedOn,
      href: `/home/${homeId}/documents`,
    })),
  ].sort(sortByDate).slice(0, 4)

  function openAssistant() {
    window.dispatchEvent(new CustomEvent('homesrolo:open-assistant', {
      detail: { homeId },
    }))
  }

  function moveCards(direction: -1 | 1) {
    cardDeck.current?.scrollBy({ left: direction * 330, behavior: 'smooth' })
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero} aria-labelledby="rolo-home-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroMeta}>
            <span className={styles.homeMark} aria-hidden="true">⌂</span>
            <span>{synthetic ? 'Example home' : 'Private home'}</span>
            <span aria-hidden="true">/</span>
            <span>{locality}</span>
          </div>
          <h1 id="rolo-home-title">What does {label} need today?</h1>
          <p>
            {assistantEnabled
              ? 'Tell Rolo about a repair, service visit, purchase, idea, or project. Or open the exact part of the home you need.'
              : 'Add a repair, service visit, purchase, idea, or project—or open the exact part of the home you need.'}
          </p>
          {assistantEnabled ? (
            <button className={styles.askButton} type="button" onClick={openAssistant}>
              <span className={styles.askGlyph} aria-hidden="true">R</span>
              <span><strong>Ask Rolo</strong><small>Talk it through naturally</small></span>
              <span className={styles.askArrow} aria-hidden="true">↗</span>
            </button>
          ) : (
            <Link className={styles.askButton} href={`/home/${homeId}/projects`}>
              <span className={styles.askGlyph} aria-hidden="true">+</span>
              <span><strong>Add work</strong><small>Record it manually</small></span>
              <span className={styles.askArrow} aria-hidden="true">↗</span>
            </Link>
          )}
          <span className={styles.privacyLine}>Private by default. You approve what gets saved.</span>
        </div>

        <div className={styles.heroLedger} aria-label="Saved home record totals">
          <p className={styles.ledgerLabel}>IN THIS ROLO</p>
          <dl>
            <div><dt>Work</dt><dd>{projects.length}</dd></div>
            <div><dt>Files</dt><dd>{progress.counts.files}</dd></div>
            <div><dt>People</dt><dd>{professionalNames.length}</dd></div>
          </dl>
          <div className={styles.ledgerNote}>
            <span>{completedCount} completed</span>
            <span>{activeCount} active</span>
            <span>{progress.counts.representedAreas} home {progress.counts.representedAreas === 1 ? 'area' : 'areas'}</span>
          </div>
        </div>
      </section>

      <nav className={styles.quickActions} aria-label="Home shortcuts">
        <Link href={`/home/${homeId}/projects`}>
          <span aria-hidden="true">＋</span>
          <strong>Add or describe work</strong>
          <small>Past work, service, repair, issue, or project</small>
        </Link>
        <Link href={`/home/${homeId}/documents`}>
          <span aria-hidden="true">▤</span>
          <strong>Open the library</strong>
          <small>{uploadsEnabled ? 'Save photos, files, receipts, and warranties' : 'See this home\u2019s saved records'}</small>
        </Link>
        <Link href={`/home/${homeId}/details`}>
          <span aria-hidden="true">⌂</span>
          <strong>Home details</strong>
          <small>Address, age, type, and systems</small>
        </Link>
        {checkupsEnabled ? (
          <Link href={`/home/${homeId}/checkups`}>
            <span aria-hidden="true">◎</span>
            <strong>Home Watch</strong>
            <small>Repeat photos and compare what changed</small>
          </Link>
        ) : null}
      </nav>

      <section className={styles.roloSection} aria-labelledby="rolo-cards-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>YOUR ROLO</p>
            <h2 id="rolo-cards-title">Everything has a card.</h2>
          </div>
          <div className={styles.deckControls} aria-label="Move through Rolo cards">
            <button type="button" onClick={() => moveCards(-1)} aria-label="Previous card">←</button>
            <button type="button" onClick={() => moveCards(1)} aria-label="Next card">→</button>
          </div>
        </header>
        <ul className={styles.cardDeck} ref={cardDeck} aria-label="Saved home cards">
          {cards.map(card => (
            <li className={`${styles.roloCard} ${styles[card.tone]}`} key={card.id}>
              <Link href={card.href}>
                <span className={styles.cardTab}>{card.tab}</span>
                <span className={styles.cardEyebrow}>{card.eyebrow}</span>
                <strong>{card.title}</strong>
                <span className={styles.cardDetail}>{card.detail}</span>
                <span className={styles.cardMeta}>{card.meta}</span>
                <span className={styles.openCard}>Open card <span aria-hidden="true">↗</span></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.swipeHint}>Swipe the cards. Each one opens the record already behind it.</p>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.activitySection} aria-labelledby="recent-activity-title">
          <header className={styles.sectionHeader}>
            <div>
              <p>RECENT</p>
              <h2 id="recent-activity-title">What this home remembers</h2>
            </div>
            <Link className={styles.headerLink} href={`/home/${homeId}/projects`}>All work →</Link>
          </header>
          {activity.length > 0 ? (
            <ol className={styles.activityList}>
              {activity.map(item => (
                <li key={item.id}>
                  <Link href={item.href}>
                    <time dateTime={item.on ?? undefined}>{readableDate(item.on)}</time>
                    <span className={styles.activityBody}>
                      <small>{item.kind}</small>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyActivity}>
              <strong>This Rolo is ready for its first memory.</strong>
              <p>Add something the home has been through. An approximate date is enough.</p>
              <Link href={`/home/${homeId}/projects`}>Add the first one →</Link>
            </div>
          )}
        </section>

        <aside className={styles.progressCard} aria-labelledby="record-proof-title">
          <p className={styles.progressKicker}>SAVED PROOF</p>
          <h2 id="record-proof-title">A little more useful every time.</h2>
          <div className={styles.progressSummary}>
            <strong>{progress.documentedSteps}<small> / {progress.totalSteps}</small></strong>
            <span>record steps backed by something saved</span>
          </div>
          <progress value={progress.documentedSteps} max={progress.totalSteps}>
            {progress.documentedSteps} of {progress.totalSteps}
          </progress>
          {earnedMilestones.length > 0 ? (
            <ul className={styles.badges} aria-label="Earned record badges">
              {earnedMilestones.map(milestone => <li key={milestone.id}>✓ {milestone.label}</li>)}
            </ul>
          ) : null}
          <p className={styles.progressBoundary}>
            This reflects saved records only. It is not a rating of condition, safety, value, or insurability.
          </p>
        </aside>
      </div>
    </div>
  )
}
