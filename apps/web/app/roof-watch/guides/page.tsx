import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../../components/Prose.tsx'
import { ROOF_WATCH_GUIDES } from '../../../lib/content/roof-watch-guides.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Roof Watch guides for North Texas homeowners',
  description: 'Practical, sourced guides to hail response, roof inspection reports, heat, ventilation, contractors, and annual roof maintenance in North Texas.',
  alternates: { canonical: '/roof-watch/guides/' },
  openGraph: {
    title: 'Roof Watch guides for North Texas homeowners',
    description: 'Practical, sourced guidance on hail response, useful inspection reports, heat, ventilation, and roof maintenance.',
    url: '/roof-watch/guides/',
    images: [{ url: '/roof-watch-social-card.png', width: 1200, height: 630, alt: 'Homesrolo Roof Watch homeowner guides' }],
  },
  twitter: { card: 'summary_large_image', title: 'Roof Watch guides for North Texas homeowners', description: 'Practical, sourced roof guidance for North Texas homeowners.', images: ['/roof-watch-social-card.png'] },
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
            title="Useful roof answers, with the sources attached"
            lede="These guides are written for North Texas homeowners who need a clear next step, not a sales pitch. Safety, insurance, legal, and roof-performance claims link to the sources used, and each page shows when it was updated."
          />
          <div className="grid grid--2" style={{ marginTop: '2rem' }}>
            {ROOF_WATCH_GUIDES.map(guide => (
              <div key={guide.slug} className="card">
                <p className="eyebrow">{guide.eyebrow}</p>
                <h2 className="card__title"><Link href={`/roof-watch/guides/${guide.slug}/`}>{guide.title}</Link></h2>
                <p>{guide.description}</p>
                <p className="article-meta">Updated <time dateTime={guide.dateModified}>August 20, 2026</time></p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
