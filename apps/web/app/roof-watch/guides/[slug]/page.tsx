import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '../../../../components/Prose.tsx'
import { ROOF_WATCH_SMS_URL, SITE_NAME, SITE_ORIGIN } from '../../../../lib/site.ts'
import { ROOF_WATCH_GUIDES } from '../../../../lib/content/roof-watch-guides.ts'

export function generateStaticParams() {
  return ROOF_WATCH_GUIDES.map(guide => ({ slug: guide.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const guide = ROOF_WATCH_GUIDES.find(entry => entry.slug === slug)
  if (!guide) return {}
  return {
    title: guide.metaTitle,
    description: guide.description,
    alternates: { canonical: `/roof-watch/guides/${guide.slug}/` },
    openGraph: {
      type: 'article',
      title: guide.title,
      description: guide.description,
      url: `/roof-watch/guides/${guide.slug}/`,
      publishedTime: guide.datePublished,
      modifiedTime: guide.dateModified,
      images: [{ url: '/roof-watch-social-card.png', width: 1200, height: 630, alt: 'Homesrolo Roof Watch homeowner guide' }],
    },
    twitter: { card: 'summary_large_image', title: guide.title, description: guide.description, images: ['/roof-watch-social-card.png'] },
  }
}

export default async function RoofWatchGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = ROOF_WATCH_GUIDES.find(entry => entry.slug === slug)
  if (!guide) notFound()
  const others = ROOF_WATCH_GUIDES.filter(entry => entry.slug !== guide.slug)
  const canonical = `${SITE_ORIGIN}/roof-watch/guides/${guide.slug}/`
  const updatedLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${guide.dateModified}T12:00:00Z`))
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    mainEntityOfPage: canonical,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    image: [{
      '@type': 'ImageObject',
      url: `${SITE_ORIGIN}/roof-watch-social-card.png`,
      width: 1200,
      height: 630,
    }],
    citation: guide.sources.map(source => source.href),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    url: canonical,
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Roof Watch', item: `${SITE_ORIGIN}/roof-watch/` },
      { '@type': 'ListItem', position: 3, name: 'Guides', item: `${SITE_ORIGIN}/roof-watch/guides/` },
      { '@type': 'ListItem', position: 4, name: guide.title, item: canonical },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <section className="section">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span>{' '}
            <Link href="/roof-watch/guides/">Guides</Link> <span aria-hidden="true">/</span> {guide.eyebrow}
          </nav>
          <PageHeader eyebrow={guide.eyebrow} title={guide.title} lede={guide.description} />
          <p className="article-meta">Published by {SITE_NAME} | Updated <time dateTime={guide.dateModified}>{updatedLabel}</time> | Sources linked below</p>
          <div className="stack" style={{ '--stack-gap': '2.5rem', marginTop: '2rem' } as React.CSSProperties}>
            {guide.sections.map(section => (
              <section key={section.heading} className="prose">
                <h2>{section.heading}</h2>
                {section.body.map(paragraph => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
              </section>
            ))}
          </div>
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">Check Roof Watch availability</p>
            <p>Text your city and ZIP to see whether your address is currently served. We send the written program limits before you schedule.</p>
            <p style={{ marginTop: '1rem' }}><a className="btn btn--primary" href={ROOF_WATCH_SMS_URL}>Text ROOF WATCH</a></p>
          </div>
          <details className="source-drawer" style={{ marginTop: '2.5rem' }}>
            <summary>Sources checked for this guide</summary>
            <div className="prose">
              <p>These links support the safety, insurance, legal, and roof-performance details above. Rules, policies, and product guidance can change, so check the current source for your situation.</p>
              <ul className="source-list">
                {guide.sources.map(source => (
                  <li key={source.href}>
                    <a href={source.href} rel="noreferrer">{source.label}</a>
                    <span>{source.publisher}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <div className="prose" style={{ marginTop: '2rem' }}>
            <p>Keep reading: {others.map((entry, index) => (
              <span key={entry.slug}>
                <Link href={`/roof-watch/guides/${entry.slug}/`}>{entry.title}</Link>
                {index < others.length - 1 ? ' · ' : ''}
              </span>
            ))}</p>
            <p>Related planning: <Link href="/roof-watch/">Roof Watch program details</Link> · <Link href="/services/roofing/dfw/">DFW roofing guide</Link> · <Link href="/services/roofing/choose-a-contractor/">contractor checklist</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
