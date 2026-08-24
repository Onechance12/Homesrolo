'use client'

import { useRef, useState, type FormEvent } from 'react'
import { usePort } from '../lib/port/provider.tsx'
import { usePortCall } from '../lib/port/hooks.ts'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { ErrorState, Skeleton } from './states.tsx'
import type {
  DocumentSummary,
  ProjectQuote,
  QuoteScope,
  QuoteScopeKey,
  QuoteScopeStatus,
} from '../lib/port/types.ts'

const SCOPE_ROWS = Object.freeze([
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
type ScopeDraft = Record<QuoteScopeKey, { status: DraftStatus; detail: string }>

const STATUS_LABEL: Readonly<Record<DraftStatus, string>> = Object.freeze({
  unreviewed: 'Not reviewed',
  included: 'Included',
  excluded: 'Excluded',
  allowance: 'Allowance or open term',
  not_stated: 'Not stated',
})

function emptyScopeDraft(): ScopeDraft {
  return Object.fromEntries(SCOPE_ROWS.map(([key]) => [key, {
    status: 'unreviewed' as const,
    detail: '',
  }])) as ScopeDraft
}

function scopeDraftFor(quote: ProjectQuote): ScopeDraft {
  const draft = emptyScopeDraft()
  for (const [key, item] of Object.entries(quote.scope)) {
    if (!item) continue
    draft[key as QuoteScopeKey] = { status: item.status, detail: item.detail ?? '' }
  }
  return draft
}

function scopeFromDraft(draft: ScopeDraft): QuoteScope {
  const scope: Partial<Record<QuoteScopeKey, { status: QuoteScopeStatus; detail?: string }>> = {}
  for (const [key] of SCOPE_ROWS) {
    const item = draft[key]
    if (item.status === 'unreviewed') continue
    const detail = item.detail.trim()
    scope[key] = { status: item.status, ...(detail ? { detail } : {}) }
  }
  return scope
}

export function RoofQuoteVault({
  homeRef,
  projectRef,
  projectFiles,
  uploadsEnabled,
}: {
  readonly homeRef: string
  readonly projectRef: string
  readonly projectFiles: readonly DocumentSummary[]
  readonly uploadsEnabled: boolean
}) {
  const port = usePort()
  const quotes = usePortCall(() => port.listProjectQuotes(homeRef, projectRef))
  const [editingRef, setEditingRef] = useState<string | null>(null)
  const [editingRevision, setEditingRevision] = useState<number | null>(null)
  const [contractorLabel, setContractorLabel] = useState('')
  const [proposalDate, setProposalDate] = useState('')
  const [artifactRef, setArtifactRef] = useState('')
  const [notes, setNotes] = useState('')
  const [scope, setScope] = useState<ScopeDraft>(() => emptyScopeDraft())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const commandAttempt = useRef<string | null>(null)

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
    setScope(emptyScopeDraft())
    setSaveError(null)
    setSaveMessage(null)
    commandAttempt.current = null
  }

  function editQuote(quote: ProjectQuote) {
    setEditingRef(quote.quoteRef)
    setEditingRevision(quote.revision)
    setContractorLabel(quote.contractorLabel)
    setProposalDate(quote.proposalDate ?? '')
    setArtifactRef(quote.artifactRef ?? '')
    setNotes(quote.notes)
    setScope(scopeDraftFor(quote))
    setSaveError(null)
    setSaveMessage(null)
    commandAttempt.current = null
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
      scope: scopeFromDraft(scope),
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
    setSaveMessage(wasEditing ? 'Proposal record updated.' : 'Proposal added to this private roof project.')
    quotes.retry()
  }

  return (
    <section className="panel stack" aria-labelledby="roof-quotes" style={{ ['--stack-gap' as never]: '0.9rem' }}>
      <div className="panel__head">
        <div>
          <h2 id="roof-quotes">Roof proposals</h2>
          <p>Record multiple proposals in one place and compare what each one actually says.</p>
        </div>
      </div>

      <div className="notice">
        <strong>Scope only—not a price score.</strong>{' '}
        Homesrolo does not estimate this roof, rank proposals, verify the company label, or recommend a contractor.
        These classifications and notes stay in Homesrolo.
      </div>

      {quotes.state.status === 'loading' ? <Skeleton lines={3} label="Loading roof proposals" /> : null}
      {quotes.state.status === 'error' ? (
        <ErrorState retry={quotes.retry} error={quotes.state.error} />
      ) : null}
      {quotes.state.status === 'ready' && quoteRecords.length === 0 ? (
        <p className="mono">No proposals recorded yet. Start with the label printed on the proposal.</p>
      ) : null}

      {quotes.state.status === 'ready' && quoteRecords.length > 0 ? (
        <div className="quote-compare" role="region" aria-label="Roof proposal scope comparison" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Written scope</th>
                {quoteRecords.map(quote => (
                  <th scope="col" key={quote.quoteRef}>
                    <span>{quote.contractorLabel}</span>
                    <button className="btn btn--quiet" type="button"
                      aria-label={`Edit proposal record: ${quote.contractorLabel}`}
                      onClick={() => editQuote(quote)}>
                      Edit proposal
                    </button>
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
                  <td key={quote.quoteRef}>{quote.notes || 'No notes recorded'}</td>
                ))}
              </tr>
              {SCOPE_ROWS.map(([key, label]) => (
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

      <form className="stack quote-form" style={{ ['--stack-gap' as never]: '0.8rem' }} onSubmit={saveQuote}>
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
          {SCOPE_ROWS.map(([key, label]) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              <select aria-label={`${label} status`} value={scope[key].status} onChange={event => {
                const status = event.target.value as DraftStatus
                setScope(current => ({ ...current, [key]: { ...current[key], status } })); changed()
              }}>
                <option value="unreviewed">Not reviewed</option>
                <option value="included">Included</option>
                <option value="excluded">Excluded</option>
                <option value="allowance">Allowance or open term</option>
                <option value="not_stated">Not stated</option>
              </select>
              <input aria-label={`${label} detail`} value={scope[key].detail} maxLength={160}
                placeholder="Exact product, limit, allowance, or wording"
                disabled={scope[key].status === 'unreviewed'}
                onChange={event => {
                  setScope(current => ({ ...current, [key]: { ...current[key], detail: event.target.value } })); changed()
                }} />
            </fieldset>
          ))}
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
    </section>
  )
}
