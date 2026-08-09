'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV, SITE_NAME } from '../lib/site.ts'

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="masthead">
      <div className="shell masthead__inner">
        <Link href="/" className="wordmark">
          Homes<span>rolo</span>
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
