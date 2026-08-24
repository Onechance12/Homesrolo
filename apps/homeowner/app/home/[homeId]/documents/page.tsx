'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState, type FormEvent } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconDocs } from '../../../../components/icons.tsx'
import { HomeRecordHandoffs } from '../../../../components/HomeRecordHandoffs.tsx'
import { mintCommandRef } from '../../../../lib/port/command-ref.ts'
import type { DocumentKind, DocumentSummary } from '../../../../lib/port/types.ts'
import { handoffShareRef } from '../../../../lib/entry-context.ts'

const KIND_LABEL: Record<DocumentKind, string> = {
  document: 'Home record',
  contract: 'Contract',
  invoice: 'Invoice',
  warranty: 'Warranty',
  photo_set: 'Photo',
  permit: 'Permit',
  manual: 'Manual',
}

function FiledRows({ records }: { records: readonly DocumentSummary[] }) {
  return (
    <ul className="rows">
      {records.map(record => (
        <li key={record.documentRef}>
          <span className="row">
            <span className="row__glyph"><IconDocs /></span>
            <span className="row__body">
              <span className="row__title">{record.title}</span>
              <span className="row__sub">
                {KIND_LABEL[record.kind]}
                {record.byteLength
                  ? ` · ${(record.byteLength / 1024 / 1024).toFixed(1)} MB`
                  : record.pages ? ` · ${record.pages} pages` : ''}
                {record.projectRef ? ' · linked to a project' : ' · home-level record'}
              </span>
            </span>
            <span className="row__end">
              <span className="mono">{record.addedOn}</span>
              {record.downloadHref ? <a href={record.downloadHref}>Download</a> : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
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
  const { state, retry } = usePortCall(
    () => recordsReadable
      ? port.listDocuments(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly DocumentSummary[] }),
    value => value.length === 0,
  )
  const previousRecordsReadable = useRef(recordsReadable)
  const [kind, setKind] = useState<'document' | 'photo' | 'warranty'>('document')
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const commandRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (previousRecordsReadable.current === recordsReadable) return
    previousRecordsReadable.current = recordsReadable
    retry()
  }, [recordsReadable, retry])

  const returnedRecords = state.status === 'ready' ? state.value : []
  const photos = returnedRecords.filter(record => record.kind === 'photo_set')
  const filedRecords = returnedRecords.filter(record => record.kind !== 'photo_set')

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !uploadsEnabled || uploadState === 'saving') return
    commandRef.current ??= mintCommandRef()
    setUploadState('saving')
    const result = await port.uploadPrivateArtifact(homeId, {
      commandRef: commandRef.current,
      kind,
      file,
    })
    if (!result.ok) {
      setUploadState('error')
      return
    }
    commandRef.current = null
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
    setUploadState('saved')
    retry()
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
        <form className="panel stack" style={{ ['--stack-gap' as never]: '0.75rem' }} onSubmit={upload}>
          <div className="panel__head"><h2>Add a file to the home record</h2></div>
          <label className="field" style={{ marginTop: 0 }}>
            <span>What are you adding?</span>
            <select value={kind} onChange={event => {
              setKind(event.target.value as typeof kind)
              commandRef.current = null
              setUploadState('idle')
            }}>
              <option value="document">Home record</option>
              <option value="photo">Photo</option>
              <option value="warranty">Warranty paper</option>
            </select>
          </label>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Choose a PDF, JPEG, or PNG</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={event => {
                setFile(event.target.files?.[0] ?? null)
                commandRef.current = null
                setUploadState('idle')
              }}
              required
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={!file || uploadState === 'saving'}>
            {uploadState === 'saving' ? 'Uploading…' : 'Add to home record'}
          </button>
          {uploadState === 'saved' ? <p role="status">File added to this private home record.</p> : null}
          {uploadState === 'error' ? <p role="alert">The file could not be added. Check the type and size, then try again.</p> : null}
        </form>
      ) : null}

      {recordsReadable && state.status === 'loading'
        ? <div className="panel"><Skeleton lines={5} label="Loading saved home files" /></div>
        : null}
      {recordsReadable && state.status === 'error'
        ? <ErrorState retry={retry} error={state.error} />
        : null}

      {recordsReadable && state.status !== 'loading' && state.status !== 'error' ? (
        <>
          {photos.length > 0 ? (
            <section className="panel" aria-labelledby="saved-photo-records-title">
              <div className="panel__head">
                <h2 id="saved-photo-records-title">Saved photo files</h2>
                <span className="mono">{photos.length} saved</span>
              </div>
              <FiledRows records={photos} />
            </section>
          ) : null}

          <section className="panel" aria-labelledby="saved-home-files-title">
            <div className="panel__head">
              <h2 id="saved-home-files-title">Saved home files</h2>
              {state.status === 'ready' ? <span className="mono">{filedRecords.length} saved</span> : null}
            </div>
            {filedRecords.length > 0 ? (
              <FiledRows records={filedRecords} />
            ) : (
              <EmptyState
                title={mode === 'synthetic' ? 'No sample files' : 'No files saved yet'}
                body={mode === 'synthetic'
                  ? 'This sample home does not include file records.'
                  : 'Use the form above when you have a home paper or image to keep.'}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
