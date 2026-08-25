'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commandRefForAttempt, mintCommandRef } from '../lib/port/command-ref.ts'
import { usePort, useSession } from '../lib/port/provider.tsx'
import type {
  AskRoloResult,
  RoloAssistantTurn,
  RoloDestination,
  RoloWorkDraft,
} from '../lib/port/types.ts'
import { HouseMark } from './icons.tsx'
import styles from './AssistantDock.module.css'

type ThreadMessage = RoloAssistantTurn & { readonly id: string }

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

function readStoredThread(homeId: string): ThreadMessage[] {
  try {
    const raw = sessionStorage.getItem(`homesrolo:rolo-thread:${homeId}`)
    if (!raw) return []
    const decoded = JSON.parse(raw) as unknown
    if (!Array.isArray(decoded)) return []
    return decoded.flatMap((entry, index) => {
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
      }
      return [restored]
    }).slice(-12)
  } catch {
    return []
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
  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState<ThreadMessage[]>(() => readStoredThread(homeId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<RoloWorkDraft | null>(null)
  const [suggestion, setSuggestion] = useState<Pick<AskRoloResult, 'destination' | 'projectRef'> | null>(null)
  const [followUps, setFollowUps] = useState<readonly string[]>([])
  const [savedProject, setSavedProject] = useState<{ ref: string; title: string; partial: boolean } | null>(null)
  const saveAttempt = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const assistantEnabled = session.kind === 'signed_in' && session.capabilities.homeResearch
  const destination = currentDestination(pathname, homeId)
  const currentProjectRef = projectRefFromPath(pathname)

  useEffect(() => {
    try {
      sessionStorage.setItem(`homesrolo:rolo-thread:${homeId}`, JSON.stringify(thread.slice(-12)))
    } catch {
      // Conversation persistence is a convenience only; the app still works.
    }
  }, [homeId, thread])

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('homesrolo:open-assistant', show)
    return () => window.removeEventListener('homesrolo:open-assistant', show)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [thread, proposal, busy])

  const history = useMemo<readonly RoloAssistantTurn[]>(
    () => thread.slice(-8).map(({ role, text }) => ({ role, text })),
    [thread],
  )

  async function sendMessage(message: string) {
    const clean = message.trim()
    if (!clean || busy || !assistantEnabled) return
    const userMessage: ThreadMessage = { id: `user-${crypto.randomUUID()}`, role: 'user', text: clean }
    setThread(current => [...current, userMessage].slice(-12))
    setInput('')
    setBusy(true)
    setError(null)
    setProposal(null)
    setSuggestion(null)
    setFollowUps([])
    setSavedProject(null)
    saveAttempt.current = null
    const result = await port.askRolo(homeId, {
      message: clean,
      history,
      destination,
      ...(currentProjectRef ? { projectRef: currentProjectRef } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      setError(assistantError(result.error))
      return
    }
    const assistantMessage: ThreadMessage = {
      id: result.value.requestRef,
      role: 'assistant',
      text: result.value.answer,
    }
    setThread(current => [...current, assistantMessage].slice(-12))
    setProposal(result.value.proposedWork)
    setSuggestion({ destination: result.value.destination, projectRef: result.value.projectRef })
    setFollowUps(result.value.followUpQuestions)
  }

  async function saveProposal() {
    if (!proposal || saveBusy) return
    const commandRef = commandRefForAttempt(saveAttempt.current)
    saveAttempt.current = commandRef
    setSaveBusy(true)
    setError(null)
    const created = await port.createProject(homeId, {
      commandRef,
      title: proposal.title,
      category: proposal.category,
      status: proposal.status,
      ...(proposal.occurredOn ? { occurredOn: proposal.occurredOn } : {}),
      summary: proposal.summary,
    })
    if (!created.ok) {
      setSaveBusy(false)
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
    setSaveBusy(false)
    setProposal(null)
    saveAttempt.current = null
    setSavedProject({ ref: created.value.projectRef, title: created.value.title, partial })
    const savedMessage: ThreadMessage = {
      id: `saved-${created.value.projectRef}`,
      role: 'assistant',
      text: partial
        ? `I saved ${created.value.title}. One extra detail did not attach, so open the record to review it.`
        : `Saved. ${created.value.title} is now part of this home's work history.`,
    }
    setThread(current => [...current, savedMessage].slice(-12))
    window.dispatchEvent(new CustomEvent('homesrolo:data-changed', {
      detail: { homeId, projectRef: created.value.projectRef },
    }))
  }

  function clearConversation() {
    setThread([])
    setProposal(null)
    setSuggestion(null)
    setFollowUps([])
    setSavedProject(null)
    setError(null)
    try { sessionStorage.removeItem(`homesrolo:rolo-thread:${homeId}`) } catch {}
  }

  return (
    <>
      <button
        type="button"
        className={styles.floatingTrigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <HouseMark size={22} />
        <span>Ask Rolo</span>
      </button>

      {open ? (
        <div className={styles.layer}>
          <button className={styles.backdrop} type="button" aria-label="Close Rolo" onClick={() => setOpen(false)} />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="rolo-assistant-title">
            <header className={styles.header}>
              <span className={styles.mark}><HouseMark size={28} /></span>
              <div>
                <p>Inside this home</p>
                <h2 id="rolo-assistant-title">Ask Rolo</h2>
              </div>
              <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close Rolo">×</button>
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
                    <button type="button" onClick={() => setProposal(null)} disabled={saveBusy}>Not this</button>
                  </div>
                  <small>Nothing is saved until you approve it. This does not contact or hire anyone.</small>
                </section>
              ) : null}

              {savedProject ? (
                <div className={styles.saved} role="status">
                  <span>Saved to this home</span>
                  <Link href={`/home/${homeId}/projects/${savedProject.ref}`} onClick={() => setOpen(false)}>
                    Open {savedProject.title} →
                  </Link>
                </div>
              ) : null}

              {suggestion?.destination ? (
                <Link
                  className={styles.destination}
                  href={destinationHref(homeId, suggestion.destination, suggestion.projectRef)}
                  onClick={() => setOpen(false)}
                >
                  Open {suggestion.destination === 'library' ? 'Library' : suggestion.destination === 'activity' ? 'Activity' : suggestion.destination === 'rolo' ? 'the Rolo' : suggestion.destination === 'details' ? 'Home details' : 'that record'} →
                </Link>
              ) : null}

              {followUps.length > 0 ? (
                <div className={styles.followUps} aria-label="Continue the conversation">
                  {followUps.map(question => (
                    <button key={question} type="button" onClick={() => setInput(question)}>{question}</button>
                  ))}
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
              <label htmlFor="rolo-message">Talk to Rolo</label>
              <div>
                <textarea
                  id="rolo-message"
                  ref={inputRef}
                  value={input}
                  onChange={event => setInput(event.target.value)}
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
                <button type="submit" disabled={!assistantEnabled || busy || !input.trim()} aria-label="Send to Rolo">↑</button>
              </div>
              <span>
                Your message and a short index of saved labels are processed by OpenAI. File and photo contents are not sent.
                Rolo does not diagnose, price, hire, or save without approval.
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
