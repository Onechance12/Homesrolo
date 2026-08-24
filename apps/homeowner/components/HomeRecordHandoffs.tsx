'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { withHomeownerEntryContext } from '../lib/entry-context.ts'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { usePort } from '../lib/port/provider.tsx'
import type {
  HomeRecordHandoffPreview,
  HomeRecordHandoffState,
  PortError,
} from '../lib/port/types.ts'

interface HomeRecordHandoffsProps {
  readonly homeId: string
  readonly entryShareId: string | null
}

type EntryAttempt = {
  readonly homeId: string
  readonly shareId: string | null
  readonly state: 'absent' | 'ready' | 'claiming' | 'claimed' | 'unavailable'
  readonly error: string | null
}

const STATE_LABEL: Readonly<Record<HomeRecordHandoffState, string>> = Object.freeze({
  received: 'Ready to review',
  accepting: 'Copying securely',
  accepted: 'Saved to Home Record',
  rejected: 'Declined',
  expired: 'Expired',
  quarantined: 'Stopped for safety',
  reconciliation_required: 'Needs a record check',
})

const TYPE_LABEL = Object.freeze({
  'application/pdf': 'PDF',
})

const ENTRY_WRONG_HOME_COPY =
  'This completion record is not available for this home. Nothing was added. You can choose a different home.'
const ENTRY_RETRY_COPY =
  'We could not open this completion record right now. Nothing was added. Try again in a moment.'

function friendlySize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function friendlyDate(instant: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(instant))
}

function errorMessage(error: PortError): string {
  if (error === 'conflict') return 'This handoff changed. Open it again and review the current version.'
  if (error === 'not_signed_in') return 'Your session ended. Sign in again before reviewing this record.'
  if (error === 'forbidden' || error === 'not_found') return 'This handoff is not available for this home.'
  if (error === 'rate_limited') return 'Homesrolo is busy checking completion records. Wait a moment and try again.'
  if (error === 'invalid') return 'The handoff could not be verified. Refresh and try again.'
  return 'The handoff could not be opened right now. Try again in a moment.'
}

