'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commandRefForAttempt, mintCommandRef } from '../lib/port/command-ref.ts'
import { usePort, useSession } from '../lib/port/provider.tsx'
import { roloThreadStorageKey } from '../lib/rolo-thread-storage.ts'
import type {
  AskRoloResult,
  DocumentSummary,
  RoloAssistantTurn,
  RoloDestination,
  RoloWorkDraft,
} from '../lib/port/types.ts'
import { HouseMark } from './icons.tsx'
import styles from './AssistantDock.module.css'

type ThreadMessage = RoloAssistantTurn & {
  readonly id: string
  readonly photoTitle?: string
}
type StoredConversation = {
  readonly thread: ThreadMessage[]
  readonly proposal: RoloWorkDraft | null
  readonly followUps: readonly string[]
  readonly photoReview: AskRoloResult['photoReview']
  readonly photoReviewTitle: string | null
  readonly photoReviewRef: string | null
}

const ARTIFACT_REF = /^hart_[A-Za-z0-9_-]{43}$/

const STARTERS = [
  'My AC stopped cooling yesterday.',
  'Where did I save my roof warranty?',
  'I had some work done and want to record it.',
] as const

const KIND_LABEL: Record<RoloWorkDraft['kind'], string> = {
  project: 'Project',
  issue: 'Issue',
  repair: 'Repair',
  service: 'Service visit',
  incident: 'Home event',
}

const CATEGORY_LABEL: Record<RoloWorkDraft['category'], string> = {
  roofing: 'Roof',
  exterior: 'Exterior',
  interior: 'Interior / remodel',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  landscaping: 'Yard / landscaping',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pool',
  new_construction: 'New construction',
  other: 'Other',
}

function currentDestination(pathname: string, homeId: string) {
  const base = `/home/${homeId}`
  if (pathname.startsWith(`${base}/rolo`)) return 'rolo' as const
  if (pathname.startsWith(`${base}/timeline`)) return 'activity' as const
  if (pathname.startsWith(`${base}/documents`)) return 'library' as const
  if (pathname.startsWith(`${base}/details`)) return 'details' as const
  return 'home' as const
}

function projectRefFromPath(pathname: string): string | undefined {
  return pathname.match(/\/projects\/(hprj_[A-Za-z0-9_-]{43})(?:\/|$)/)?.[1]
}

function destinationHref(homeId: string, destination: RoloDestination, projectRef: string | null) {
  if (destination === 'rolo') return `/home/${homeId}/rolo`
  if (destination === 'activity') return `/home/${homeId}/timeline`
  if (destination === 'library') return `/home/${homeId}/documents`
  if (destination === 'details') return `/home/${homeId}/details`
  if (destination === 'work' && projectRef) return `/home/${homeId}/projects/${projectRef}`
  return `/home/${homeId}`
}

const WORK_KINDS = new Set<RoloWorkDraft['kind']>(['project', 'issue', 'repair', 'service', 'incident'])
const WORK_STATUSES = new Set<RoloWorkDraft['status']>(['planned', 'in_progress', 'completed', 'cancelled'])

function readStoredDraft(value: unknown): RoloWorkDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const draft = value as Record<string, unknown>
  if (typeof draft.kind !== 'string' || !WORK_KINDS.has(draft.kind as RoloWorkDraft['kind'])
    || typeof draft.title !== 'string' || draft.title.trim().length < 1 || draft.title.length > 120
    || typeof draft.category !== 'string' || !Object.hasOwn(CATEGORY_LABEL, draft.category)
    || typeof draft.status !== 'string' || !WORK_STATUSES.has(draft.status as RoloWorkDraft['status'])
    || (draft.occurredOn !== null && (typeof draft.occurredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn)))
    || typeof draft.summary !== 'string' || draft.summary.length > 2_000
    || (draft.professionalLabel !== null && (typeof draft.professionalLabel !== 'string'
      || draft.professionalLabel.trim().length < 1 || draft.professionalLabel.length > 160))
    || (draft.firstUpdate !== null && (typeof draft.firstUpdate !== 'string'
      || draft.firstUpdate.trim().length < 1 || draft.firstUpdate.length > 2_000))) return null
  return {
    kind: draft.kind as RoloWorkDraft['kind'],
    title: draft.title.trim(),
    category: draft.category as RoloWorkDraft['category'],
    status: draft.status as RoloWorkDraft['status'],
    occurredOn: draft.occurredOn as string | null,
    summary: draft.summary.trim(),
    professionalLabel: typeof draft.professionalLabel === 'string' ? draft.professionalLabel.trim() : null,
    firstUpdate: typeof draft.firstUpdate === 'string' ? draft.firstUpdate.trim() : null,
  }
}

