import Link from 'next/link'
import { type EducationalSection } from '../lib/content/education.ts'
import { HOMEOWNER_APP_ORIGIN, SITE_NAME, SITE_ORIGIN } from '../lib/site.ts'
import { PageHeader, Sections } from './Prose.tsx'

export type RoofingSource = {
  readonly label: string
  readonly href: string
  readonly publisher: string
}

export type RoofingRelatedLink = {
  readonly href: string
  readonly title: string
  readonly description: string
}

export function RoofingArticle({
  title,
  eyebrow,
  lede,
  quickAnswer,
  pathname,
  sections,
  sources,
  related,
  children,
}: {
  title: string
  eyebrow: string
  lede: string
  quickAnswer: string
  pathname: string
  sections: readonly EducationalSection[]
  sources: readonly RoofingSource[]
  related: readonly RoofingRelatedLink[]
  children?: React.ReactNode
}) {
  const canonical = `${SITE_ORIGIN}${pathname}`
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: lede,
    mainEntityOfPage: canonical,
    datePublished: '2026-08-12',
    dateModified: '2026-08-12',
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    citation: sources.map(source => source.href),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Roofing', item: `${SITE_ORIGIN}/services/roofing/` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <section className="section section--drafting">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><span aria-hidden="true">/</span>
            <Link href="/services/roofing/">Roofing</Link><span aria-hidden="true">/</span>
            <span aria-current="page">{title}</span>
          </nav>
          <PageHeader eyebrow={eyebrow} title={title} lede={lede} />
          <p className="article-meta">Published by Homesrolo | Updated August 12, 2026 | Sources linked below</p>
        </div>
      </section>

      <section className="answer-strip" aria-label="Quick answer">
        <div className="shell">
          <div className="answer-box">
            <p className="eyebrow">Quick answer</p>
            <p>{quickAnswer}</p>
          </div>
        </div>
      </section>

      {children}

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <Sections sections={sections} />
        </div>
      </section>

      <section className="section" aria-labelledby="roof-project-record">
        <div className="shell">
          <div className="grid grid--2" style={{ alignItems: 'start', gap: '3rem' }}>
            <div className="prose">
              <p className="eyebrow">The Homesrolo record</p>
              <h2 id="roof-project-record">Do not wait until the job is over to build the roof record</h2>
              <p>A roof is covered up as it is built. Once the shingles or panels are down, the deck repairs, underlayment, flashing, fasteners, and ventilation details are hard to verify. The useful record is built while the work is happening.</p>
              <p>Start the home and roof project in Homesrolo, then use the record as the project’s organizing point. The lasting roof history comes from the evidence collected along the way, not from a contractor folder that disappears when the job closes.</p>
              <p><a className="btn btn--primary" href={`${HOMEOWNER_APP_ORIGIN}/signin`}>Start my home record</a></p>
            </div>
            <div className="stack" style={{ '--stack-gap': '1rem' } as React.CSSProperties}>
              <article className="card">
                <p className="eyebrow">Before work</p>
                <h3 className="card__title">Define what is being bought</h3>
                <p>Save the roof measurement, every proposal, the signed scope, exact product names, insurance certificate, permit responsibility, payment terms, and written warranty promises.</p>
              </article>
              <article className="card">
                <p className="eyebrow">During work</p>
                <h3 className="card__title">Capture what will be covered</h3>
                <p>Keep dated photographs of tear-off, deck condition and repairs, underlayment, valleys, wall and chimney flashing, penetrations, ventilation, and the delivered product labels.</p>
              </article>
              <article className="card">
                <p className="eyebrow">At closeout</p>
                <h3 className="card__title">Collect proof, not promises</h3>
                <p>Keep the final invoice, proof of payment, permit and inspection result, change orders, cleanup confirmation, manufacturer registration, and the contractor’s workmanship warranty.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <details className="source-drawer">
            <summary>Sources checked for this guide</summary>
            <div className="prose">
              <p>These links support the factual details above. Prices, permit rules, products, and warranties can change, so open the current source before making a project decision.</p>
              <ul className="source-list">
                {sources.map(source => (
                  <li key={source.href}>
                    <a href={source.href} rel="noreferrer">{source.label}</a>
                    <span>{source.publisher}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="related-roofing">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">More roofing information</p>
            <h2 id="related-roofing">Related roofing guides</h2>
          </div>
          <div className="grid grid--3">
            {related.map(item => (
              <Link className="roofing-link-card" href={item.href} key={item.href}>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
