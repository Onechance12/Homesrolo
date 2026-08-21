'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconDocs } from '../../../../components/icons.tsx'
import { mintCommandRef } from '../../../../lib/port/command-ref.ts'
import type { DocumentKind, DocumentSummary } from '../../../../lib/port/types.ts'

const KIND_LABEL: Record<DocumentKind, string> = {
  document: 'Home record',
  contract: 'Contract',
  invoice: 'Invoice',
  warranty: 'Warranty',
  photo_set: 'Photo',
  permit: 'Permit',
  manual: 'Manual',
}

function LibraryCard({ eyebrow, title, body, href }: {
  eyebrow: string
  title: string
  body: string
  href?: string
}) {
  const contents: ReactNode = (
    <>
      <span className="mono">{eyebrow}</span>
      <strong>{title}</strong>
      <span className="stat__note">{body}</span>
    </>
  )

  return href
    ? <Link className="stat" href={href}>{contents}</Link>
    : <article className="stat">{contents}</article>
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

/**
 * The home's library, not merely a document bucket. The backed list remains
 * the sole source of real file/photo rows; the map describes where the wider
 * home record is going without inventing files or enabled storage.
 */
export default function DocumentsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const uploadsEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.uploads
  const libraryReadable = mode === 'synthetic' || uploadsEnabled
  const { state, retry } = usePortCall(
    () => libraryReadable
      ? port.listDocuments(homeId)
      : Promise.resolve({ ok: true as const, value: [] as readonly DocumentSummary[] }),
    value => value.length === 0,
  )
  const previousLibraryReadable = useRef(libraryReadable)
  const [kind, setKind] = useState<'document' | 'photo' | 'warranty'>('document')
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const commandRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (previousLibraryReadable.current === libraryReadable) return
    previousLibraryReadable.current = libraryReadable
    retry()
  }, [libraryReadable, retry])

  const returnedRecords = state.status === 'ready' ? state.value : []
  const photos = returnedRecords.filter(record => record.kind === 'photo_set')
  const filedRecords = returnedRecords.filter(record => record.kind !== 'photo_set')

  const libraryAreas = [
    {
      eyebrow: 'Condition record',
      title: 'Photos & home checkups',
      body: 'Repeat the same views seasonally and after major weather or work.',
      href: '#photo-checkups',
    },
    {
      eyebrow: 'Protection',
      title: 'Insurance',
      body: 'Policies, declarations, inspection reports, and claim papers.',
      href: '#filed-records',
    },
    {
      eyebrow: 'Work history',
      title: 'Projects & upgrades',
      body: 'Past, current, and planned work across every part of the property.',
      href: `/home/${homeId}/projects`,
    },
    {
      eyebrow: 'What the home owns',
      title: 'Inventory & manuals',
      body: 'Appliances, equipment, model details, receipts, and manuals.',
      href: '#filed-records',
    },
    {
      eyebrow: 'Coverage',
      title: 'Warranties',
      body: 'Coverage papers and the work or equipment they belong to.',
      href: `/home/${homeId}/warranties`,
    },
    {
      eyebrow: 'Property record',
      title: 'Taxes, value & sale',
      body: 'Tax notices, appraisals, valuations, disclosures, and closing records.',
      href: '#filed-records',
    },
    {
      eyebrow: 'Ongoing care',
      title: 'Events & maintenance',
      body: 'Service dates, recurring care, inspections, and what happened when.',
      href: `/home/${homeId}/timeline`,
    },
    {
      eyebrow: 'The Rolodex',
      title: 'People & service history',
      body: 'The companies and people connected to work recorded for this home.',
      href: `/home/${homeId}/projects`,
    },
  ] as const

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
          <p className="mono">Your home Rolodex</p>
          <h1>Home library</h1>
        </div>
        <p>One private place for the proof, history, and care of this home.</p>
      </div>

      <div className="notice">
        {mode === 'synthetic' ? (
          <><strong>Demo library.</strong> Every listed item is synthetic and disappears on refresh.</>
        ) : uploadsEnabled ? (
          <><strong>Private home library.</strong> Upload a PDF, JPEG, or PNG up to 25 MB. Nothing is sent to a professional unless you choose that in a later project step.</>
        ) : (
          <><strong>Uploads are unavailable right now.</strong> Homesrolo has not opened secure photo and document storage for this home. Any existing files will appear only when the private service returns them.</>
        )}
      </div>

      <section aria-labelledby="library-map-title">
        <div className="panel__head">
          <div>
            <h2 id="library-map-title">The whole-home record</h2>
            <p className="form-note">A library for everything around the home—not a roofing folder.</p>
          </div>
        </div>
        <div className="cardgrid cardgrid--2">
          {libraryAreas.map(area => <LibraryCard key={area.title} {...area} />)}
        </div>
      </section>

      {mode === 'remote' && uploadsEnabled ? (
        <form className="panel stack" style={{ ['--stack-gap' as never]: '0.75rem' }} onSubmit={upload}>
          <div className="panel__head"><h2>Add to the library</h2></div>
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
            {uploadState === 'saving' ? 'Uploading…' : 'Add to home library'}
          </button>
          {uploadState === 'saved' ? <p role="status">File added to this private home library.</p> : null}
          {uploadState === 'error' ? <p role="alert">The file could not be added. Check the type and size, then try again.</p> : null}
        </form>
      ) : null}

      {state.status === 'loading' && <div className="panel"><Skeleton lines={5} label="Loading the home library" /></div>}
      {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}

      {state.status !== 'loading' && state.status !== 'error' ? (
        <>
          <section id="photo-checkups" className="panel" aria-labelledby="photo-checkups-title">
            <div className="panel__head">
              <div>
                <h2 id="photo-checkups-title">Photos & seasonal home checkups</h2>
                <p className="form-note">
                  Photograph the same exterior, attic, ceilings, mechanical equipment,
                  and trouble spots a few times a year so changes are easier to notice.
                </p>
              </div>
              {state.status === 'ready' ? <span className="mono">{photos.length} saved</span> : null}
            </div>
            {photos.length > 0 ? (
              <FiledRows records={photos} />
            ) : (
              <EmptyState
                title="No saved home-checkup photos yet"
                body={uploadsEnabled
                  ? 'Choose Photo in Add to the library when you are ready to start a dated condition record.'
                  : 'This is where dated condition photos will appear after secure photo storage is opened.'}
              />
            )}
          </section>

          <section id="filed-records" className="panel" aria-labelledby="filed-records-title">
            <div className="panel__head">
              <div>
                <h2 id="filed-records-title">Filed home records</h2>
                <p className="form-note">Only records returned by this home&rsquo;s private library are shown.</p>
              </div>
              {state.status === 'ready' ? <span className="mono">{filedRecords.length} saved</span> : null}
            </div>
            {filedRecords.length > 0 ? (
              <FiledRows records={filedRecords} />
            ) : (
              <EmptyState
                title="No filed records yet"
                body={uploadsEnabled
                  ? 'Add a policy, contract, invoice, permit, manual, warranty paper, tax notice, valuation, or sale record when you are ready.'
                  : 'No private papers were returned for this home. Secure uploads are not open right now.'}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
