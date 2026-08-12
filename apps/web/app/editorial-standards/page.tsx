import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { EDITORIAL_STANDARDS } from '../../lib/content/education.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Editorial standards',
  description: 'How Homesrolo researches, sources, updates, and separates homeowner education from commercial influence.',
  alternates: { canonical: '/editorial-standards/' },
}

export default function EditorialStandardsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Homesrolo editorial standards',
    url: `${SITE_ORIGIN}/editorial-standards/`,
    dateModified: '2026-08-12',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader eyebrow="Editorial standards" title="How Homesrolo researches a guide" lede="Sources stay visible, dates mean something, commercial relationships do not change the facts, and important limits are stated in plain language." />
        </div>
      </section>
      <section className="section section--sunken">
        <div className="shell"><Sections sections={EDITORIAL_STANDARDS} /></div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Corrections</h2>
            <p>A correction process will be published before real contractor profiles go live. Until then, the public directory contains only clearly labeled sample records and is blocked from search indexing.</p>
            <p><Link href="/services/roofing/">Return to the roofing center</Link> or <Link href="/how-we-verify/">see how public facts are handled</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
