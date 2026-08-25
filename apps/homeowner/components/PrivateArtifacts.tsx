'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { IconDocs } from './icons.tsx'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import type {
  DocumentKind,
  DocumentSummary,
  HomeownerDataPort,
  PortError,
  PrivateArtifactKind,
} from '../lib/port/types.ts'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const KIND_LABEL: Record<DocumentKind, string> = {
  document: 'Home record',
  contract: 'Contract',
  invoice: 'Invoice',
  warranty: 'Warranty',
  photo_set: 'Photo',
  permit: 'Permit',
  manual: 'Manual',
}

const UPLOAD_KIND_LABEL: Record<PrivateArtifactKind, string> = {
  photo: 'Photos',
  document: 'Documents, receipts, or estimates',
  warranty: 'Warranty papers',
}

interface QueuedArtifact {
  readonly queueRef: string
  readonly file: File
  readonly kind: PrivateArtifactKind
  readonly commandRef: string
  readonly error?: string
}

function fileSize(byteLength: number | undefined): string {
  if (!byteLength) return ''
  if (byteLength < 1024 * 1024) return `${Math.max(1, Math.round(byteLength / 1024))} KB`
  return `${(byteLength / 1024 / 1024).toFixed(1)} MB`
}

function safeFileType(file: File): 'pdf' | 'jpeg' | 'png' | 'heic' | null {
  const extension = file.name.toLowerCase().split('.').pop()
  if (file.type === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (file.type === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (file.type === 'image/png' || extension === 'png') return 'png'
  if (file.type === 'image/heic' || file.type === 'image/heif'
    || extension === 'heic' || extension === 'heif') return 'heic'
  return null
}

function validateFile(file: File, kind: PrivateArtifactKind): string | null {
  if (file.size < 1) return `${file.name || 'This file'} is empty.`
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 10 MB.`
  const type = safeFileType(file)
  if (type === 'heic') {
    return `${file.name} is an HEIC photo. Choose a JPEG or PNG copy for now.`
  }
  if (!type) return `${file.name} is not a JPEG, PNG, or PDF.`
  if (kind === 'photo' && type === 'pdf') return `${file.name} is a PDF. Choose Documents or Warranty papers for it.`
  return null
}

function uploadErrorMessage(error: PortError, retryAfterSeconds?: number): string {
  if (error === 'rate_limited') {
    return retryAfterSeconds
      ? `Homesrolo is busy. Try this file again in ${retryAfterSeconds} seconds.`
      : 'Homesrolo is busy. Try this file again shortly.'
  }
  if (error === 'invalid') return 'The file type, contents, or size did not match what was selected.'
  if (error === 'conflict') return 'This upload attempt expired. Retry the file with a fresh attempt.'
  if (error === 'forbidden') return 'Your current home access does not allow this upload.'
  if (error === 'not_signed_in') return 'Sign in again, then retry this file.'
  return 'The upload did not finish. Your file is still on this device; retry when the connection is ready.'
}

export function PrivateArtifactUploader({
  homeRef,
  projectRef,
  upload,
  onUploaded,
  initialKind = 'photo',
}: {
  readonly homeRef: string
  readonly projectRef?: string
  readonly upload: HomeownerDataPort['uploadPrivateArtifact']
  readonly onUploaded: () => void
  readonly initialKind?: PrivateArtifactKind
}) {
  const inputId = useId()
  const cameraId = useId()
  const libraryInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)
  const [kind, setKind] = useState<PrivateArtifactKind>(initialKind)
  const [queue, setQueue] = useState<readonly QueuedArtifact[]>([])
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([])
  const [uploading, setUploading] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  function queueFiles(files: FileList | null) {
    if (!files?.length || uploading) return
    const errors: string[] = []
    const accepted: QueuedArtifact[] = []
    for (const file of Array.from(files)) {
      const error = validateFile(file, kind)
      if (error) {
        errors.push(error)
        continue
      }
      const commandRef = mintCommandRef()
      accepted.push({ queueRef: commandRef, commandRef, kind, file })
    }
    setValidationErrors(errors)
    setSavedCount(0)
    if (accepted.length) setQueue(current => [...current, ...accepted])
    if (libraryInput.current) libraryInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    queueFiles(event.target.files)
  }

  function remove(queueRef: string) {
    setQueue(current => current.filter(item => item.queueRef !== queueRef))
  }

  async function uploadQueue() {
    if (uploading || queue.length === 0) return
    setUploading(true)
    setValidationErrors([])
    setSavedCount(0)
    let completed = 0

    for (const queued of queue) {
      setQueue(current => current.map(item => item.queueRef === queued.queueRef
        ? { ...item, error: undefined }
        : item))
      const result = await upload(homeRef, {
        commandRef: queued.commandRef,
        kind: queued.kind,
        file: queued.file,
        ...(projectRef ? { projectRef } : {}),
      })
      if (result.ok) {
        completed += 1
        setQueue(current => current.filter(item => item.queueRef !== queued.queueRef))
        continue
      }
      const freshCommandRef = result.error === 'invalid' || result.error === 'conflict'
        ? mintCommandRef()
        : queued.commandRef
      setQueue(current => current.map(item => item.queueRef === queued.queueRef
        ? {
            ...item,
            commandRef: freshCommandRef,
            error: uploadErrorMessage(result.error, result.retryAfterSeconds),
          }
        : item))
    }

    setUploading(false)
    setSavedCount(completed)
    if (completed > 0) onUploaded()
  }

  const accept = kind === 'photo'
    ? 'image/jpeg,image/png,.jpg,.jpeg,.png'
    : 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

  return (
    <div className="artifact-uploader">
      <div className="artifact-uploader__kind">
        <label htmlFor={`${inputId}-kind`}>What are you saving?</label>
        <select id={`${inputId}-kind`} value={kind} disabled={uploading} onChange={event => {
          setKind(event.target.value as PrivateArtifactKind)
          setValidationErrors([])
          setSavedCount(0)
        }}>
          {Object.entries(UPLOAD_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="artifact-picker-actions">
        <input
          ref={cameraInput}
          id={cameraId}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          capture="environment"
          disabled={uploading}
          onChange={handleFiles}
        />
        <label className="btn btn--primary" htmlFor={cameraId} aria-disabled={uploading}>Take a photo</label>
        <input
          ref={libraryInput}
          id={inputId}
          className="sr-only"
          type="file"
          accept={accept}
          multiple
          disabled={uploading}
          onChange={handleFiles}
        />
        <label className="btn btn--quiet" htmlFor={inputId} aria-disabled={uploading}>Choose files</label>
      </div>
      <p className="artifact-uploader__help">JPEG, PNG, or PDF · 10 MB per file · photos can be selected together</p>

      {validationErrors.length > 0 ? (
        <div className="artifact-uploader__errors" role="alert">
          {validationErrors.map(error => <p key={error}>{error}</p>)}
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="artifact-queue">
          <div className="artifact-queue__head">
            <strong>{queue.length} {queue.length === 1 ? 'file' : 'files'} ready</strong>
            <span>Uploads run one at a time.</span>
          </div>
          <ul>
            {queue.map(item => (
              <li key={item.queueRef}>
                <span className="artifact-queue__file">
                  <strong>{item.file.name}</strong>
                  <small>{UPLOAD_KIND_LABEL[item.kind]} · {fileSize(item.file.size)}</small>
                  {item.error ? <span role="alert">{item.error}</span> : null}
                </span>
                <button type="button" disabled={uploading} onClick={() => remove(item.queueRef)} aria-label={`Remove ${item.file.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn--primary btn--block" type="button" disabled={uploading} onClick={uploadQueue}>
            {uploading
              ? 'Saving securely…'
              : `Save ${queue.length} ${queue.length === 1 ? 'file' : 'files'}`}
          </button>
        </div>
      ) : null}

      {savedCount > 0 ? (
        <p className="artifact-uploader__success" role="status">
          {savedCount} {savedCount === 1 ? 'file is' : 'files are'} now in this private Home Record.
        </p>
      ) : null}
    </div>
  )
}

