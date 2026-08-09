import Link from 'next/link'
import { PRIMARY_NAV } from '../lib/site.ts'

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

/**
 * A 404 that helps rather than apologises. Reached both by a bad URL and by any
 * company slug that does not exist, since the directory builds only known
 * slugs and refuses to invent a page for anything else.
 */
export default function NotFound() {
  return (
    <section className="section">
      <div className="shell">
        <div className="prose">
          <p className="eyebrow">404</p>
          <h1>That page isn&rsquo;t here.</h1>
          <p className="lede">
            The link may be old, or the address may have a typo. If you were looking for a company listing, only
            sample listings exist in this preview — there are no real company profiles yet.
          </p>
        </div>

        <nav aria-label="Suggested pages" style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Try one of these</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.6rem' }}>
            <li><Link href="/">Home</Link></li>
            {PRIMARY_NAV.map(item => (
              <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}
