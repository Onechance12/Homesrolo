import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { EDITORIAL_STANDARDS } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'How Homesrolo checks its public guides',
  description: 'Homesrolo keeps private home records and publishes sourced homeowner guides. See how the public guides are researched, limited, and updated.',
  canonical: '/editorial-standards/',
})

export default function EditorialStandardsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'How Homesrolo builds guides homeowners can check',
    url: `${SITE_ORIGIN}/editorial-standards/`,
    dateModified: '2026-08-21',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Editorial standards"
            title="How Homesrolo builds guides homeowners can check"
            lede="Homesrolo helps homeowners understand major home projects, organize the records, and keep the history attached to the property. These standards cover the public roofing and Roof Watch guides—the pages about costs, materials, repairs, contractors, storms, inspections, and local permit rules."
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
            <p>The About page explains Homesrolo as a whole. The roofing center shows these standards in practice.</p>
            <p><Link className="btn btn--primary" href="/about/">About Homesrolo</Link> <Link className="btn btn--quiet" href="/services/roofing/">Read the roofing guides</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
