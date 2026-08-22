'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HOMEOWNER_SIGNIN_URL, PRIMARY_NAV, SITE_NAME } from '../lib/site.ts'

/** Two record tabs hold a house: the home and its history in one mark. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path d="M2.5 7.5h9l2.2 2.5h9.8v13H2.5z" fill="var(--brand-soft)" opacity=".3" />
      <path d="M4 5h7.3l2 2.3H22v14H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.2 13 4.8-4 4.8 4M9.6 12.2v5.3h6.8v-5.3" fill="none" stroke="var(--signal)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SiteHeader() {
  const pathname = usePathname()

  const navLinks = PRIMARY_NAV.map(item => {
    const isCurrent = pathname === item.href || pathname === item.href.replace(/\/$/, '')

    return (
      <Link key={item.href} href={item.href} aria-current={isCurrent ? 'page' : undefined}>
        {item.label}
      </Link>
    )
  })

  return (
    <header className="masthead">
      <div className="shell masthead__inner">
        <Link href="/" className="wordmark">
          <Mark />
          <span>homesrolo</span>
        </Link>
        <nav aria-label={`${SITE_NAME} primary`} className="nav nav--desktop">
          {navLinks}
          <a className="nav__cta" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
        </nav>
        <details className="mobile-nav">
          <summary>Menu</summary>
          <nav aria-label={`${SITE_NAME} mobile`} className="mobile-nav__links">
            {navLinks}
            <a className="nav__cta" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
          </nav>
        </details>
      </div>
    </header>
  )
}
