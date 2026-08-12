import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, Sections } from '../../../components/Prose.tsx'
import { CONSTITUTION_DISCLOSURES, ROOFING_GUIDE } from '../../../lib/content/education.ts'
import { SITE_NAME, SITE_ORIGIN } from '../../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Texas roofing guide: costs, materials, contractors, and DFW rules',
  description: 'Independent homeowner roofing guides for Texas and Dallas–Fort Worth: roof replacement cost, materials, contractor checks, permits, storm records, and warranties.',
  alternates: { canonical: '/services/roofing/' },
  openGraph: {
    title: 'Texas roofing guide for homeowners',
    description: 'Understand roof costs, materials, contractors, local permits, and the records worth keeping in DFW and across Texas.',
    url: '/services/roofing/',
  },
}

const GUIDES = [
  {
    href: '/services/roofing/cost/',
    title: 'Roof replacement cost in Texas',
    body: 'How roof area, material, pitch, tear-off, decking, flashing, ventilation, and permits shape the price.',
  },
  {
    href: '/services/roofing/materials/',
    title: 'Roofing materials for North Texas',
    body: 'A clear comparison of architectural shingles, impact-resistant products, metal, tile, and the hidden assembly.',
  },
  {
    href: '/services/roofing/choose-a-contractor/',
    title: 'How to choose a roofing contractor',
    body: 'Identity, insurance, scope, references, warranties, permit responsibility, and Texas insurance boundaries.',
  },
] as const

const LOCAL_GUIDES = [
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', body: 'North Texas weather, city-by-city rules, and a durable roof record.' },
  { href: '/services/roofing/dallas/', title: 'Dallas roofing guide', body: 'Dallas permit context, bid comparison, and closeout records.' },
  { href: '/services/roofing/fort-worth/', title: 'Fort Worth roofing guide', body: 'When shingle work becomes permitted structural work in Fort Worth.' },
] as const

export default function RoofingGuidePage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Texas roofing guide for homeowners',
    url: `${SITE_ORIGIN}/services/roofing/`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN },
    hasPart: [...GUIDES, ...LOCAL_GUIDES].map(guide => ({
      '@type': 'Article',
      headline: guide.title,
      url: `${SITE_ORIGIN}${guide.href}`,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Texas homeowner roofing center"
            title="Roofing without the sales pitch"
            lede="Understand what a roof costs, what the materials actually mean, how to compare contractors, and which records protect the history of the home. Built first for Dallas–Fort Worth and Texas homeowners."
          />
          <div className="note" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            <strong>Independent education.</strong> Homesrolo does not sell roofing work, sell leads, or rank a company because it paid. The guides explain the process and cite the source.
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="roofing-start">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Start here</p>
            <h2 id="roofing-start">The three questions behind most roofing searches</h2>
          </div>
          <div className="grid grid--3">
            {GUIDES.map(guide => (
              <article className="card" key={guide.href}>
                <h3 className="card__title"><Link href={guide.href}>{guide.title}</Link></h3>
                <p>{guide.body}</p>
                <p style={{ marginTop: '1rem' }}><Link href={guide.href}>Read the guide →</Link></p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="eyebrow">Roofing basics</p>
            <h2>The job is an assembly, not just a shingle</h2>
          </div>
          <Sections sections={ROOFING_GUIDE} />
        </div>
      </section>

      <section className="section" aria-labelledby="local-guides">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Local roofing information</p>
            <h2 id="local-guides">Dallas–Fort Worth is one market with many local rules</h2>
            <p>Permits and contractor registration are handled by the jurisdiction attached to the property. These pages separate regional weather and pricing context from city-specific rules.</p>
          </div>
          <div className="grid grid--3">
            {LOCAL_GUIDES.map(guide => (
              <article className="card" key={guide.href}>
                <h3 className="card__title"><Link href={guide.href}>{guide.title}</Link></h3>
                <p>{guide.body}</p>
                <p style={{ marginTop: '1rem' }}><Link href={guide.href}>Open local guide →</Link></p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--night">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">The Homesrolo difference</p>
              <h2>A roof guide should end with a usable home record.</h2>
              <p>A future owner needs more than a star rating. The durable record is the exact product, installer, date, scope, permits, photographs, final invoice, and warranties—kept with the home.</p>
              <p><Link className="btn btn--quiet" href="/how-it-works/" style={{ borderColor: 'var(--night-rule)', color: 'var(--night-ink)' }}>See the Home Project Passport</Link></p>
            </div>
            <div className="note">
              <strong>Not a lead auction.</strong> The long-term directory is designed around sourced facts and homeowner-released project proof, not whoever pays most for the ZIP code.
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Where Homesrolo stops</h2>
            <ul style={{ color: 'var(--ink-soft)', paddingLeft: '1.15rem' }}>
              {CONSTITUTION_DISCLOSURES.map(line => <li key={line} style={{ marginBottom: '0.45rem' }}>{line}</li>)}
              <li style={{ marginBottom: '0.45rem' }}>Homesrolo is not an engineering firm and does not assess the condition of a structure.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
