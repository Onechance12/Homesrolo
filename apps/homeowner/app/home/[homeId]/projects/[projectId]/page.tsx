'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePort, useSession } from '../../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../../components/states.tsx'
import { PhotoPlate } from '../../../../../components/PhotoPlate.tsx'
import { IconDocs } from '../../../../../components/icons.tsx'
import { STATUS_LABEL } from '../../../../../components/projectStatus.ts'
import { mintCommandRef } from '../../../../../lib/port/command-ref.ts'
import { PrivateArtifactCollection, PrivateArtifactUploader } from '../../../../../components/PrivateArtifacts.tsx'
import type {
  Project,
  ProjectActivity,
  ProjectCategory,
  ProjectItem,
  ProjectReviewPreview,
  ProjectStatus,
} from '../../../../../lib/port/types.ts'
import { RoofQuoteVault } from '../../../../../components/RoofQuoteVault.tsx'

type WorkspaceSection = 'overview' | 'activity' | 'files' | 'decisions' | 'people'

const WORKSPACE_SECTIONS: readonly { value: WorkspaceSection; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Updates' },
  { value: 'files', label: 'Photos & files' },
  { value: 'decisions', label: 'Decisions' },
  { value: 'people', label: 'People' },
]

const CATEGORIES: readonly { value: ProjectCategory; label: string; trade: string }[] = [
  { value: 'interior', label: 'Interior / remodel', trade: 'Interior' },
  { value: 'hvac', label: 'Heating & cooling', trade: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing', trade: 'Plumbing' },
  { value: 'electrical', label: 'Electrical', trade: 'Electrical' },
  { value: 'appliances', label: 'Appliances', trade: 'Appliances' },
  { value: 'exterior', label: 'Exterior / gutters', trade: 'Exterior' },
  { value: 'roofing', label: 'Roof', trade: 'Roofing' },
  { value: 'landscaping', label: 'Yard / landscaping', trade: 'Landscaping' },
  { value: 'pest', label: 'Pest control', trade: 'Pest control' },
  { value: 'pool', label: 'Pool', trade: 'Pool' },
  { value: 'new_construction', label: 'New construction', trade: 'New construction' },
  { value: 'other', label: 'Something else', trade: 'Other' },
]

function categoryFor(project: Project): ProjectCategory {
  return project.category
}

function activityDate(activity: ProjectActivity): string {
  const parsed = new Date(activity.createdAt)
  return Number.isNaN(parsed.getTime()) ? activity.createdAt : parsed.toLocaleDateString()
}

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
  const sessionReady = session.state.kind !== 'loading'
  const uploadsEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.uploads
  const projectQuotesEnabled = session.state.kind === 'signed_in'
    && session.state.capabilities.projectQuotes
  const { state, retry } = usePortCall(() => port.getProject(homeId, projectId))
  const { state: filesState, retry: retryFiles } = usePortCall(() => uploadsEnabled
    ? port.listDocuments(homeId)
    : Promise.resolve({ ok: true as const, value: [] }))
  const { state: activityState, retry: retryActivity } = usePortCall(() =>
    port.listProjectActivity(homeId, projectId),
  )
  const { state: itemsState, retry: retryItems } = usePortCall(() =>
    port.listProjectItems(homeId, projectId),
  )
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview')
  const [savedProject, setSavedProject] = useState<Project | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planned')
  const [editCategory, setEditCategory] = useState<ProjectCategory>('other')
  const [editOccurredOn, setEditOccurredOn] = useState('')
  const [editProfessional, setEditProfessional] = useState('')
  const [savingProject, setSavingProject] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const editAttempt = useRef<string | null>(null)
  const [activityKind, setActivityKind] = useState<ProjectActivity['kind']>('note')
  const [activityBody, setActivityBody] = useState('')
  const [addingActivity, setAddingActivity] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const activityAttempt = useRef<string | null>(null)
  const [itemKind, setItemKind] = useState<ProjectItem['kind']>('material')
  const [itemLabel, setItemLabel] = useState('')
  const [itemDetail, setItemDetail] = useState('')
  const [itemState, setItemState] = useState<ProjectItem['state']>('considering')
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  const [itemError, setItemError] = useState<string | null>(null)
  const itemAttempt = useRef<string | null>(null)
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

  useEffect(() => {
    retryFiles()
  }, [uploadsEnabled, retryFiles])

  function moveWorkspaceTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % WORKSPACE_SECTIONS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + WORKSPACE_SECTIONS.length) % WORKSPACE_SECTIONS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = WORKSPACE_SECTIONS.length - 1
    else return
    event.preventDefault()
    const section = WORKSPACE_SECTIONS[next]
    if (!section) return
    setActiveSection(section.value)
    requestAnimationFrame(() => document.getElementById(`project-tab-${section.value}`)?.focus())
  }

  function beginEditing(project: Project) {
    setEditTitle(project.title)
    setEditSummary(project.summary)
    setEditStatus(project.status)
    setEditCategory(categoryFor(project))
    setEditOccurredOn(project.performedOn ?? '')
    setEditProfessional(project.professionalLabel || project.contractor || '')
    setEditError(null)
    editAttempt.current = null
    setEditing(true)
  }

  async function saveProjectChanges(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault()
    if (savingProject || !editTitle.trim()) return
    editAttempt.current ??= mintCommandRef()
    setSavingProject(true)
    setEditError(null)
    const result = await port.updateProject(homeId, projectId, {
      commandRef: editAttempt.current,
      expectedRevision: project.revision,
      title: editTitle.trim(),
      summary: editSummary.trim() || null,
      status: editStatus,
      category: editCategory,
      occurredOn: editOccurredOn || null,
      professionalLabel: editProfessional.trim() || null,
    })
    setSavingProject(false)
    if (!result.ok) {
      if (result.error === 'conflict') {
        setSavedProject(null)
        editAttempt.current = null
        retry()
        setEditError('This project changed somewhere else. Homesrolo is reloading the latest version; review your draft before saving again.')
        return
      }
      setEditError('Homesrolo could not save these changes. Your existing project is unchanged.')
      return
    }
    setSavedProject(result.value)
    editAttempt.current = null
    setEditing(false)
  }

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (addingActivity || !activityBody.trim()) return
    activityAttempt.current ??= mintCommandRef()
    setAddingActivity(true)
    setActivityError(null)
    const result = await port.addProjectActivity(homeId, projectId, {
      commandRef: activityAttempt.current,
      kind: activityKind,
      body: activityBody.trim(),
    })
    setAddingActivity(false)
    if (!result.ok) {
      setActivityError('This update was not saved. Check your connection and try again.')
      return
    }
    activityAttempt.current = null
    setActivityBody('')
    retryActivity()
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingItem || !itemLabel.trim()) return
    itemAttempt.current ??= mintCommandRef()
    setSavingItem(true)
    setItemError(null)
    const result = await port.saveProjectItem(homeId, projectId, {
      commandRef: itemAttempt.current,
      ...(editingItem ? {
        itemRef: editingItem.itemRef,
        expectedRevision: editingItem.revision,
      } : {}),
      kind: itemKind,
      label: itemLabel.trim(),
      detail: itemDetail.trim() || undefined,
      state: itemState,
    })
    setSavingItem(false)
    if (!result.ok) {
      if (result.error === 'conflict') {
        itemAttempt.current = null
        setEditingItem(null)
        setItemLabel('')
        setItemDetail('')
        setItemState('considering')
        retryItems()
        setItemError('This item changed somewhere else. Homesrolo reloaded the latest list; choose Edit again to review it.')
        return
      }
      setItemError('This item was not saved. Check the details and try again.')
      return
    }
    itemAttempt.current = null
    setItemLabel('')
    setItemDetail('')
    setEditingItem(null)
    retryItems()
  }

  function beginItemEdit(item: ProjectItem) {
    itemAttempt.current = null
    setEditingItem(item)
    setItemKind(item.kind)
    setItemLabel(item.label)
    setItemDetail(item.detail)
    setItemState(item.state)
    setItemError(null)
  }

  function resetPreparedReview() {
    setReviewPreview(null)
    setConsentAccepted(false)
    setReviewError(null)
    submissionAttempt.current = null
  }

  async function previewForReview() {
    if (!name.trim() || reviewing || submitting) return
    const attachmentHandoffEnabled = session.state.kind === 'signed_in'
      && session.state.capabilities.projectReviewAttachments
    setReviewing(true)
    setReviewError(null)
    const result = await port.previewProjectForReview(homeId, projectId, {
      name,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      preferredContact,
      selectedArtifactRefs: attachmentHandoffEnabled ? selectedArtifacts : [],
    })
    setReviewing(false)
    if (!result.ok) {
      setReviewError('Homesrolo could not prepare the exact request. Check the details and try again.')
      return
    }
    setReviewPreview(result.value)
    setConsentAccepted(false)
  }

  async function submitForReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewPreview || !consentAccepted || submitting) return
    const attachmentHandoffEnabled = session.state.kind === 'signed_in'
      && session.state.capabilities.projectReviewAttachments
    submissionAttempt.current ??= mintCommandRef()
    setSubmitting(true)
    const result = await port.submitProjectForReview(homeId, projectId, {
      commandRef: submissionAttempt.current,
      reviewedDisclosureDigest: reviewPreview.disclosureDigest,
      name,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      preferredContact,
      selectedArtifactRefs: attachmentHandoffEnabled ? selectedArtifacts : [],
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
  const project = savedProject ?? state.value
  const editingSupported = Number.isInteger(project.revision)
  const projectFiles = filesState.status === 'ready'
    ? filesState.value.filter(file => file.projectRef === project.projectRef)
    : []

  return (
    <div className="project-workspace">
      <Link href={`/home/${homeId}/projects`} className="backlink">← All projects</Link>

      <header className="project-workspace__head">
        <div>
          <p className="mono">{project.trade} · Project record</p>
          <h1>{project.title}</h1>
          <p>{project.summary || 'Add notes, photos, decisions, and people as this work takes shape.'}</p>
        </div>
        <span className={project.status === 'completed' ? 'pill pill--recorded' : project.status === 'in_progress' ? 'pill pill--progress' : 'pill pill--muted'}>
            {STATUS_LABEL[project.status]}
        </span>
      </header>

      <nav className="project-workspace__tabs" role="tablist" aria-label="Project workspace">
        {WORKSPACE_SECTIONS.map((section, index) => (
          <button
            key={section.value}
            id={`project-tab-${section.value}`}
            type="button"
            role="tab"
            aria-selected={activeSection === section.value}
            aria-controls={`project-panel-${section.value}`}
            tabIndex={activeSection === section.value ? 0 : -1}
            onClick={() => setActiveSection(section.value)}
            onKeyDown={event => moveWorkspaceTab(event, index)}
          >
            {section.label}
            {section.value === 'files' && projectFiles.length > 0 ? <span>{projectFiles.length}</span> : null}
          </button>
        ))}
      </nav>

      {activeSection === 'overview' ? (
        <section
          id="project-panel-overview"
          role="tabpanel"
          aria-labelledby="project-tab-overview"
          className="project-workspace__panel"
        >
          {!editing ? (
            <div className="project-overview">
              <div className="project-overview__head">
                <div>
                  <p className="mono">The basics</p>
                  <h2>Project overview</h2>
                </div>
                {editingSupported ? (
                  <button type="button" className="btn btn--quiet btn--compact" onClick={() => beginEditing(project)}>
                    Edit project
                  </button>
                ) : null}
              </div>
              <dl className="project-facts">
                <div><dt>Status</dt><dd>{STATUS_LABEL[project.status]}</dd></div>
                <div><dt>Area</dt><dd>{project.trade}</dd></div>
                <div><dt>Work date</dt><dd>{project.performedOn ?? 'Not recorded'}</dd></div>
                <div><dt>Professional</dt><dd>{project.professionalLabel || project.contractor || 'Not added'}</dd></div>
              </dl>
            </div>
          ) : (
            <form className="project-edit" onSubmit={event => saveProjectChanges(event, project)}>
              <div className="project-overview__head">
                <div><p className="mono">Make a correction</p><h2>Edit project</h2></div>
                <button type="button" className="btn btn--quiet btn--compact" onClick={() => setEditing(false)}>Cancel</button>
              </div>
              <div className="project-edit__grid">
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Project name</span>
                  <input value={editTitle} required maxLength={120} onChange={event => {
                    editAttempt.current = null
                    setEditTitle(event.target.value)
                  }} />
                </label>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Part of the home</span>
                  <select value={editCategory} onChange={event => {
                    editAttempt.current = null
                    setEditCategory(event.target.value as ProjectCategory)
                  }}>
                    {CATEGORIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Status</span>
                  <select value={editStatus} onChange={event => {
                    editAttempt.current = null
                    setEditStatus(event.target.value as ProjectStatus)
                  }}>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Exact work date (optional)</span>
                  <input type="date" max={new Date().toISOString().slice(0, 10)} value={editOccurredOn} onChange={event => {
                    editAttempt.current = null
                    setEditOccurredOn(event.target.value)
                  }} />
                </label>
              </div>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Notes</span>
                <textarea value={editSummary} maxLength={2000} onChange={event => {
                  editAttempt.current = null
                  setEditSummary(event.target.value)
                }} placeholder="What changed, what still needs a decision, or what should future you know?" />
              </label>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Professional or company (optional)</span>
                <input value={editProfessional} maxLength={160} onChange={event => {
                  editAttempt.current = null
                  setEditProfessional(event.target.value)
                }} placeholder="Who is helping with this work?" />
              </label>
              {editError ? <div className="notice" role="alert">{editError}</div> : null}
              <button className="btn btn--primary" type="submit" disabled={savingProject || !editTitle.trim()}>
                {savingProject ? 'Saving changes…' : 'Save project'}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {activeSection === 'activity' ? (
        <section
          id="project-panel-activity"
          role="tabpanel"
          aria-labelledby="project-tab-activity"
          className="project-workspace__panel"
        >
          <div className="project-overview__head">
            <div><p className="mono">A running record</p><h2>Updates</h2></div>
          </div>
          {!project.isSynthetic ? (
            <form className="project-quick-entry" onSubmit={addActivity}>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Type</span>
                <select value={activityKind} onChange={event => {
                  activityAttempt.current = null
                  setActivityKind(event.target.value as ProjectActivity['kind'])
                }}>
                  <option value="note">Note</option>
                  <option value="milestone">Milestone</option>
                </select>
              </label>
              <label className="field project-quick-entry__body" style={{ marginTop: 0 }}>
                <span>What happened?</span>
                <input value={activityBody} maxLength={1000} onChange={event => {
                  activityAttempt.current = null
                  setActivityBody(event.target.value)
                }} placeholder="Estimate received, color chosen, work started…" />
              </label>
              <button className="btn btn--primary" type="submit" disabled={addingActivity || !activityBody.trim()}>
                {addingActivity ? 'Saving…' : 'Add update'}
              </button>
            </form>
          ) : !project.isSynthetic ? (
            <div className="notice">Updates are not connected in this build yet. Nothing entered here would be saved.</div>
          ) : null}
          {activityError ? <div className="notice" role="alert">{activityError}</div> : null}
          {activityState.status === 'loading' ? <Skeleton lines={3} label="Loading project updates" /> : null}
          {activityState.status === 'error' ? <ErrorState retry={retryActivity} error={activityState.error} /> : null}
          {activityState.status === 'ready' && activityState.value.length > 0 ? (
            <ol className="project-activity">
              {activityState.value.map(activity => (
                <li key={activity.activityRef}>
                  <span className="project-activity__dot" aria-hidden="true" />
                  <div>
                    <span className="mono">{activity.kind === 'milestone' ? 'Milestone' : 'Note'} · {activityDate(activity)}</span>
                    <p>{activity.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : activityState.status === 'ready' ? (
            <div className="project-empty-inline"><strong>No updates yet</strong><span>Add the first decision, visit, or milestone.</span></div>
          ) : null}
        </section>
      ) : null}

      {activeSection === 'files' && project.isSynthetic ? <section id="project-panel-files" role="tabpanel" className="project-workspace__panel" aria-labelledby="project-tab-files">
        <div className="panel__head"><h2 id="project-photos">Photos</h2></div>
        {project.photos.length === 0 ? (
          <EmptyState title="No photos in this sample" body="This sample project has no saved photo records." />
        ) : (
          <div className="plates">
            {project.photos.map(photo => <PhotoPlate key={photo.photoRef} photo={photo} />)}
          </div>
        )}
      </section> : null}

      {activeSection === 'files' && !project.isSynthetic && uploadsEnabled ? (
        <section id="project-panel-files" role="tabpanel" aria-labelledby="project-tab-files" className="project-workspace__panel stack" style={{ ['--stack-gap' as never]: '0.8rem' }}>
          <div className="panel__head">
            <div>
              <h2 id="project-files">Project files</h2>
              <p>Photos and papers saved to this project.</p>
            </div>
          </div>
          <PrivateArtifactUploader
            homeRef={homeId}
            projectRef={projectId}
            upload={(ref, input) => port.uploadPrivateArtifact(ref, input)}
            onUploaded={retryFiles}
            initialKind="photo"
          />
          {filesState.status === 'loading' ? <Skeleton lines={2} label="Loading project files" /> : null}
          {filesState.status === 'error' ? <ErrorState retry={retryFiles} error={filesState.error} /> : null}
          {filesState.status === 'ready' ? (
            <PrivateArtifactCollection
              records={projectFiles}
              emptyMessage="Take a before photo or save the first estimate, receipt, or warranty for this project."
            />
          ) : null}
        </section>
      ) : null}

      {activeSection === 'files'
        && !project.isSynthetic
        && session.state.kind === 'signed_in'
        && !uploadsEnabled ? (
        <section id="project-panel-files" role="tabpanel" aria-labelledby="project-tab-files" className="project-workspace__panel">
          <div className="project-overview__head">
            <div><p className="mono">Private project storage</p><h2>Photos &amp; files</h2></div>
          </div>
          <div className="project-upload-off" role="status">
            <strong>Uploads are turned off in this build.</strong>
            <p>Your project is saved, but no photo or file has been uploaded. When storage is connected, this is where you will add site photos, estimates, receipts, warranties, and completion records.</p>
          </div>
        </section>
      ) : null}

      {activeSection === 'decisions' ? (
        <section id="project-panel-decisions" role="tabpanel" aria-labelledby="project-tab-decisions" className="project-workspace__panel">
          <div className="project-overview__head">
            <div><p className="mono">Choices worth remembering</p><h2>Decisions, materials &amp; wish list</h2></div>
          </div>
          {!project.isSynthetic ? (
            <form className="project-item-form" onSubmit={addItem}>
              {editingItem ? (
                <div className="project-item-form__mode">
                  <strong>Editing saved item</strong>
                  <button type="button" onClick={() => {
                    itemAttempt.current = null
                    setEditingItem(null)
                    setItemLabel('')
                    setItemDetail('')
                    setItemState('considering')
                  }}>Cancel edit</button>
                </div>
              ) : null}
              <div className="project-item-form__grid">
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Type</span>
                  <select value={itemKind} onChange={event => {
                    itemAttempt.current = null
                    setItemKind(event.target.value as ProjectItem['kind'])
                  }}>
                    <option value="material">Material or product</option>
                    <option value="decision">Decision</option>
                    <option value="wishlist">Wish list</option>
                  </select>
                </label>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Status</span>
                  <select value={itemState} onChange={event => {
                    itemAttempt.current = null
                    setItemState(event.target.value as ProjectItem['state'])
                  }}>
                    <option value="considering">Considering</option>
                    <option value="chosen">Chosen</option>
                    <option value="purchased">Purchased</option>
                    <option value="declined">Not using</option>
                  </select>
                </label>
                <label className="field project-item-form__label" style={{ marginTop: 0 }}>
                  <span>Item</span>
                  <input value={itemLabel} required maxLength={160} onChange={event => {
                    itemAttempt.current = null
                    setItemLabel(event.target.value)
                  }} placeholder="Paint color, faucet, shingle, sofa…" />
                </label>
              </div>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Link, model, color, or note (optional)</span>
                <input value={itemDetail} maxLength={1000} onChange={event => {
                  itemAttempt.current = null
                  setItemDetail(event.target.value)
                }} placeholder="Paste a product link or record why you chose it." />
              </label>
              {itemError ? <div className="notice" role="alert">{itemError}</div> : null}
              <button className="btn btn--primary" type="submit" disabled={savingItem || !itemLabel.trim()}>
                {savingItem ? 'Saving…' : editingItem ? 'Update item' : 'Save item'}
              </button>
            </form>
          ) : !project.isSynthetic ? (
            <div className="notice">Decisions and wish-list items are not connected in this build yet. Nothing entered here would be saved.</div>
          ) : null}
          {itemsState.status === 'loading' ? <Skeleton lines={3} label="Loading project decisions" /> : null}
          {itemsState.status === 'error' ? <ErrorState retry={retryItems} error={itemsState.error} /> : null}
          {itemsState.status === 'ready' && itemsState.value.length > 0 ? (
            <ul className="project-items">
              {itemsState.value.map(item => (
                <li key={item.itemRef}>
                  <div>
                    <span className="mono">{item.kind === 'wishlist' ? 'Wish list' : item.kind === 'material' ? 'Material' : 'Decision'}</span>
                    <strong>{item.label}</strong>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  <div className="project-item-actions">
                    <span className={item.state === 'chosen' || item.state === 'purchased' ? 'pill pill--recorded' : 'pill pill--muted'}>
                      {item.state === 'purchased' ? 'Purchased' : item.state === 'chosen' ? 'Chosen' : item.state === 'declined' ? 'Not using' : 'Considering'}
                    </span>
                    {!project.isSynthetic ? (
                      <button type="button" onClick={() => beginItemEdit(item)}>Edit</button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : itemsState.status === 'ready' ? (
            <div className="project-empty-inline"><strong>No decisions saved yet</strong><span>Keep products, colors, links, and final choices with the project.</span></div>
          ) : null}
        </section>
      ) : null}

      {activeSection === 'decisions' && !project.isSynthetic && project.trade === 'Roofing' && projectQuotesEnabled ? (
        <RoofQuoteVault
          homeRef={homeId}
          projectRef={projectId}
          projectFiles={projectFiles}
          uploadsEnabled={uploadsEnabled}
        />
      ) : null}

      {activeSection === 'files' && !project.isSynthetic && !sessionReady ? (
        <section className="panel" aria-label="Loading private project tools">
          <Skeleton lines={2} label="Loading private project tools" />
        </section>
      ) : null}

      {activeSection === 'people' ? (
        <section id="project-panel-people" role="tabpanel" aria-labelledby="project-tab-people" className="project-workspace__panel">
          <div className="project-overview__head">
            <div><p className="mono">People connected to this work</p><h2>Homeowner &amp; professionals</h2></div>
            {editingSupported ? (
              <button type="button" className="btn btn--quiet btn--compact" onClick={() => {
                setActiveSection('overview')
                beginEditing(project)
              }}>Edit people</button>
            ) : null}
          </div>
          <div className="project-person-card">
            <span aria-hidden="true">{(project.professionalLabel || project.contractor) ? 'P' : '+'}</span>
            <div>
              <strong>{project.professionalLabel || project.contractor || 'No professional added'}</strong>
              <p>{project.professionalLabel || project.contractor
                ? 'Saved to this project. This does not grant account or Home Record access.'
                : 'Add the company or person helping with this work when you know it.'}</p>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === 'people' && !project.isSynthetic
        && project.trade === 'Roofing'
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
              {session.state.capabilities.projectReviewAttachments && projectFiles.length > 0 ? (
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
              ) : session.state.capabilities.projectReviewAttachments ? (
                <p className="mono">No files will be included. You can still send the roofing request.</p>
              ) : (
                <div className="notice">
                  <strong>Your files stay in Homesrolo.</strong>{' '}
                  Only this roofing request is sent to Chance; no photos or documents are attached.
                </div>
              )}
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
                        : 'No files sent — saved files stay in Homesrolo'}</dd></div>
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

      {activeSection === 'files' && project.isSynthetic ? <section className="project-workspace__panel" aria-labelledby="project-docs">
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
      </section> : null}

      {activeSection === 'files' && project.isSynthetic ? <section className="project-workspace__panel" aria-labelledby="project-warranty">
        <div className="panel__head"><h2 id="project-warranty">Warranty</h2></div>
        {project.warranty ? (
          <div className="stack" style={{ ['--stack-gap' as never]: '0.5rem' }}>
            <p style={{ fontWeight: 650 }}>{project.warranty.coverage}</p>
            <p className="mono">
              {project.warranty.issuedBy} · {project.warranty.startsOn} → {project.warranty.endsOn}
            </p>
          </div>
        ) : (
          <EmptyState title="No warranty recorded" body="This sample project has no warranty record." />
        )}
      </section> : null}

      {activeSection === 'overview' && project.isSynthetic ? (
        <p className="mono">Synthetic record — no real project, company, or document exists behind it.</p>
      ) : null}
    </div>
  )
}
