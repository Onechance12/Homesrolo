'use client'

import { useRef, useState, type FormEvent } from 'react'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { usePortCall } from '../lib/port/hooks.ts'
import { usePort } from '../lib/port/provider.tsx'
import type {
  ProfessionalOrganization,
  ProfessionalProposal,
  ProjectCategory,
  ProjectInvitation,
  QuoteScope,
  QuoteScopeKey,
} from '../lib/port/types.ts'
import { ErrorState, Skeleton } from './states.tsx'

const TRADES = [
  ['roofing', 'Roofing'], ['hvac', 'Heating & cooling'], ['plumbing', 'Plumbing'],
  ['electrical', 'Electrical'], ['interior', 'Interior & remodeling'],
  ['exterior', 'Exterior'], ['landscaping', 'Yard & landscaping'],
  ['pest', 'Pest control'], ['pool', 'Pools & outdoor living'],
  ['appliances', 'Appliances'], ['new_construction', 'New construction'],
  ['other', 'Other home services'],
] as const satisfies readonly (readonly [ProjectCategory, string])[]

const TRADE_LABEL = Object.fromEntries(TRADES) as Readonly<Record<ProjectCategory, string>>

const PROPOSAL_FIELDS = [
  ['project_scope', 'Work included'],
  ['materials_products', 'Materials, products, and finish choices'],
  ['schedule', 'Start window and estimated duration'],
  ['warranty', 'Work and product warranties'],
  ['payment_terms', 'Payment and change-order terms'],
  ['exclusions', 'Exclusions'],
] as const satisfies readonly (readonly [QuoteScopeKey, string])[]

type ScopeText = Partial<Record<(typeof PROPOSAL_FIELDS)[number][0], string>>

