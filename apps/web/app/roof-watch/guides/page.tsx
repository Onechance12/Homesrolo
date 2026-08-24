import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../../components/Prose.tsx'
import { ROOF_WATCH_GUIDES } from '../../../lib/content/roof-watch-guides.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Roof Watch homeowner guides',
  description: 'Practical, sourced guides to hail response, roof inspection reports, heat, ventilation, contractors, and maintenance. Each guide identifies its region and sources.',
  alternates: { canonical: '/roof-watch/guides/' },
  openGraph: {
    type: 'website',
    title: 'Roof Watch homeowner guides',
    description: 'Practical, sourced guidance on hail response, useful inspection reports, heat, ventilation, and roof maintenance.',
    url: '/roof-watch/guides/',
    images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', width: 1200, height: 630, alt: 'Close field photo of architectural asphalt shingles' }],
  },
  twitter: { card: 'summary_large_image', title: 'Roof Watch homeowner guides', description: 'Practical roof guidance with the region and reviewed sources named in each guide.', images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', alt: 'Close field photo of architectural asphalt shingles' }] },
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

function dateLabel(date: string): string {
  return DATE_FORMATTER.format(new Date(`${date}T12:00:00Z`))
}

export default function RoofWatchGuidesPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Roof Watch guides',
    description: metadata.description,
    url: `${SITE_ORIGIN}/roof-watch/guides/`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: ROOF_WATCH_GUIDES.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.title,
        url: `${SITE_ORIGIN}/roof-watch/guides/${guide.slug}/`,
      })),
    },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span> Guides
          </nav>
          <PageHeader
            eyebrow="Roof Watch guides"
            title="Roof questions usually arrive before the answers do"
            lede="Start here after hail, when an inspection report feels vague, or when heat and ventilation have you wondering what is happening overhead. Each guide names its region and sources, then gives you a practical next step."
          />
          <div className="grid grid--2" style={{ marginTop: '2rem' }}>
            {ROOF_WATCH_GUIDES.map(guide => (
              <div key={guide.slug} className="card">
                <p className="eyebrow">{guide.eyebrow}</p>
                <h2 className="card__title"><Link href={`/roof-watch/guides/${guide.slug}/`}>{guide.title}</Link></h2>
                <p>{guide.description}</p>
                <p className="article-meta">Updated <time dateTime={guide.dateModified}>{dateLabel(guide.dateModified)}</time></p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
