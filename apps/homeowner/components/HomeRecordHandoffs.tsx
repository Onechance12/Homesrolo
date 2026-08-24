'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mintCommandRef } from '../lib/port/command-ref.ts'
import { usePort } from '../lib/port/provider.tsx'
import type {
  HomeRecordHandoffPreview,
  HomeRecordHandoffState,
  PortError,
} from '../lib/port/types.ts'

interface HomeRecordHandoffsProps {
  readonly homeId: string
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
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
})

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
  if (error === 'not_signed_in') return 'Your session ended. Sign in again before reviewing these files.'
  if (error === 'forbidden' || error === 'not_found') return 'This handoff is not available for this home.'
  if (error === 'rate_limited') return 'Homesrolo is busy checking files. Wait a moment and try again.'
  if (error === 'invalid') return 'The handoff could not be verified. Refresh and try again.'
  return 'The handoff could not be opened right now. Try again in a moment.'
}

/**
 * Homeowner-controlled contractor file intake. It is mounted only when the
 * signed session reports the independently configured handoff capability.
 */
export function HomeRecordHandoffs({ homeId }: HomeRecordHandoffsProps) {
  const port = usePort()
  const [handoffs, setHandoffs] = useState<readonly HomeRecordHandoffPreview[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [active, setActive] = useState<HomeRecordHandoffPreview | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [consent, setConsent] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [action, setAction] = useState<'idle' | 'opening' | 'accepting' | 'rejecting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const acceptanceCommand = useRef<string | null>(null)
  const rejectionCommand = useRef<string | null>(null)

  const load = useCallback(async () => {
    setListState('loading')
    const result = await port.listHomeRecordHandoffs(homeId)
    if (!result.ok) {
      setListState('error')
      setError(errorMessage(result.error))
      return
    }
    setHandoffs(result.value)
    setListState('ready')
    setError(null)
  }, [homeId, port])

  useEffect(() => {
    let live = true
    void port.listHomeRecordHandoffs(homeId).then(result => {
      if (!live) return
      if (!result.ok) {
        setListState('error')
        setError(errorMessage(result.error))
        return
      }
      setHandoffs(result.value)
      setListState('ready')
      setError(null)
    })
    return () => { live = false }
  }, [homeId, port])

  function replaceHandoff(next: HomeRecordHandoffPreview) {
    setHandoffs(current => current.map(handoff =>
      handoff.shareId === next.shareId ? next : handoff))
    setActive(next)
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
    setActive(result.value)
    setSelected(new Set(result.value.items
      .filter(item => item.decision === 'pending')
      .map(item => item.artifactRef)))
    setConsent(false)
    setConfirmReject(false)
    acceptanceCommand.current = null
    rejectionCommand.current = null
  }

  function toggleItem(artifactRef: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(artifactRef)) next.delete(artifactRef)
      else next.add(artifactRef)
      return next
    })
    acceptanceCommand.current = null
    setConsent(false)
    setError(null)
  }

  async function accept() {
    if (!active || action !== 'idle' || !consent || selected.size < 1) return
    acceptanceCommand.current ??= mintCommandRef()
    setAction('accepting')
    setError(null)
    const result = await port.acceptHomeRecordHandoff(homeId, active.shareId, {
      commandRef: acceptanceCommand.current,
      reviewedPreviewDigest: active.previewDigest,
      selectedArtifactRefs: active.items
        .filter(item => selected.has(item.artifactRef))
        .map(item => item.artifactRef),
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

  if (listState === 'ready' && handoffs.length === 0) return null

  const acceptedCount = handoffs.filter(handoff => handoff.state === 'accepted').length
  const reviewableCount = handoffs.filter(handoff => handoff.state === 'received').length
  const activeIsReviewable = active?.state === 'received'

  return (
    <section className="handoff-vault" aria-labelledby="handoff-vault-title">
      <div className="handoff-vault__head">
        <div>
          <p className="mono">Sent by a home service pro</p>
          <h2 id="handoff-vault-title">Files waiting for your say-so</h2>
          <p>A pro can send project photos and paperwork here. You choose each item before Homesrolo makes a private copy.</p>
        </div>
        {acceptedCount > 0 ? (
          <a
            className="btn btn--secondary"
            href={`/api/v1/homes/${homeId}/home-record/export`}
          >
            Download accepted pro files
          </a>
        ) : null}
      </div>

      {listState === 'loading' ? <p role="status">Checking for files sent to this home…</p> : null}
      {listState === 'error' ? (
        <div className="handoff-vault__error" role="alert">
          <p>{error}</p>
          <button className="btn btn--secondary" type="button" onClick={() => void load()}>Try again</button>
        </div>
      ) : null}

      {listState === 'ready' ? (
        <>
          <div className="handoff-vault__summary" aria-label="Contractor file handoff summary">
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
                  <strong>Project file handoff {String(index + 1).padStart(2, '0')}</strong>
                  <small>
                    {handoff.items.length} {handoff.items.length === 1 ? 'item' : 'items'} · sent {friendlyDate(handoff.receivedAt)}
                  </small>
                </div>
                {handoff.state === 'received' ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={action !== 'idle'}
                    onClick={() => void openHandoff(handoff.shareId)}
                  >
                    {action === 'opening' ? 'Opening…' : 'Review files'}
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
              <p className="mono">Exact file preview</p>
              <h3 id="handoff-review-title">
                {activeIsReviewable ? 'Choose what belongs in your record' : STATE_LABEL[active.state]}
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
            {active.items.map((item, itemIndex) => (
              <li key={item.artifactRef}>
                {activeIsReviewable ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(item.artifactRef)}
                      disabled={action !== 'idle'}
                      onChange={() => toggleItem(item.artifactRef)}
                    />
                    <span>
                      <strong>{item.label} {String(itemIndex + 1).padStart(2, '0')}</strong>
                      <small>{TYPE_LABEL[item.mediaType]} · {friendlySize(item.byteLength)}</small>
                    </span>
                  </label>
                ) : (
                  <span className="handoff-item__receipt">
                    <span aria-hidden="true">{item.copyState === 'available' ? '✓' : '—'}</span>
                    <span>
                      <strong>{item.label} {String(itemIndex + 1).padStart(2, '0')}</strong>
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
                  disabled={selected.size < 1 || action !== 'idle'}
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
                  disabled={!consent || selected.size < 1 || action !== 'idle'}
                  onClick={() => void accept()}
                >
                  {action === 'accepting'
                    ? 'Checking and saving…'
                    : `Accept ${selected.size} selected ${selected.size === 1 ? 'item' : 'items'}`}
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
                    <span>Decline every item?</span>
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
              <p className="handoff-review__boundary">Unselected files stay out. Accepted files are safety-checked, then copied into this private Home Record.</p>
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