function ArtifactRows({ records }: { readonly records: readonly DocumentSummary[] }) {
  return (
    <ul className="artifact-file-list">
      {records.map(record => (
        <li key={record.documentRef}>
          <span className="artifact-file-list__glyph" aria-hidden="true"><IconDocs /></span>
          <span className="artifact-file-list__body">
            <strong>{record.title}</strong>
            <small>
              {KIND_LABEL[record.kind]}
              {record.byteLength ? ` · ${fileSize(record.byteLength)}` : record.pages ? ` · ${record.pages} pages` : ''}
              {record.projectRef ? ' · project record' : ' · home record'}
            </small>
          </span>
          <span className="artifact-file-list__actions">
            {record.previewHref ? <a href={record.previewHref}>Open</a> : null}
            {record.downloadHref ? <a href={record.downloadHref}>Download</a> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PrivateArtifactCollection({
  records,
  emptyMessage = 'No photos or files have been saved here yet.',
}: {
  readonly records: readonly DocumentSummary[]
  readonly emptyMessage?: string
}) {
  const photos = records.filter(record => record.kind === 'photo_set' && record.previewHref)
  const files = records.filter(record => record.kind !== 'photo_set' || !record.previewHref)

  if (records.length === 0) return <p className="artifact-collection__empty">{emptyMessage}</p>

  return (
    <div className="artifact-collection">
      {photos.length > 0 ? (
        <div className="artifact-photo-grid" aria-label="Saved photos">
          {photos.map(photo => (
            <figure key={photo.documentRef} className="artifact-photo-card">
              <a href={photo.previewHref} aria-label={`Open ${photo.title}`}>
                {/* Authenticated same-origin previews cannot travel through an image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewHref} alt={photo.title} loading="lazy" />
              </a>
              <figcaption>
                <strong>{photo.title}</strong>
                <span>{photo.addedOn}{photo.byteLength ? ` · ${fileSize(photo.byteLength)}` : ''}</span>
                {photo.downloadHref ? <a href={photo.downloadHref}>Download original</a> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {files.length > 0 ? <ArtifactRows records={files} /> : null}
    </div>
  )
}