function today(): string {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function cleanList(value: string): readonly string[] {
  const seen = new Set<string>()
  return value.split(/[\n,]+/).map(item => item.trim()).filter(item => {
    const key = item.toLocaleLowerCase('en-US')
    if (item.length < 2 || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 40)
}

function slugFor(value: string): string {
  return value.toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function scopeText(proposal: ProfessionalProposal | null): ScopeText {
  if (!proposal) return {}
  return Object.fromEntries(PROPOSAL_FIELDS.map(([key]) => [key, proposal.scope[key]?.detail ?? '']))
}

function scopePayload(text: ScopeText): QuoteScope {
  const rows: Partial<Record<QuoteScopeKey, { status: 'included' | 'excluded'; detail: string }>> = {}
  for (const [key] of PROPOSAL_FIELDS) {
    const detail = text[key]?.trim()
    if (!detail) continue
    rows[key] = { status: key === 'exclusions' ? 'excluded' : 'included', detail }
  }
  return rows
}

function invitationState(invitation: ProjectInvitation) {
  return ({
    pending: 'Needs your response',
    accepted: 'Accepted',
    declined: 'Declined',
    revoked: 'Access revoked',
    expired: 'Expired',
  } as const)[invitation.status]
}

function ProfessionalInvitationCard({
  invitation,
  organization,
  onChanged,
}: {
  readonly invitation: ProjectInvitation
  readonly organization?: ProfessionalOrganization
  readonly onChanged: () => void
}) {
  const port = usePort()
  const currentProposal = usePortCall<ProfessionalProposal | null>(() =>
    invitation.status === 'accepted'
      ? port.getProfessionalProposal(invitation.invitationRef)
      : Promise.resolve({ ok: true as const, value: null }))
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const responseAttempts = useRef(new Map<string, string>())
  const [proposalDraft, setProposalDraft] = useState<{
    readonly sourceKey: string
    readonly proposalDate: string
    readonly amount: string
    readonly summary: string
    readonly scope: ScopeText
  }>(() => ({ sourceKey: 'new', proposalDate: today(), amount: '', summary: '', scope: {} }))
  const [saving, setSaving] = useState(false)
  const [proposalError, setProposalError] = useState<string | null>(null)
  const [proposalNotice, setProposalNotice] = useState<string | null>(null)
  const proposalAttempt = useRef<string | null>(null)
  const proposal = currentProposal.state.status === 'ready' ? currentProposal.state.value : null
  const proposalLocked = proposal?.homeownerDecision === 'selected'
  const proposalSourceKey = proposal
    ? `${proposal.quoteRef}:${proposal.revision}:${proposal.decisionRevision}:${proposal.homeownerDecision}`
    : 'new'
  const draft = proposalDraft.sourceKey === proposalSourceKey
    ? proposalDraft
    : {
        sourceKey: proposalSourceKey,
        proposalDate: proposal?.proposalDate ?? today(),
        amount: proposal?.totalAmountCents === undefined
          ? ''
          : (proposal.totalAmountCents / 100).toFixed(2),
        summary: proposal?.summary ?? '',
        scope: scopeText(proposal),
      }

  async function respond(response: 'accepted' | 'declined') {
    if (responding) return
    let commandRef = responseAttempts.current.get(response)
    if (!commandRef) {
      commandRef = mintCommandRef()
      responseAttempts.current.set(response, commandRef)
    }
    setResponding(response)
    setResponseError(null)
    const result = await port.respondToProjectInvitation(invitation.invitationRef, {
      commandRef,
      expectedRevision: invitation.revision,
      response,
    })
    setResponding(null)
    if (!result.ok) {
      setResponseError(result.error === 'conflict'
        ? 'This invitation changed. Reloading its current status.'
        : 'Homesrolo could not save your response. No access changed.')
      if (result.error === 'conflict') onChanged()
      return
    }
    responseAttempts.current.delete(response)
    onChanged()
  }

  async function saveProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || proposalLocked || !draft.scope.project_scope?.trim()) return
    const parsedAmount = draft.amount.trim()
      ? Number(draft.amount.replace(/[$,\s]/g, ''))
      : null
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > 10_000_000)) {
      setProposalError('Enter a total from $0 through $10,000,000, or leave it blank.')
      return
    }
    proposalAttempt.current ??= mintCommandRef()
    setSaving(true)
    setProposalError(null)
    setProposalNotice(null)
    const input = {
      commandRef: proposalAttempt.current,
      proposalDate: draft.proposalDate,
      ...(parsedAmount === null ? {} : { totalAmountCents: Math.round(parsedAmount * 100) }),
      ...(draft.summary.trim() ? { summary: draft.summary.trim() } : {}),
      scope: scopePayload(draft.scope),
    }
    const result = proposal
      ? await port.reviseProfessionalProposal(invitation.invitationRef, proposal.quoteRef, {
          ...input,
          expectedRevision: proposal.revision,
        })
      : await port.submitProfessionalProposal(invitation.invitationRef, input)
    setSaving(false)
    if (!result.ok) {
      setProposalError(result.error === 'conflict'
        ? 'This proposal changed or already exists. Its current version is reloading.'
        : 'The proposal was not submitted. Nothing changed in the homeowner’s project.')
      if (result.error === 'conflict') currentProposal.retry()
      return
    }
    proposalAttempt.current = null
    setProposalNotice(proposal ? 'Proposal revision saved.' : 'Proposal delivered to the homeowner’s comparison workspace.')
    currentProposal.retry()
  }

  return (
    <article className="pro-inbox-card">
      <header>
        <div>
          <p className="mono">{TRADE_LABEL[invitation.disclosure.category]} · EXACT PROJECT</p>
          <h3>{invitation.disclosure.title}</h3>
          <span>{organization?.displayName ?? 'Your professional organization'} · {invitationState(invitation)}</span>
        </div>
        <span className={invitation.status === 'accepted' ? 'pill pill--recorded' : 'pill pill--muted'}>
          {invitation.status}
        </span>
      </header>
      <div className="pro-inbox-card__brief">
        <p>{invitation.disclosure.summary || 'The homeowner did not add a written summary.'}</p>
        {invitation.message ? <blockquote>“{invitation.message}”</blockquote> : null}
        <dl>
          <div><dt>Type</dt><dd>{invitation.disclosure.workKind}</dd></div>
          <div><dt>Status</dt><dd>{invitation.disclosure.status.replace('_', ' ')}</dd></div>
          <div><dt>Selected files</dt><dd>{invitation.disclosure.selectedArtifactRefs.length}</dd></div>
          <div><dt>Expires</dt><dd>{new Date(invitation.expiresAt).toLocaleDateString()}</dd></div>
        </dl>
        {invitation.status === 'accepted' && invitation.disclosure.selectedArtifactRefs.length > 0 ? (
          <div className="pro-inbox-card__files">
            {invitation.disclosure.selectedArtifactRefs.map((artifactRef, index) => (
              <a
                key={artifactRef}
                href={`/api/v1/professional/invitations/${invitation.invitationRef}/artifacts/${artifactRef}`}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">▣</span>
                Open homeowner-selected file {index + 1}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {invitation.status === 'pending' ? (
        <div className="pro-inbox-card__response">
          <p>Accept to review this project brief and submit a proposal. This does not give access to the address, other projects, or the homeowner’s full record.</p>
          {responseError ? <div className="notice" role="alert">{responseError}</div> : null}
          <div>
            <button className="btn btn--primary" type="button" disabled={responding !== null} onClick={() => void respond('accepted')}>
              {responding === 'accepted' ? 'Accepting…' : 'Accept invitation'}
            </button>
            <button className="btn btn--quiet" type="button" disabled={responding !== null} onClick={() => void respond('declined')}>
              {responding === 'declined' ? 'Declining…' : 'Decline'}
            </button>
          </div>
        </div>
      ) : null}

      {invitation.status === 'accepted' ? (
        <section className="pro-proposal" aria-label={`Proposal for ${invitation.disclosure.title}`}>
          {currentProposal.state.status === 'loading' ? <Skeleton lines={3} label="Loading proposal" /> : null}
          {currentProposal.state.status === 'error' ? <ErrorState retry={currentProposal.retry} error={currentProposal.state.error} /> : null}
          {currentProposal.state.status === 'ready' ? (
            <details open={!proposal}>
              <summary>
                <span><strong>{proposal ? 'Review or revise proposal' : 'Write the proposal'}</strong><small>Structured facts go straight into the homeowner’s comparison</small></span>
                <span aria-hidden="true">＋</span>
              </summary>
              <form className="stack" onSubmit={saveProposal}>
                <div className="cardgrid cardgrid--2">
                  <label className="field" style={{ marginTop: 0 }}>
                    <span>Proposal date</span>
                    <input type="date" required disabled={proposalLocked} value={draft.proposalDate} onChange={event => {
                      proposalAttempt.current = null
                      setProposalDraft({ ...draft, proposalDate: event.target.value })
                    }} />
                  </label>
                  <label className="field" style={{ marginTop: 0 }}>
                    <span>Total, optional</span>
                    <input inputMode="decimal" disabled={proposalLocked} value={draft.amount} onChange={event => {
                      proposalAttempt.current = null
                      setProposalDraft({ ...draft, amount: event.target.value })
                    }} placeholder="12500.00" />
                    <small>The written scope matters more than a standalone number.</small>
                  </label>
                </div>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Short explanation, optional</span>
                  <textarea maxLength={2_000} disabled={proposalLocked} value={draft.summary} onChange={event => {
                    proposalAttempt.current = null
                    setProposalDraft({ ...draft, summary: event.target.value })
                  }} placeholder="Explain the approach, important assumptions, or what makes this option fit." />
                </label>
                <div className="pro-proposal__scope">
                  {PROPOSAL_FIELDS.map(([key, label]) => (
                    <label className="field" key={key} style={{ marginTop: 0 }}>
                      <span>{label}{key === 'project_scope' ? ' *' : ''}</span>
                      <textarea
                        required={key === 'project_scope'}
                        disabled={proposalLocked}
                        maxLength={160}
                        value={draft.scope[key] ?? ''}
                        onChange={event => {
                          proposalAttempt.current = null
                          setProposalDraft({
                            ...draft,
                            scope: { ...draft.scope, [key]: event.target.value },
                          })
                        }}
                      />
                    </label>
                  ))}
                </div>
                {proposalLocked ? (
                  <div className="notice notice--success">
                    The homeowner selected this proposal, so this version is locked. They can change the decision before you submit a revision.
                  </div>
                ) : proposal && proposal.homeownerDecision !== 'undecided' ? (
                  <div className="notice notice--success">
                    Homeowner decision: <strong>{proposal.homeownerDecision}</strong>. A revision changes the proposal facts, not that decision.
                  </div>
                ) : null}
                {proposalError ? <div className="notice" role="alert">{proposalError}</div> : null}
                {proposalNotice ? <div className="notice notice--success" role="status">{proposalNotice}</div> : null}
                <button className="btn btn--primary" type="submit" disabled={saving || proposalLocked || !draft.scope.project_scope?.trim()}>
                  {saving ? 'Saving proposal…' : proposal ? 'Save revised proposal' : 'Submit proposal'}
                </button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}

function OrganizationProfileForm({
  organization,
  onSaved,
}: {
  readonly organization: ProfessionalOrganization
  readonly onSaved: () => void
}) {
  const port = usePort()
  const [displayName, setDisplayName] = useState(organization.displayName)
  const [legalName, setLegalName] = useState(organization.legalName ?? '')
  const [description, setDescription] = useState(organization.description ?? '')
  const [phone, setPhone] = useState(organization.publicPhone ?? '')
  const [email, setEmail] = useState(organization.publicEmail ?? '')
  const [website, setWebsite] = useState(organization.websiteUrl ?? '')
  const [logo, setLogo] = useState(organization.logoUrl ?? '')
  const [trades, setTrades] = useState<readonly ProjectCategory[]>(organization.trades)
  const [serviceAreas, setServiceAreas] = useState(organization.serviceAreas.join('\n'))
  const [published, setPublished] = useState(organization.publicationState === 'published')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const attempt = useRef<string | null>(null)

  function changed() {
    attempt.current = null
    setError(null)
    setNotice(null)
  }

  function toggleTrade(trade: ProjectCategory) {
    changed()
    setTrades(current => current.includes(trade)
      ? current.filter(value => value !== trade)
      : [...current, trade])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const areas = cleanList(serviceAreas)
    if (published && (trades.length === 0 || areas.length === 0)) {
      setError('Choose at least one service and service area before publishing.')
      return
    }
    attempt.current ??= mintCommandRef()
    setSaving(true)
    setError(null)
    const result = await port.saveProfessionalProfile({
      commandRef: attempt.current,
      organizationRef: organization.organizationRef,
      expectedRevision: organization.revision,
      displayName: displayName.trim(),
      legalName: legalName.trim() || null,
      description: description.trim() || null,
      publicPhone: phone.trim() || null,
      publicEmail: email.trim() || null,
      websiteUrl: website.trim() || null,
      logoUrl: logo.trim() || null,
      trades,
      serviceAreas: areas,
      publicationState: published ? 'published' : 'draft',
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error === 'conflict'
        ? 'This profile changed in another session. Reloading the current version.'
        : 'Homesrolo could not save the profile. No public facts changed.')
      if (result.error === 'conflict') onSaved()
      return
    }
    attempt.current = null
    setNotice(result.value.publicationState === 'published'
      ? 'Profile saved and listed for homeowners.'
      : 'Profile saved privately as a draft.')
    onSaved()
  }

  return (
    <form className="pro-profile-form stack" onSubmit={save}>
      <div className="panel__head">
        <div><p className="mono">PUBLIC COMPANY CARD</p><h2>{organization.displayName}</h2><p>Tell homeowners who you are and where you work. Every fact below is labeled company-supplied.</p></div>
        <span className={published ? 'pill pill--recorded' : 'pill pill--muted'}>{published ? 'Listed' : 'Draft'}</span>
      </div>
      <div className="cardgrid cardgrid--2">
        <label className="field" style={{ marginTop: 0 }}><span>Public company name</span><input required maxLength={120} value={displayName} onChange={event => { setDisplayName(event.target.value); changed() }} /></label>
        <label className="field" style={{ marginTop: 0 }}><span>Legal name, optional</span><input maxLength={160} value={legalName} onChange={event => { setLegalName(event.target.value); changed() }} /></label>
      </div>
      <label className="field" style={{ marginTop: 0 }}><span>What you do</span><textarea maxLength={1_200} value={description} onChange={event => { setDescription(event.target.value); changed() }} placeholder="Write like a person. Explain the work you handle and the kind of homeowner you help." /></label>
      <fieldset className="pro-trade-picker">
        <legend>Services</legend>
        {TRADES.map(([value, label]) => (
          <label key={value}><input type="checkbox" checked={trades.includes(value)} onChange={() => toggleTrade(value)} /><span>{label}</span></label>
        ))}
      </fieldset>
      <label className="field" style={{ marginTop: 0 }}><span>Service areas</span><textarea value={serviceAreas} onChange={event => { setServiceAreas(event.target.value); changed() }} placeholder={'Fort Worth, Texas\nTulsa, Oklahoma'} /><small>One city, county, metro, or region per line. Up to 40.</small></label>
      <div className="cardgrid cardgrid--2">
        <label className="field" style={{ marginTop: 0 }}><span>Public phone</span><input type="tel" value={phone} onChange={event => { setPhone(event.target.value); changed() }} /></label>
        <label className="field" style={{ marginTop: 0 }}><span>Public email</span><input type="email" value={email} onChange={event => { setEmail(event.target.value); changed() }} /></label>
        <label className="field" style={{ marginTop: 0 }}><span>Website</span><input type="url" value={website} onChange={event => { setWebsite(event.target.value); changed() }} placeholder="https://" /></label>
        <label className="field" style={{ marginTop: 0 }}><span>Logo URL, optional</span><input type="url" value={logo} onChange={event => { setLogo(event.target.value); changed() }} placeholder="https://" /></label>
      </div>
      <label className="pro-publish"><input type="checkbox" checked={published} onChange={event => { setPublished(event.target.checked); changed() }} /><span><strong>List this profile for homeowners</strong><small>A listed profile is public inside Homesrolo. Invitations still require the homeowner to choose you.</small></span></label>
      {error ? <div className="notice" role="alert">{error}</div> : null}
      {notice ? <div className="notice notice--success" role="status">{notice}</div> : null}
      <button className="btn btn--primary" type="submit" disabled={saving || !displayName.trim()}>{saving ? 'Saving profile…' : 'Save company profile'}</button>
    </form>
  )
}

export function ProfessionalHub() {
  const port = usePort()
  const workspace = usePortCall(() => port.getProfessionalProfile())
  const invitations = usePortCall(() => port.listProfessionalInvitations())
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createAttempt = useRef<string | null>(null)
  const organizations = workspace.state.status === 'ready' ? workspace.state.value.organizations : []
  const organizationByRef = new Map(organizations.map(organization => [organization.organizationRef, organization]))

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating || !companyName.trim() || !slug.trim()) return
    createAttempt.current ??= mintCommandRef()
    setCreating(true)
    setCreateError(null)
    const result = await port.createProfessionalOrganization({
      commandRef: createAttempt.current,
      displayName: companyName.trim(),
      slug: slug.trim().toLocaleLowerCase('en-US'),
    })
    setCreating(false)
    if (!result.ok) {
      setCreateError(result.error === 'conflict'
        ? 'That profile address is already used. Try a more specific one.'
        : 'Homesrolo could not create the company profile.')
      return
    }
    createAttempt.current = null
    workspace.retry()
  }

  return (
    <div className="pro-hub__body stack">
      <section className="pro-hub__intro">
        <div><p className="mono">HOMESROLO PRO</p><h1>Be invited. See exactly what was shared. Put the scope in writing.</h1><p>This is not another contractor CRM. It is the homeowner-controlled lane for a company profile, private project invitations, and clear proposals.</p></div>
        <div className="pro-hub__rules"><span>One exact project</span><span>Selected evidence only</span><span>No paid ranking</span></div>
      </section>

      {workspace.state.status === 'loading' ? <Skeleton lines={5} label="Loading professional workspace" /> : null}
      {workspace.state.status === 'error' ? <ErrorState retry={workspace.retry} error={workspace.state.error} /> : null}
      {workspace.state.status === 'ready' && organizations.length === 0 ? (
        <form className="pro-create-card stack" onSubmit={createOrganization}>
          <div><p className="mono">FIRST STEP</p><h2>Create your company card.</h2><p>Use the same Homesrolo sign-in. This creates a professional organization, not a homeowner account duplicate.</p></div>
          <label className="field" style={{ marginTop: 0 }}><span>Company name</span><input required maxLength={120} value={companyName} onChange={event => {
            const value = event.target.value
            createAttempt.current = null
            setCompanyName(value)
            if (!slugTouched) setSlug(slugFor(value))
          }} /></label>
          <label className="field" style={{ marginTop: 0 }}><span>Profile address</span><div className="pro-slug"><span>homesrolo.com/pros/</span><input required minLength={3} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={event => {
            createAttempt.current = null
            setSlugTouched(true)
            setSlug(slugFor(event.target.value))
          }} /></div></label>
          {createError ? <div className="notice" role="alert">{createError}</div> : null}
          <button className="btn btn--primary" type="submit" disabled={creating || !companyName.trim() || slug.length < 3}>{creating ? 'Creating profile…' : 'Create company profile'}</button>
        </form>
      ) : null}

      {organizations.map(organization => (
        <OrganizationProfileForm key={`${organization.organizationRef}:${organization.revision}`} organization={organization} onSaved={workspace.retry} />
      ))}

      <section className="pro-inbox stack" aria-labelledby="pro-inbox-title">
        <div className="panel__head"><div><p className="mono">PRIVATE INBOX</p><h2 id="pro-inbox-title">Project invitations</h2><p>Only invitations addressed to one of your active organizations appear here.</p></div></div>
        {invitations.state.status === 'loading' ? <Skeleton lines={5} label="Loading project invitations" /> : null}
        {invitations.state.status === 'error' ? <ErrorState retry={invitations.retry} error={invitations.state.error} /> : null}
        {invitations.state.status === 'ready' && invitations.state.value.length === 0 ? (
          <div className="project-empty-inline"><strong>No invitations yet</strong><span>Publish the company profile so a homeowner can choose it from an exact plan.</span></div>
        ) : null}
        {invitations.state.status === 'ready' ? invitations.state.value.map(invitation => (
          <ProfessionalInvitationCard key={`${invitation.invitationRef}:${invitation.revision}`} invitation={invitation} organization={organizationByRef.get(invitation.professionalOrganizationRef)} onChanged={invitations.retry} />
        )) : null}
      </section>
    </div>
  )
}
