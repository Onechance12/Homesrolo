import type { Metadata } from 'next'
import Link from 'next/link'
import { Illustration } from '../../components/Illustration.tsx'
import { PageHeader } from '../../components/Prose.tsx'
import { HOMEOWNER_ROOFING_SIGNIN_URL, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../lib/content/roof-watch-cities.ts'

export const metadata: Metadata = {
  title: 'Roof Watch: free North Texas roof inspections',
  description: 'Free yearly roof inspections for North Texas homes — written reports you own, small repairs included. Keller, Roanoke, Grapevine, Southlake, Flower Mound, Fort Worth.',
  alternates: { canonical: '/roof-watch/' },
  openGraph: {
    title: 'Roof Watch — free yearly roof inspections, and the record is yours',
    description: 'A free annual roof inspection, a written condition report in your own account, and small repairs included in writing. Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth.',
    url: '/roof-watch/',
  },
}

const PHONE_DISPLAY = '(817) 886-2418'
const PHONE_SMS = 'sms:+18178862418?&body=ROOF%20WATCH%20-%20I%20want%20to%20enroll%20my%20home.'

const YOURS = [
  {
    kind: 'frame' as const,
    title: 'Your account, your roof file',
    body: 'Enrolling creates your free Homesrolo account, and every inspection is written into it: photographs, condition notes, what was repaired, when, by whom. Homesrolo runs the program — the record belongs to you.',
  },
  {
    kind: 'roofline' as const,
    title: 'It goes where you go',
    body: 'Show it to your insurance company after a hailstorm. Hand it to any contractor for a bid. Give it to a buyer when you sell. Your roof’s documented history is yours to use anywhere — no permission needed from us.',
  },
  {
    kind: 'window' as const,
    title: 'Leave anytime, keep everything',
    body: 'No contract and no strings: cancel enrollment whenever you like, and every report ever written about your roof stays in your account. The program is free; the data was never the price.',
  },
] as const

const VISIT = [
  ['Shingles and field', 'Cracked, lifted, or missing shingles; granule loss; wear patterns by slope and sun exposure'],
  ['Flashing and penetrations', 'Chimneys, vents, skylights, and wall transitions — where nearly all real leaks start'],
  ['Sealants and fasteners', 'Dried or split sealant beads, exposed or backing-out fasteners, rubber boots on pipes'],
  ['Valleys, ridges, and edges', 'Debris-packed valleys, ridge cap condition, drip edge and starter integrity'],
  ['Gutters and drainage', 'Standing water signals, granule accumulation, overflow staining, downspout flow'],
  ['Storm evidence', 'Hail strikes and wind damage documented with dated photos — before and after storm seasons'],
] as const

const FAQ = [
  { question: 'Is Roof Watch really free?', answer: 'Yes. Enrollment, the yearly professional inspection, the written condition report, and small covered repairs cost nothing. The written program limits arrive with your enrollment confirmation, before your first inspection — nothing is defined after the fact.' },
  { question: 'Whose data is the inspection report?', answer: 'Yours. Every report is written into your own Homesrolo account, and it stays yours if you cancel, sell, or never spend a dollar with anyone. Homesrolo operates the program; the roof’s history belongs to the homeowner.' },
  { question: 'What counts as a small covered repair?', answer: 'Routine maintenance items a yearly inspection commonly surfaces — resealing exposed fasteners, minor flashing corrections, replacing a damaged shingle — up to the written limits in your enrollment confirmation. They are fixed during or shortly after the visit and documented in your file.' },
  { question: 'What happens if the inspection finds something big?', answer: 'You get a written scope with photographs — what it is, why it matters, what fixing it involves. No pressure, no countdown timers, no “sign today” pricing. Take it to any company you trust, including nobody. The documentation is the deliverable.' },
  { question: 'Who actually shows up at my house?', answer: 'A verified roofing professional from the Homesrolo contractor network serving your city. Homesrolo is not one roofing company — it is the program operator and the record layer. Participating local contractors carry the inspections, and the report notes exactly who performed each one.' },
  { question: 'How often should a roof be inspected in North Texas?', answer: 'At least once a year, plus after any major hail or wind event. North Texas roofs live in one of the most active hail corridors in the country; annual documented inspections are how small maintenance items stay small, and how storm damage gets proven instead of argued.' },
  { question: 'Does this help with insurance claims?', answer: 'Indirectly, and powerfully: a dated, photographed history of your roof’s condition before a storm is the strongest evidence a homeowner can hold. Roof Watch is not a claims service and files nothing for you — it arms you with the record.' },
  { question: 'Which cities does Roof Watch serve?', answer: 'Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth, plus nearby North Texas neighborhoods. Close but not listed? Text your city and zip and you will get an honest answer the same day.' },
] as const

export default function RoofWatchPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Roof Watch',
    serviceType: 'Free annual residential roof inspection and maintenance program',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: ROOF_WATCH_CITIES.map(city => ({ '@type': 'City', name: `${city.name}, TX` })),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free enrollment, free yearly roof inspection, written condition report owned by the homeowner, small repairs included within written limits.' },
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
          <PageHeader
            eyebrow="Roof Watch · Free annual roof inspections · North Texas"
            title="Your roof, inspected free every year. Your report, in your account, forever."
            lede="Roof Watch is a free roof maintenance program for North Texas homes: a professional roof inspection every year, a written condition report with photos saved in your own Homesrolo account, and small repairs included in writing. Serving Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth — no contract, no obligation, no sales pitch."
          />
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Enroll by text — it takes one message</p>
            <p>Text <strong>ROOF WATCH</strong> and your city to <strong>{PHONE_DISPLAY}</strong>. A coordinator replies the same day, confirms your address, and sets your first inspection window. That’s the whole signup.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={PHONE_SMS}>Text ROOF WATCH now</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Or enroll online</a>
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-yours">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">The part nobody else offers</p>
            <h2 id="rw-yours">The inspection is free. The record is yours.</h2>
            <p>Every roofing company will tell you what they found. Roof Watch writes it down, photographs it, and files it in an account that belongs to <em>you</em> — building a year-over-year history of your actual roof that no company, including us, can take away.</p>
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
            <h2 id="rw-visit">A real inspection, not a drive-by</h2>
            <p>A vetted local roofing professional walks the full roof system and documents what is actually there — in plain language, with photographs, dated and attributed.</p>
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
            <p>Small maintenance items the inspection surfaces — a bead of sealant, an exposed fastener, a damaged shingle — are handled at no cost within the written program limits, and the fix is documented in your file alongside the finding. Larger findings become a written, photographed scope you can take to any company in Texas. Or to no one. Your roof, your call.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-why">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Why it costs nothing</p>
            <h2 id="rw-why">The honest answer to “what’s the catch?”</h2>
            <p>{SITE_NAME} exists to build durable, homeowner-owned records of real homes. Roof Watch is that mission wearing work boots: participating local contractors carry free inspections because a documented, well-maintained roof is how a good company earns trust — and eventually work — the right way: in writing, with no pressure, on your timeline.</p>
            <p>You are never required to hire anyone. There is no membership to upgrade, no card on file, and no fine print that turns “free” into “free at first.” The written limits arrive before your first inspection, and the reports are yours regardless.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-cities">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Service area</p>
            <h2 id="rw-cities">Roof Watch across North Texas</h2>
            <p>The program serves six cities and their surrounding neighborhoods, with local pages for each:</p>
          </div>
          <div className="grid grid--2">
            {ROOF_WATCH_CITIES.map(city => (
              <div key={city.slug} className="card">
                <h3 className="card__title"><Link href={`/roof-watch/${city.slug}/`}>Free roof inspections in {city.name}</Link></h3>
                <p>{city.county} · {city.lede.split('.')[0]}.</p>
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
            <p className="kicker">One text starts it</p>
            <p>Text <strong>ROOF WATCH</strong> and your city to <strong>{PHONE_DISPLAY}</strong>.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={PHONE_SMS}>Text ROOF WATCH now</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Enroll online</a>
            </p>
            <p style={{ marginTop: '1rem' }}>Want the deeper background first? Read the <Link href="/services/roofing/">Texas roofing guide</Link> or see <Link href="/how-it-works/">how the home record works</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
