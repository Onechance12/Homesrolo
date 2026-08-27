'use client'

/**
 * The authenticated application chrome: desktop rail, mobile top bar and
 * bottom tab bar, the ever-present demo banner, and the session guard. Every
 * home-scoped screen renders inside this shell.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SYNTHETIC_NOTICE, homeLabel } from '../lib/port/types.ts'
import { usePort, usePortMode, useSession } from '../lib/port/provider.tsx'
import { usePortCall } from '../lib/port/hooks.ts'
import { Skeleton, UnauthorizedState } from './states.tsx'
import {
  HouseMark, IconGear, IconHome, IconPeople, IconProjects,
} from './icons.tsx'
import { SignOutButton } from './SignOutButton.tsx'
import { AssistantDock } from './AssistantDock.tsx'

const PRIMARY_NAV = [
  { id: 'today', segment: '', label: 'Today', tabLabel: 'Today', icon: IconHome, query: '' },
  { id: 'plans', segment: 'projects', label: 'Plans & service', tabLabel: 'Plans', icon: IconProjects, query: '' },
  { id: 'pros', segment: 'pros', label: 'Pros', tabLabel: 'Pros', icon: IconPeople, query: '' },
  { id: 'my-home', segment: 'rolo', label: 'My Home', tabLabel: 'My Home', icon: HouseMark, query: '' },
] as const

const START_ACTIONS = [
  {
    id: 'fix',
    mark: '!',
    title: 'Fix a problem',
    detail: 'Something broke, leaked, stopped, or looks wrong.',
    prompt: 'Something at my home is broken or not working. Help me think through safe first checks, ask only what you need, and help me organize the right issue or repair.',
  },
  {
    id: 'plan',
    mark: '◇',
    title: 'Plan a project',
    detail: 'Pool, remodel, paint, roof, yard, or a new idea.',
    prompt: 'I want to plan a home project. Start by asking what I want to change and what matters most. Help me organize photos, ideas, and choices, then prepare a planned project for my approval.',
  },
  {
    id: 'routine',
    mark: '↻',
    title: 'Get routine help',
    detail: 'Yard care, pest control, tune-ups, or recurring service.',
    prompt: 'I need routine help at my home. Ask what service I need and whether this is one time or recurring. Help me create a service request I can use to organize photos and the person or company doing the work.',
  },
  {
    id: 'past',
    mark: '✓',
    title: 'Add past work',
    detail: 'Keep a repair, replacement, or old project from getting lost.',
    prompt: 'I want to add work that already happened at my home. Ask what was done, roughly when, who did it if I know, and what photos, receipts, or warranties I still have.',
  },
] as const

function navHref(homeId: string, segment: string) {
  return segment ? `/home/${homeId}/${segment}` : `/home/${homeId}`
}

function isCurrent(
  pathname: string,
  homeId: string,
  id: typeof PRIMARY_NAV[number]['id'],
) {
  const base = `/home/${homeId}`
  if (id === 'today') return pathname === base
  if (id === 'plans') return pathname === `${base}/projects` || pathname.startsWith(`${base}/projects/`)
  if (id === 'pros') return pathname === `${base}/pros` || pathname.startsWith(`${base}/pros/`)
  if (pathname === `${base}/rolo`) return true
  return ['details', 'documents', 'timeline', 'checkups', 'warranties']
    .some(segment => pathname === `${base}/${segment}` || pathname.startsWith(`${base}/${segment}/`))
}

export function AppShell({ homeId, children }: { homeId: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const mode = usePortMode()
  const { state: session } = useSession()
  const port = usePort()
  const [startOpen, setStartOpen] = useState(false)
  const startMenuRef = useRef<HTMLElement | null>(null)
  const startLaunchRef = useRef<HTMLElement | null>(null)
  const { state: home } = usePortCall(
    () => port.getHome(homeId),
  )
  const closeStartMenu = useCallback(() => {
    setStartOpen(false)
    requestAnimationFrame(() => startLaunchRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!startOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const menu = startMenuRef.current
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeStartMenu()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [closeStartMenu, startOpen])

  if (session.kind === 'loading') {
    return (
      <div className="gate">
        <span className="gate__brand"><HouseMark /> <span>homesrolo</span></span>
        <div className="gate__main"><div className="gate__card"><Skeleton lines={4} label="Checking your session" /></div></div>
      </div>
    )
  }

  if (session.kind === 'signed_out') {
    return (
      <div className="gate">
        <span className="gate__brand"><HouseMark /> <span>homesrolo</span></span>
        <div className="gate__main"><div className="gate__card"><UnauthorizedState /></div></div>
      </div>
    )
  }

  const alias = home.status === 'ready' ? homeLabel(home.value) : '…'
  const assistantEnabled = session.capabilities.homeAssistant
  const professionalNavEnabled = session.capabilities.invitations
  const secondaryNav = PRIMARY_NAV.slice(2).filter(({ id }) =>
    id !== 'pros' || professionalNavEnabled)

  function openStartMenu() {
    if (document.activeElement instanceof HTMLElement) startLaunchRef.current = document.activeElement
    setStartOpen(true)
  }

  function openAssistant(prompt?: string) {
    setStartOpen(false)
    requestAnimationFrame(() => {
      startLaunchRef.current?.focus()
      window.dispatchEvent(new CustomEvent('homesrolo:open-assistant', {
        detail: { homeId, ...(prompt ? { prompt } : {}) },
      }))
    })
  }

  return (
    <div className="shell">
      {mode === 'synthetic'
        ? <p className="demo-banner" role="note">{SYNTHETIC_NOTICE}</p>
        : null}

      <header className="topbar">
        <Link href="/homes" className="topbar__brand">
          <HouseMark /> <span>homesrolo</span>
        </Link>
        <span className="topbar__home">{alias}</span>
        <Link
          className="topbar__account"
          href={`/home/${homeId}/settings`}
          aria-label="Account and settings"
          aria-current={pathname === `/home/${homeId}/settings` ? 'page' : undefined}
        >
          <IconGear size={19} /> <span>Account</span>
        </Link>
      </header>

      <nav className="rail" aria-label="This home">
        <Link href="/homes" className="rail__brand">
          <HouseMark /> <span>homesrolo</span>
        </Link>
        <div className="rail__home">
          <span className="mono">This home</span>
          <strong>{alias}</strong>
          <Link href="/homes" className="rail__switch">Switch home</Link>
        </div>
        <div className="rail__nav">
          {PRIMARY_NAV.slice(0, 2).map(({ id, segment, label, icon: Icon, query }) => (
            <Link
              key={id}
              href={`${navHref(homeId, segment)}${query ? `?${query}` : ''}`}
              aria-current={isCurrent(pathname, homeId, id) ? 'page' : undefined}
            >
              <Icon /> {label}
            </Link>
          ))}
          {assistantEnabled ? (
            <button type="button" className="rail__ask" onClick={openStartMenu} aria-haspopup="dialog">
              <HouseMark size={20} /> <span><strong>Start with Rolo</strong><small>Fix, plan, service, or ask</small></span>
            </button>
          ) : null}
          {secondaryNav.map(({ id, segment, label, icon: Icon, query }) => (
            <Link
              key={id}
              href={`${navHref(homeId, segment)}${query ? `?${query}` : ''}`}
              aria-current={isCurrent(pathname, homeId, id) ? 'page' : undefined}
            >
              <Icon /> {label}
            </Link>
          ))}
        </div>
        <div className="rail__foot">
          <span className="mono">
            {session.session.displayName
              ? `Signed in as ${session.session.displayName}`
              : 'Signed in'}
          </span>
          {mode === 'synthetic'
            ? <span className="mono">Demo session — memory only</span>
            : null}
          <Link
            className="rail__account"
            href={`/home/${homeId}/settings`}
            aria-current={pathname === `/home/${homeId}/settings` ? 'page' : undefined}
          >
            <IconGear size={18} /> Account &amp; settings
          </Link>
          <SignOutButton compact />
        </div>
      </nav>

      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>

      <nav className={`tabbar${professionalNavEnabled ? '' : ' tabbar--four'}`} aria-label="This home">
        {PRIMARY_NAV.slice(0, 2).map(({ id, segment, tabLabel, icon: Icon, query }) => (
          <Link
            key={id}
            href={`${navHref(homeId, segment)}${query ? `?${query}` : ''}`}
              aria-current={isCurrent(pathname, homeId, id) ? 'page' : undefined}
          >
            <Icon size={22} /> {tabLabel}
          </Link>
        ))}
        {assistantEnabled ? (
          <button type="button" className="tabbar__ask" onClick={openStartMenu} aria-haspopup="dialog">
            <span><HouseMark size={25} /></span>
            Start
          </button>
        ) : <Link href={`/home/${homeId}/rolo`}><HouseMark size={22} /> Rolo</Link>}
        {secondaryNav.map(({ id, segment, tabLabel, icon: Icon, query }) => (
          <Link
            key={id}
            href={`${navHref(homeId, segment)}${query ? `?${query}` : ''}`}
            aria-current={isCurrent(pathname, homeId, id) ? 'page' : undefined}
          >
            <Icon size={22} /> {tabLabel}
          </Link>
        ))}
      </nav>
      {startOpen ? (
        <div className="start-menu__layer">
          <button className="start-menu__backdrop" type="button" aria-label="Close Start menu" onClick={closeStartMenu} />
          <section ref={startMenuRef} className="start-menu" role="dialog" aria-modal="true" aria-labelledby="start-menu-title">
            <header className="start-menu__head">
              <div>
                <p className="mono">What brought you here?</p>
                <h2 id="start-menu-title">Start with what you need.</h2>
              </div>
              <button type="button" aria-label="Close Start menu" onClick={closeStartMenu}>×</button>
            </header>
            <div className="start-menu__actions">
              {START_ACTIONS.map(action => (
                <button type="button" key={action.id} onClick={() => openAssistant(action.prompt)}>
                  <span aria-hidden="true">{action.mark}</span>
                  <span><strong>{action.title}</strong><small>{action.detail}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            <button className="start-menu__ask" type="button" onClick={() => openAssistant()}>
              Just ask Rolo about my home
            </button>
            <p className="start-menu__note">Nothing is saved, sent, hired, or shared until you review the next step.</p>
          </section>
        </div>
      ) : null}
      {assistantEnabled ? <AssistantDock key={homeId} homeId={homeId} /> : null}
    </div>
  )
}
