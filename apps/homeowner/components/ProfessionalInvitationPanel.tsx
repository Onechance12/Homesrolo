'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { usePortCall } from '../lib/port/hooks.ts'
import { usePort } from '../lib/port/provider.tsx'
import type {
  DocumentSummary,
  ProfessionalOrganization,
  ProjectCategory,
  ProjectInvitation,
} from '../lib/port/types.ts'
import { ErrorState, Skeleton } from './states.tsx'

const TRADE_LABEL: Readonly<Record<ProjectCategory, string>> = Object.freeze({
  roofing: 'Roofing',
  exterior: 'Exterior',
  interior: 'Interior & remodeling',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  landscaping: 'Yard & landscaping',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pools & outdoor living',
  new_construction: 'New construction',
  other: 'Home services',
})

function invitationStatus(invitation: ProjectInvitation) {
  return ({
    pending: 'Waiting for response',
    accepted: 'Project access accepted',
    declined: 'Invitation declined',
    revoked: 'Access revoked',
    expired: 'Invitation expired',
  } as const)[invitation.status]
}

function matchesSearch(organization: ProfessionalOrganization, search: string) {
  const query = search.trim().toLocaleLowerCase('en-US')
  if (!query) return true
  return [organization.displayName, organization.description ?? '', ...organization.serviceAreas]
    .some(value => value.toLocaleLowerCase('en-US').includes(query))
}

