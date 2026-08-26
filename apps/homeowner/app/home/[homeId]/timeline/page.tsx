'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { PHOTO_CHECKUP_AREA_LABEL } from '../../../../components/PhotoCheckups.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import {
  homeLabel,
  homeLocality,
  type DocumentSummary,
  type PhotoCheckup,
  type ProjectCategory,
  type ProjectStatus,
} from '../../../../lib/port/types.ts'
import styles from './timeline.module.css'

type ActivityFilter = 'all' | 'work' | 'photos' | 'files'

interface ActivityEntry {
  readonly id: string
  readonly kind: Exclude<ActivityFilter, 'all'>
  readonly date: string | null
  readonly title: string
  readonly eyebrow: string
  readonly detail: string
  readonly context: string
  readonly href: string
}

interface ActivityGroup {
  readonly label: string
  readonly entries: readonly ActivityEntry[]
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
  pest: 'Pest',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Whole home',
}

const STATUS_LABEL: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Closed',
}

function fileKind(kind: DocumentSummary['kind']): string {
  if (kind === 'photo_set') return 'Photos'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function normalizedDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function groupLabel(value: string | null): string {
  const parsed = normalizedDate(value)
  return parsed ? String(parsed.getFullYear()) : 'Date not recorded'
}

function dateParts(value: string | null): { readonly month: string; readonly day: string } {
  const parsed = normalizedDate(value)
  if (!parsed) return { month: 'DATE', day: '—' }
  return {
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(parsed).toLocaleUpperCase(),
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(parsed),
  }
}

/** A chronological projection over work, photos, and files; no copied timeline storage. */
export default function ActivityPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const projects = usePortCall(() => port.listProjects(homeId))
  const filesReadable = mode === 'synthetic'
    || (session.state.kind === 'signed_in' && session.state.capabilities.uploads)
  const files = usePortCall<readonly DocumentSummary[]>(() => filesReadable
    ? port.listDocuments(homeId)
    : Promise.resolve({ ok: true as const, value: [] }))
  const checkupsReadable = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.photoCheckups
  const checkups = usePortCall<readonly PhotoCheckup[]>(() => checkupsReadable
    ? port.listPhotoCheckups(homeId)
    : Promise.resolve({ ok: true as const, value: [] }))
  const retryProjects = projects.retry
  const retryFiles = files.retry
  const retryCheckups = checkups.retry
  const previousFilesReadable = useRef(filesReadable)
  const previousCheckupsReadable = useRef(checkupsReadable)
  const [filter, setFilter] = useState<ActivityFilter>('all')

  useEffect(() => {
    if (previousCheckupsReadable.current === checkupsReadable) return
    previousCheckupsReadable.current = checkupsReadable
    retryCheckups()
  }, [checkupsReadable, retryCheckups])

  useEffect(() => {
    if (previousFilesReadable.current === filesReadable) return
    previousFilesReadable.current = filesReadable
    retryFiles()
  }, [filesReadable, retryFiles])

  useEffect(() => {
    const refreshChangedHome = (event: Event) => {
      if ((event as CustomEvent<{ homeId?: string }>).detail?.homeId !== homeId) return
      retryProjects()
      if (filesReadable) retryFiles()
      if (checkupsReadable) retryCheckups()
    }
    window.addEventListener('homesrolo:data-changed', refreshChangedHome)
    return () => window.removeEventListener('homesrolo:data-changed', refreshChangedHome)
  }, [checkupsReadable, filesReadable, homeId, retryCheckups, retryFiles, retryProjects])

  const entries = useMemo<readonly ActivityEntry[]>(() => {
    const work: ActivityEntry[] = (projects.state.status === 'ready' ? projects.state.value : [])
      .filter(project => !project.archived)
      .map<ActivityEntry>(project => ({
        id: project.projectRef,
        kind: 'work',
        date: project.performedOn,
        title: project.title,
        eyebrow: CATEGORY_LABEL[project.category],
        detail: STATUS_LABEL[project.status],
        context: project.professionalLabel || project.trade || 'Saved work',
        href: `/home/${homeId}/projects/${project.projectRef}`,
      }))

    const documents: ActivityEntry[] = (files.state.status === 'ready' ? files.state.value : [])
      .map<ActivityEntry>(document => ({
        id: document.documentRef,
        kind: document.kind === 'photo_set' ? 'photos' : 'files',
        date: document.addedOn,
        title: document.title,
        eyebrow: fileKind(document.kind),
        detail: 'Added to this home',
        context: document.projectRef ? 'Filed with saved work' : 'Home library',
        href: document.projectRef
          ? `/home/${homeId}/projects/${document.projectRef}?section=files`
          : `/home/${homeId}/documents`,
      }))

    const checkupPhotos: ActivityEntry[] = (checkups.state.status === 'ready' ? checkups.state.value : [])
      .map<ActivityEntry>(photo => ({
        id: photo.photoRef,
        kind: 'photos',
        date: photo.observedOn,
        title: photo.viewLabel,
        eyebrow: `${PHOTO_CHECKUP_AREA_LABEL[photo.area]} photo`,
        detail: 'Saved in Home Watch',
        context: photo.caption || 'Repeatable private home view',
        href: `/home/${homeId}/checkups`,
      }))

    return [...work, ...documents, ...checkupPhotos].sort((left, right) => {
      if (left.date && right.date) return right.date.localeCompare(left.date)
      if (left.date) return -1
      if (right.date) return 1
      return left.title.localeCompare(right.title)
    })
  }, [checkups.state, files.state, homeId, projects.state])

  const counts = useMemo(() => ({
    all: entries.length,
    work: entries.filter(entry => entry.kind === 'work').length,
    photos: entries.filter(entry => entry.kind === 'photos').length,
    files: entries.filter(entry => entry.kind === 'files').length,
  }), [entries])

  const groups = useMemo<readonly ActivityGroup[]>(() => {
    const visible = filter === 'all' ? entries : entries.filter(entry => entry.kind === filter)
    const byLabel = new Map<string, ActivityEntry[]>()
    for (const entry of visible) {
      const label = groupLabel(entry.date)
      byLabel.set(label, [...(byLabel.get(label) ?? []), entry])
    }
    return [...byLabel.entries()].map(([label, groupedEntries]) => ({ label, entries: groupedEntries }))
  }, [entries, filter])

  if (home.state.status === 'loading' || projects.state.status === 'loading') {
    return <div className="panel"><Skeleton lines={7} label="Opening home activity" /></div>
  }
  if (home.state.status === 'error') return <ErrorState retry={home.retry} error={home.state.error} />
  if (projects.state.status === 'error') return <ErrorState retry={projects.retry} error={projects.state.error} />
  if (home.state.status !== 'ready') return null

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>The story so far</p>
          <h1>Activity</h1>
          <p className={styles.lead}>A single history of the work, photos, and files already connected to this home.</p>
          <p className={styles.homeName}>{homeLabel(home.state.value)} <span>{homeLocality(home.state.value)}</span></p>
        </div>
        <Link href={`/home/${homeId}/projects`} className={styles.addButton}>
          <span aria-hidden="true">+</span>
          Add something
        </Link>
      </header>

      <section className={styles.history} aria-labelledby="activity-history-title">
        <div className={styles.historyHead}>
          <div>
            <p className={styles.eyebrow}>Home history</p>
            <h2 id="activity-history-title">What this home remembers</h2>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter activity">
            {(['all', 'work', 'photos', 'files'] as const).map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === 'all' ? 'All' : value === 'work' ? 'Work' : value === 'photos' ? 'Photos' : 'Files'}
                <small>{counts[value]}</small>
              </button>
            ))}
          </div>
        </div>

        {files.state.status === 'loading' || checkups.state.status === 'loading' ? <p className={styles.loading} role="status">Adding saved photos and files to the history…</p> : null}
        {files.state.status === 'error' ? (
          <div className={styles.fileError} role="status">
            <span>Saved files could not be added to this view.</span>
            <button type="button" onClick={files.retry}>Try again</button>
          </div>
        ) : null}
        {checkups.state.status === 'error' ? (
          <div className={styles.fileError} role="status">
            <span>Home Watch photos could not be added to this view.</span>
            <button type="button" onClick={checkups.retry}>Try again</button>
          </div>
        ) : null}

        {groups.length ? (
          <div className={styles.groups}>
            {groups.map(group => {
              const headingId = `activity-${group.label.replaceAll(' ', '-').toLocaleLowerCase()}`
              return (
                <section className={styles.yearGroup} key={group.label} aria-labelledby={headingId}>
                  <header>
                    <h3 id={headingId}>{group.label}</h3>
                    <span>{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}</span>
                  </header>
                  <ol>
                    {group.entries.map(entry => {
                      const shownDate = dateParts(entry.date)
                      return (
                        <li key={`${entry.kind}-${entry.id}`}>
                          <time dateTime={entry.date ?? undefined} className={styles.date}>
                            <small>{shownDate.month}</small>
                            <strong>{shownDate.day}</strong>
                          </time>
                          <span className={`${styles.dot} ${entry.kind === 'work' ? styles.workDot : styles.fileDot}`} aria-hidden="true" />
                          <Link href={entry.href} className={styles.entry}>
                            <span className={styles.entryTop}>
                              <small>{entry.eyebrow}</small>
                              <b>{entry.kind === 'work' ? 'WORK' : entry.kind === 'photos' ? 'PHOTO' : 'FILE'}</b>
                            </span>
                            <strong>{entry.title}</strong>
                            <span className={styles.entryDetails}>{entry.detail} <i aria-hidden="true">·</i> {entry.context}</span>
                            <span className={styles.open}>Open <b aria-hidden="true">→</b></span>
                          </Link>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true">⌂</span>
            <div>
              <h3>{filter === 'all' ? 'The first entry starts here' : `No ${filter} in this history`}</h3>
              <p>{filter === 'all'
                ? 'Add a repair, service visit, idea, project, photo, or file. Homesrolo will put it in order.'
                : 'Choose All to see the rest of this home’s activity.'}</p>
            </div>
            {filter === 'all'
              ? <Link href={`/home/${homeId}/projects`}>Add something</Link>
              : <button type="button" onClick={() => setFilter('all')}>Show all</button>}
          </div>
        )}
      </section>
    </div>
  )
}
