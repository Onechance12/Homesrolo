import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { ABOUT_HOMESROLO } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'About Homesrolo',
  description: 'Homesrolo gives a home an organized project history and gives homeowners clear, sourced information before they hire a professional.',
  canonical: '/about/',
})

export default function AboutPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About Homesrolo',
    url: `${SITE_ORIGIN}/about/`,
    description: SITE_DESCRIPTION,
    mainEntity: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader eyebrow="About Homesrolo" title="A better memory for every home" lede="Homesrolo helps homeowners understand major projects, organize the records, and keep the history attached to the property." />
        </div>
      </section>
      <section className="section section--sunken">
        <div className="shell"><Sections sections={ABOUT_HOMESROLO} /></div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Start with the roofing center</h2>
            <p>The first public guides cover roof cost, materials, contractor checks, and Dallas Fort Worth permit rules.</p>
            <p><Link className="btn btn--primary" href="/services/roofing/">Read the roofing guides</Link> <Link className="btn btn--quiet" href="/editorial-standards/">Read the editorial standards</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
