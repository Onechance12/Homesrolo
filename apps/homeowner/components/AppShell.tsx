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
  HouseMark, IconCamera, IconDocs, IconGear, IconHome, IconProjects,
} from './icons.tsx'
import { SignOutButton } from './SignOutButton.tsx'

const NAV = [
  { segment: '', label: 'Home', tabLabel: 'Home', icon: IconHome },
  { segment: 'projects', label: 'Projects', tabLabel: 'Projects', icon: IconProjects },
  { segment: 'documents', label: 'Home record', tabLabel: 'Record', icon: IconDocs },
  {
    segment: 'checkups', label: 'Checkups', tabLabel: 'Checkups', icon: IconCamera,
    requiresPhotoCheckups: true,
  },
] as const

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
  const checkupsEnabled = mode === 'remote' && session.capabilities.photoCheckups
  const visibleNav = NAV.filter(item => !('requiresPhotoCheckups' in item) || checkupsEnabled)

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

      <nav className="rail" aria-label="Home Record">
        <Link href="/homes" className="rail__brand">
          <HouseMark /> <span>homesrolo</span>
        </Link>
        <div className="rail__home">
          <span className="mono">Home Record</span>
          <strong>{alias}</strong>
          <Link href="/homes" className="rail__switch">Switch home</Link>
        </div>
        <div className="rail__nav">
          {visibleNav.map(({ segment, label, icon: Icon }) => (
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

      <nav className="tabbar" aria-label="Home Record sections">
        {visibleNav.map(({ segment, tabLabel, icon: Icon }) => (
          <Link
            key={segment}
            href={navHref(homeId, segment)}
            aria-current={isCurrent(pathname, homeId, segment) ? 'page' : undefined}
          >
            <Icon size={22} /> {tabLabel}
          </Link>
        ))}
      </nav>
    </div>
  )
}
