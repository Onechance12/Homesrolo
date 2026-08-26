'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { PHOTO_CHECKUP_AREA_LABEL } from '../../../../components/PhotoCheckups.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import {
  homeLabel,
  homeLocality,
  type DocumentSummary,
  type HomeRecordProfile,
  type HomeSystemKind,
  type PhotoCheckup,
  type ProjectCategory,
  type ProjectSummary,
  type ProjectStatus,
} from '../../../../lib/port/types.ts'
import styles from './rolo.module.css'

type RoloFilter = 'all' | 'work' | 'home' | 'people' | 'saved'
type Accent = 'lime' | 'blue' | 'mint' | 'slate'

interface RoloEntry {
  readonly id: string
  readonly group: Exclude<RoloFilter, 'all'>
  readonly eyebrow: string
  readonly title: string
  readonly detail: string
  readonly meta: string
  readonly href: string
  readonly tab: string
  readonly mark: string
  readonly accent: Accent
  readonly searchText: string
}

const FILTERS: readonly { readonly value: RoloFilter; readonly label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
  { value: 'people', label: 'People' },
  { value: 'saved', label: 'Saved' },
]

const SYSTEM_LABEL: Readonly<Record<HomeSystemKind, string>> = {
  roof: 'Roof',
  heating: 'Heating',
  cooling: 'Cooling',
  water_heater: 'Water heater',
  gutters: 'Gutters',
  foundation: 'Foundation',
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
  completed: 'Complete',
  cancelled: 'Closed',
}

