import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '../../../components/Prose.tsx'
import { HOMEOWNER_ROOFING_SIGNIN_URL, SITE_NAME, SITE_ORIGIN } from '../../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../../lib/content/roof-watch-cities.ts'

const PHONE_DISPLAY = '(817) 886-2418'
const PHONE_SMS = 'sms:+18178862418?&body=ROOF%20WATCH%20-%20I%20want%20to%20enroll%20my%20home.'

export function generateStaticParams() {
  return ROOF_WATCH_CITIES.map(city => ({ city: city.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: citySlug } = await params
  const city = ROOF_WATCH_CITIES.find(entry => entry.slug === citySlug)
  if (!city) return {}
  return {
    title: `Free roof inspection in ${city.name}, TX — Roof Watch`,
    description: `${city.lede.split('. ')[0]}.`,
    alternates: { canonical: `/roof-watch/${city.slug}/` },
    openGraph: {
      title: city.headline,
      description: city.lede,
      url: `/roof-watch/${city.slug}/`,
    },
  }
}

export default async function RoofWatchCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: citySlug } = await params
  const city = ROOF_WATCH_CITIES.find(entry => entry.slug === citySlug)
  if (!city) notFound()
  const others = ROOF_WATCH_CITIES.filter(entry => entry.slug !== city.slug)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Roof Watch — ${city.name}`,
    serviceType: 'Free annual residential roof inspection and maintenance program',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: { '@type': 'City', name: `${city.name}, TX` },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: `${SITE_ORIGIN}/roof-watch/${city.slug}/`,
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: city.faqTwist.question, acceptedAnswer: { '@type': 'Answer', text: city.faqTwist.answer } }],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="section">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span> {city.name}
          </nav>
          <PageHeader eyebrow={`Roof Watch · ${city.name}, Texas · ${city.county}`} title={city.headline} lede={city.lede} />
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Enroll by text</p>
            <p>Text <strong>ROOF WATCH {city.name.toUpperCase()}</strong> to <strong>{PHONE_DISPLAY}</strong> — a coordinator replies the same day. Free enrollment, free yearly inspection, and the written report lives in your own account.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={PHONE_SMS}>Text ROOF WATCH now</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Or enroll online</a>
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
              <h2>Your report belongs to you — not to a roofing company</h2>
              <p>Every Roof Watch inspection in {city.name} is written into your own Homesrolo account: dated photographs, plain-language condition notes, and a record of anything repaired. It is your data. Show it to your insurer after a storm, hand it to any contractor for a bid, pass it to the buyer when you sell — or keep it to yourself. Cancel anytime and the entire history stays in your account.</p>
            </section>
            <section className="prose">
              <h2>{city.faqTwist.question}</h2>
              <p>{city.faqTwist.answer}</p>
            </section>
          </div>
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">One text starts it</p>
            <p>Text <strong>ROOF WATCH</strong> to <strong>{PHONE_DISPLAY}</strong>. Or read the full <Link href="/roof-watch/">Roof Watch program page</Link>.</p>
          </div>
          <div className="prose" style={{ marginTop: '2rem' }}>
            <p>Roof Watch also serves {others.map((entry, index) => (
              <span key={entry.slug}>
                <Link href={`/roof-watch/${entry.slug}/`}>{entry.name}</Link>
                {index < others.length - 2 ? ', ' : index === others.length - 2 ? ', and ' : ''}
              </span>
            ))}.</p>
          </div>
        </div>
      </section>
    </>
  )
}
