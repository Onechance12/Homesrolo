import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '../../../components/Prose.tsx'
import {
  HOMEOWNER_ROOFING_SIGNIN_URL,
  ROOF_WATCH_PHONE_DISPLAY,
  roofWatchSmsUrl,
  SITE_NAME,
  SITE_ORIGIN,
} from '../../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../../lib/content/roof-watch-cities.ts'

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
      title: city.headline,
      description: city.metaDescription,
      url: `/roof-watch/${city.slug}/`,
      images: [{ url: '/roof-watch-social-card.png', width: 1200, height: 630, alt: 'Homesrolo Roof Watch: a yearly roof check with the findings in writing' }],
    },
    twitter: { card: 'summary_large_image', title: city.headline, description: city.metaDescription, images: ['/roof-watch-social-card.png'] },
  }
}

export default async function RoofWatchCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: citySlug } = await params
  const city = ROOF_WATCH_CITIES.find(entry => entry.slug === citySlug)
  if (!city) notFound()
  const others = ROOF_WATCH_CITIES.filter(entry => entry.slug !== city.slug)
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
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">See whether Roof Watch serves your address</p>
            <p>Text your city and ZIP to <strong>{ROOF_WATCH_PHONE_DISPLAY}</strong>. We will send current availability and the program limits before you schedule.</p>
            <p style={{ marginTop: '1rem' }}><a className="btn btn--primary" href={smsUrl}>Text ROOF WATCH {city.name.toUpperCase()}</a></p>
            <p style={{ marginTop: '1rem' }}>Want to understand the visit first? Read <Link href="/roof-watch/guides/roof-inspection-report/">what belongs in a roof inspection report</Link> or the full <Link href="/roof-watch/">Roof Watch program page</Link>.</p>
          </div>
          <div className="prose" style={{ marginTop: '2rem' }}>
            <p>Roof Watch also serves {others.map((entry, index) => (
              <span key={entry.slug}>
                <Link href={`/roof-watch/${entry.slug}/`}>{entry.name}</Link>
                {index < others.length - 2 ? ', ' : index === others.length - 2 ? ', and ' : ''}
              </span>
            ))}. For broader project planning, use the <Link href="/services/roofing/dfw/">DFW roofing guide</Link>{city.slug === 'fort-worth' ? <> and the <Link href="/services/roofing/fort-worth/">Fort Worth roofing guide</Link></> : null}.</p>
          </div>
        </div>
      </section>
    </>
  )
}
