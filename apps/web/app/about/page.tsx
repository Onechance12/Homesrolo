import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { ABOUT_HOMESROLO } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'About Homesrolo',
  description: 'Homesrolo gives a home one organized record for its care, projects, people, decisions, files, and repeatable photo checkups.',
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
          <PageHeader eyebrow="About Homesrolo" title="A better memory for every home" lede="Homesrolo gives the homeowner one private Home Record: a practical place to understand the house, organize its projects, and remember who did what." />
        </div>
      </section>
      <section className="section section--sunken">
        <div className="shell"><Sections sections={ABOUT_HOMESROLO} /></div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Start where your home needs you</h2>
            <p>Use the home-care map for routine checks, the project guide for bigger work, or open your home record and start with something you already know.</p>
            <p><Link className="btn btn--primary" href="/home-care/">Explore home care</Link> <Link className="btn btn--quiet" href="/home-record/">Build a better home record</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
