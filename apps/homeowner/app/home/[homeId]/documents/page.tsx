'use client'

import Link from 'next/link'
import { use, useEffect, useRef } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { HomeRecordHandoffs } from '../../../../components/HomeRecordHandoffs.tsx'
import { PrivateArtifactCollection, PrivateArtifactUploader } from '../../../../components/PrivateArtifacts.tsx'
import type { DocumentSummary } from '../../../../lib/port/types.ts'
import { handoffShareRef } from '../../../../lib/entry-context.ts'

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
  const { state, retry } = usePortCall(
    () => recordsReadable
      ? port.listDocuments(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly DocumentSummary[] }),
    value => value.length === 0,
  )
  const previousRecordsReadable = useRef(recordsReadable)

  useEffect(() => {
    if (previousRecordsReadable.current === recordsReadable) return
    previousRecordsReadable.current = recordsReadable
    retry()
  }, [recordsReadable, retry])

  const returnedRecords = state.status === 'ready' ? state.value : []
  const photos = returnedRecords.filter(record => record.kind === 'photo_set')
  const filedRecords = returnedRecords.filter(record => record.kind !== 'photo_set')

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

      {recordsReadable && state.status === 'loading'
        ? <div className="panel"><Skeleton lines={5} label="Loading saved home files" /></div>
        : null}
      {recordsReadable && state.status === 'error'
        ? <ErrorState retry={retry} error={state.error} />
        : null}

      {recordsReadable && state.status !== 'loading' && state.status !== 'error' ? (
        <>
          <section className="panel" aria-labelledby="saved-photo-records-title">
            <div className="panel__head">
              <div><p className="mono">A visual history</p><h2 id="saved-photo-records-title">Home photos</h2></div>
              <span className="mono">{photos.length} saved</span>
            </div>
            <PrivateArtifactCollection
              records={photos}
              emptyMessage="Take the first photo when there is something this home should remember."
            />
          </section>

          <section className="panel" aria-labelledby="saved-home-files-title">
            <div className="panel__head">
              <h2 id="saved-home-files-title">Saved home files</h2>
              {state.status === 'ready' ? <span className="mono">{filedRecords.length} saved</span> : null}
            </div>
            <PrivateArtifactCollection
              records={filedRecords}
              emptyMessage={mode === 'synthetic'
                ? 'This sample home does not include file records.'
                : 'Save a receipt, estimate, manual, permit, or warranty when you have one.'}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}
