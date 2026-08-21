import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DocumentaryImage } from '../../../../components/DocumentaryImage.tsx'
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
      images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', width: 1200, height: 630, alt: 'Close field photo of architectural asphalt shingles' }],
    },
    twitter: { card: 'summary_large_image', title: guide.title, description: guide.description, images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', alt: 'Close field photo of architectural asphalt shingles' }] },
  }
}

const GUIDE_PHOTOS = {
  'hail-first-72-hours': {
    src: '/images/roof-watch/architectural-shingle-roof-condition.webp',
    width: 1200,
    height: 894,
    alt: 'Brown architectural asphalt shingles viewed across a roof slope',
    caption: 'Selected from the operator\'s archival roof-photo library. It is a documentation example, not an identified hail impact. A storm report should identify the roof area and state separately what the inspector observed.',
  },
  'roof-inspection-report': {
    src: '/images/roof-watch/roof-ridge-cap-and-vent-detail.webp',
    width: 1200,
    height: 900,
    alt: 'Close view of layered ridge-cap shingles and a vent-pipe penetration',
    caption: 'Selected from the operator\'s archival roof-photo library. A useful report pairs a detail like this with the roof slope, location, written observation, and any access limit.',
  },
  'texas-heat-roof': {
    src: '/images/roof-watch/round-attic-vent-and-shingle-field.webp',
    width: 1200,
    height: 900,
    alt: 'Round attic vent in a field of dark asphalt shingles',
    caption: 'Selected from the operator\'s archival roof-photo library. A round attic vent is one part of the system; the photo alone does not establish balanced attic ventilation or diagnose heat damage.',
  },
  'selling-documented-home': {
    src: '/images/roof-watch/roof-field-and-hip-ridge-detail.webp',
    width: 1200,
    height: 991,
    alt: 'Brown asphalt-shingle roof field with adjoining hip and ridge lines',
    caption: 'Selected from the operator\'s archival roof-photo library. A wide reference view can help later readers identify the roof area shown; it is not a current condition finding or a substitute for a buyer inspection.',
  },
} as const

export default async function RoofWatchGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = ROOF_WATCH_GUIDES.find(entry => entry.slug === slug)
  if (!guide) notFound()
  const guidePhoto = GUIDE_PHOTOS[guide.slug as keyof typeof GUIDE_PHOTOS]
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
      url: `${SITE_ORIGIN}${guidePhoto.src}`,
      width: 1200,
      height: guidePhoto.height,
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
          <figure className="article-field-photo">
            <DocumentaryImage
              src={guidePhoto.src}
              width={guidePhoto.width}
              height={guidePhoto.height}
              sizes="(max-width: 48rem) 100vw, 46rem"
              alt={guidePhoto.alt}
              priority
            />
            <figcaption>{guidePhoto.caption}</figcaption>
          </figure>
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
