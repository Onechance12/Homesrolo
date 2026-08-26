'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { HomeRecordHandoffs } from '../../../../components/HomeRecordHandoffs.tsx'
import { PrivateArtifactCollection, PrivateArtifactUploader } from '../../../../components/PrivateArtifacts.tsx'
import { PrivateImageViewer, type PrivateImageItem } from '../../../../components/PrivateImageViewer.tsx'
import { PHOTO_CHECKUP_AREA_LABEL } from '../../../../components/PhotoCheckups.tsx'
import type { DocumentSummary, PhotoCheckup, ProjectSummary } from '../../../../lib/port/types.ts'
import { handoffShareRef } from '../../../../lib/entry-context.ts'

type LibraryFilter = 'all' | 'photos' | 'documents' | 'warranties' | 'unfiled'
type LibrarySource = 'all' | 'uploads' | 'home_watch'
type LibrarySort = 'newest' | 'oldest' | 'name'

interface LibraryEntry {
  readonly id: string
  readonly source: Exclude<LibrarySource, 'all'>
  readonly kind: 'photo' | 'document' | 'warranty'
  readonly title: string
  readonly date: string
  readonly projectRef: string | null
  readonly searchText: string
  readonly document?: DocumentSummary
  readonly checkup?: PhotoCheckup
}

