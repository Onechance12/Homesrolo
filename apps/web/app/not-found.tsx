import Link from 'next/link'
import { PRIMARY_NAV } from '../lib/site.ts'

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

/** A 404 that returns people to the working whole-home product. */
export default function NotFound() {
  return (
    <section className="section">
      <div className="shell">
        <div className="prose">
          <p className="eyebrow">404</p>
          <h1>That page isn&rsquo;t here.</h1>
          <p className="lede">
            The link may be old, or the address may have a typo. Start again with your Home Record, a home-care
            question, or the project in front of you.
          </p>
        </div>

        <nav aria-label="Suggested pages" style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Try one of these</h2>
          <ul className="nav-list">
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
