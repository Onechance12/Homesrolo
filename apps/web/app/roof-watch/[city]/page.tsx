import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DocumentaryImage } from '../../../components/DocumentaryImage.tsx'
import { PageHeader } from '../../../components/Prose.tsx'
import {
  HOMEOWNER_ROOFING_SIGNIN_URL,
  ROOF_WATCH_PHONE_DISPLAY,
  roofWatchSmsUrl,
  SITE_NAME,
  SITE_ORIGIN,
} from '../../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../../lib/content/roof-watch-cities.ts'

const CITY_PHOTOS = {
  keller: {
    src: '/images/roof-watch/roof-ridge-cap-and-vent-detail.webp',
    width: 1200,
    height: 900,
    alt: 'Close view of layered ridge-cap shingles and a vent-pipe penetration',
    caption: 'Ridge caps and a pipe penetration photographed up close. This image was selected from the operator\'s archival roof-photo library; it is not a Roof Watch finding.',
  },
  roanoke: {
    src: '/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp',
    width: 1200,
    height: 727,
    alt: 'Finished gray architectural-shingle roof with ridge caps and pipe penetrations',
    caption: 'A finished roof seen across several slopes and penetrations. This image was selected from the operator\'s archival roof-photo library; it is not a completed Roof Watch visit.',
  },
  grapevine: {
    src: '/images/roof-watch/laminated-shingle-ridge-detail.webp',
    width: 1200,
    height: 774,
    alt: 'Close view of laminated asphalt shingles and a ridge-cap line',
    caption: 'A close field photo preserves the ridge line and shingle courses better than a generic condition verdict. Archival example; not a Roof Watch inspection.',
  },
  southlake: {
    src: '/images/roof-watch/roof-tear-off-hidden-assembly.webp',
    width: 1200,
    height: 700,
    alt: 'Roof tear-off exposing spaced wood decking and remnants of old felt underlayment',
    caption: 'A tear-off can expose assembly details hidden below the finished roof. This archival photo is an example, not a Roof Watch visit or a finding about a Southlake home.',
  },
  'flower-mound': {
    src: '/images/roof-watch/roof-shingle-surface-detail.webp',
    width: 1200,
    height: 900,
    alt: 'Close view of a gray asphalt-shingle roof field',
    caption: 'A broad shingle-field view helps a later reader compare roof area and orientation. This archival photo is not evidence about a particular storm or home.',
  },
  'fort-worth': {
    src: '/images/roof-watch/roof-field-and-hip-ridge-detail.webp',
    width: 1200,
    height: 991,
    alt: 'Brown asphalt-shingle roof field with adjoining hip and ridge lines',
    caption: 'A view across adjoining slopes can anchor a report to the exact hip, ridge, and roof field observed. Archival example; not a Roof Watch finding.',
  },
} as const

export function generateStaticParams() {
  return ROOF_WATCH_CITIES.map(city => ({ city: city.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: citySlug } = await params
  const city = ROOF_WATCH_CITIES.find(entry => entry.slug === citySlug)
  if (!city) return {}
  return {
    title: `Free roof inspection: ${city.name}, TX`,
    description: city.metaDescription,
    alternates: { canonical: `/roof-watch/${city.slug}/` },
    openGraph: {
      type: 'website',
      title: city.headline,
      description: city.metaDescription,
      url: `/roof-watch/${city.slug}/`,
      images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', width: 1200, height: 630, alt: 'Close field photo of architectural asphalt shingles' }],
    },
    twitter: { card: 'summary_large_image', title: city.headline, description: city.metaDescription, images: [{ url: '/images/roof-watch/roof-watch-field-photos-social.jpg', alt: 'Close field photo of architectural asphalt shingles' }] },
  }
}

export default async function RoofWatchCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: citySlug } = await params
  const city = ROOF_WATCH_CITIES.find(entry => entry.slug === citySlug)
  if (!city) notFound()
  const cityPhoto = CITY_PHOTOS[city.slug as keyof typeof CITY_PHOTOS]
  const smsUrl = roofWatchSmsUrl(city.name)
  const canonical = `${SITE_ORIGIN}/roof-watch/${city.slug}/`
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Roof Watch — ${city.name}`,
    serviceType: 'Free annual residential roof inspection program',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: { '@type': 'City', name: `${city.name}, TX` },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Available at participating addresses after service-area confirmation.' },
    image: `${SITE_ORIGIN}${cityPhoto.src}`,
    url: canonical,
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: city.faqTwist.question, acceptedAnswer: { '@type': 'Answer', text: city.faqTwist.answer } }],
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Roof Watch', item: `${SITE_ORIGIN}/roof-watch/` },
      { '@type': 'ListItem', position: 3, name: city.name, item: canonical },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <section className="section">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span> {city.name}
          </nav>
          <PageHeader eyebrow={`Roof Watch · ${city.name}, Texas · ${city.county}`} title={city.headline} lede={city.lede} />
          <figure className="article-field-photo">
            <DocumentaryImage
              src={cityPhoto.src}
              width={cityPhoto.width}
              height={cityPhoto.height}
              sizes="(max-width: 48rem) 100vw, 46rem"
              alt={cityPhoto.alt}
              priority
            />
            <figcaption>{cityPhoto.caption}</figcaption>
          </figure>
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Check availability by text</p>
            <p>Text <strong>ROOF WATCH {city.name.toUpperCase()}</strong> and your ZIP to <strong>{ROOF_WATCH_PHONE_DISPLAY}</strong>. We will confirm whether your address is currently served and send the written program limits before scheduling.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={smsUrl}>Text to check availability</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start a private roof project</a>
            </p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="stack" style={{ '--stack-gap': '2.5rem' } as React.CSSProperties}>
            {city.local.map(block => (
              <section key={block.heading} className="prose">
                <h2>{block.heading}</h2>
                {block.body.map(paragraph => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
              </section>
            ))}
            <section className="prose">
              <h2>{city.faqTwist.question}</h2>
              <p>{city.faqTwist.answer}</p>
            </section>
          </div>
          {city.sources.length > 0 ? (
            <details className="source-drawer" style={{ marginTop: '2.5rem' }}>
              <summary>Sources checked for this local guide</summary>
              <div className="prose">
                <p>These links support the technical, safety, insurance, legal, or permit details above. Check the issuing source for current requirements.</p>
                <ul className="source-list">
                  {city.sources.map(source => (
                    <li key={source.href}>
                      <a href={source.href} rel="noreferrer">{source.label}</a>
                      <span>{source.publisher}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
          <div className="prose" style={{ marginTop: '2rem' }}>
            <h2>Before you schedule</h2>
            <p>Read <Link href="/roof-watch/guides/roof-inspection-report/">what belongs in a roof inspection report</Link>, then check the current service area and program limits on the <Link href="/roof-watch/">Roof Watch program page</Link>. For broader project planning, use the <Link href="/services/roofing/dfw/">DFW roofing guide</Link>{city.slug === 'fort-worth' ? <> and the <Link href="/services/roofing/fort-worth/">Fort Worth roofing guide</Link></> : null}.</p>
          </div>
        </div>
      </section>
    </>
  )
}
