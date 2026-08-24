'use client'

/* eslint-disable @next/next/no-img-element -- private cookie-authenticated derivatives stay on exact same-origin routes; Next image optimization would lose that boundary and add infrastructure work */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { usePortCall } from '../lib/port/hooks.ts'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import type {
  HomeownerDataPort, PhotoCheckup, PhotoCheckupArea, PortError,
} from '../lib/port/types.ts'
import { EmptyState, Skeleton } from './states.tsx'

const MAX_INPUT_BYTES = 10 * 1024 * 1024

export const PHOTO_CHECKUP_AREAS = [
  { value: 'front_exterior', label: 'Front exterior' },
  { value: 'rear_exterior', label: 'Rear exterior' },
  { value: 'roofline', label: 'Roofline' },
  { value: 'attic', label: 'Attic' },
  { value: 'ceilings', label: 'Ceilings' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'water_heater', label: 'Water heater' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly { value: PhotoCheckupArea; label: string }[]

const AREA_LABEL: Readonly<Record<PhotoCheckupArea, string>> = Object.freeze({
  front_exterior: 'Front exterior',
  rear_exterior: 'Rear exterior',
  roofline: 'Roofline',
  attic: 'Attic',
  ceilings: 'Ceilings',
  hvac: 'HVAC',
  water_heater: 'Water heater',
  foundation: 'Foundation',
  gutters: 'Gutters',
  other: 'Other',
})

function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function validObservedOn(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function formatObservedOn(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

type UploadErrorAction = 'replace' | 'same_retry' | 'wait_retry' | 'fresh_attempt' | 'sign_in' | 'access' | 'correct'
type UploadState =
  | { readonly status: 'idle' | 'saving' | 'saved'; readonly message: string }
  | {
      readonly status: 'error'
      readonly message: string
      readonly error: PortError
      readonly action: UploadErrorAction
    }

function uploadFailure(error: PortError): Extract<UploadState, { status: 'error' }> {
  if (error === 'invalid') return {
    status: 'error', error, action: 'replace',
    message: 'That image was not accepted. Choose a new JPEG or PNG under 10 MB, then check the date, view name, and note.',
  }
  if (error === 'rate_limited') return {
    status: 'error', error, action: 'wait_retry',
    message: 'Photo uploads are temporarily busy. Wait at least five seconds before retrying; the exact selected photo and attempt are preserved.',
  }
  if (error === 'conflict') return {
    status: 'error', error, action: 'fresh_attempt',
    message: 'This upload conflicts with an earlier attempt or a monthly photo limit was reached. Monthly safety limits do not reset when photos are deleted or a new attempt is started; try again after the limit window resets.',
  }
  if (error === 'not_signed_in') return {
    status: 'error', error, action: 'sign_in',
    message: 'Your session ended. Sign in again before starting a fresh upload attempt.',
  }
  if (error === 'forbidden' || error === 'not_found') return {
    status: 'error', error, action: 'access',
    message: 'This account cannot add photos to this home. Check that you opened the right home or ask its controller for access.',
  }
  return {
    status: 'error', error, action: 'same_retry',
    message: 'The private photo service could not be reached. The exact selected photo and attempt are preserved, so it is safe to try the same upload again.',
  }
}

function PhotoImage({ photo, comparison = false, comparisonLabel }: {
  photo: PhotoCheckup
  comparison?: boolean
  comparisonLabel?: 'Previous' | 'Latest'
}) {
  const dateLabel = formatObservedOn(photo.observedOn)
  return (
    <figure className={comparison ? 'checkup-compare__photo' : 'checkup-photo'}>
      <img
        src={photo.thumbnailUrl}
        loading="lazy"
        alt={`${photo.viewLabel}, ${AREA_LABEL[photo.area]} checkup photo observed ${dateLabel}`}
        width={photo.width}
        height={photo.height}
      />
      <figcaption>
        {comparisonLabel ? <strong className="checkup-compare__label">{comparisonLabel}</strong> : null}
        <span className="checkup-photo__view">{photo.viewLabel} · {AREA_LABEL[photo.area]}</span>
        <time dateTime={photo.observedOn}>{dateLabel}</time>
        {photo.caption ? <span>{photo.caption}</span> : <span className="form-note">No caption recorded.</span>}
      </figcaption>
    </figure>
  )
}

function CheckupGallery({
  photos,
  uploading,
  deleting,
  deleteError,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  photos: readonly PhotoCheckup[]
  uploading: boolean
  deleting: { readonly photoRef: string; readonly status: 'confirm' | 'deleting' | 'error' } | null
  deleteError: string
  onAskDelete: (photoRef: string) => void
  onCancelDelete: (photoRef: string) => void
  onConfirmDelete: (photoRef: string) => void
}) {
  const groups = useMemo(() => {
    const areaOrder = new Map(PHOTO_CHECKUP_AREAS.map((area, index) => [area.value, index]))
    const grouped = new Map<string, {
      key: string
      area: PhotoCheckupArea
      areaLabel: string
      viewLabel: string
      photos: PhotoCheckup[]
    }>()
    for (const photo of photos) {
      const key = `${photo.area}\u0000${photo.viewLabel}`
      const group = grouped.get(key) ?? {
        key,
        area: photo.area,
        areaLabel: AREA_LABEL[photo.area],
        viewLabel: photo.viewLabel,
        photos: [],
      }
      group.photos.push(photo)
      grouped.set(key, group)
    }
    return [...grouped.values()]
      .map(group => ({
        ...group,
        photos: group.photos.sort((left, right) => right.observedOn.localeCompare(left.observedOn)
          || right.createdAt.localeCompare(left.createdAt)),
      }))
      .sort((left, right) => (areaOrder.get(left.area) ?? 99) - (areaOrder.get(right.area) ?? 99)
        || left.viewLabel.localeCompare(right.viewLabel))
  }, [photos])
  const [openComparison, setOpenComparison] = useState<string | null>(null)
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const keepPhotoRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<string | null>(null)

  useEffect(() => {
    if (deleting?.status === 'confirm') keepPhotoRef.current?.focus()
    if (!deleting && restoreFocusRef.current) {
      deleteTriggerRefs.current.get(restoreFocusRef.current)?.focus()
      restoreFocusRef.current = null
    }
  }, [deleting])

  return (
    <div className="checkup-groups">
      {groups.map((group, groupIndex) => {
        const latest = group.photos[0]
        const previous = group.photos[1]
        const headingId = `checkup-view-${group.area}-${groupIndex}`
        const comparisonId = `${headingId}-comparison`
        const comparisonOpen = openComparison === group.key
        return (
          <section className="checkup-group" key={group.key} aria-labelledby={headingId}>
            <div className="checkup-group__head">
              <div>
                <span className="mono">{group.areaLabel}</span>
                <h3 id={headingId}>{group.viewLabel}</h3>
              </div>
              <span className="mono">{group.photos.length} saved</span>
            </div>

            {latest && previous ? (
              <div className="checkup-compare">
                <button
                  className="checkup-compare__toggle"
                  type="button"
                  aria-expanded={comparisonOpen}
                  aria-controls={comparisonId}
                  disabled={uploading}
                  onClick={() => setOpenComparison(current => current === group.key ? null : group.key)}
                >
                  {comparisonOpen ? 'Close comparison' : `Compare latest two: ${group.viewLabel}`}
                </button>
                {comparisonOpen ? (
                  <div id={comparisonId} className="checkup-compare__body">
                    <p className="form-note">
                      These are the latest two photos with this exact area and view name. Homesrolo does not diagnose damage or claim that something changed.
                    </p>
                    <div className="checkup-compare__grid">
                      <PhotoImage photo={previous} comparison comparisonLabel="Previous" />
                      <PhotoImage photo={latest} comparison comparisonLabel="Latest" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="checkup-gallery">
              {group.photos.map(photo => {
                const activeDelete = deleting?.photoRef === photo.photoRef ? deleting : null
                return (
                  <article className="checkup-card" key={photo.photoRef}>
                    <PhotoImage photo={photo} />
                    <div className="checkup-card__actions">
                      <a
                        className="btn btn--quiet"
                        href={photo.fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open full image
                      </a>
                      <button
                        ref={node => {
                          if (node) deleteTriggerRefs.current.set(photo.photoRef, node)
                          else deleteTriggerRefs.current.delete(photo.photoRef)
                        }}
                        className="btn btn--quiet checkup-delete"
                        type="button"
                        aria-label={`Delete ${group.viewLabel}, ${group.areaLabel} photo from ${formatObservedOn(photo.observedOn)}`}
                        aria-expanded={!!activeDelete}
                        disabled={uploading || deleting !== null}
                        onClick={() => onAskDelete(photo.photoRef)}
                      >
                        Delete
                      </button>
                    </div>
                    {activeDelete ? (
                      <div
                        className="checkup-delete-confirm"
                        role="group"
                        aria-label={`Confirm deletion of ${group.viewLabel}, ${group.areaLabel} photo from ${formatObservedOn(photo.observedOn)}`}
                        aria-busy={activeDelete.status === 'deleting'}
                      >
                        <p>
                          Remove the {group.viewLabel} photo from{' '}
                          {formatObservedOn(photo.observedOn)}?
                        </p>
                        <p className="form-note">
                          This removes the photo files and redacts their details from active records.
                          A minimal retry-safety receipt may remain for safe retries.
                          Provider backups follow the provider&rsquo;s retention schedule.
                        </p>
                        <div>
                          <button
                            ref={keepPhotoRef}
                            className="btn btn--quiet"
                            type="button"
                            onClick={() => {
                              restoreFocusRef.current = photo.photoRef
                              onCancelDelete(photo.photoRef)
                            }}
                            disabled={activeDelete.status === 'deleting'}
                          >
                            Keep photo
                          </button>
                          <button
                            className="btn btn--danger"
                            type="button"
                            onClick={() => onConfirmDelete(photo.photoRef)}
                            disabled={activeDelete.status === 'deleting'}
                          >
                            {activeDelete.status === 'deleting' ? 'Deleting…' : 'Yes, delete'}
                          </button>
                        </div>
                        {activeDelete.status === 'error' ? <p role="alert">{deleteError}</p> : null}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function PhotoCheckups({
  homeRef,
  enabled,
  port,
}: {
  homeRef: string
  enabled: boolean
  port: HomeownerDataPort
}) {
  const today = useMemo(() => localToday(), [])
  const { state, retry } = usePortCall(
    () => enabled
      ? port.listPhotoCheckups(homeRef)
      : Promise.resolve({ ok: true as const, value: [] as readonly PhotoCheckup[] }),
    value => value.length === 0,
  )
  const [formOpen, setFormOpen] = useState(false)
  const [observedOn, setObservedOn] = useState(today)
  const [area, setArea] = useState<PhotoCheckupArea>('front_exterior')
  const [viewLabel, setViewLabel] = useState('')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: '' })
  const [deleting, setDeleting] = useState<{
    readonly photoRef: string
    readonly status: 'confirm' | 'deleting' | 'error'
  } | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [rateRetryReady, setRateRetryReady] = useState(false)
  const commandRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const uploadGeneration = useRef(0)
  const savedHeadingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => () => { uploadGeneration.current += 1 }, [])

  useEffect(() => {
    if (uploadState.status !== 'error' || uploadState.action !== 'wait_retry') return
    const timeout = window.setTimeout(() => setRateRetryReady(true), 5_000)
    return () => window.clearTimeout(timeout)
  }, [uploadState])

  const photos = state.status === 'ready' ? state.value : []
  const uploadPending = uploadState.status === 'saving'

  function changed() {
    if (uploadPending) return
    uploadGeneration.current += 1
    commandRef.current = null
    setRateRetryReady(false)
    setUploadState({ status: 'idle', message: '' })
  }

  function chooseFile(next: File | null) {
    changed()
    setFileError('')
    if (!next) { setFile(null); return }
    if (!['image/jpeg', 'image/png'].includes(next.type)) {
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setFileError('Choose a JPEG or PNG. For an iPhone HEIC photo, export or share a JPEG copy first.')
      return
    }
    if (next.size < 1 || next.size > MAX_INPUT_BYTES) {
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setFileError('Choose one JPEG or PNG under 10 MB.')
      return
    }
    setFile(next)
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enabled || !file || uploadPending) return
    const trimmedViewLabel = viewLabel.trim()
    const trimmedCaption = caption.trim()
    let encodedCaption = ''
    let encodedViewLabel = ''
    try {
      encodedCaption = trimmedCaption ? encodeURIComponent(trimmedCaption) : ''
      encodedViewLabel = encodeURIComponent(trimmedViewLabel)
    } catch {
      setUploadState({
        status: 'error', error: 'invalid', action: 'correct',
        message: 'The view name or note contains a character that cannot be saved.',
      })
      return
    }
    if (!validObservedOn(observedOn, today)) {
      setUploadState({
        status: 'error', error: 'invalid', action: 'correct',
        message: 'Use a real observation date that is not in the future.',
      })
      return
    }
    if (/[\u0000-\u001f\u007f]/.test(trimmedViewLabel)
      || /[\u0000-\u001f\u007f]/.test(trimmedCaption)) {
      setUploadState({
        status: 'error', error: 'invalid', action: 'correct',
        message: 'Keep the repeatable view name and factual note on one line without control characters. The selected photo is still here.',
      })
      return
    }
    if (trimmedViewLabel.length < 1 || trimmedViewLabel.length > 80 || encodedViewLabel.length > 400) {
      setUploadState({
        status: 'error', error: 'invalid', action: 'correct',
        message: 'Add a shorter repeatable view name before uploading.',
      })
      return
    }
    if (trimmedCaption.length > 240 || encodedCaption.length > 1_000) {
      setUploadState({
        status: 'error', error: 'invalid', action: 'correct',
        message: 'Shorten the factual note before uploading.',
      })
      return
    }
    commandRef.current ??= mintCommandRef()
    const attemptRef = commandRef.current
    const generation = uploadGeneration.current + 1
    uploadGeneration.current = generation
    setUploadState({ status: 'saving', message: 'Uploading and sanitizing this photo…' })
    const result = await port.uploadPhotoCheckup(homeRef, {
      commandRef: attemptRef,
      observedOn,
      area,
      viewLabel: trimmedViewLabel,
      caption: trimmedCaption,
      file,
    })
    if (uploadGeneration.current !== generation) return
    if (!result.ok) {
      const failure = uploadFailure(result.error)
      if (failure.action === 'wait_retry') setRateRetryReady(false)
      if (failure.action !== 'same_retry' && failure.action !== 'wait_retry') {
        commandRef.current = null
      }
      if (failure.action === 'replace') {
        setFile(null)
        if (fileInput.current) fileInput.current.value = ''
      }
      setUploadState(failure)
      return
    }
    commandRef.current = null
    setFile(null)
    setViewLabel('')
    setCaption('')
    if (fileInput.current) fileInput.current.value = ''
    setUploadState({ status: 'saved', message: 'Photo saved in this private home checkup.' })
    retry()
  }

  async function confirmDelete(photoRef: string) {
    if (!enabled || deleting?.status === 'deleting') return
    setDeleting({ photoRef, status: 'deleting' })
    setDeleteError('')
    const result = await port.deletePhotoCheckup(homeRef, photoRef)
    if (!result.ok) {
      setDeleteError('We could not confirm whether this photo was deleted. It is safe to try deleting it again; the server treats a repeated delete safely.')
      setDeleting({ photoRef, status: 'error' })
      return
    }
    setDeleting(null)
    if (uploadState.status === 'error' && uploadState.action === 'fresh_attempt') {
      setUploadState({ status: 'idle', message: '' })
    } else {
      setUploadState({ status: 'saved', message: 'Photo removed from this active home checkup.' })
    }
    savedHeadingRef.current?.focus()
    retry()
  }

  const errorAction = uploadState.status === 'error' ? uploadState.action : null
  const retryError = uploadState.status === 'error'
    && (uploadState.action === 'same_retry' || uploadState.action === 'wait_retry')
    ? uploadState.error
    : null
  const submitBlockedByError = errorAction !== null
    && errorAction !== 'same_retry'
    && !(errorAction === 'wait_retry' && rateRetryReady)
  const submitLabel = uploadPending
    ? 'Saving private photo…'
    : errorAction === 'same_retry' || errorAction === 'wait_retry'
      ? retryError === 'rate_limited'
        ? rateRetryReady ? 'Retry the paused upload' : 'Wait five seconds before retrying…'
        : 'Try the same upload again'
      : 'Save checkup photo'

  if (!enabled) {
    return null
  }

  return (
    <section id="photo-checkups" className="panel checkups" aria-labelledby="photo-checkups-title">
      <div className="checkups__head">
        <div>
          <p className="mono">Private condition record</p>
          <h2 id="photo-checkups-title">Photos &amp; seasonal home checkups</h2>
          <p>
            Repeat the same views a few times a year and after major weather or work.
            Homesrolo records what you photograph and write; it does not inspect or diagnose the home.
          </p>
        </div>
        <button
          className="btn btn--primary"
          type="button"
          aria-expanded={formOpen}
          aria-controls="photo-checkup-form"
          disabled={uploadPending}
          onClick={() => setFormOpen(open => !open)}
        >
          {formOpen ? 'Close checkup' : 'Start seasonal checkup'}
        </button>
      </div>

      {formOpen ? (
        <form
          id="photo-checkup-form"
          className="checkup-form"
          onSubmit={upload}
          aria-busy={uploadPending}
        >
          <div className="checkup-form__grid">
            <label className="field">
              <span>Area photographed</span>
              <select disabled={uploadPending} value={area} onChange={event => {
                setArea(event.target.value as PhotoCheckupArea); changed()
              }}>
                {PHOTO_CHECKUP_AREAS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date observed</span>
              <input
                type="date"
                value={observedOn}
                max={today}
                disabled={uploadPending}
                onChange={event => { setObservedOn(event.target.value); changed() }}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>Repeatable view name</span>
            <input
              type="text"
              value={viewLabel}
              minLength={1}
              maxLength={80}
              disabled={uploadPending}
              onChange={event => { setViewLabel(event.target.value); changed() }}
              placeholder="Example: Hall ceiling by vent"
              required
            />
            <span className="field__hint">
              Name the exact spot so future photos compare the same view. {viewLabel.length}/80
            </span>
          </label>
          <label className="field">
            <span>Take or choose one JPEG or PNG</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png"
              disabled={uploadPending}
              onChange={event => chooseFile(event.target.files?.[0] ?? null)}
              required
            />
            <span className="field__hint">
              Up to 10 MB. For an HEIC image, export or share a JPEG copy first.
            </span>
            {file ? <span className="checkup-file" role="status">Selected: {file.name}</span> : null}
            {fileError ? <span className="form-error" role="alert">{fileError}</span> : null}
          </label>
          <label className="field">
            <span>Factual note <span className="form-note">(optional)</span></span>
            <input
              type="text"
              value={caption}
              maxLength={240}
              disabled={uploadPending}
              onChange={event => { setCaption(event.target.value); changed() }}
              placeholder="Example: After the August storm; viewed from the driveway."
            />
            <span className="field__hint">What you saw or when you took it—no diagnosis required. {caption.length}/240</span>
          </label>
          <button
            className="btn btn--primary btn--block"
            type="submit"
            disabled={!file || uploadPending || submitBlockedByError}
          >
            {submitLabel}
          </button>
          <p className="form-note">
            The original is decoded, stripped of metadata, resized, and stored as a private JPEG.
            Location metadata and the original filename are not kept.
          </p>
          {uploadState.message ? (
            <div className="checkup-result" aria-live="polite">
              <p
                className={uploadState.status === 'error' ? 'form-error' : 'checkup-status'}
                role={uploadState.status === 'error' ? 'alert' : 'status'}
              >
                {uploadState.message}
              </p>
              {uploadState.status === 'error' && uploadState.action === 'fresh_attempt' ? (
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={() => {
                    uploadGeneration.current += 1
                    commandRef.current = null
                    setUploadState({ status: 'idle', message: '' })
                  }}
                >
                  Prepare a fresh attempt
                </button>
              ) : null}
              {uploadState.status === 'error' && uploadState.action === 'sign_in' ? (
                <a className="btn btn--quiet" href="/signin">Sign in again</a>
              ) : null}
              {uploadState.status === 'error' && uploadState.action === 'access' ? (
                <a className="btn btn--quiet" href="/homes">Choose another home</a>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="checkups__saved" aria-live="polite">
        <div className="checkup-saved__head">
          <h3 ref={savedHeadingRef} tabIndex={-1}>Saved checkup views</h3>
          {state.status === 'ready' ? <span className="mono">{photos.length} total</span> : null}
        </div>
        {state.status === 'loading' ? <Skeleton lines={4} label="Loading private checkup photos" /> : null}
        {state.status === 'error' ? (
          <div className="checkup-load-error" role="alert">
            <p>Private checkup photos could not be loaded.</p>
            <button className="btn btn--quiet" type="button" onClick={retry}>Try again</button>
          </div>
        ) : null}
        {state.status === 'empty' ? (
          <EmptyState
            title="No checkup photos saved yet"
            body="Start with one repeatable view, such as the front exterior or a ceiling you want to keep an eye on."
          />
        ) : null}
        {state.status === 'ready' ? (
          <CheckupGallery
            photos={photos}
            uploading={uploadPending}
            deleting={deleting}
            deleteError={deleteError}
            onAskDelete={photoRef => setDeleting({ photoRef, status: 'confirm' })}
            onCancelDelete={() => setDeleting(null)}
            onConfirmDelete={photoRef => { void confirmDelete(photoRef) }}
          />
        ) : null}
      </div>
    </section>
  )
}
