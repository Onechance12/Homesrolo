'use client'

import Link from 'next/link'
import { use, useEffect, useRef } from 'react'
import { RoloHomeDashboard } from '../../../components/RoloHomeDashboard.tsx'
import { EmptyState, ErrorState, Skeleton } from '../../../components/states.tsx'
import { buildHomeRecordProgress } from '../../../lib/home-record-progress.ts'
import { usePortCall } from '../../../lib/port/hooks.ts'
import { usePort, usePortMode, useSession } from '../../../lib/port/provider.tsx'
import { homeLabel, homeLocality, type DocumentSummary, type PhotoCheckup } from '../../../lib/port/types.ts'

/** The useful front door to one private Home Record. */
export default function DashboardPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const mode = usePortMode()
  const port = usePort()
  const session = useSession()
  const home = usePortCall(() => port.getHome(homeId))
  const homeRecord = usePortCall(() => port.getHomeRecord(homeId))
  const projects = usePortCall(() => port.listProjects(homeId), value => value.length === 0)
  const retryProjects = projects.retry
  const uploadsEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.uploads
  const recordsReadable = mode === 'synthetic' || uploadsEnabled
  const checkupsEnabled = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.photoCheckups
  const { state: documentsState, retry: retryDocuments } = usePortCall(
    () => recordsReadable
      ? port.listDocuments(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly DocumentSummary[] }),
  )
  const { state: checkupsState, retry: retryCheckups } = usePortCall(
    () => checkupsEnabled
      ? port.listPhotoCheckups(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly PhotoCheckup[] }),
  )
  const previousRecordsReadable = useRef(recordsReadable)
  const previousCheckupsEnabled = useRef(checkupsEnabled)

  useEffect(() => {
    if (previousRecordsReadable.current === recordsReadable) return
    previousRecordsReadable.current = recordsReadable
    retryDocuments()
  }, [recordsReadable, retryDocuments])

  useEffect(() => {
    if (previousCheckupsEnabled.current === checkupsEnabled) return
    previousCheckupsEnabled.current = checkupsEnabled
    retryCheckups()
  }, [checkupsEnabled, retryCheckups])

  useEffect(() => {
    const refreshChangedHome = (event: Event) => {
      const changedHomeId = (event as CustomEvent<{ homeId?: string }>).detail?.homeId
      if (changedHomeId !== homeId) return
      retryProjects()
      if (recordsReadable) retryDocuments()
      if (checkupsEnabled) retryCheckups()
    }
    window.addEventListener('homesrolo:data-changed', refreshChangedHome)
    return () => window.removeEventListener('homesrolo:data-changed', refreshChangedHome)
  }, [checkupsEnabled, homeId, recordsReadable, retryCheckups, retryDocuments, retryProjects])

  if (home.state.status === 'loading' || projects.state.status === 'loading'
    || (mode === 'remote' && homeRecord.state.status === 'loading')) {
    return <div className="panel"><Skeleton lines={7} label="Opening the Home Record" /></div>
  }
  if (home.state.status === 'error') {
    return home.state.error === 'not_found'
      ? <EmptyState title="No such home" body="This Home Record could not be found. Pick another home from your list."
          action={<Link className="btn btn--quiet" href="/homes">Your homes</Link>} />
      : <ErrorState retry={home.retry} error={home.state.error} />
  }
  if (projects.state.status === 'error') {
    return <ErrorState retry={projects.retry} error={projects.state.error} />
  }
  if (home.state.status !== 'ready') return null

  const file = home.state.value
  const projectRecords = projects.state.status === 'ready' ? projects.state.value : []
  const documentRecords = recordsReadable && documentsState.status === 'ready'
    ? documentsState.value
    : null
  const checkupRecords = checkupsEnabled && checkupsState.status === 'ready'
    ? checkupsState.value
    : null
  const progress = buildHomeRecordProgress({
    home: file,
    projects: projectRecords,
    documents: documentRecords,
    checkups: checkupRecords,
    uploadsEnabled,
    checkupsEnabled,
  })

  return (
    <RoloHomeDashboard
      homeId={homeId}
      label={homeLabel(file)}
      locality={homeLocality(file)}
      progress={progress}
      homeRecord={mode === 'remote' && homeRecord.state.status === 'ready'
        ? homeRecord.state.value
        : null}
      projects={projectRecords}
      documents={documentRecords}
      uploadsEnabled={uploadsEnabled}
      checkupsEnabled={checkupsEnabled}
      synthetic={mode === 'synthetic'}
    />
  )
}
