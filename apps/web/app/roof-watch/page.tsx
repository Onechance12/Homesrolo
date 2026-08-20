import type { Metadata } from 'next'
import Link from 'next/link'
import { Illustration } from '../../components/Illustration.tsx'
import { PageHeader } from '../../components/Prose.tsx'
import {
  HOMEOWNER_ROOFING_SIGNIN_URL,
  ROOF_WATCH_PHONE_DISPLAY,
  ROOF_WATCH_SMS_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from '../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../lib/content/roof-watch-cities.ts'

export const metadata: Metadata = {
  title: 'Free annual roof inspections in North Texas',
  description: 'Check Roof Watch availability in North Texas. The free annual visit includes written findings, roof photos, and program limits shared before scheduling.',
  alternates: { canonical: '/roof-watch/' },
  openGraph: {
    title: 'Roof Watch — a free annual roof check in North Texas',
    description: 'Written findings, roof photos, and clearly stated limits for participating addresses in the current North Texas service area.',
    url: '/roof-watch/',
    images: [{ url: '/roof-watch-social-card.png', width: 1200, height: 630, alt: 'Homesrolo Roof Watch: a yearly roof check with the findings in writing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roof Watch — a free annual roof check in North Texas',
    description: 'Written findings, roof photos, and program limits shared before scheduling.',
    images: ['/roof-watch-social-card.png'],
  },
}

const YOURS = [
  {
    kind: 'frame' as const,
    title: 'A report you can keep',
    body: 'After a completed visit, you receive the written findings and available photos. Keep them with the rest of the home record and use them when you compare future work.',
  },
  {
    kind: 'roofline' as const,
    title: 'Useful beyond one visit',
    body: 'You may share the report with an insurer, builder, buyer, consultant, or contractor of your choice. The report records observations; it does not certify a roof or decide coverage.',
  },
  {
    kind: 'window' as const,
    title: 'No required future contract',
    body: 'A Roof Watch visit does not require you to award later work to the inspecting professional. Ask questions, seek another opinion, and keep the written copy provided to you.',
  },
] as const

const VISIT = [
  ['Shingles and field', 'Cracked, lifted, or missing shingles; granule loss; wear patterns by slope and sun exposure'],
  ['Flashing and penetrations', 'Visible condition at chimneys, vents, skylights, pipe boots, and wall transitions'],
  ['Sealants and fasteners', 'Dried or split sealant beads, exposed or backing-out fasteners, rubber boots on pipes'],
  ['Valleys, ridges, and edges', 'Debris-packed valleys, ridge cap condition, drip edge and starter integrity'],
  ['Gutters and drainage', 'Standing water signals, granule accumulation, overflow staining, downspout flow'],
  ['Weather-related changes', 'Visible changes documented without deciding cause, insurance coverage, or claim value'],
] as const

const FAQ = [
  { question: 'Is the Roof Watch visit free?', answer: 'The annual inspection is offered at no charge for participating addresses. Current availability and the written program limits are sent before scheduling. Some minor maintenance may be included within those limits; anything outside them requires separate authorization.' },
  { question: 'What do I receive after the visit?', answer: 'You receive written findings and the photos available from the completed inspection. Keep that copy with your home records and share it with any professional you choose. It is an observation report, not a roof certification, warranty, or insurance decision.' },
  { question: 'What minor maintenance may be included?', answer: 'The written limits sent before scheduling define it. Depending on the roof and safe access, examples may include a small sealant or exposed-fastener correction. Material-specific work, uncertain conditions, and larger repairs are outside a routine visit unless separately explained and authorized.' },
  { question: 'What happens if the inspection finds something larger?', answer: 'The report should identify the location, include a photo when conditions allow, and explain the recommended next step. You can take that information to any qualified company you trust and compare opinions or bids.' },
  { question: 'Who comes to the house?', answer: 'The coordinator identifies the roofing professional assigned to the visit before the appointment. Ask for the company name, the person who will inspect, the observation method, and any current business or insurance evidence that applies. Homesrolo does not make a blanket verification claim.' },
  { question: 'How often is Roof Watch offered?', answer: 'Roof Watch is designed as a yearly visit. A separate inspection may be appropriate after severe weather, a leak, or a material change. If damage is possible, follow your policy and contact your insurer promptly; do not wait for the annual visit.' },
  { question: 'Does Roof Watch handle insurance claims?', answer: 'No. Roof Watch documents visible roof condition. It does not file, negotiate, or adjust claims, decide coverage, or promise an insurance result. Questions about a possible claim belong with your insurer or another appropriately licensed adviser.' },
  { question: 'Which cities are in the current service area?', answer: 'Roof Watch is checking availability in Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth. Coverage is confirmed by address because scheduling and service boundaries can change.' },
] as const

export default function RoofWatchPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Roof Watch',
    serviceType: 'Free annual residential roof inspection program',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: ROOF_WATCH_CITIES.map(city => ({ '@type': 'City', name: `${city.name}, TX` })),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free annual inspection at participating addresses, with written program limits sent before scheduling.' },
    url: `${SITE_ORIGIN}/roof-watch/`,
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ alignItems: 'start', gap: '3rem' }}>
            <PageHeader
              eyebrow="Roof Watch · Free annual roof inspections · North Texas"
              title="Check the roof once a year. Keep the report."
              lede="Roof Watch offers a free annual visit at participating North Texas addresses. We photograph what is visible, explain what may need attention, and put the findings in writing."
            />
            <div className="answer-box">
              <p className="kicker">Check your address before you schedule</p>
              <p>Text <strong>ROOF WATCH</strong>, your city, and your ZIP to <strong>{ROOF_WATCH_PHONE_DISPLAY}</strong>. We will reply with current service availability and the written program limits. No roof visit is booked until you have those details.</p>
              <p style={{ marginTop: '1rem' }}>
                <a className="btn btn--primary" href={ROOF_WATCH_SMS_URL}>Text to check availability</a>{' '}
                <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start a private roof project</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-yours">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">What you receive</p>
            <h2 id="rw-yours">The visit should leave something useful behind</h2>
            <p>A verbal opinion is hard to compare a year later. Roof Watch is built around a written report that identifies the roof areas observed, includes photos when conditions allow, and separates ordinary maintenance from items that need a closer evaluation.</p>
          </div>
          <div className="grid grid--2">
            {YOURS.map(item => (
              <div key={item.title} className="card">
                <Illustration kind={item.kind} />
                <h3 className="card__title">{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-visit">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">What the yearly visit covers</p>
            <h2 id="rw-visit">A roof-system check, with access limits stated</h2>
            <p>The assigned roofing professional examines the areas that can be reached safely and documents any limits. The report names the date, observer, roof areas, findings, and photographs available from the visit.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th>Inspected</th><th>What the report documents</th></tr></thead>
              <tbody>
                {VISIT.map(([area, detail]) => (
                  <tr key={area}><th>{area}</th><td>{detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="prose" style={{ marginTop: '2rem' }}>
            <p>Some minor maintenance may be included within the written limits shared before scheduling. Safe access, roof material, and the actual condition determine what can be handled during a routine visit. Larger, uncertain, or material-specific work is documented for separate evaluation rather than performed without authorization.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-why">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Why it costs nothing</p>
            <h2 id="rw-why">Why Homesrolo is testing a free annual program</h2>
            <p>{SITE_NAME} is being built around durable home records. Roof Watch applies that idea to a part of the house that is difficult to see and easy to forget between storms. A consistent inspection format also gives homeowners and roofing professionals a clearer starting point for future maintenance.</p>
            <p>The annual visit is offered without a membership fee at participating addresses. Availability, who performs the visit, any included maintenance, and the service limits are provided in writing before scheduling. You are not required to hire that professional for later work.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-cities">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Service area</p>
            <h2 id="rw-cities">Roof Watch across North Texas</h2>
            <p>Six cities, their surrounding neighborhoods, and a local page for each one, because a Southlake roof and a Fairmount bungalow are not living the same life:</p>
          </div>
          <div className="grid grid--2">
            {ROOF_WATCH_CITIES.map(city => (
              <div key={city.slug} className="card">
                <h3 className="card__title"><Link href={`/roof-watch/${city.slug}/`}>Free roof inspections in {city.name}</Link></h3>
                <p>{city.county} · {city.cardSummary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-faq">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Straight answers</p>
            <h2 id="rw-faq">Roof Watch, question by question</h2>
          </div>
          <div className="stack" style={{ '--stack-gap': '2rem' } as React.CSSProperties}>
            {FAQ.map(item => (
              <section key={item.question} className="prose">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </section>
            ))}
          </div>
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">Check current availability</p>
            <p>Text <strong>ROOF WATCH</strong>, your city, and your ZIP to <strong>{ROOF_WATCH_PHONE_DISPLAY}</strong>. We will send the current service answer and written limits before you decide whether to schedule.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={ROOF_WATCH_SMS_URL}>Text to check availability</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start a private roof project</a>
            </p>
            <p style={{ marginTop: '1rem' }}>Not ready to contact anyone? Start with the <Link href="/roof-watch/guides/roof-inspection-report/">inspection-report checklist</Link>, the <Link href="/roof-watch/guides/">Roof Watch guides</Link>, or the <Link href="/services/roofing/">Texas roofing guide</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
