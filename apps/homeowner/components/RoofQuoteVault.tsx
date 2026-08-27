'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { usePort } from '../lib/port/provider.tsx'
import { usePortCall } from '../lib/port/hooks.ts'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { ErrorState, Skeleton } from './states.tsx'
import { ProfessionalInvitationPanel } from './ProfessionalInvitationPanel.tsx'
import type {
  DocumentSummary,
  ProjectCategory,
  ProjectItem,
  ProjectQuote,
  QuoteScope,
  QuoteScopeKey,
  QuoteScopeStatus,
} from '../lib/port/types.ts'

const GENERAL_SCOPE_ROWS = Object.freeze([
  ['project_scope', 'Work included'],
  ['site_conditions', 'Site conditions and assumptions'],
  ['preparation', 'Preparation and removal'],
  ['labor', 'Labor and crew responsibilities'],
  ['materials_products', 'Materials, products, and finish choices'],
  ['allowances', 'Allowances and undecided selections'],
  ['schedule', 'Start window and estimated duration'],
  ['access_protection', 'Access and protection of the home'],
  ['permits', 'Permits and inspections'],
  ['cleanup', 'Cleanup and disposal'],
  ['inspection_closeout', 'Final walkthrough and closeout'],
  ['warranty', 'Work and product warranties'],
  ['change_orders', 'Change-order process'],
  ['payment_terms', 'Payment terms'],
  ['exclusions', 'Exclusions'],
] as const satisfies readonly (readonly [QuoteScopeKey, string])[])

const ROOF_SCOPE_ROWS = Object.freeze([
  ['measurement', 'Roof measurement'],
  ['roof_configuration', 'Pitch, stories, hips, and roof configuration'],
  ['tear_off', 'Tear-off and existing layers'],
  ['decking', 'Decking and wood-repair terms'],
  ['underlayment', 'Underlayment'],
  ['leak_barrier', 'Leak barrier'],
  ['primary_materials', 'Primary materials and product line'],
  ['starter_and_ridge', 'Starter, edge metal, and hip/ridge'],
  ['valleys', 'Valleys'],
  ['flashing_transitions', 'Walls, chimneys, skylights, and transitions'],
  ['penetrations', 'Pipe boots and other penetrations'],
  ['ventilation', 'Intake and exhaust ventilation'],
  ['permits', 'Permits and inspections'],
  ['cleanup', 'Disposal and cleanup'],
  ['workmanship_warranty', 'Workmanship warranty'],
  ['manufacturer_warranty', 'Manufacturer warranty and registration'],
  ['payment_terms', 'Payment and change-order terms'],
  ['exclusions', 'Exclusions'],
] as const satisfies readonly (readonly [QuoteScopeKey, string])[])

type DraftStatus = QuoteScopeStatus | 'unreviewed'
type ScopeDraft = Partial<Record<QuoteScopeKey, { status: DraftStatus; detail: string }>>

const STATUS_LABEL: Readonly<Record<DraftStatus, string>> = Object.freeze({
  unreviewed: 'Not reviewed',
  included: 'Included',
  excluded: 'Excluded',
  allowance: 'Allowance or open term',
  not_stated: 'Not stated',
})

function emptyScopeDraft(rows: readonly (readonly [QuoteScopeKey, string])[]): ScopeDraft {
  return Object.fromEntries(rows.map(([key]) => [key, {
    status: 'unreviewed' as const,
    detail: '',
  }])) as ScopeDraft
}

function scopeDraftFor(
  quote: ProjectQuote,
  rows: readonly (readonly [QuoteScopeKey, string])[],
): ScopeDraft {
  const draft = emptyScopeDraft(rows)
  for (const [key, item] of Object.entries(quote.scope)) {
    if (!item) continue
    draft[key as QuoteScopeKey] = { status: item.status, detail: item.detail ?? '' }
  }
  return draft
}

function scopeFromDraft(
  draft: ScopeDraft,
  rows: readonly (readonly [QuoteScopeKey, string])[],
  preserved: QuoteScope,
): QuoteScope {
  const scope: Partial<Record<QuoteScopeKey, { status: QuoteScopeStatus; detail?: string }>> = {
    ...preserved,
  }
  for (const [key] of rows) {
    delete scope[key]
    const item = draft[key]
    if (!item) continue
    if (item.status === 'unreviewed') continue
    const detail = item.detail.trim()
    scope[key] = { status: item.status, ...(detail ? { detail } : {}) }
  }
  return scope
}