function clearHandoffFromAddressBar() {
  const url = new URL(window.location.href)
  url.searchParams.delete('handoff')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

/**
 * Homeowner-controlled contractor file intake. It is mounted only when the
 * signed session reports the independently configured handoff capability.
 */
export function HomeRecordHandoffs({ homeId, entryShareId }: HomeRecordHandoffsProps) {
  const port = usePort()
  const [handoffs, setHandoffs] = useState<readonly HomeRecordHandoffPreview[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [active, setActive] = useState<HomeRecordHandoffPreview | null>(null)
  const [consent, setConsent] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [action, setAction] = useState<'idle' | 'claiming' | 'opening' | 'accepting' | 'rejecting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [entryAttempt, setEntryAttempt] = useState<EntryAttempt>({
    homeId,
    shareId: entryShareId,
    state: entryShareId ? 'ready' : 'absent',
    error: null,
  })
  const acceptanceCommand = useRef<string | null>(null)
  const rejectionCommand = useRef<string | null>(null)
  const claimedEntry = useRef<{
    readonly homeId: string
    readonly preview: HomeRecordHandoffPreview
  } | null>(null)

  const entryMatches = entryAttempt.homeId === homeId && entryAttempt.shareId === entryShareId
  const entryState = entryMatches
    ? entryAttempt.state
    : entryShareId ? 'ready' : 'absent'
  const entryError = entryMatches ? entryAttempt.error : null

  const mergeClaimedEntry = useCallback((next: readonly HomeRecordHandoffPreview[]) => {
    const claimed = claimedEntry.current
    return claimed?.homeId === homeId
      && !next.some(handoff => handoff.shareId === claimed.preview.shareId)
      ? [claimed.preview, ...next]
      : next
  }, [homeId])

  const load = useCallback(async () => {
    setListState('loading')
    const result = await port.listHomeRecordHandoffs(homeId)
    if (!result.ok) {
      setListState('error')
      setError(errorMessage(result.error))
      return
    }
    setHandoffs(mergeClaimedEntry(result.value))
    setListState('ready')
    setError(null)
  }, [homeId, mergeClaimedEntry, port])

  useEffect(() => {
    let live = true
    void port.listHomeRecordHandoffs(homeId).then(result => {
      if (!live) return
      if (!result.ok) {
        setListState('error')
        setError(errorMessage(result.error))
        return
      }
      setHandoffs(mergeClaimedEntry(result.value))
      setListState('ready')
      setError(null)
    })
    return () => { live = false }
  }, [homeId, mergeClaimedEntry, port])

  function replaceHandoff(next: HomeRecordHandoffPreview) {
    setHandoffs(current => current.some(handoff => handoff.shareId === next.shareId)
      ? current.map(handoff => handoff.shareId === next.shareId ? next : handoff)
      : [next, ...current])
    setActive(next)
  }

  function showPreview(next: HomeRecordHandoffPreview) {
    setActive(next)
    setConsent(false)
    setConfirmReject(false)
    acceptanceCommand.current = null
    rejectionCommand.current = null
  }

  async function claimEntryHandoff() {
    if (!entryShareId || entryState !== 'ready' || action !== 'idle') return
    setEntryAttempt({ homeId, shareId: entryShareId, state: 'claiming', error: null })
    setAction('claiming')
    const result = await port.claimHomeRecordHandoff(homeId, entryShareId)
    setAction('idle')
    if (!result.ok) {
      const terminal = ['not_found', 'forbidden', 'invalid', 'conflict'].includes(result.error)
      setEntryAttempt({
        homeId,
        shareId: entryShareId,
        state: terminal ? 'unavailable' : 'ready',
        error: terminal ? ENTRY_WRONG_HOME_COPY : ENTRY_RETRY_COPY,
      })
      return
    }
    claimedEntry.current = { homeId, preview: result.value }
    setEntryAttempt({ homeId, shareId: entryShareId, state: 'claimed', error: null })
    setListState('ready')
    setError(null)
    replaceHandoff(result.value)
    showPreview(result.value)
    clearHandoffFromAddressBar()
    requestAnimationFrame(() => document.getElementById('handoff-review-title')?.focus())
  }

  async function openHandoff(shareId: string) {
    if (action !== 'idle') return
    setAction('opening')
    setError(null)
    const result = await port.previewHomeRecordHandoff(homeId, shareId)
    setAction('idle')
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    showPreview(result.value)
  }

  async function accept() {
    const completionRecord = active?.items[0]
    if (!active || !completionRecord || action !== 'idle' || !consent) return
    acceptanceCommand.current ??= mintCommandRef()
    setAction('accepting')
    setError(null)
    const result = await port.acceptHomeRecordHandoff(homeId, active.shareId, {
      commandRef: acceptanceCommand.current,
      reviewedPreviewDigest: active.previewDigest,
      selectedArtifactRefs: [completionRecord.artifactRef],
      consentAccepted: true,
    })
    setAction('idle')
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    acceptanceCommand.current = null
    replaceHandoff(result.value)
    setConsent(false)
  }

  async function reject() {
    if (!active || action !== 'idle') return
    rejectionCommand.current ??= mintCommandRef()
    setAction('rejecting')
    setError(null)
    const result = await port.rejectHomeRecordHandoff(homeId, active.shareId, {
      commandRef: rejectionCommand.current,
      reviewedPreviewDigest: active.previewDigest,
    })
    setAction('idle')
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    rejectionCommand.current = null
    replaceHandoff(result.value)
    setConfirmReject(false)
  }

  const showEntryPrompt = entryShareId !== null && entryState !== 'claimed'
  if (listState === 'ready' && handoffs.length === 0 && !showEntryPrompt) return null

  const acceptedCount = handoffs.filter(handoff => handoff.state === 'accepted').length
  const reviewableCount = handoffs.filter(handoff => handoff.state === 'received').length
  const activeIsReviewable = active?.state === 'received'

  return (
    <section className="handoff-vault" aria-labelledby="handoff-vault-title">
      {showEntryPrompt ? (
        <div className="handoff-entry" aria-labelledby="handoff-entry-title">
          <div className="handoff-entry__mark" aria-hidden="true">→</div>
          <div>
            <p className="mono">Private delivery</p>
            <h2 id="handoff-entry-title">Review a project completion record</h2>
            <p>
              Check whether this one-job record belongs with this Home Record. Nothing is added until you review and accept.
            </p>
          </div>
          {entryError ? (
            <p className="handoff-entry__error" role="alert">{entryError}</p>
          ) : null}
          {entryState === 'unavailable' ? (
            <Link
              className="btn btn--secondary"
              href={withHomeownerEntryContext('/homes', { intent: null, handoff: entryShareId })}
            >
              Choose a different home
            </Link>
          ) : (
            <button
              className="btn btn--primary"
              type="button"
              disabled={entryState !== 'ready' || action !== 'idle'}
              onClick={() => void claimEntryHandoff()}
            >
              {entryState === 'claiming' ? 'Opening secure preview…' : 'Review this record'}
            </button>
          )}
        </div>
      ) : null}
      <div className="handoff-vault__head">
        <div>
          <p className="mono">Sent by a home service pro</p>
          <h2 id="handoff-vault-title">Completion records waiting for your say-so</h2>
          <p>A pro can send one contractor-issued project completion PDF. You decide whether Homesrolo makes a private copy.</p>
        </div>
        {acceptedCount > 0 ? (
          <a
            className="btn btn--secondary"
            href={`/api/v1/homes/${homeId}/home-record/export`}
          >
            Download accepted completion records
          </a>
        ) : null}
      </div>

      {listState === 'loading' ? <p role="status">Checking for completion records sent to this home…</p> : null}
      {listState === 'error' ? (
        <div className="handoff-vault__error" role="alert">
          <p>{error}</p>
          <button className="btn btn--secondary" type="button" onClick={() => void load()}>Try again</button>
        </div>
      ) : null}

      {listState === 'ready' ? (
        <>
          <div className="handoff-vault__summary" aria-label="Contractor completion record summary">
            <span><strong>{reviewableCount}</strong> to review</span>
            <span><strong>{acceptedCount}</strong> saved</span>
            <span><strong>Private</strong> unless you share</span>
          </div>
          <ul className="handoff-list">
            {handoffs.map((handoff, index) => (
              <li key={handoff.shareId}>
                <div>
                  <span className={`handoff-state handoff-state--${handoff.state}`}>
                    {STATE_LABEL[handoff.state]}
                  </span>
                  <strong>Project completion record {String(index + 1).padStart(2, '0')}</strong>
                  <small>
                    PDF · sent {friendlyDate(handoff.receivedAt)}
                  </small>
                </div>
                {handoff.state === 'received' ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={action !== 'idle'}
                    onClick={() => void openHandoff(handoff.shareId)}
                  >
                    {action === 'opening' ? 'Opening…' : 'Review record'}
                  </button>
                ) : handoff.state === 'accepted' ? (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={action !== 'idle'}
                    onClick={() => void openHandoff(handoff.shareId)}
                  >
                    View receipt
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {active ? (
        <div className="handoff-review" aria-labelledby="handoff-review-title">
          <div className="handoff-review__head">
            <div>
              <p className="mono">Exact PDF preview</p>
              <h3 id="handoff-review-title" tabIndex={-1}>
                {activeIsReviewable ? 'Decide whether to keep this record' : STATE_LABEL[active.state]}
              </h3>
              <p>
                Received {friendlyDate(active.receivedAt)} · offer ends {friendlyDate(active.expiresAt)}
              </p>
            </div>
            <button
              className="handoff-review__close"
              type="button"
              aria-label="Close handoff review"
              onClick={() => { setActive(null); setError(null) }}
            >×</button>
          </div>

          <ul className="handoff-items">
            {active.items.map(item => (
              <li key={item.artifactRef}>
                {activeIsReviewable ? (
                  <span className="handoff-item__receipt">
                    <span aria-hidden="true">PDF</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{TYPE_LABEL[item.mediaType]} · {friendlySize(item.byteLength)}</small>
                    </span>
                  </span>
                ) : (
                  <span className="handoff-item__receipt">
                    <span aria-hidden="true">{item.copyState === 'available' ? '✓' : '—'}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{TYPE_LABEL[item.mediaType]} · {friendlySize(item.byteLength)} · {item.decision}</small>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          {activeIsReviewable ? (
            <>
              <label className="handoff-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={action !== 'idle'}
                  onChange={event => {
                    setConsent(event.target.checked)
                    acceptanceCommand.current = null
                    setError(null)
                  }}
                />
                <span>{active.acceptanceText}</span>
              </label>
              <div className="handoff-review__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={!consent || action !== 'idle'}
                  onClick={() => void accept()}
                >
                  {action === 'accepting'
                    ? 'Checking and saving…'
                    : 'Accept completion record'}
                </button>
                {!confirmReject ? (
                  <button
                    className="btn btn--quiet"
                    type="button"
                    disabled={action !== 'idle'}
                    onClick={() => setConfirmReject(true)}
                  >Decline this handoff</button>
                ) : (
                  <span className="handoff-reject-confirm">
                    <span>Decline this completion record?</span>
                    <button
                      className="btn btn--quiet"
                      type="button"
                      disabled={action !== 'idle'}
                      onClick={() => void reject()}
                    >{action === 'rejecting' ? 'Declining…' : 'Yes, decline'}</button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={action !== 'idle'}
                      onClick={() => setConfirmReject(false)}
                    >Keep reviewing</button>
                  </span>
                )}
              </div>
              <p className="handoff-review__boundary">If accepted, this exact contractor-issued completion PDF is safety-checked, then copied into this private Home Record.</p>
            </>
          ) : null}

          {error ? <p className="handoff-vault__message" role="alert">{error}</p> : null}
          {active.state === 'quarantined' ? (
            <p className="handoff-vault__message" role="alert">Homesrolo stopped this copy because a file did not pass its safety or integrity check.</p>
          ) : null}
          {active.state === 'reconciliation_required' ? (
            <p className="handoff-vault__message" role="status">The copy result needs a server-side record check before Homesrolo can call it complete.</p>
          ) : null}
        </div>
      ) : error && listState === 'ready' ? (
        <p className="handoff-vault__message" role="alert">{error}</p>
      ) : null}
    </section>
  )
}
