'use client'

import Link from 'next/link'
import { use, useRef, useState, type FormEvent } from 'react'
import { usePort, useSession } from '../../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../../components/states.tsx'
import { PhotoPlate } from '../../../../../components/PhotoPlate.tsx'
import { IconDocs } from '../../../../../components/icons.tsx'
import { STATUS_LABEL } from '../../../../../components/projectStatus.ts'
import { mintCommandRef } from '../../../../../lib/port/command-ref.ts'
import type { ProjectReviewPreview } from '../../../../../lib/port/types.ts'

/**
 * A single project, rendered as the document it is becoming: the job's
 * facts in ruled rows, its photo plates, its papers, and its warranty.
 */
export default function ProjectPage({
  params,
}: {
  params: Promise<{ homeId: string; projectId: string }>
}) {
  const { homeId, projectId } = use(params)
  const port = usePort()
  const session = useSession()
  const { state, retry } = usePortCall(() => port.getProject(homeId, projectId))
  const files = usePortCall(() => port.listDocuments(homeId))
  const [uploadKind, setUploadKind] = useState<'photo' | 'document' | 'warranty'>('photo')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadAttempt = useRef<string | null>(null)
  const uploadInput = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredContact, setPreferredContact] = useState<'email' | 'phone' | 'text'>('email')
  const [selectedArtifacts, setSelectedArtifacts] = useState<readonly string[]>([])
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [reviewPreview, setReviewPreview] = useState<ProjectReviewPreview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [submissionUnknown, setSubmissionUnknown] = useState(false)
  const submissionAttempt = useRef<string | null>(null)

  function resetPreparedReview() {
    setReviewPreview(null)
    setConsentAccepted(false)
    setReviewError(null)
    submissionAttempt.current = null
  }

  async function previewForReview() {
    if (!name.trim() || reviewing || submitting) return
    setReviewing(true)
    setReviewError(null)
    const result = await port.previewProjectForReview(homeId, projectId, {
      name,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      preferredContact,
      selectedArtifactRefs: selectedArtifacts,
    })
    setReviewing(false)
    if (!result.ok) {
      setReviewError('Homesrolo could not prepare the exact request. Check the details and try again.')
      return
    }
    setReviewPreview(result.value)
    setConsentAccepted(false)
  }

  async function uploadProjectFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uploadFile || uploading) return
    uploadAttempt.current ??= mintCommandRef()
    setUploading(true)
    const result = await port.uploadPrivateArtifact(homeId, {
      commandRef: uploadAttempt.current,
      kind: uploadKind,
      file: uploadFile,
      projectRef: projectId,
    })
    setUploading(false)
    if (!result.ok) return
    uploadAttempt.current = null
    setUploadFile(null)
    if (uploadInput.current) uploadInput.current.value = ''
    files.retry()
  }

  async function submitForReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewPreview || !consentAccepted || submitting) return
    submissionAttempt.current ??= mintCommandRef()
    setSubmitting(true)
    const result = await port.submitProjectForReview(homeId, projectId, {
      commandRef: submissionAttempt.current,
      reviewedDisclosureDigest: reviewPreview.disclosureDigest,
      name,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      preferredContact,
      selectedArtifactRefs: selectedArtifacts,
      consentAccepted: true,
    })
    setSubmitting(false)
    if (!result.ok) {
      if (result.error === 'conflict') {
        resetPreparedReview()
        setReviewError('The saved home or project changed. Review the exact request again before sending it.')
        return
      }
      setSubmissionMessage('This request could not be confirmed. Nothing will be sent again automatically.')
      setSubmissionUnknown(true)
      return
    }
    setSubmissionMessage(result.value.message)
    setSubmissionUnknown(result.value.status === 'reconciliation_required')
    if (result.value.status === 'awaiting_chance_review') submissionAttempt.current = null
  }

  if (state.status === 'loading') {
    return <div className="panel"><Skeleton lines={6} label="Opening the project record" /></div>
  }
  if (state.status === 'error') {
    return state.error === 'not_found'
      ? <EmptyState title="No such project" body="This project is not available in this home file."
          action={<Link className="btn btn--quiet" href={`/home/${homeId}/projects`}>All projects</Link>} />
      : <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />
  }
  if (state.status !== 'ready') return null
  const project = state.value
  const projectFiles = files.state.status === 'ready'
    ? files.state.value.filter(file => file.projectRef === project.projectRef)
    : []

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <Link href={`/home/${homeId}/projects`} className="backlink">← All projects</Link>

      <article className="jobdoc">
        <p className="jobdoc__serial">
          <span>Project record</span>
          <span aria-hidden="true">{project.projectRef.slice(0, 14)}…</span>
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.45rem' }}>{project.title}</h1>
          <span className={project.status === 'completed' ? 'stamp' : 'stamp stamp--muted'}>
            {STATUS_LABEL[project.status]}
          </span>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.94rem', marginTop: '0.6rem', maxWidth: '58ch', whiteSpace: 'pre-wrap' }}>
          {project.summary}
        </p>
        <dl className="jobdoc__rows">
          <div><dt>{project.status === 'planned' ? 'Started' : 'Performed'}</dt><dd>{project.performedOn}</dd></div>
          <div><dt>Trade</dt><dd>{project.trade}</dd></div>
          {project.contractor ? <div><dt>By</dt><dd>{project.contractor}</dd></div> : null}
          {project.materials.map(m => (
            <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>
          ))}
        </dl>
      </article>

      <section className="panel" aria-labelledby="project-photos">
        <div className="panel__head"><h2 id="project-photos">Photos</h2></div>
        {project.photos.length === 0 ? (
          <EmptyState title="No photos yet" body="Photos will live with this project as the file grows." />
        ) : (
          <div className="plates">
            {project.photos.map(photo => <PhotoPlate key={photo.photoRef} photo={photo} />)}
          </div>
        )}
      </section>

      {!project.isSynthetic ? (
        <section className="panel stack" aria-labelledby="project-files" style={{ ['--stack-gap' as never]: '0.8rem' }}>
          <div className="panel__head">
            <div>
              <h2 id="project-files">Project files</h2>
              <p>Photos and papers saved to this roofing request.</p>
            </div>
          </div>
          <form className="stack" style={{ ['--stack-gap' as never]: '0.65rem' }} onSubmit={uploadProjectFile}>
            <div className="intake__row">
              <label className="field" style={{ marginTop: 0 }}>
                <span>Type</span>
                <select value={uploadKind} onChange={event => {
                  setUploadKind(event.target.value as typeof uploadKind)
                  uploadAttempt.current = null
                }}>
                  <option value="photo">Photo</option>
                  <option value="document">Document</option>
                  <option value="warranty">Warranty document</option>
                </select>
              </label>
              <label className="field" style={{ marginTop: 0, flex: 1 }}>
                <span>PDF, JPEG, or PNG up to 25 MB</span>
                <input ref={uploadInput} type="file" accept="application/pdf,image/jpeg,image/png"
                  onChange={event => {
                    setUploadFile(event.target.files?.[0] ?? null)
                    uploadAttempt.current = null
                  }} />
              </label>
            </div>
            <button className="btn btn--quiet" type="submit" disabled={!uploadFile || uploading}>
              {uploading ? 'Adding file…' : 'Add to this project'}
            </button>
          </form>
          {files.state.status === 'loading' ? <Skeleton lines={2} label="Loading project files" /> : null}
          {files.state.status === 'error' ? <ErrorState retry={files.retry} error={files.state.error} /> : null}
          {projectFiles.length === 0 && files.state.status === 'ready'
            ? <p className="mono">No files are attached to this project yet.</p>
            : null}
          {projectFiles.length > 0 ? (
            <ul className="rows" style={{ display: 'block' }}>
              {projectFiles.map(file => (
                <li key={file.documentRef}>
                  <span className="row">
                    <span className="row__body">
                      <span className="row__title">{file.title}</span>
                      <span className="row__sub">{file.kind.replace('_', ' ')} · {file.addedOn}</span>
                    </span>
                    <span className="row__end">
                      {file.downloadHref ? <a href={file.downloadHref}>Download</a> : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {!project.isSynthetic
        && session.state.kind === 'signed_in'
        && session.state.capabilities.projectReview ? (
        <section className="panel stack" aria-labelledby="request-help" style={{ ['--stack-gap' as never]: '0.8rem' }}>
          <div className="panel__head">
            <div>
              <h2 id="request-help">Get help with this roof</h2>
              <p>Send this request to Chance for review. He decides whether and where it should go next.</p>
            </div>
          </div>
          {submissionMessage ? (
            <div className={submissionUnknown ? 'notice' : 'notice notice--success'} role="status">
              <strong>{submissionUnknown ? 'Needs confirmation.' : 'Waiting for Chance\u2019s review.'}</strong>{' '}
              {submissionMessage}
            </div>
          ) : (
            <form className="stack" style={{ ['--stack-gap' as never]: '0.75rem' }} onSubmit={submitForReview}>
              <div className="cardgrid cardgrid--2">
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Your name</span>
                  <input value={name} onChange={event => {
                    setName(event.target.value)
                    resetPreparedReview()
                  }} required maxLength={120} autoComplete="name" />
                </label>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>How should Chance contact you?</span>
                  <select value={preferredContact} onChange={event => {
                    setPreferredContact(event.target.value as typeof preferredContact)
                    resetPreparedReview()
                  }}>
                    <option value="email">Email me</option>
                    <option value="phone">Call me</option>
                    <option value="text">Text me</option>
                  </select>
                </label>
              </div>
              {preferredContact !== 'email' ? (
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Mobile number, including country code</span>
                  <input value={phone} onChange={event => {
                    setPhone(event.target.value)
                    resetPreparedReview()
                  }} required placeholder="+12145551212" inputMode="tel" autoComplete="tel" />
                </label>
              ) : null}
              {projectFiles.length > 0 ? (
                <fieldset className="review-files">
                  <legend>Choose files to include</legend>
                  <p>Nothing is selected automatically.</p>
                  {projectFiles.map(file => (
                    <label key={file.documentRef}>
                      <input type="checkbox" checked={selectedArtifacts.includes(file.documentRef)}
                        onChange={event => {
                          setSelectedArtifacts(current => event.target.checked
                            ? [...current, file.documentRef]
                            : current.filter(ref => ref !== file.documentRef))
                          resetPreparedReview()
                        }} />
                      <span>{file.title}</span>
                    </label>
                  ))}
                </fieldset>
              ) : <p className="mono">No files will be included. You can still send the roofing request.</p>}
              {reviewError ? <div className="notice" role="alert">{reviewError}</div> : null}
              {!reviewPreview ? (
                <button className="btn btn--primary" type="button" onClick={previewForReview}
                  disabled={!name.trim() || reviewing || submitting}>
                  {reviewing ? 'Preparing exact request…' : 'Review what will be sent'}
                </button>
              ) : (
                <div className="stack" style={{ ['--stack-gap' as never]: '0.75rem' }}>
                  <div className="notice" aria-label="Exact roofing request review">
                    <strong>Review the exact information going to Chance</strong>
                    <dl className="jobdoc__rows" style={{ marginTop: '0.6rem' }}>
                      <div><dt>Name</dt><dd>{reviewPreview.homeowner.name}</dd></div>
                      <div><dt>Email</dt><dd>{reviewPreview.homeowner.email}</dd></div>
                      {reviewPreview.homeowner.phone
                        ? <div><dt>Phone</dt><dd>{reviewPreview.homeowner.phone}</dd></div>
                        : null}
                      <div><dt>Home</dt><dd>{reviewPreview.property.label}</dd></div>
                      <div><dt>Roof request</dt><dd>{reviewPreview.project.title}</dd></div>
                      <div><dt>Details</dt><dd>{reviewPreview.project.summary || 'No additional details'}</dd></div>
                      <div><dt>Files</dt><dd>{reviewPreview.attachments.length
                        ? reviewPreview.attachments.map(file => file.displayName).join(', ')
                        : 'No files selected'}</dd></div>
                    </dl>
                  </div>
                  <label className="consent-row">
                    <input type="checkbox" checked={consentAccepted}
                      onChange={event => setConsentAccepted(event.target.checked)} />
                    <span>{reviewPreview.consentText}</span>
                  </label>
                  <button className="btn btn--primary" type="submit"
                    disabled={!consentAccepted || submitting}>
                    {submitting ? 'Sending for review…' : 'Send to Chance for review'}
                  </button>
                </div>
              )}
            </form>
          )}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="project-docs">
        <div className="panel__head"><h2 id="project-docs">Papers</h2></div>
        {project.documents.length === 0 ? (
          <EmptyState title="No documents" body="Contracts and invoices for this job would be filed here." />
        ) : (
          <ul className="rows" style={{ display: 'block' }}>
            {project.documents.map(doc => (
              <li key={doc.documentRef}>
                <span className="row">
                  <span className="row__glyph"><IconDocs /></span>
                  <span className="row__body">
                    <span className="row__title">{doc.title}</span>
                    <span className="row__sub">{doc.kind.replace('_', ' ')} · {doc.pages} pages</span>
                  </span>
                  <span className="row__end"><span className="mono">{doc.addedOn}</span></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="project-warranty">
        <div className="panel__head"><h2 id="project-warranty">Warranty</h2></div>
        {project.warranty ? (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.5rem' }}>
            <p style={{ fontWeight: 650 }}>{project.warranty.coverage}</p>
            <p className="mono">
              {project.warranty.issuedBy} · {project.warranty.startsOn} → {project.warranty.endsOn}
            </p>
          </div>
        ) : (
          <EmptyState title="No warranty recorded" body="If this work carries coverage, it would be recorded here with its dates." />
        )}
      </section>

      {project.isSynthetic ? (
        <p className="mono">Synthetic record — no real project, company, or document exists behind it.</p>
      ) : null}
    </div>
  )
}