/** The working index to every record Homesrolo can actually open for this home. */
export default function HomeRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: Promise<{ handoff?: string | string[] }>
}) {
  const { homeId } = use(params)
  const query = use(searchParams)
  const entryShareId = handoffShareRef(query.handoff)
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const uploadsEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.uploads
  const photoCheckupsEnabled = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.photoCheckups
  const handoffsEnabled = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.homeRecordHandoffs
  const recordsReadable = mode === 'synthetic' || uploadsEnabled
  const libraryReadable = recordsReadable || photoCheckupsEnabled
  const { state, retry } = usePortCall(
    () => recordsReadable
      ? port.listDocuments(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly DocumentSummary[] }),
    value => value.length === 0,
  )
  const projects = usePortCall<readonly ProjectSummary[]>(() => port.listProjects(homeId))
  const checkups = usePortCall<readonly PhotoCheckup[]>(() => photoCheckupsEnabled
    ? port.listPhotoCheckups(homeId)
    : Promise.resolve({ ok: true as const, value: [] }))
  const previousRecordsReadable = useRef(recordsReadable)
  const previousCheckupsEnabled = useRef(photoCheckupsEnabled)
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<LibrarySource>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [sort, setSort] = useState<LibrarySort>('newest')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (previousRecordsReadable.current === recordsReadable) return
    previousRecordsReadable.current = recordsReadable
    retry()
  }, [recordsReadable, retry])

  useEffect(() => {
    if (previousCheckupsEnabled.current === photoCheckupsEnabled) return
    previousCheckupsEnabled.current = photoCheckupsEnabled
    checkups.retry()
  }, [checkups.retry, photoCheckupsEnabled])

  const returnedRecords = state.status === 'ready' ? state.value : []
  const returnedCheckups = checkups.state.status === 'ready' ? checkups.state.value : []
  const returnedProjects = projects.state.status === 'ready' ? projects.state.value.filter(project => !project.archived) : []
  const libraryLoading = (recordsReadable && state.status === 'loading')
    || (photoCheckupsEnabled && checkups.state.status === 'loading')
  const projectLabels = useMemo(() => new Map(returnedProjects.map(project => [project.projectRef, project.title])), [returnedProjects])

  const entries = useMemo<readonly LibraryEntry[]>(() => {
    const uploaded = returnedRecords.map<LibraryEntry>(record => ({
      id: record.documentRef,
      source: 'uploads',
      kind: record.kind === 'photo_set' ? 'photo' : record.kind === 'warranty' ? 'warranty' : 'document',
      title: record.title,
      date: record.addedOn,
      projectRef: record.projectRef,
      searchText: [
        record.title,
        record.kind,
        record.addedOn,
        record.projectRef ? projectLabels.get(record.projectRef) : 'whole home unfiled',
      ].filter(Boolean).join(' '),
      document: record,
    }))
    const watched = returnedCheckups.map<LibraryEntry>(photo => ({
      id: photo.photoRef,
      source: 'home_watch',
      kind: 'photo',
      title: photo.viewLabel,
      date: photo.observedOn,
      projectRef: null,
      searchText: [
        photo.viewLabel,
        PHOTO_CHECKUP_AREA_LABEL[photo.area],
        photo.caption,
        photo.observedOn,
        'Home Watch checkup',
      ].join(' '),
      checkup: photo,
    }))
    return [...uploaded, ...watched]
  }, [projectLabels, returnedCheckups, returnedRecords])

  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    const filtered = entries.filter(entry => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false
      if (filter === 'photos' && entry.kind !== 'photo') return false
      if (filter === 'documents' && entry.kind !== 'document') return false
      if (filter === 'warranties' && entry.kind !== 'warranty') return false
      if (filter === 'unfiled' && entry.projectRef !== null) return false
      if (projectFilter !== 'all' && entry.projectRef !== projectFilter) return false
      return !needle || `${entry.title} ${entry.searchText}`.toLocaleLowerCase().includes(needle)
    })
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.title.localeCompare(right.title)
      return sort === 'oldest'
        ? left.date.localeCompare(right.date)
        : right.date.localeCompare(left.date)
    })
  }, [entries, filter, projectFilter, search, sort, sourceFilter])

  const photoItems = visibleEntries.flatMap<PrivateImageItem>(entry => {
    if (entry.kind !== 'photo') return []
    if (entry.checkup) return [{
      id: entry.id,
      title: entry.checkup.viewLabel,
      alt: `${entry.checkup.viewLabel}, ${PHOTO_CHECKUP_AREA_LABEL[entry.checkup.area]} Home Watch photo`,
      thumbnailSrc: entry.checkup.thumbnailUrl,
      fullSrc: entry.checkup.fullUrl,
      meta: `${PHOTO_CHECKUP_AREA_LABEL[entry.checkup.area]} · ${entry.checkup.observedOn}${entry.checkup.caption ? ` · ${entry.checkup.caption}` : ''}`,
      sourceLabel: 'Home Watch',
    }]
    const record = entry.document
    if (!record?.previewHref) return []
    const project = record.projectRef ? projectLabels.get(record.projectRef) : null
    const projectLabel = project ?? (record.projectRef ? 'Saved work' : 'Whole home')
    return [{
      id: entry.id,
      title: record.title,
      alt: record.title,
      thumbnailSrc: record.previewHref,
      fullSrc: record.previewHref,
      meta: `${projectLabel} · ${record.addedOn}`,
      sourceLabel: record.projectRef ? 'Work photo' : 'Home photo',
      ...(record.downloadHref ? { downloadHref: record.downloadHref } : {}),
    }]
  })
  const visibleFiles = visibleEntries.flatMap(entry => entry.kind === 'photo' || !entry.document ? [] : [entry.document])
  const filtersActive = filter !== 'all' || sourceFilter !== 'all' || projectFilter !== 'all'
    || sort !== 'newest' || Boolean(search.trim())

  function clearFilters() {
    setFilter('all')
    setSourceFilter('all')
    setProjectFilter('all')
    setSort('newest')
    setSearch('')
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <div>
          <p className="mono">Your private Home Record</p>
          <h1>Home record</h1>
        </div>
        <p>Open the project history, checkup views, and files that are actually saved for this home.</p>
      </div>

      {mode === 'synthetic' ? (
        <div className="notice"><strong>Sample record.</strong> Listed items are synthetic and disappear on refresh.</div>
      ) : null}

      {handoffsEnabled ? (
        <HomeRecordHandoffs homeId={homeId} entryShareId={entryShareId} />
      ) : null}

      <section aria-labelledby="record-sections-title">
        <div className="panel__head">
          <div>
            <p className="mono">Connected to this home</p>
            <h2 id="record-sections-title">Your working records</h2>
          </div>
        </div>
        <div className="cardgrid cardgrid--2">
          <Link className="stat" href={`/home/${homeId}/projects`}>
            <dt>Project history</dt>
            <dd>Projects</dd>
            <span className="stat__note">Planned work, active jobs, repairs, remodels, and completed history</span>
          </Link>
          {photoCheckupsEnabled ? (
            <Link className="stat" href={`/home/${homeId}/checkups`}>
              <dt>Condition record</dt>
              <dd>Checkups</dd>
              <span className="stat__note">Private photos organized by area, repeatable view, and date</span>
            </Link>
          ) : null}
        </div>
      </section>

      {mode === 'remote' && uploadsEnabled ? (
        <section className="panel stack" style={{ ['--stack-gap' as never]: '0.75rem' }} aria-labelledby="add-home-record-file-title">
          <div className="panel__head">
            <div>
              <p className="mono">Quick capture</p>
              <h2 id="add-home-record-file-title">Add to this home</h2>
            </div>
          </div>
          <PrivateArtifactUploader
            homeRef={homeId}
            upload={(ref, input) => port.uploadPrivateArtifact(ref, input)}
            onUploaded={retry}
          />
        </section>
      ) : null}

      {libraryReadable && libraryLoading
        ? <div className="panel"><Skeleton lines={5} label="Loading saved home files" /></div>
        : null}
      {recordsReadable && state.status === 'error' ? (
        photoCheckupsEnabled ? (
          <div className="notice" role="status">
            Saved uploads could not be added to this view. Home Watch remains available. <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : <ErrorState retry={retry} error={state.error} />
      ) : null}

      {projects.state.status === 'error' ? (
        <div className="notice" role="status">
          Work names could not be loaded, so linked items are labeled “Saved work.” <button type="button" onClick={projects.retry}>Try again</button>
        </div>
      ) : null}

      {photoCheckupsEnabled && checkups.state.status === 'error' ? (
        <div className="notice" role="status">
          Home Watch photos could not be added to this view. <button type="button" onClick={checkups.retry}>Try again</button>
        </div>
      ) : null}

      {libraryReadable && !libraryLoading && (state.status !== 'error' || photoCheckupsEnabled) ? (
        <>
          <section className="library-index panel" aria-labelledby="library-index-title">
            <div className="panel__head">
              <div>
                <p className="mono">One private index</p>
                <h2 id="library-index-title">Find anything saved here</h2>
              </div>
              <span className="mono">{visibleEntries.length} of {entries.length}</span>
            </div>
            <label className="library-index__search">
              <span className="sr-only">Search the private library</span>
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search photos, files, areas, or work" />
            </label>
            <div className="library-index__filters" role="group" aria-label="Library type">
              {([
                ['all', 'Everything'],
                ['photos', 'Photos'],
                ['documents', 'Documents'],
                ['warranties', 'Warranties'],
                ['unfiled', 'Whole home'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
            <div className="library-index__selects">
              <label>
                <span>Source</span>
                <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value as LibrarySource)}>
                  <option value="all">Every source</option>
                  {recordsReadable ? <option value="uploads">Saved uploads</option> : null}
                  {photoCheckupsEnabled ? <option value="home_watch">Home Watch</option> : null}
                </select>
              </label>
              <label>
                <span>Filed with</span>
                <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
                  <option value="all">Any work or whole home</option>
                  {returnedProjects.map(project => <option key={project.projectRef} value={project.projectRef}>{project.title}</option>)}
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={sort} onChange={event => setSort(event.target.value as LibrarySort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">A–Z</option>
                </select>
              </label>
            </div>
            {filtersActive ? <button type="button" className="library-index__clear" onClick={clearFilters}>Clear filters</button> : null}
          </section>

          <section className="panel" aria-labelledby="saved-photo-records-title">
            <div className="panel__head">
              <div><p className="mono">Uploads + Home Watch</p><h2 id="saved-photo-records-title">Photo history</h2></div>
              <span className="mono">{photoItems.length} shown</span>
            </div>
            <PrivateImageViewer
              items={photoItems}
              emptyMessage={entries.length === 0
                ? 'Take the first photo when there is something this home should remember.'
                : 'No photos match this library view.'}
            />
          </section>

          <section className="panel" aria-labelledby="saved-home-files-title">
            <div className="panel__head">
              <h2 id="saved-home-files-title">Saved home files</h2>
              <span className="mono">{visibleFiles.length} shown</span>
            </div>
            <PrivateArtifactCollection
              records={visibleFiles}
              emptyMessage={entries.length === 0 && mode === 'synthetic'
                ? 'This sample home does not include file records.'
                : entries.length === 0
                  ? 'Save a receipt, estimate, manual, permit, or warranty when you have one.'
                  : 'No files match this library view.'}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}