export function ProfessionalInvitationPanel({
  homeRef,
  projectRef,
  projectCategory,
  projectFiles,
}: {
  readonly homeRef: string
  readonly projectRef: string
  readonly projectCategory: ProjectCategory
  readonly projectFiles: readonly DocumentSummary[]
}) {
  const port = usePort()
  const searchParams = useSearchParams()
  const directory = usePortCall(() => port.listProfessionals({ trade: projectCategory }))
  const invitations = usePortCall(() => port.listProjectInvitations(homeRef, projectRef))
  const [search, setSearch] = useState('')
  const [selectedOrganizationRef, setSelectedOrganizationRef] = useState(
    () => searchParams.get('professional') ?? '',
  )
  const [message, setMessage] = useState('')
  const [selectedArtifactRefs, setSelectedArtifactRefs] = useState<readonly string[]>([])
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revokingRef, setRevokingRef] = useState<string | null>(null)
  const inviteAttempt = useRef<string | null>(null)
  const revokeAttempts = useRef(new Map<string, string>())
  const organizations = directory.state.status === 'ready'
    ? directory.state.value.filter(organization => matchesSearch(organization, search))
    : []
  const selectedOrganization = directory.state.status === 'ready'
    ? directory.state.value.find(organization =>
        organization.organizationRef === selectedOrganizationRef)
    : null
  const activeOrganizationRefs = useMemo(
    () => new Set(invitations.state.status === 'ready'
      ? invitations.state.value
          .filter(invitation => invitation.status === 'pending' || invitation.status === 'accepted')
          .map(invitation => invitation.professionalOrganizationRef)
      : []),
    [invitations.state],
  )

  function toggleArtifact(artifactRef: string) {
    inviteAttempt.current = null
    setSelectedArtifactRefs(current => current.includes(artifactRef)
      ? current.filter(value => value !== artifactRef)
      : [...current, artifactRef])
  }

  async function sendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrganization || sending
      || activeOrganizationRefs.has(selectedOrganization.organizationRef)) return
    inviteAttempt.current ??= mintCommandRef()
    setSending(true)
    setError(null)
    setNotice(null)
    const result = await port.inviteProfessional(homeRef, projectRef, {
      commandRef: inviteAttempt.current,
      professionalOrganizationRef: selectedOrganization.organizationRef,
      ...(message.trim() ? { message: message.trim() } : {}),
      selectedArtifactRefs,
      expiresInDays: 7,
    })
    setSending(false)
    if (!result.ok) {
      setError(result.error === 'conflict'
        ? 'That company already has an active invitation for this project.'
        : 'The invitation was not sent. No project access changed.')
      return
    }
    inviteAttempt.current = null
    setSelectedOrganizationRef('')
    setMessage('')
    setSelectedArtifactRefs([])
    setNotice('Invitation sent. The company can see only this project summary and the files you selected.')
    invitations.retry()
  }

  async function revoke(invitation: ProjectInvitation) {
    if (revokingRef) return
    let commandRef = revokeAttempts.current.get(invitation.invitationRef)
    if (!commandRef) {
      commandRef = mintCommandRef()
      revokeAttempts.current.set(invitation.invitationRef, commandRef)
    }
    setRevokingRef(invitation.invitationRef)
    setError(null)
    const result = await port.revokeProjectInvitation(
      homeRef,
      projectRef,
      invitation.invitationRef,
      { commandRef, expectedRevision: invitation.revision },
    )
    setRevokingRef(null)
    if (!result.ok) {
      setError(result.error === 'conflict'
        ? 'That invitation changed. Reloading its current status.'
        : 'Homesrolo could not revoke the invitation. Access was not changed.')
      if (result.error === 'conflict') invitations.retry()
      return
    }
    revokeAttempts.current.delete(invitation.invitationRef)
    setNotice('Invitation revoked. This did not delete your project or Home Record.')
    invitations.retry()
  }

  return (
    <section className="pro-invite stack" aria-labelledby="invite-professional-title">
      <div className="panel__head">
        <div>
          <p className="mono">Private project invitation</p>
          <h3 id="invite-professional-title">Invite a {TRADE_LABEL[projectCategory]} pro</h3>
          <p>Choose who you want. They receive this project—not your entire home—and only the files you check below.</p>
        </div>
        <Link className="btn btn--quiet btn--compact" href={`/home/${homeRef}/pros?trade=${projectCategory}`}>
          Browse Pros
        </Link>
      </div>

      {invitations.state.status === 'loading' ? <Skeleton lines={2} label="Loading project invitations" /> : null}
      {invitations.state.status === 'error' ? <ErrorState retry={invitations.retry} error={invitations.state.error} /> : null}
      {invitations.state.status === 'ready' && invitations.state.value.length > 0 ? (
        <div className="pro-invite__active">
          {invitations.state.value.map(invitation => {
            const organization = directory.state.status === 'ready'
              ? directory.state.value.find(candidate =>
                candidate.organizationRef === invitation.professionalOrganizationRef)
              : null
            return (
              <article key={invitation.invitationRef} className="pro-invite__status-card">
                <div>
                  <strong>{invitation.professionalDisplayLabel ?? organization?.displayName ?? 'Invited professional'}</strong>
                  <span>{invitationStatus(invitation)} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                </div>
                {(invitation.status === 'pending' || invitation.status === 'accepted') ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--compact"
                    disabled={revokingRef === invitation.invitationRef}
                    onClick={() => void revoke(invitation)}
                  >
                    {revokingRef === invitation.invitationRef ? 'Revoking…' : 'Revoke access'}
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : null}

      <details className="proposal-tool">
        <summary>
          <span aria-hidden="true">＋</span>
          <span><strong>Invite another company</strong><small>Pick a listed pro and choose the evidence they may see</small></span>
        </summary>
        <form className="proposal-tool__body stack" onSubmit={sendInvitation}>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Find a company</span>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search company or service area"
            />
          </label>
          {directory.state.status === 'loading' ? <Skeleton lines={3} label="Finding listed professionals" /> : null}
          {directory.state.status === 'error' ? <ErrorState retry={directory.retry} error={directory.state.error} /> : null}
          {directory.state.status === 'ready' && organizations.length === 0 ? (
            <div className="project-empty-inline">
              <strong>No listed {TRADE_LABEL[projectCategory].toLocaleLowerCase('en-US')} pros match yet.</strong>
              <span>You can still keep a proposal yourself. Professionals can create a free self-reported profile from the Pro hub.</span>
              <Link className="btn btn--quiet btn--compact" href="/pro">Open Pro hub</Link>
            </div>
          ) : null}
          {organizations.length > 0 ? (
            <div className="pro-picker" role="radiogroup" aria-label="Choose a professional">
              {organizations.map(organization => {
                const alreadyInvited = activeOrganizationRefs.has(organization.organizationRef)
                return (
                  <label key={organization.organizationRef} className="pro-picker__card">
                    <input
                      type="radio"
                      name="professional"
                      value={organization.organizationRef}
                      checked={selectedOrganizationRef === organization.organizationRef}
                      disabled={alreadyInvited}
                      onChange={() => {
                        inviteAttempt.current = null
                        setSelectedOrganizationRef(organization.organizationRef)
                      }}
                    />
                    <span>
                      <strong>{organization.displayName}</strong>
                      <small>{organization.serviceAreas.slice(0, 3).join(' · ')}</small>
                      <em>{alreadyInvited ? 'Already invited' : 'Company self-reported profile'}</em>
                    </span>
                  </label>
                )
              })}
            </div>
          ) : null}
          <label className="field">
            <span>Message, optional</span>
            <textarea
              value={message}
              maxLength={1_000}
              onChange={event => {
                inviteAttempt.current = null
                setMessage(event.target.value)
              }}
              placeholder="What would you like the company to review or schedule?"
            />
          </label>
          <fieldset className="pro-evidence">
            <legend>Files this company may see</legend>
            {projectFiles.length === 0 ? (
              <p>No private project files selected. The company will receive only the project summary.</p>
            ) : projectFiles.map(file => (
              <label key={file.documentRef}>
                <input
                  type="checkbox"
                  checked={selectedArtifactRefs.includes(file.documentRef)}
                  onChange={() => toggleArtifact(file.documentRef)}
                />
                <span><strong>{file.title}</strong><small>{file.kind.replace('_', ' ')}</small></span>
              </label>
            ))}
          </fieldset>
          <p className="field__hint">No address, other projects, library files, insurance records, or Home Record membership is included.</p>
          {error ? <div className="notice" role="alert">{error}</div> : null}
          {notice ? <div className="notice notice--success" role="status">{notice}</div> : null}
          <button className="btn btn--primary" type="submit" disabled={!selectedOrganization || sending
            || activeOrganizationRefs.has(selectedOrganization.organizationRef)}>
            {sending ? 'Sending invitation…' : 'Send private invitation'}
          </button>
        </form>
      </details>
    </section>
  )
}