function readStoredPhotoReview(value: unknown): AskRoloResult['photoReview'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const review = value as Record<string, unknown>
  if (Object.keys(review).sort().join(',')
    !== 'cannotConfirm,hazardSignal,suggestedTrade,urgency,visibleObservations') return null
  const validText = (item: unknown) => typeof item === 'string'
    && item === item.trim() && item.length > 0 && item.length <= 240
    && !/[\u0000-\u001f\u007f]/.test(item)
  if (!Array.isArray(review.visibleObservations)
    || !review.visibleObservations.every(validText)
    || !Array.isArray(review.cannotConfirm)
    || !review.cannotConfirm.every(validText)) return null
  const observations = review.visibleObservations as string[]
  const limits = review.cannotConfirm as string[]
  const hazards = new Set([
    'none', 'visible_fire_or_smoke', 'visible_sparking_or_exposed_electrical',
    'water_near_electrical', 'major_displacement_or_collapse',
  ])
  if (observations.length < 1 || observations.length > 5 || limits.length < 1 || limits.length > 4
    || (review.urgency !== 'routine' && review.urgency !== 'prompt_attention' && review.urgency !== 'urgent')
    || (review.suggestedTrade !== null
      && (typeof review.suggestedTrade !== 'string'
        || !Object.hasOwn(CATEGORY_LABEL, review.suggestedTrade)))
    || typeof review.hazardSignal !== 'string' || !hazards.has(review.hazardSignal)) return null
  return {
    visibleObservations: observations,
    cannotConfirm: limits,
    urgency: review.urgency,
    suggestedTrade: review.suggestedTrade as RoloWorkDraft['category'] | null,
    hazardSignal: review.hazardSignal as NonNullable<AskRoloResult['photoReview']>['hazardSignal'],
  }
}

function readStoredConversation(storageKey: string): StoredConversation {
  const empty = (): StoredConversation => ({
    thread: [], proposal: null, followUps: [], photoReview: null,
    photoReviewTitle: null, photoReviewRef: null,
  })
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return empty()
    const decoded = JSON.parse(raw) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return empty()
    }
    const stored = decoded as Record<string, unknown>
    if (stored.version !== 1 || !Array.isArray(stored.thread)) {
      return empty()
    }
    const thread = stored.thread.flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') return []
      const candidate = entry as Record<string, unknown>
      if ((candidate.role !== 'user' && candidate.role !== 'assistant')
        || typeof candidate.text !== 'string'
        || candidate.text.trim().length < 1
        || candidate.text.length > 1_600) return []
      const restored: ThreadMessage = {
        id: typeof candidate.id === 'string' ? candidate.id : `restored-${index}`,
        role: candidate.role,
        text: candidate.text.trim(),
        ...(candidate.role === 'user' && typeof candidate.photoTitle === 'string'
          && candidate.photoTitle === candidate.photoTitle.trim()
          && candidate.photoTitle.length > 0 && candidate.photoTitle.length <= 160
          ? { photoTitle: candidate.photoTitle }
          : {}),
      }
      return [restored]
    }).slice(-20)
    const followUps = Array.isArray(stored.followUps)
      ? stored.followUps.flatMap(question => typeof question === 'string'
        && question.trim().length > 0 && question.length <= 240 ? [question.trim()] : []).slice(0, 1)
      : []
    const photoReview = readStoredPhotoReview(stored.photoReview)
    const photoReviewTitle = photoReview && typeof stored.photoReviewTitle === 'string'
      && stored.photoReviewTitle === stored.photoReviewTitle.trim()
      && stored.photoReviewTitle.length > 0 && stored.photoReviewTitle.length <= 160
      ? stored.photoReviewTitle
      : null
    const photoReviewRef = photoReview && typeof stored.photoReviewRef === 'string'
      && ARTIFACT_REF.test(stored.photoReviewRef) ? stored.photoReviewRef : null
    return {
      thread,
      proposal: readStoredDraft(stored.proposal),
      followUps,
      photoReview,
      photoReviewTitle,
      photoReviewRef,
    }
  } catch {
    return empty()
  }
}

