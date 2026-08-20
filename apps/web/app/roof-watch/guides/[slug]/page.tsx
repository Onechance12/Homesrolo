import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '../../../../components/Prose.tsx'
import { SITE_NAME, SITE_ORIGIN } from '../../../../lib/site.ts'
import { ROOF_WATCH_GUIDES } from '../../../../lib/content/roof-watch-guides.ts'

const PHONE_SMS = 'sms:+18178862418?&body=ROOF%20WATCH%20-%20I%20want%20to%20enroll%20my%20home.'

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
    openGraph: { title: guide.title, description: guide.description, url: `/roof-watch/guides/${guide.slug}/` },
  }
}

export default async function RoofWatchGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = ROOF_WATCH_GUIDES.find(entry => entry.slug === slug)
  if (!guide) notFound()
  const others = ROOF_WATCH_GUIDES.filter(entry => entry.slug !== guide.slug)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    author: { '@type': 'Organization', name: `${SITE_NAME} Roof Watch team` },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    url: `${SITE_ORIGIN}/roof-watch/guides/${guide.slug}/`,
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span>{' '}
            <Link href="/roof-watch/guides/">Guides</Link> <span aria-hidden="true">/</span> {guide.eyebrow}
          </nav>
          <PageHeader eyebrow={guide.eyebrow} title={guide.title} lede={guide.description} />
          <div className="stack" style={{ '--stack-gap': '2.5rem', marginTop: '2rem' } as React.CSSProperties}>
            {guide.sections.map(section => (
              <section key={section.heading} className="prose">
                <h2>{section.heading}</h2>
                {section.body.map(paragraph => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
              </section>
            ))}
          </div>
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">Free yearly inspections, on the record</p>
            <p>Roof Watch puts a vetted local pro on your roof once a year and files the written report in your own account. <a className="btn btn--primary" href={PHONE_SMS} style={{ marginLeft: '0.5rem' }}>Text ROOF WATCH</a></p>
          </div>
          <div className="prose" style={{ marginTop: '2rem' }}>
            <p>Keep reading: {others.map((entry, index) => (
              <span key={entry.slug}>
                <Link href={`/roof-watch/guides/${entry.slug}/`}>{entry.title}</Link>
                {index < others.length - 1 ? ' · ' : ''}
              </span>
            ))}</p>
          </div>
        </div>
      </section>
    </>
  )
}
