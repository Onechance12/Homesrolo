import Link from 'next/link'
import { PageHeader, Sections } from '../../../components/Prose.tsx'
import { ROOFING_GUIDE, ROOFING_QUICK_ANSWERS } from '../../../lib/content/education.ts'
import { publicPageMetadata } from '../../../lib/public-metadata.ts'
import { HOMEOWNER_ROOFING_SIGNIN_URL, SITE_NAME, SITE_ORIGIN } from '../../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Texas roofing guide: costs, materials, contractors, and DFW rules',
  description: 'Independent roofing information for Texas homeowners: roof replacement cost, materials, contractor checks, Dallas Fort Worth permits, storm records, and warranties.',
  canonical: '/services/roofing/',
  socialTitle: 'Texas roofing guide for homeowners',
  socialDescription: 'Understand roof costs, materials, contractors, local permits, and the records worth keeping in DFW and across Texas.',
})

const GUIDES = [
  {
    href: '/roof-watch/',
    title: 'Roof Watch: a free yearly roof check',
    body: 'Homesrolo\u2019s free North Texas maintenance program: an annual professional inspection, written findings provided to you, and some minor maintenance that may be included within written limits.',
  },
  {
    href: '/services/roofing/repair-or-replace/',
    title: 'Roof repair or replacement?',
    body: 'A condition-first framework for leaks, isolated damage, repeated problems, material matching, and written repairability evidence.',
  },
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
    dateModified: '2026-08-12',
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN },
    hasPart: [...GUIDES, ...LOCAL_GUIDES].map(guide => ({
      '@type': 'Article',
      headline: guide.title,
      url: `${SITE_ORIGIN}${guide.href}`,
    })),
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ROOFING_QUICK_ANSWERS.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Texas roofing help for homeowners"
            title="Understand the roof before you hire the roofer"
            lede="Straight answers about roof prices, materials, contractors, permits, storm paperwork, and the records worth keeping. We start with Dallas Fort Worth and Texas."
          />
          <div className="note" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            <strong>Built for the homeowner.</strong> Contractors and manufacturers do not pay to influence these guides. Important claims link to the source so you can check them.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
            <a className="btn btn--primary" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start my roof project</a>
            <Link className="btn btn--quiet" href="/professionals/">See how the project works</Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="roofing-situation">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Start with the real problem</p>
            <h2 id="roofing-situation">What brought you here today?</h2>
            <p>The right first step depends on whether the house is taking on water, a storm just passed, the roof is aging, or bids are already on the table.</p>
          </div>
          <div className="grid grid--2">
            <article className="card">
              <h3 className="card__title">Water is coming into the house</h3>
              <p>Protect people and belongings first. Photograph visible conditions from a safe place, record when the water appeared, and keep receipts for temporary protection. Do not climb onto a wet or damaged roof.</p>
              <p style={{ marginTop: '1rem' }}><a href="https://www.tdi.texas.gov/consumer/storms/recoverytips.html" rel="noreferrer">Texas storm recovery guidance</a></p>
            </article>
            <article className="card">
              <h3 className="card__title">A hail or wind storm just passed</h3>
              <p>Start a dated record before opinions pile up: ground-level photographs, interior water, fallen material, temporary work, and every inspection. Weather data and roof condition belong in the same file, but they are not the same proof.</p>
              <p style={{ marginTop: '1rem' }}><Link href="/services/roofing/dfw/">Use the DFW storm guide</Link></p>
            </article>
            <article className="card">
              <h3 className="card__title">The roof is old or keeps needing repair</h3>
              <p>Find the installation date, earlier invoices, repair photographs, product name, permit, and warranty. A repair-versus-replacement conversation is much more useful when the roof’s age and problem history are known.</p>
              <p style={{ marginTop: '1rem' }}><Link href="/services/roofing/repair-or-replace/">Use the repair-or-replace guide</Link></p>
            </article>
            <article className="card">
              <h3 className="card__title">You already have roofing bids</h3>
              <p>Ignore the totals for a moment. Put measurement, tear-off, wood price, exact products, flashing, ventilation, permit, payment, cleanup, and warranties into the same rows. Missing scope is not a discount.</p>
              <p style={{ marginTop: '1rem' }}><Link href="/services/roofing/cost/">Open the bid-comparison guide</Link></p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="roofing-start">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Start here</p>
            <h2 id="roofing-start">Start with cost, material, and contractor</h2>
          </div>
          <div className="grid grid--3">
            {GUIDES.map(guide => (
              <article className="card" key={guide.href}>
                <h3 className="card__title"><Link href={guide.href}>{guide.title}</Link></h3>
                <p>{guide.body}</p>
                <p style={{ marginTop: '1rem' }}><Link href={guide.href}>Read the guide</Link></p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="eyebrow">Roofing basics</p>
            <h2>What is included in a roof replacement?</h2>
          </div>
          <Sections sections={ROOFING_GUIDE} />
        </div>
      </section>

      <section className="section section--night" aria-labelledby="roofing-project-path">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="eyebrow">From question to home history</p>
            <h2 id="roofing-project-path">A roof project has four records, not one contract</h2>
          </div>
          <ol className="chain">
            <li><h3>Starting condition</h3><p>What was noticed, when it appeared, and dated photographs.</p><span className="provenance">The reason the project began</span></li>
            <li><h3>Inspection</h3><p>Observed conditions, limitations, photographs, and repair or replacement options.</p><span className="provenance">Evidence before sales</span></li>
            <li><h3>Scope and selection</h3><p>Measured quantity, exact assembly, price, contractor proof, and signed terms.</p><span className="provenance">What the homeowner bought</span></li>
            <li><h3>Installation and closeout</h3><p>Hidden-work photographs, changes, permit result, invoice, and warranties.</p><span className="provenance">What the home received</span></li>
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="roofing-answers">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Common questions</p>
            <h2 id="roofing-answers">Straight answers to common roofing questions</h2>
          </div>
          <div className="answer-grid">
            {ROOFING_QUICK_ANSWERS.map(item => (
              <article className="answer-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
                {item.href && item.source ? <p className="answer-card__source"><a href={item.href} rel="noreferrer">Source: {item.source}</a></p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="local-guides">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Local roofing information</p>
            <h2 id="local-guides">Dallas Fort Worth is one market with many local rules</h2>
            <p>Permits and contractor registration are handled by the jurisdiction attached to the property. These pages separate regional weather and pricing context from city-specific rules.</p>
          </div>
          <div className="grid grid--3">
            {LOCAL_GUIDES.map(guide => (
              <article className="card" key={guide.href}>
                <h3 className="card__title"><Link href={guide.href}>{guide.title}</Link></h3>
                <p>{guide.body}</p>
                <p style={{ marginTop: '1rem' }}><Link href={guide.href}>Open local guide</Link></p>
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
              <h2>A roof guide should end with a usable home record</h2>
              <p>A future owner needs the exact product, installer, date, scope, permits, photographs, final invoice, and warranties. Homesrolo starts that history with the home and the roof project, so later records have a clear place to belong.</p>
              <p><Link className="btn btn--quiet" href="/how-it-works/" style={{ borderColor: 'var(--night-rule)', color: 'var(--night-ink)' }}>See how the home record works</Link></p>
            </div>
            <div className="note">
              <strong>No contractor directory to sort through.</strong> Start with the home and the roof problem. Homesrolo organizes the request around the property instead of sending the homeowner through a public list of companies.
            </div>
          </div>
        </div>
      </section>

    </>
  )
}