function assistantError(error: string) {
  if (error === 'rate_limited') return 'Rolo has handled a lot at once. Give it a minute, then try again.'
  if (error === 'not_signed_in') return 'Your sign-in expired. Sign in again before asking about this home.'
  if (error === 'invalid') return 'Rolo could not use that message. Try saying it a little more plainly.'
  return 'Rolo could not answer right now. Your home information was not changed.'
}

export function AssistantDock({ homeId }: { readonly homeId: string }) {
  const pathname = usePathname()
  const port = usePort()
  const { state: session } = useSession()
  const principalRef = session.kind === 'signed_in' ? session.session.principalRef : 'signed-out'
  const storageKey = roloThreadStorageKey(homeId, principalRef)
  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState<ThreadMessage[]>(() => readStoredConversation(storageKey).thread)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<RoloWorkDraft | null>(
    () => readStoredConversation(storageKey).proposal,
  )
  const [suggestion, setSuggestion] = useState<Pick<AskRoloResult, 'destination' | 'projectRef'> | null>(null)
  const [followUps, setFollowUps] = useState<readonly string[]>(
    () => readStoredConversation(storageKey).followUps,
  )
  const [savedProject, setSavedProject] = useState<{ ref: string; title: string; partial: boolean } | null>(null)
  const [savedPhotos, setSavedPhotos] = useState<readonly DocumentSummary[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState(false)
  const [selectedPhotoRef, setSelectedPhotoRef] = useState<string | null>(null)
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoReview, setPhotoReview] = useState<AskRoloResult['photoReview']>(
    () => readStoredConversation(storageKey).photoReview,
  )
  const [photoReviewTitle, setPhotoReviewTitle] = useState<string | null>(
    () => readStoredConversation(storageKey).photoReviewTitle,
  )
  const [photoReviewRef, setPhotoReviewRef] = useState<string | null>(
    () => readStoredConversation(storageKey).photoReviewRef,
  )
  const saveAttempt = useRef<string | null>(null)
  const sendInFlight = useRef(false)
  const saveInFlight = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const launchRef = useRef<HTMLElement | null>(null)
  const activeStorageKey = useRef(storageKey)
  const assistantEnabled = session.kind === 'signed_in' && session.capabilities.homeAssistant
  const visionEnabled = session.kind === 'signed_in' && session.capabilities.homeAssistantVision
  const activeSelectedPhotoRef = visionEnabled ? selectedPhotoRef : null
  const destination = currentDestination(pathname, homeId)
  const currentProjectRef = projectRefFromPath(pathname)

  const closeAssistant = useCallback(() => {
    setOpen(false)
    setSelectedPhotoRef(null)
    setPhotoConsent(false)
    requestAnimationFrame(() => launchRef.current?.focus())
  }, [])

  useEffect(() => {
    if (activeStorageKey.current !== storageKey) {
      activeStorageKey.current = storageKey
      const restored = readStoredConversation(storageKey)
      setThread(restored.thread)
      setProposal(restored.proposal)
      setFollowUps(restored.followUps)
      setPhotoReview(restored.photoReview)
      setPhotoReviewTitle(restored.photoReviewTitle)
      setPhotoReviewRef(restored.photoReviewRef)
      setSuggestion(null)
      setSavedProject(null)
      setError(null)
      setSavedPhotos([])
      setSelectedPhotoRef(null)
      setPhotoConsent(false)
      return
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        thread: thread.slice(-20),
        proposal,
        followUps: followUps.slice(0, 1),
        photoReview,
        photoReviewTitle,
        photoReviewRef,
      }))
    } catch {
      // Conversation persistence is a convenience only; the app still works.
    }
  }, [followUps, photoReview, photoReviewRef, photoReviewTitle, proposal, storageKey, thread])

  useEffect(() => {
    const show = () => {
      if (document.activeElement instanceof HTMLElement) launchRef.current = document.activeElement
      setSavedPhotos([])
      setSelectedPhotoRef(null)
      setPhotoConsent(false)
      setPhotosError(false)
      setPhotosLoading(visionEnabled)
      setOpen(true)
    }
    window.addEventListener('homesrolo:open-assistant', show)
    return () => window.removeEventListener('homesrolo:open-assistant', show)
  }, [visionEnabled])

  useEffect(() => {
    if (!open || !visionEnabled) return
    let active = true
    void port.listDocuments(homeId).then(result => {
      if (!active) return
      setPhotosLoading(false)
      if (!result.ok) {
        setSavedPhotos([])
        setPhotosError(true)
        return
      }
      setSavedPhotos(result.value.filter(record => !record.isSynthetic
        && record.kind === 'photo_set'
        && !!record.previewHref))
    }).catch(() => {
      if (!active) return
      setSavedPhotos([])
      setPhotosLoading(false)
      setPhotosError(true)
    })
    return () => { active = false }
  }, [homeId, open, port, visionEnabled])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAssistant()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const background = [...document.querySelectorAll<HTMLElement>('.topbar, .rail, .main, .tabbar')]
    const previousInert = background.map(node => node.inert)
    background.forEach(node => { node.inert = true })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      if (assistantEnabled) inputRef.current?.focus()
      else drawerRef.current?.querySelector<HTMLElement>('button')?.focus()
    }, 80)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
      background.forEach((node, index) => { node.inert = previousInert[index] ?? false })
      document.body.style.overflow = previousOverflow
    }
  }, [assistantEnabled, closeAssistant, open])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [thread, proposal, busy])

  const history = useMemo<readonly RoloAssistantTurn[]>(
    () => thread.slice(-16).map(({ role, text, photoTitle }) => ({
      role,
      text: `${text}${photoTitle ? `\n[Saved photo attached: ${photoTitle}]` : ''}`.slice(0, 900),
    })),
    [thread],
  )

  async function sendMessage(message: string) {
    const clean = message.trim()
    if (!clean || busy || sendInFlight.current || !assistantEnabled) return
    const selectedPhoto = activeSelectedPhotoRef
      ? savedPhotos.find(photo => photo.documentRef === activeSelectedPhotoRef) ?? null
      : null
    if (activeSelectedPhotoRef && (!selectedPhoto || !photoConsent)) {
      setError('Check the photo permission box for this message, or remove the photo.')
      return
    }
    sendInFlight.current = true
    const pendingWork = proposal
    const unansweredFollowUpQuestion = followUps[0] ?? null
    const userMessage: ThreadMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      text: clean,
      ...(selectedPhoto ? { photoTitle: selectedPhoto.title } : {}),
    }
    setThread(current => [...current, userMessage].slice(-20))
    setInput('')
    setBusy(true)
    setError(null)
    setProposal(null)
    setSuggestion(null)
    setFollowUps([])
    setSavedProject(null)
    if (selectedPhoto) {
      setPhotoReview(null)
      setPhotoReviewTitle(null)
      setPhotoReviewRef(null)
    }
    saveAttempt.current = null
    let result: Awaited<ReturnType<typeof port.askRolo>>
    try {
      result = await port.askRolo(homeId, {
        message: clean,
        history,
        conversation: { pendingWork, unansweredFollowUpQuestion },
        destination,
        ...(currentProjectRef ? { projectRef: currentProjectRef } : {}),
        ...(visionEnabled && selectedPhoto && photoConsent ? {
          selectedPhoto: {
            source: 'artifact' as const,
            artifactRef: selectedPhoto.documentRef,
            consentToAnalyze: true as const,
          },
        } : {}),
      })
    } catch {
      setBusy(false)
      sendInFlight.current = false
      setProposal(pendingWork)
      setFollowUps(unansweredFollowUpQuestion ? [unansweredFollowUpQuestion] : [])
      setError('Rolo could not answer right now. Your home information was not changed.')
      return
    }
    setBusy(false)
    sendInFlight.current = false
    if (!result.ok) {
      setProposal(pendingWork)
      setFollowUps(unansweredFollowUpQuestion ? [unansweredFollowUpQuestion] : [])
      setError(assistantError(result.error))
      return
    }
    const assistantMessage: ThreadMessage = {
      id: result.value.requestRef,
      role: 'assistant',
      text: result.value.answer,
    }
    setThread(current => [...current, assistantMessage].slice(-20))
    setProposal(result.value.proposedWork)
    setSuggestion({ destination: result.value.destination, projectRef: result.value.projectRef })
    setFollowUps(result.value.followUpQuestions)
    if (result.value.photoReview && selectedPhoto) {
      setPhotoReview(result.value.photoReview)
      setPhotoReviewTitle(selectedPhoto.title)
      setPhotoReviewRef(selectedPhoto.documentRef)
    }
    if (selectedPhoto) {
      setSelectedPhotoRef(null)
      setPhotoConsent(false)
    }
  }

  async function saveProposal() {
    if (!proposal || saveBusy || saveInFlight.current) return
    saveInFlight.current = true
    const commandRef = commandRefForAttempt(saveAttempt.current)
    saveAttempt.current = commandRef
    setSaveBusy(true)
    setError(null)
    try {
      const created = await port.createProject(homeId, {
        commandRef,
        title: proposal.title,
        workKind: proposal.kind,
        category: proposal.category,
        status: proposal.status,
        ...(proposal.occurredOn ? { occurredOn: proposal.occurredOn } : {}),
        summary: proposal.summary,
      })
      if (!created.ok) {
        setError('That work record was not saved. Review it and try again; Rolo will not make a duplicate.')
        return
      }

      let revision = created.value.revision
      let partial = false
      if (proposal.professionalLabel) {
        const updated = await port.updateProject(homeId, created.value.projectRef, {
          commandRef: mintCommandRef(),
          expectedRevision: revision,
          professionalLabel: proposal.professionalLabel,
        })
        if (updated.ok) revision = updated.value.revision
        else partial = true
      }
      if (proposal.firstUpdate) {
        const update = await port.addProjectActivity(homeId, created.value.projectRef, {
          commandRef: mintCommandRef(),
          kind: 'note',
          body: proposal.firstUpdate,
        })
        if (!update.ok) partial = true
      }
      setProposal(null)
      setFollowUps([])
      setSuggestion(null)
      saveAttempt.current = null
      setSavedProject({ ref: created.value.projectRef, title: created.value.title, partial })
      const savedMessage: ThreadMessage = {
        id: `saved-${created.value.projectRef}`,
        role: 'assistant',
        text: partial
          ? `I saved ${created.value.title}. One extra detail did not attach, so open the record to review it.`
          : `Saved. ${created.value.title} is now part of this home's work history.`,
      }
      setThread(current => [...current, savedMessage].slice(-20))
      window.dispatchEvent(new CustomEvent('homesrolo:data-changed', {
        detail: { homeId, projectRef: created.value.projectRef },
      }))
    } catch {
      setError('That work record was not saved. Review it and try again; Rolo will not make a duplicate.')
    } finally {
      setSaveBusy(false)
      saveInFlight.current = false
    }
  }

  function clearConversation() {
    setThread([])
    setProposal(null)
    setSuggestion(null)
    setFollowUps([])
    setSavedProject(null)
    setError(null)
    setSelectedPhotoRef(null)
    setPhotoConsent(false)
    setPhotoReview(null)
    setPhotoReviewTitle(null)
    setPhotoReviewRef(null)
    try { sessionStorage.removeItem(storageKey) } catch {}
  }

  return (
    <>
      {open ? (
        <div className={styles.layer}>
          <button className={styles.backdrop} type="button" aria-label="Close Rolo" onClick={closeAssistant} />
          <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="rolo-assistant-title">
            <header className={styles.header}>
              <span className={styles.mark}><HouseMark size={28} /></span>
              <div>
                <p>Inside this home</p>
                <h2 id="rolo-assistant-title">Ask Rolo</h2>
              </div>
              <button type="button" className={styles.close} onClick={closeAssistant} aria-label="Close Rolo">×</button>
            </header>

            <div className={styles.thread} ref={threadRef} role="log" aria-live="polite">
              <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                <span className={styles.speaker}>Rolo</span>
                <p>Tell me what happened, what you need to find, or what this home should remember. I’ll organize it with you.</p>
              </div>

              {thread.map(message => (
                <div
                  key={message.id}
                  className={`${styles.bubble} ${message.role === 'user' ? styles.userBubble : styles.assistantBubble}`}
                >
                  <span className={styles.speaker}>{message.role === 'user' ? 'You' : 'Rolo'}</span>
                  <p>{message.text}</p>
                  {message.photoTitle ? <span className={styles.threadPhoto}>▣ {message.photoTitle}</span> : null}
                </div>
              ))}

              {thread.length === 0 ? (
                <div className={styles.starters} aria-label="Ways to start">
                  {STARTERS.map(starter => (
                    <button key={starter} type="button" onClick={() => void sendMessage(starter)} disabled={!assistantEnabled}>
                      {starter}
                    </button>
                  ))}
                </div>
              ) : null}

              {busy ? (
                <div className={`${styles.bubble} ${styles.assistantBubble}`} role="status">
                  <span className={styles.speaker}>Rolo</span>
                  <p className={styles.thinking}>Putting that together<span aria-hidden="true">…</span></p>
                </div>
              ) : null}

              {proposal ? (
                <section className={styles.proposal} aria-labelledby="rolo-draft-title">
                  <div className={styles.proposalTopline}>
                    <span>{KIND_LABEL[proposal.kind]}</span>
                    <span>Review before saving</span>
                  </div>
                  <h3 id="rolo-draft-title">{proposal.title}</h3>
                  <dl>
                    <div><dt>Area</dt><dd>{CATEGORY_LABEL[proposal.category]}</dd></div>
                    <div><dt>Status</dt><dd>{proposal.status.replace('_', ' ')}</dd></div>
                    {proposal.occurredOn ? <div><dt>Date</dt><dd>{proposal.occurredOn}</dd></div> : null}
                    {proposal.professionalLabel ? <div><dt>Who</dt><dd>{proposal.professionalLabel}</dd></div> : null}
                  </dl>
                  {proposal.summary ? <p>{proposal.summary}</p> : null}
                  <div className={styles.proposalActions}>
                    <button type="button" onClick={() => void saveProposal()} disabled={saveBusy}>
                      {saveBusy ? 'Saving…' : 'Save to this home'}
                    </button>
                    <button type="button" onClick={() => {
                      setProposal(null)
                      setFollowUps([])
                      setSuggestion(null)
                    }} disabled={saveBusy}>Not this</button>
                  </div>
                  <small>Nothing is saved until you approve it. This does not contact or hire anyone.</small>
                </section>
              ) : null}

              {photoReview ? (
                <section className={styles.photoReview} aria-label="Rolo photo review">
                  <div>
                    <span>{photoReviewTitle ?? 'Selected photo'}</span>
                    <strong>{photoReview.urgency === 'urgent'
                      ? 'Treat this as urgent'
                      : photoReview.urgency === 'prompt_attention'
                        ? 'Worth prompt attention'
                        : 'No urgent signal visible'}</strong>
                  </div>
                  <h3>What Rolo can see</h3>
                  <ul>{photoReview.visibleObservations.map(item => <li key={item}>{item}</li>)}</ul>
                  <h3>What the photo cannot confirm</h3>
                  <ul>{photoReview.cannotConfirm.map(item => <li key={item}>{item}</li>)}</ul>
                  {photoReview.suggestedTrade ? (
                    <p>Likely next trade to consider: <strong>{CATEGORY_LABEL[photoReview.suggestedTrade]}</strong></p>
                  ) : null}
                </section>
              ) : null}

              {savedProject ? (
                <div className={styles.saved} role="status">
                  <span>Saved to this home</span>
                  <Link href={`/home/${homeId}/projects/${savedProject.ref}`} onClick={closeAssistant}>
                    Open {savedProject.title} →
                  </Link>
                </div>
              ) : null}

              {suggestion?.destination ? (
                <Link
                  className={styles.destination}
                  href={destinationHref(homeId, suggestion.destination, suggestion.projectRef)}
                  onClick={closeAssistant}
                >
                  Open {suggestion.destination === 'library' ? 'Library' : suggestion.destination === 'activity' ? 'Activity' : suggestion.destination === 'rolo' ? 'the Rolo' : suggestion.destination === 'details' ? 'Home details' : 'that record'} →
                </Link>
              ) : null}

              {followUps.length > 0 ? (
                <div className={styles.followUps} aria-label="Continue the conversation">
                  <span>Rolo still needs:</span>
                  <ul>{followUps.map(question => <li key={question}>{question}</li>)}</ul>
                  <button type="button" onClick={() => { setInput(''); inputRef.current?.focus() }}>Answer Rolo</button>
                </div>
              ) : null}

              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              {!assistantEnabled ? (
                <p className={styles.unavailable} role="status">Rolo is unavailable right now. Your saved home records and uploads still work normally.</p>
              ) : null}
            </div>

            <form
              className={styles.composer}
              onSubmit={event => {
                event.preventDefault()
                void sendMessage(input)
              }}
            >
              {visionEnabled ? (
                <div className={styles.photoAttach}>
                  {selectedPhotoRef ? (() => {
                    const selected = savedPhotos.find(photo => photo.documentRef === selectedPhotoRef)
                    return selected ? (
                      <div className={styles.selectedPhoto}>
                        <span className={styles.selectedPhotoMark} aria-hidden="true">▣</span>
                        <div>
                          <strong>{selected.title}</strong>
                          <button type="button" onClick={() => {
                            setSelectedPhotoRef(null)
                            setPhotoConsent(false)
                          }}>Remove</button>
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            checked={photoConsent}
                            onChange={event => setPhotoConsent(event.target.checked)}
                          />
                          Let Rolo inspect this photo for this message only.
                        </label>
                      </div>
                    ) : (
                      <div className={styles.selectedPhotoMissing}>
                        <span>That photo is no longer available in this home.</span>
                        <button type="button" onClick={() => {
                          setSelectedPhotoRef(null)
                          setPhotoConsent(false)
                        }}>Remove it</button>
                      </div>
                    )
                  })() : (
                    <details>
                      <summary>Review a saved photo</summary>
                      {photosLoading ? <p>Loading your private photos…</p> : null}
                      {photosError ? <p>Photos could not load here. Your Library is still available.</p> : null}
                      {!photosLoading && !photosError && savedPhotos.length === 0 ? (
                        <p>No saved photos yet. <Link href={`/home/${homeId}/documents`} onClick={closeAssistant}>Add one in Library.</Link></p>
                      ) : null}
                      {savedPhotos.length > 0 ? (
                        <div className={styles.photoChoices}>
                          {savedPhotos.slice(0, 12).map(photo => (
                            <button
                              key={photo.documentRef}
                              type="button"
                              onClick={() => {
                                setSelectedPhotoRef(photo.documentRef)
                                setPhotoConsent(false)
                              }}
                            >
                              <span className={styles.photoChoiceMark} aria-hidden="true">▣</span>
                              <span>{photo.title}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </details>
                  )}
                </div>
              ) : null}
              <label htmlFor="rolo-message">Talk to Rolo</label>
              <div>
                <textarea
                  id="rolo-message"
                  ref={inputRef}
                  value={input}
                  onChange={event => {
                    setInput(event.target.value)
                    setPhotoConsent(false)
                  }}
                  maxLength={1_600}
                  rows={2}
                  placeholder="My water heater started leaking this morning…"
                  disabled={!assistantEnabled || busy}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage(input)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!assistantEnabled || busy || !input.trim() || (!!activeSelectedPhotoRef && !photoConsent)}
                  aria-label="Send to Rolo"
                >↑</button>
              </div>
              <span>
                Your message and a limited index of this home—including city/state when available, saved titles, dates, statuses, file names, professional labels, and system years—are processed by OpenAI. The saved street-address field is not sent. File and photo contents are not sent by default.
                {visionEnabled ? ' If you explicitly select a saved photo and check the consent box, a fresh metadata-free JPEG copy is sent for that message. Responses storage is disabled, though OpenAI’s provider-retention rules may still apply; no other photo contents are sent.' : ''}
                {' '}Rolo can describe visible details, but it does not diagnose, measure, price, hire, or save without approval.
              </span>
            </form>

            {thread.length > 0 ? (
              <button type="button" className={styles.clear} onClick={clearConversation}>Clear this conversation</button>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  )
}