function readableDate(value: string | null): string {
  if (!value) return 'Date not recorded'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function fileKind(kind: DocumentSummary['kind']): string {
  if (kind === 'photo_set') return 'Photos'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function emptyStateFor(filter: RoloFilter, homeId: string) {
  if (filter === 'people') return {
    title: 'No home pros saved yet',
    detail: 'Open a saved job and add the company or person who handled it. Homesrolo will connect them to every job they appear on.',
    href: `/home/${homeId}/projects`,
    action: 'Open saved work',
  }
  if (filter === 'home') return {
    title: 'Home details need a first pass',
    detail: 'Add what you know about the roof, heating, cooling, water heater, gutters, and foundation.',
    href: `/home/${homeId}/details`,
    action: 'Open home details',
  }
  if (filter === 'saved') return {
    title: 'Nothing saved in the Library yet',
    detail: 'Add a photo, receipt, estimate, warranty, or Home Watch view and it will become a card here.',
    href: `/home/${homeId}/documents`,
    action: 'Open the Library',
  }
  if (filter === 'work') return {
    title: 'No work saved yet',
    detail: 'Start with a repair, service visit, home event, old job, or project—whatever this home should remember first.',
    href: `/home/${homeId}/projects`,
    action: 'Add work',
  }
  return {
    title: 'This Rolo is ready for its first card',
    detail: 'Add work, home details, a professional, a photo, or a file. Each one joins the same searchable home history.',
    href: `/home/${homeId}/projects`,
    action: 'Add something',
  }
}

/** One searchable Rolodex assembled from the records this home already owns. */
export default function RoloPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const { homeId } = use(params)
  const queryParams = use(searchParams)
  const requestedFilter = Array.isArray(queryParams.filter) ? null : queryParams.filter
  const initialFilter: RoloFilter = FILTERS.some(option => option.value === requestedFilter)
    ? requestedFilter as RoloFilter
    : 'all'
  const router = useRouter()
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const projects = usePortCall(() => port.listProjects(homeId))
  const record = usePortCall<HomeRecordProfile | null>(() => mode === 'remote'
    ? port.getHomeRecord(homeId)
    : Promise.resolve({ ok: true as const, value: null }))
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
  const retryRecord = record.retry
  const retryFiles = files.retry
  const retryCheckups = checkups.retry
  const previousFilesReadable = useRef(filesReadable)
  const previousCheckupsReadable = useRef(checkupsReadable)
  const filter = initialFilter
  const [query, setQuery] = useState('')

  function chooseFilter(nextFilter: RoloFilter) {
    router.replace(
      `/home/${homeId}/rolo${nextFilter === 'all' ? '' : `?filter=${nextFilter}`}`,
      { scroll: false },
    )
  }

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
      retryRecord()
      if (filesReadable) retryFiles()
      if (checkupsReadable) retryCheckups()
    }
    window.addEventListener('homesrolo:data-changed', refreshChangedHome)
    return () => window.removeEventListener('homesrolo:data-changed', refreshChangedHome)
  }, [checkupsReadable, filesReadable, homeId, retryCheckups, retryFiles, retryProjects, retryRecord])

  const entries = useMemo<readonly RoloEntry[]>(() => {
    const projectRecords = projects.state.status === 'ready' ? projects.state.value : []
    const documentRecords = files.state.status === 'ready' ? files.state.value : []
    const checkupRecords = checkups.state.status === 'ready' ? checkups.state.value : []
    const profile = record.state.status === 'ready' ? record.state.value : null
    const work: RoloEntry[] = projectRecords
      .filter(project => !project.archived)
      .map<RoloEntry>(project => ({
        id: project.projectRef,
        group: 'work',
        eyebrow: CATEGORY_LABEL[project.category],
        title: project.title,
        detail: project.professionalLabel || project.trade || 'Saved to this home',
        meta: `${STATUS_LABEL[project.status]} · ${readableDate(project.performedOn)}`,
        href: `/home/${homeId}/projects/${project.projectRef}`,
        tab: 'WORK',
        mark: CATEGORY_LABEL[project.category].slice(0, 1),
        accent: project.status === 'in_progress' ? 'lime' : project.status === 'completed' ? 'mint' : 'blue',
        searchText: [project.title, project.trade, project.professionalLabel, CATEGORY_LABEL[project.category], STATUS_LABEL[project.status]].join(' '),
      }))

    const homeSystems: RoloEntry[] = (profile?.systems ?? [])
      .filter(system => system.present !== 'no')
      .map<RoloEntry>(system => {
        const year = system.installedOrReplacedYear
        const detail = year
          ? `${year.precision === 'approximate' ? 'About ' : ''}${year.value}`
          : system.present === 'yes' ? 'Present · year not recorded' : 'Details not recorded'
        const label = SYSTEM_LABEL[system.kind]
        return {
          id: `system-${system.kind}`,
          group: 'home',
          eyebrow: 'Home system',
          title: label,
          detail,
          meta: 'Home details',
          href: `/home/${homeId}/details`,
          tab: 'HOME',
          mark: label.slice(0, 1),
          accent: 'blue',
          searchText: `${label} ${detail} home system`,
        }
      })

    const peopleByName = new Map<string, {
      readonly label: string
      readonly projects: readonly ProjectSummary[]
    }>()
    for (const project of projectRecords) {
      const label = project.professionalLabel.trim()
      if (!label || project.archived) continue
      const key = label.toLocaleLowerCase()
      const current = peopleByName.get(key)
      peopleByName.set(key, {
        label: current?.label ?? label,
        projects: [...(current?.projects ?? []), project],
      })
    }
    const people: RoloEntry[] = [...peopleByName.entries()].map<RoloEntry>(([key, person]) => {
      const newest = [...person.projects].sort((left, right) =>
        (right.performedOn ?? '').localeCompare(left.performedOn ?? ''))[0]
      const count = person.projects.length
      return {
        id: `person-${key}`,
        group: 'people',
        eyebrow: 'Home professional',
        title: person.label,
        detail: count === 1 ? 'Connected to 1 saved job' : `Connected to ${count} saved jobs`,
        meta: newest ? `Last in ${newest.title}` : 'Connected to this home',
        href: newest ? `/home/${homeId}/projects/${newest.projectRef}` : `/home/${homeId}/projects`,
        tab: 'PRO',
        mark: person.label.slice(0, 1).toLocaleUpperCase(),
        accent: 'lime',
        searchText: `${person.label} ${person.projects.map(project => project.title).join(' ')}`,
      }
    })

    const savedFiles: RoloEntry[] = documentRecords.map<RoloEntry>(document => ({
      id: document.documentRef,
      group: 'saved',
      eyebrow: fileKind(document.kind),
      title: document.title,
      detail: document.projectRef
        ? 'Filed with saved work'
        : 'Filed with this home',
      meta: `Added ${readableDate(document.addedOn)}`,
      href: document.projectRef
        ? `/home/${homeId}/projects/${document.projectRef}?section=files`
        : `/home/${homeId}/documents`,
      tab: document.kind === 'photo_set' ? 'PHOTO' : 'FILE',
      mark: document.kind === 'photo_set' ? '▣' : '≡',
      accent: document.kind === 'photo_set' ? 'mint' : 'slate',
      searchText: `${document.title} ${fileKind(document.kind)} ${document.addedOn}`,
    }))

    const savedCheckups: RoloEntry[] = checkupRecords.map<RoloEntry>(photo => ({
      id: photo.photoRef,
      group: 'saved',
      eyebrow: `${PHOTO_CHECKUP_AREA_LABEL[photo.area]} · Home Watch`,
      title: photo.viewLabel,
      detail: photo.caption || 'Repeatable private home view',
      meta: `Observed ${readableDate(photo.observedOn)}`,
      href: `/home/${homeId}/checkups`,
      tab: 'PHOTO',
      mark: '▣',
      accent: 'mint',
      searchText: `${photo.viewLabel} ${PHOTO_CHECKUP_AREA_LABEL[photo.area]} ${photo.caption} ${photo.observedOn} Home Watch checkup`,
    }))

    return [...work, ...homeSystems, ...people, ...savedFiles, ...savedCheckups]
  }, [checkups.state, files.state, homeId, projects.state, record.state])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(option => [
    option.value,
    option.value === 'all' ? entries.length : entries.filter(entry => entry.group === option.value).length,
  ])) as Record<RoloFilter, number>, [entries])

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return entries.filter(entry => (filter === 'all' || entry.group === filter)
      && (!needle || `${entry.title} ${entry.searchText}`.toLocaleLowerCase().includes(needle)))
  }, [entries, filter, query])
  const emptyState = emptyStateFor(filter, homeId)

  if (home.state.status === 'loading' || projects.state.status === 'loading') {
    return <div className="panel"><Skeleton lines={7} label="Opening your Rolo" /></div>
  }
  if (home.state.status === 'error') return <ErrorState retry={home.retry} error={home.state.error} />
  if (projects.state.status === 'error') return <ErrorState retry={projects.retry} error={projects.state.error} />
  if (home.state.status !== 'ready') return null

  const optionalLoadFailed = record.state.status === 'error' && record.state.error !== 'unavailable'
    || files.state.status === 'error'
    || checkups.state.status === 'error'

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Your home, indexed</p>
          <h1>The Rolo</h1>
          <p className={styles.intro}>Work, people, home systems, photos, and files—connected without making you remember where everything lives.</p>
          <div className={styles.homeIdentity}>
            <span>{homeLabel(home.state.value)}</span>
            <small>{homeLocality(home.state.value)}</small>
          </div>
        </div>
        <dl className={styles.scoreboard} aria-label="Rolo summary">
          <div><dt>Work</dt><dd>{counts.work}</dd></div>
          <div><dt>People</dt><dd>{counts.people}</dd></div>
          <div><dt>Saved</dt><dd>{counts.saved}</dd></div>
        </dl>
      </header>

      <section className={styles.directory} aria-labelledby="rolo-directory-title">
        <div className={styles.directoryHead}>
          <div>
            <p className={styles.eyebrow}>Flip through this home</p>
            <h2 id="rolo-directory-title">Everything has a card</h2>
          </div>
          <Link href={`/home/${homeId}/projects`} className={styles.addLink}>Add something <span aria-hidden="true">+</span></Link>
        </div>

        <label className={styles.search}>
          <span className={styles.srOnly}>Search this Rolo</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search work, people, systems, or files"
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
        </label>

        <div className={styles.filters} role="group" aria-label="Filter the Rolo">
          {FILTERS.map(option => (
            <button
              type="button"
              key={option.value}
              aria-pressed={filter === option.value}
              onClick={() => chooseFilter(option.value)}
            >
              <span>{option.label}</span>
              <small>{counts[option.value]}</small>
            </button>
          ))}
        </div>

        {record.state.status === 'loading' || files.state.status === 'loading' || checkups.state.status === 'loading' ? (
          <p className={styles.loadingNote} role="status">Filing the rest of your cards…</p>
        ) : null}
        {optionalLoadFailed ? (
          <div className={styles.partialNotice} role="status">
            <span>Some home or file cards could not be opened.</span>
            <button type="button" onClick={() => { record.retry(); files.retry(); checkups.retry() }}>Try again</button>
          </div>
        ) : null}

        <p className={styles.resultCount} aria-live="polite">
          {visibleEntries.length} {visibleEntries.length === 1 ? 'card' : 'cards'}
        </p>

        {visibleEntries.length ? (
          <ul className={styles.cards}>
            {visibleEntries.map(entry => (
              <li key={entry.id}>
                <Link className={`${styles.card} ${styles[entry.accent]}`} href={entry.href}>
                  <span className={styles.cardTab}>{entry.tab}</span>
                  <span className={styles.mark} aria-hidden="true">{entry.mark}</span>
                  <span className={styles.cardCopy}>
                    <small>{entry.eyebrow}</small>
                    <strong>{entry.title}</strong>
                    <span>{entry.detail}</span>
                  </span>
                  <span className={styles.cardFoot}>
                    <small>{entry.meta}</small>
                    <b aria-hidden="true">↗</b>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true">R</span>
            <div>
              <h3>{query ? 'No matching cards' : emptyState.title}</h3>
              <p>{query
                ? `Nothing in this Rolo matches “${query.trim()}”.`
                : emptyState.detail}</p>
            </div>
            {query
              ? <button type="button" onClick={() => setQuery('')}>Clear search</button>
              : <Link href={emptyState.href}>{emptyState.action}</Link>}
          </div>
        )}
      </section>
    </div>
  )
}
