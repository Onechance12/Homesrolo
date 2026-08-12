import Link from 'next/link'
import { type EducationalSection } from '../lib/content/education.ts'
import { SITE_NAME, SITE_ORIGIN } from '../lib/site.ts'
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

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ alignItems: 'start', gap: '2.5rem' }}>
            <div className="prose">
              <h2>Sources and further reading</h2>
              <p>We used the sources below for the facts on this page. Prices, permit rules, products, and warranties can change. Check the current source before starting work.</p>
              <ul className="source-list">
                {sources.map(source => (
                  <li key={source.href}>
                    <a href={source.href} rel="noreferrer">{source.label}</a>
                    <span>{source.publisher}</span>
                  </li>
                ))}
              </ul>
            </div>
            <aside className="note">
              <strong>About this guide.</strong> Homesrolo explains roofing terms, records, and common project steps. It does not inspect a roof, price a job, select a company, or advise on an insurance claim.
            </aside>
          </div>
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
