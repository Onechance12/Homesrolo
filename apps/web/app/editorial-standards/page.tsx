import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { EDITORIAL_STANDARDS } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'How Homesrolo researches homeowner guides',
  description: 'See how Homesrolo checks sources, dates practical guidance, explains limits, and corrects material facts in its homeowner guides.',
  canonical: '/editorial-standards/',
})

export default function EditorialStandardsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'How Homesrolo researches homeowner guides',
    url: `${SITE_ORIGIN}/editorial-standards/`,
    dateModified: '2026-08-23',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="How we research"
            title="Useful guidance should show its work."
            lede="Homesrolo is a home-care and home-record tool. When a public guide relies on a law, permit rule, technical standard, market benchmark, or manufacturer document, the source and the limits belong on the page too."
          />
        </div>
      </section>
      <section className="section section--sunken">
        <div className="shell"><Sections sections={EDITORIAL_STANDARDS} /></div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Want the bigger picture?</h2>
            <p>The About page explains the product. The guide library puts this research method to work across the home.</p>
            <p><Link className="btn btn--primary" href="/about/">About Homesrolo</Link> <Link className="btn btn--quiet" href="/guides/">Browse homeowner guides</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
