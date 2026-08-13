'use client'

import { use, useRef, useState, type FormEvent } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconDocs } from '../../../../components/icons.tsx'
import { mintCommandRef } from '../../../../lib/port/command-ref.ts'
import type { DocumentKind } from '../../../../lib/port/types.ts'

const KIND_LABEL: Record<DocumentKind, string> = {
  document: 'Document',
  contract: 'Contract',
  invoice: 'Invoice',
  warranty: 'Warranty',
  photo_set: 'Photo',
  permit: 'Permit',
  manual: 'Manual',
}

/** Every private file attached to this home, whether or not a project owns it. */
export default function DocumentsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const { state, retry } = usePortCall(() => port.listDocuments(homeId), value => value.length === 0)
  const [kind, setKind] = useState<'document' | 'photo' | 'warranty'>('document')
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const commandRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const uploadsEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.uploads

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
        <h1>Documents and photos</h1>
        <p>Keep the papers and pictures for this home in one private record.</p>
      </div>

      <div className="notice">
        {mode === 'synthetic' ? (
          <><strong>Demo documents.</strong> These entries are synthetic and disappear on refresh.</>
        ) : uploadsEnabled ? (
          <><strong>Private home files.</strong> Upload a PDF, JPEG, or PNG up to 25 MB. Nothing is sent to a professional unless you choose it in a later project step.</>
        ) : (
          <><strong>Uploads are unavailable.</strong> File storage is not configured for this account.</>
        )}
      </div>

      {mode === 'remote' && uploadsEnabled ? (
        <form className="panel stack" style={{ ['--stack-gap' as never]: '0.75rem' }} onSubmit={upload}>
          <div className="panel__head"><h2>Add to this home</h2></div>
          <label>
            <span className="mono">File type</span>
            <select value={kind} onChange={event => {
              setKind(event.target.value as typeof kind)
              commandRef.current = null
              setUploadState('idle')
            }}>
              <option value="document">Document</option>
              <option value="photo">Photo</option>
              <option value="warranty">Warranty document</option>
            </select>
          </label>
          <label>
            <span className="mono">Choose PDF, JPEG, or PNG</span>
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
            {uploadState === 'saving' ? 'Uploading…' : 'Upload file'}
          </button>
          {uploadState === 'saved' ? <p role="status">File added to this private home record.</p> : null}
          {uploadState === 'error' ? <p role="alert">The file could not be added. Check the type and size, then try again.</p> : null}
        </form>
      ) : null}

      {state.status === 'loading' && <div className="panel"><Skeleton lines={5} label="Loading files" /></div>}
      {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
      {state.status === 'empty' && (
        <EmptyState
          title="Nothing filed yet"
          body="Add contracts, invoices, permits, manuals, photos, or warranty papers to start the home's record."
        />
      )}
      {state.status === 'ready' && (
        <ul className="rows panel panel--flush" style={{ display: 'block' }}>
          {state.value.map(doc => (
            <li key={doc.documentRef}>
              <span className="row">
                <span className="row__glyph"><IconDocs /></span>
                <span className="row__body">
                  <span className="row__title">{doc.title}</span>
                  <span className="row__sub">
                    {KIND_LABEL[doc.kind]}
                    {doc.byteLength
                      ? ` · ${(doc.byteLength / 1024 / 1024).toFixed(1)} MB`
                      : doc.pages ? ` · ${doc.pages} pages` : ''}
                    {doc.projectRef ? ' · from a project' : ' · home-level'}
                  </span>
                </span>
                <span className="row__end">
                  <span className="mono">{doc.addedOn}</span>
                  {doc.downloadHref ? <a href={doc.downloadHref}>Download</a> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