function scopeOutsideRows(
  quote: ProjectQuote,
  rows: readonly (readonly [QuoteScopeKey, string])[],
): QuoteScope {
  const visible = new Set<QuoteScopeKey>(rows.map(([key]) => key))
  return Object.fromEntries(
    Object.entries(quote.scope).filter(([key]) => !visible.has(key as QuoteScopeKey)),
  ) as QuoteScope
}

function readableCategory(category: ProjectCategory): string {
  return ({
    roofing: 'Roofing', exterior: 'Exterior', interior: 'Interior and remodeling',
    electrical: 'Electrical', plumbing: 'Plumbing', hvac: 'Heating and cooling',
    landscaping: 'Yard and landscaping', appliances: 'Appliances', pest: 'Pest control',
    pool: 'Pool and outdoor living', new_construction: 'New construction', other: 'Home project',
  } as const)[category]
}

function readableMoney(cents: number | null): string {
  if (cents === null) return 'Not stated'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function calendarHref(title: string, company: string, startsAt: string): string | null {
  const starts = new Date(startsAt)
  if (Number.isNaN(starts.getTime())) return null
  const ends = new Date(starts.getTime() + 60 * 60 * 1_000)
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n')
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homesrolo//Project visit//EN',
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@homesrolo.com`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(starts)}`, `DTEND:${stamp(ends)}`,
    `SUMMARY:${escape(`Estimate visit — ${title}`)}`,
    `DESCRIPTION:${escape(`Estimate or service visit with ${company}. Saved from Homesrolo.`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`
}

export function ProjectProposalWorkspace({
  homeRef,
  projectRef,
  projectTitle,
  projectSummary,
  projectCategory,
  projectTrade,
  projectItems,
  projectPhotoCount,
  projectFiles,
  uploadsEnabled,
  invitationsEnabled,
  onVisitSaved,
}: {
  readonly homeRef: string
  readonly projectRef: string
  readonly projectTitle: string
  readonly projectSummary: string
  readonly projectCategory: ProjectCategory
  readonly projectTrade: string
  readonly projectItems: readonly ProjectItem[]
  readonly projectPhotoCount: number
  readonly projectFiles: readonly DocumentSummary[]
  readonly uploadsEnabled: boolean
  readonly invitationsEnabled: boolean
  readonly onVisitSaved?: () => void
}) {
  const port = usePort()
  const quotes = usePortCall(() => port.listProjectQuotes(homeRef, projectRef))
  const [editingRef, setEditingRef] = useState<string | null>(null)
  const [editingRevision, setEditingRevision] = useState<number | null>(null)
  const [contractorLabel, setContractorLabel] = useState('')
  const [proposalDate, setProposalDate] = useState('')
  const [artifactRef, setArtifactRef] = useState('')
  const [notes, setNotes] = useState('')
  const scopeRows = projectCategory === 'roofing' ? ROOF_SCOPE_ROWS : GENERAL_SCOPE_ROWS
  const [scope, setScope] = useState<ScopeDraft>(() => emptyScopeDraft(scopeRows))
  const [preservedScope, setPreservedScope] = useState<QuoteScope>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const proposalDetails = useRef<HTMLDetailsElement>(null)
  const commandAttempt = useRef<string | null>(null)
  const visitAttempt = useRef<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [visitCompany, setVisitCompany] = useState('')
  const [visitStartsAt, setVisitStartsAt] = useState('')
  const [visitBusy, setVisitBusy] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [savedVisit, setSavedVisit] = useState<{ readonly company: string; readonly startsAt: string } | null>(null)
  const [decisionBusyRef, setDecisionBusyRef] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const decisionAttempts = useRef(new Map<string, string>())

  const generatedRequestText = useMemo(() => {
    const choices = projectItems
      .filter(item => item.state !== 'declined')
      .slice(0, 8)
      .map(item => `- ${item.label}${item.detail ? `: ${item.detail}` : ''}`)
    return [
      `Homesrolo project request: ${projectTitle}`,
      `Home area: ${projectTrade}`,
      projectSummary ? `What I need: ${projectSummary}` : 'What I need: I would like to discuss the work and available options.',
      choices.length ? `Current choices and priorities:\n${choices.join('\n')}` : '',
      projectPhotoCount > 0
        ? `${projectPhotoCount} private project photo${projectPhotoCount === 1 ? ' is' : 's are'} organized in Homesrolo. I will share only the photos needed for an estimate.`
        : '',
      'Please reply with your availability, what your written scope would include, materials or products, timing, warranties, payment/change-order terms, and exclusions.',
      'This request does not grant access to my private Home Record or approve any work.',
    ].filter(Boolean).join('\n\n')
  }, [projectItems, projectPhotoCount, projectSummary, projectTitle, projectTrade])
  const [requestOverride, setRequestOverride] = useState<string | null>(null)
  const requestText = requestOverride ?? generatedRequestText

  const proposalFiles = projectFiles.filter(file =>
    file.kind === 'document' && file.mediaType === 'application/pdf')
  const quoteRecords = quotes.state.status === 'ready' ? quotes.state.value : []

  function changed() {
    commandAttempt.current = null
    setSaveError(null)
    setSaveMessage(null)
  }

  function resetDraft() {
    setEditingRef(null)
    setEditingRevision(null)
    setContractorLabel('')
    setProposalDate('')
    setArtifactRef('')
    setNotes('')
    setScope(emptyScopeDraft(scopeRows))
    setPreservedScope({})
    setSaveError(null)
    setSaveMessage(null)
    commandAttempt.current = null
  }

  function editQuote(quote: ProjectQuote) {
    if (quote.source !== 'homeowner_entry') return
    if (proposalDetails.current) proposalDetails.current.open = true
    setEditingRef(quote.quoteRef)
    setEditingRevision(quote.revision)
    setContractorLabel(quote.contractorLabel)
    setProposalDate(quote.proposalDate ?? '')
    setArtifactRef(quote.artifactRef ?? '')
    setNotes(quote.notes)
    setScope(scopeDraftFor(quote, scopeRows))
    setPreservedScope(scopeOutsideRows(quote, scopeRows))
    setSaveError(null)
    setSaveMessage(null)
    commandAttempt.current = null
  }

  async function decideProfessionalQuote(
    quote: ProjectQuote,
    decision: 'shortlisted' | 'selected' | 'declined',
  ) {
    if (quote.source !== 'professional_submission'
      || quote.decisionRevision === null
      || decisionBusyRef !== null) return
    const attemptKey = `${quote.quoteRef}:${quote.decisionRevision}:${decision}`
    let commandRef = decisionAttempts.current.get(attemptKey)
    if (!commandRef) {
      commandRef = mintCommandRef()
      decisionAttempts.current.set(attemptKey, commandRef)
    }
    setDecisionBusyRef(quote.quoteRef)
    setDecisionError(null)
    const result = await port.decideProfessionalProposal(homeRef, projectRef, quote.quoteRef, {
      commandRef,
      expectedDecisionRevision: quote.decisionRevision,
      decision,
    })
    setDecisionBusyRef(null)
    if (!result.ok) {
      setDecisionError(result.error === 'conflict'
        ? 'That proposal decision changed in another session. The current version is reloading.'
        : 'Homesrolo could not save that decision. No company was selected.')
      if (result.error === 'conflict') quotes.retry()
      return
    }
    decisionAttempts.current.delete(attemptKey)
    quotes.retry()
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contractorLabel.trim() || saving) return
    commandAttempt.current ??= mintCommandRef()
    setSaving(true)
    setSaveError(null)
    const input = {
      commandRef: commandAttempt.current,
      contractorLabel: contractorLabel.trim(),
      ...(proposalDate ? { proposalDate } : {}),
      ...(artifactRef ? { artifactRef } : {}),
      scope: scopeFromDraft(scope, scopeRows, preservedScope),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    const wasEditing = editingRef !== null
    const editTarget = editingRef !== null && editingRevision !== null
      ? { quoteRef: editingRef, revision: editingRevision }
      : null
    if (wasEditing && !editTarget) {
      setSaving(false)
      setSaveError('Reload the proposal comparison and reopen the record before saving.')
      return
    }
    const result = editTarget
      ? await port.saveProjectQuote(homeRef, projectRef, editTarget.quoteRef, {
          ...input,
          expectedRevision: editTarget.revision,
        })
      : await port.createProjectQuote(homeRef, projectRef, input)
    setSaving(false)
    if (!result.ok) {
      if (result.error === 'conflict') {
        resetDraft()
        setSaveError('This proposal changed in another session. The comparison is reloading; reopen the record before making a correction.')
        quotes.retry()
      } else {
        setSaveError('Homesrolo could not save this proposal. Nothing was sent to Jobrolo or a contractor.')
      }
      return
    }
    commandAttempt.current = null
    resetDraft()
    setSaveMessage(wasEditing ? 'Proposal record updated.' : 'Proposal added to this private project.')
    quotes.retry()
  }

  async function shareRequest() {
    setShareMessage(null)
    const exactText = requestText.trim()
    if (!exactText) {
      setShareMessage('Add the request text you want to share first.')
      return
    }
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text: exactText })
        setShareMessage('Your phone opened the share sheet with only the request text. No saved photo or file was attached, and no Home Record access was granted.')
        return
      }
      await navigator.clipboard.writeText(exactText)
      setShareMessage('Request copied. Paste it into a text or email to a company you choose.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareMessage('Your browser could not open sharing. Select and copy the request text below instead.')
    }
  }

  async function saveVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!visitCompany.trim() || !visitStartsAt || visitBusy) return
    const date = new Date(visitStartsAt)
    if (Number.isNaN(date.getTime())) {
      setVisitError('Choose a valid visit date and time.')
      return
    }
    visitAttempt.current ??= mintCommandRef()
    setVisitBusy(true)
    setVisitError(null)
    const company = visitCompany.trim()
    const result = await port.addProjectActivity(homeRef, projectRef, {
      commandRef: visitAttempt.current,
      kind: 'milestone',
      body: `Estimate visit with ${company} — ${date.toLocaleString()}`,
    })
    setVisitBusy(false)
    if (!result.ok) {
      setVisitError(result.error === 'conflict'
        ? 'That visit changed in another session. Review the Updates tab before trying again.'
        : 'The visit was not saved. Your phone calendar was not changed.')
      return
    }
    visitAttempt.current = null
    setSavedVisit({ company, startsAt: visitStartsAt })
    onVisitSaved?.()
    window.dispatchEvent(new CustomEvent('homesrolo:data-changed', {
      detail: { homeId: homeRef, projectRef },
    }))
  }

  return (
    <section
      id="project-panel-quotes"
      role="tabpanel"
      aria-labelledby="project-tab-quotes"
      className="panel stack project-workspace__panel proposal-workspace"
      style={{ ['--stack-gap' as never]: '0.9rem' }}
    >
      <div className="panel__head">
        <div>
          <p className="mono">Homeowner-controlled request</p>
          <h2 id="project-proposals">Request &amp; proposals</h2>
          <p>Invite a company you choose, keep each written proposal, and compare the facts without opening the rest of your home.</p>
        </div>
      </div>

      {invitationsEnabled ? (
        <ProfessionalInvitationPanel
          homeRef={homeRef}
          projectRef={projectRef}
          projectCategory={projectCategory}
          projectFiles={projectFiles}
        />
      ) : null}

      <section className="proposal-request" aria-labelledby="proposal-request-title">
        <div>
          <span className="proposal-request__mark" aria-hidden="true">↗</span>
          <div>
            <p className="mono">Ready to ask</p>
            <h3 id="proposal-request-title">Prepare a project request</h3>
            <p>This shares only the text below through your phone’s share sheet. Review it and remove anything you do not want to send. Saved photos and files are not attached, and it never grants Home Record access.</p>
          </div>
        </div>
        <details>
          <summary>Review and share the exact request</summary>
          <textarea aria-label="Exact project request" value={requestText} onChange={event => {
            setRequestOverride(event.target.value)
          }} rows={10} />
          <div className="proposal-request__actions">
            <button className="btn btn--quiet btn--compact" type="button" disabled={requestOverride === null} onClick={() => setRequestOverride(null)}>
              Restore project summary
            </button>
            <button className="btn btn--primary" type="button" disabled={!requestText.trim()} onClick={() => void shareRequest()}>
              Share this text
            </button>
          </div>
        </details>
        {shareMessage ? <p className="proposal-request__status" role="status">{shareMessage}</p> : null}
      </section>

      <div className="notice">
        <strong>Written facts—not a price verdict.</strong>{' '}
        Homesrolo does not estimate this work, rank proposals, verify the company label, or recommend a professional.
        These classifications and notes stay in Homesrolo.
      </div>

      {quotes.state.status === 'loading' ? <Skeleton lines={3} label="Loading project proposals" /> : null}
      {quotes.state.status === 'error' ? (
        <ErrorState retry={quotes.retry} error={quotes.state.error} />
      ) : null}
      {quotes.state.status === 'ready' && quoteRecords.length === 0 ? (
        <p className="mono">No proposals recorded yet. Start with the label printed on the proposal.</p>
      ) : null}

      {quotes.state.status === 'ready' && quoteRecords.length > 0 ? (
          <div className="quote-compare" role="region" aria-label={`${readableCategory(projectCategory)} proposal comparison`} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Written scope</th>
                {quoteRecords.map(quote => (
                  <th scope="col" key={quote.quoteRef}>
                    <span>{quote.contractorLabel}</span>
                    {quote.source === 'professional_submission' ? (
                      <span className="pill pill--recorded">Submitted in Homesrolo</span>
                    ) : (
                      <button className="btn btn--quiet" type="button"
                        aria-label={`Edit proposal record: ${quote.contractorLabel}`}
                        onClick={() => editQuote(quote)}>
                        Edit proposal
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Proposal date</th>
                {quoteRecords.map(quote => (
                  <td key={quote.quoteRef}>{quote.proposalDate ?? 'Not recorded'}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Proposal total</th>
                {quoteRecords.map(quote => (
                  <td key={quote.quoteRef}>
                    {quote.source === 'professional_submission'
                      ? readableMoney(quote.totalAmountCents)
                      : 'Check the written proposal'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Linked original</th>
                {quoteRecords.map(quote => {
                  const linked = quote.artifactRef
                    ? proposalFiles.find(file => file.documentRef === quote.artifactRef)
                    : null
                  return (
                    <td key={quote.quoteRef}>
                      {linked?.title ?? (quote.artifactRef ? 'Linked private PDF' : 'No PDF linked')}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <th scope="row">General notes</th>
                {quoteRecords.map(quote => (
                  <td key={quote.quoteRef}>
                    {quote.source === 'professional_submission'
                      ? quote.professionalSummary || 'No company summary provided'
                      : quote.notes || 'No notes recorded'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Your decision</th>
                {quoteRecords.map(quote => (
                  <td key={quote.quoteRef}>
                    {quote.source !== 'professional_submission' ? (
                      <span className="pill pill--muted">Private record</span>
                    ) : (
                      <div className="proposal-decision">
                        <span className={quote.homeownerDecision === 'selected'
                          ? 'pill pill--recorded'
                          : quote.homeownerDecision === 'shortlisted'
                            ? 'pill pill--progress'
                            : 'pill pill--muted'}>
                          {quote.homeownerDecision === 'undecided'
                            ? 'Not decided'
                            : quote.homeownerDecision === 'shortlisted'
                              ? 'Shortlisted'
                              : quote.homeownerDecision === 'selected'
                                ? 'Selected'
                                : 'Not moving forward'}
                        </span>
                        <div>
                          <button type="button" disabled={decisionBusyRef !== null || quote.homeownerDecision === 'shortlisted'}
                            onClick={() => void decideProfessionalQuote(quote, 'shortlisted')}>Shortlist</button>
                          <button type="button" disabled={decisionBusyRef !== null || quote.homeownerDecision === 'selected'}
                            onClick={() => void decideProfessionalQuote(quote, 'selected')}>Select</button>
                          <button type="button" disabled={decisionBusyRef !== null || quote.homeownerDecision === 'declined'}
                            onClick={() => void decideProfessionalQuote(quote, 'declined')}>Pass</button>
                        </div>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
              {scopeRows.map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  {quoteRecords.map(quote => {
                    const item = quote.scope[key]
                    return (
                      <td key={quote.quoteRef}>
                        <span className="pill pill--muted">
                          {item ? STATUS_LABEL[item.status] : STATUS_LABEL.unreviewed}
                        </span>
                        {item?.detail ? <span className="quote-compare__detail">{item.detail}</span> : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {decisionError ? <div className="notice" role="alert">{decisionError}</div> : null}

      <details className="proposal-tool" ref={proposalDetails}>
        <summary>
          <span aria-hidden="true">＋</span>
          <span><strong>Add a written proposal</strong><small>Keep the PDF and compare what it actually says</small></span>
        </summary>
      <form className="stack quote-form proposal-tool__body" style={{ ['--stack-gap' as never]: '0.8rem' }} onSubmit={saveQuote}>
        <div className="panel__head">
          <div>
            <h3>{editingRef ? 'Correct this proposal record' : 'Add a proposal record'}</h3>
            <p>“Not reviewed” means you have not classified that row. Choose “Not stated” only after checking the original.</p>
          </div>
          {editingRef ? (
            <button className="btn btn--quiet" type="button" onClick={resetDraft}>Cancel edit</button>
          ) : null}
        </div>
        <div className="cardgrid cardgrid--2">
          <label className="field" style={{ marginTop: 0 }}>
            <span>Company or proposal label</span>
            <input value={contractorLabel} required maxLength={120} onChange={event => {
              setContractorLabel(event.target.value); changed()
            }} />
            <span className="field__hint">This private label comes from you. Homesrolo has not verified the company.</span>
          </label>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Proposal date, if shown</span>
            <input type="date" value={proposalDate} onChange={event => {
              setProposalDate(event.target.value); changed()
            }} />
          </label>
        </div>
        {uploadsEnabled ? (
          <label className="field" style={{ marginTop: 0 }}>
            <span>Original proposal PDF, optional</span>
            <select value={artifactRef} onChange={event => {
              setArtifactRef(event.target.value); changed()
            }}>
              <option value="">No PDF linked</option>
              {proposalFiles.map(file => (
                <option key={file.documentRef} value={file.documentRef}>{file.title}</option>
              ))}
            </select>
            <span className="field__hint">Upload the PDF to Project files first, then link it here.</span>
          </label>
        ) : null}
        <div className="quote-form__scope">
          {scopeRows.map(([key, label]) => {
            const item = scope[key] ?? { status: 'unreviewed' as const, detail: '' }
            return <fieldset key={key}>
              <legend>{label}</legend>
              <select aria-label={`${label} status`} value={item.status} onChange={event => {
                const status = event.target.value as DraftStatus
                setScope(current => ({ ...current, [key]: { ...(current[key] ?? { detail: '' }), status } })); changed()
              }}>
                <option value="unreviewed">Not reviewed</option>
                <option value="included">Included</option>
                <option value="excluded">Excluded</option>
                <option value="allowance">Allowance or open term</option>
                <option value="not_stated">Not stated</option>
              </select>
              <input aria-label={`${label} detail`} value={item.detail} maxLength={160}
                placeholder="Exact product, limit, allowance, or wording"
                disabled={item.status === 'unreviewed'}
                onChange={event => {
                  setScope(current => ({ ...current, [key]: { ...(current[key] ?? { status: 'unreviewed' }), detail: event.target.value } })); changed()
                }} />
            </fieldset>
          })}
        </div>
        <label className="field" style={{ marginTop: 0 }}>
          <span>General notes, optional</span>
          <textarea value={notes} maxLength={500} onChange={event => { setNotes(event.target.value); changed() }} />
        </label>
        {saveError ? <div className="notice" role="alert">{saveError}</div> : null}
        {saveMessage ? <div className="notice notice--success" role="status">{saveMessage}</div> : null}
        <button className="btn btn--primary" type="submit" disabled={!contractorLabel.trim() || saving}>
          {saving ? 'Saving proposal…' : editingRef ? 'Save corrections' : 'Add to proposal comparison'}
        </button>
      </form>
      </details>

      <details className="proposal-tool">
        <summary>
          <span aria-hidden="true">＋</span>
          <span><strong>Save a visit</strong><small>Keep it with the project and add it to your phone calendar</small></span>
        </summary>
      <form className="proposal-visit proposal-tool__body" onSubmit={saveVisit}>
        <div><p>Record an estimate or service appointment after you and the company agree on a time.</p></div>
        <label className="field" style={{ marginTop: 0 }}>
          <span>Company or person</span>
          <input value={visitCompany} maxLength={120} required onChange={event => {
            visitAttempt.current = null
            setSavedVisit(null)
            setVisitCompany(event.target.value)
          }} placeholder="Who is coming?" />
        </label>
        <label className="field" style={{ marginTop: 0 }}>
          <span>Visit date and time</span>
          <input type="datetime-local" value={visitStartsAt} required onChange={event => {
            visitAttempt.current = null
            setSavedVisit(null)
            setVisitStartsAt(event.target.value)
          }} />
        </label>
        {visitError ? <div className="notice" role="alert">{visitError}</div> : null}
        <button className="btn btn--quiet" type="submit" disabled={visitBusy || !visitCompany.trim() || !visitStartsAt}>
          {visitBusy ? 'Saving visit…' : 'Save visit'}
        </button>
        {savedVisit ? (() => {
          const href = calendarHref(projectTitle, savedVisit.company, savedVisit.startsAt)
          return href ? (
            <a className="btn btn--primary" href={href} download={`${projectTitle.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-visit.ics`}>
              Add to phone calendar
            </a>
          ) : null
        })() : null}
      </form>
      </details>
    </section>
  )
}
