'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HOMEOWNER_SIGNIN_URL, PRIMARY_NAV, SITE_NAME } from '../lib/site.ts'
import { BrandMark } from './BrandMark.tsx'

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
          <BrandMark />
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
