'use client'

/**
 * The authenticated application chrome: desktop rail, mobile top bar and
 * bottom tab bar, the ever-present demo banner, and the session guard. Every
 * home-scoped screen renders inside this shell.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SYNTHETIC_NOTICE, homeLabel } from '../lib/port/types.ts'
import { usePort, usePortMode, useSession } from '../lib/port/provider.tsx'
import { usePortCall } from '../lib/port/hooks.ts'
import { Skeleton, UnauthorizedState } from './states.tsx'
import {
  HouseMark, IconDocs, IconGear, IconHome, IconProjects, IconShield, IconThread,
} from './icons.tsx'

const NAV = [
  { segment: '', label: 'Home', icon: IconHome },
  { segment: 'projects', label: 'Projects', icon: IconProjects },
  { segment: 'documents', label: 'Documents', icon: IconDocs },
  { segment: 'timeline', label: 'Timeline', icon: IconThread },
  { segment: 'warranties', label: 'Warranties', icon: IconShield },
  { segment: 'settings', label: 'Settings', icon: IconGear },
] as const

/** The five that fit a thumb; settings lives in the rail and the Home screen. */
const TAB_SEGMENTS = ['', 'projects', 'documents', 'timeline', 'warranties'] as const

function navHref(homeId: string, segment: string) {
  return segment ? `/home/${homeId}/${segment}` : `/home/${homeId}`
}

function isCurrent(pathname: string, homeId: string, segment: string) {
  const href = navHref(homeId, segment)
  if (segment === '') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({ homeId, children }: { homeId: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const mode = usePortMode()
  const { state: session } = useSession()
  const port = usePort()
  const { state: home } = usePortCall(
    () => port.getHome(homeId),
  )

  if (session.kind === 'loading') {
    return (
      <div className="gate">
        <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
        <div className="gate__main"><div className="gate__card"><Skeleton lines={4} label="Checking your session" /></div></div>
      </div>
    )
  }

  if (session.kind === 'signed_out') {
    return (
      <div className="gate">
        <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
        <div className="gate__main"><div className="gate__card"><UnauthorizedState /></div></div>
      </div>
    )
  }

  const alias = home.status === 'ready' ? homeLabel(home.value) : '…'

  return (
    <div className="shell">
      {mode === 'synthetic'
        ? <p className="demo-banner" role="note">{SYNTHETIC_NOTICE}</p>
        : null}

      <header className="topbar">
        <Link href="/homes" className="topbar__brand">
          <HouseMark /> <span>Homes<span className="accent">rolo</span></span>
        </Link>
        <span className="topbar__home">{alias}</span>
      </header>

      <nav className="rail" aria-label="Home file">
        <Link href="/homes" className="rail__brand">
          <HouseMark /> <span>Homes<span className="accent">rolo</span></span>
        </Link>
        <div className="rail__home">
          <span className="mono">Home file</span>
          <strong>{alias}</strong>
          <Link href="/homes" style={{ fontSize: '0.8rem' }}>Switch home</Link>
        </div>
        <div className="rail__nav">
          {NAV.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={navHref(homeId, segment)}
              aria-current={isCurrent(pathname, homeId, segment) ? 'page' : undefined}
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
        </div>
      </nav>

      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>

      <nav className="tabbar" aria-label="Home file sections">
        {NAV.filter(item => (TAB_SEGMENTS as readonly string[]).includes(item.segment))
          .map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={navHref(homeId, segment)}
              aria-current={isCurrent(pathname, homeId, segment) ? 'page' : undefined}
            >
              <Icon size={22} /> {label}
            </Link>
          ))}
      </nav>
    </div>
  )
}
