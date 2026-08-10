'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV, SITE_NAME } from '../lib/site.ts'

/** The mark: a house elevation reduced to five strokes and a record line. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <path d="M3 10.5 L11 4 L19 10.5" fill="none" stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10.5 V18 H16.5 V10.5" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 14.5 H14" stroke="var(--clay)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2.4" />
    </svg>
  )
}

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="masthead">
      <div className="shell masthead__inner">
        <Link href="/" className="wordmark">
          <Mark />
          <span>Homes<span className="wordmark__accent">rolo</span></span>
        </Link>
        <nav aria-label={`${SITE_NAME} primary`} className="nav">
          {PRIMARY_NAV.map(item => {
            const isCurrent = pathname === item.href || pathname === item.href.replace(/\/$/, '')
            return (
              <Link key={item.href} href={item.href} aria-current={isCurrent ? 'page' : undefined}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
