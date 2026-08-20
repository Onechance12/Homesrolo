import type { Metadata } from 'next'
import Link from 'next/link'
import { Illustration } from '../../components/Illustration.tsx'
import { PageHeader } from '../../components/Prose.tsx'
import { HOMEOWNER_ROOFING_SIGNIN_URL, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../lib/content/roof-watch-cities.ts'

export const metadata: Metadata = {
  title: 'Free roof inspections in North Texas — the Roof Watch program',
  description: 'Roof Watch is a free annual roof inspection program for North Texas homes: a professional roof checkup every year, a written condition report saved in your own account, and small roof repairs included in writing. Serving Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth, TX.',
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
    body: 'Enrolling creates your free Homesrolo account, and every inspection files into it: photos, condition notes, what got fixed, when, and by whom. We run the program. You own the paper trail.',
  },
  {
    kind: 'roofline' as const,
    title: 'It goes where you go',
    body: 'Show it to your insurance company after a hailstorm. Hand it to any contractor and make them bid against facts. Give it to the buyer when you sell. It is your document. You will never need our permission to use it.',
  },
  {
    kind: 'window' as const,
    title: 'Leave anytime, keep everything',
    body: 'Cancel whenever you like. Every report ever written about your roof stays in your account, full stop. The program is free, and your data was never the price of admission.',
  },
] as const

const VISIT = [
  ['Shingles and field', 'Cracked, lifted, or missing shingles; granule loss; wear patterns by slope and sun exposure'],
  ['Flashing and penetrations', 'Chimneys, vents, skylights, wall transitions: the places where real leaks actually start'],
  ['Sealants and fasteners', 'Dried or split sealant beads, exposed or backing-out fasteners, rubber boots on pipes'],
  ['Valleys, ridges, and edges', 'Debris-packed valleys, ridge cap condition, drip edge and starter integrity'],
  ['Gutters and drainage', 'Standing water signals, granule accumulation, overflow staining, downspout flow'],
  ['Storm evidence', 'Hail strikes and wind damage pinned down with dated photos, before and after storm season'],
] as const

const FAQ = [
  { question: 'Is Roof Watch really free?', answer: 'Yes. Really. Enrollment, the yearly inspection, the written report, and the small covered repairs all cost nothing. The written limits show up with your enrollment confirmation, before anyone climbs a ladder, so nothing gets defined after the fact.' },
  { question: 'Whose data is the inspection report?', answer: 'Yours. Not partly yours, not yours-with-an-asterisk. Every report files into your own Homesrolo account and stays there if you cancel, sell the house, or never spend a dollar with anybody. We operate the program. You own the history.' },
  { question: 'What counts as a small covered repair?', answer: 'The stuff a yearly look usually turns up: resealing exposed fasteners, a minor flashing correction, swapping a damaged shingle. Up to the written limits in your enrollment confirmation, fixed during or right after the visit, documented in your file next to the photo that found it.' },
  { question: 'What happens if the inspection finds something big?', answer: 'You get a written scope with photos: what it is, why it matters, what fixing it involves. What you will not get is a countdown timer, a today-only price, or a guy who refuses to leave the kitchen table. Take the scope to any company you trust. Or to none. The documentation itself is the deliverable.' },
  { question: 'Who actually shows up at my house?', answer: 'A verified roofing pro from the Homesrolo network serving your city. Homesrolo is not a roofing company wearing a disguise; it runs the program and keeps the records. Local contractors carry the inspections, and every report names exactly who was on your roof.' },
  { question: 'How often should a roof be inspected in North Texas?', answer: 'Once a year minimum, plus after any serious hail or wind. North Texas roofs live in one of the busiest hail corridors in the country. A documented annual look is how twenty-dollar problems stay twenty-dollar problems, and how storm damage gets proven instead of argued about.' },
  { question: 'Does this help with insurance claims?', answer: 'Not directly, and watch out for free programs that promise they will. Roof Watch files nothing for you. What it does is hand you the strongest thing a homeowner can bring to a claim: a dated, photographed history of the roof from before the storm. You bring the receipts. The rest is your call.' },
  { question: 'Which cities does Roof Watch serve?', answer: 'Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth, plus the neighborhoods around them. Close but not on the list? Text your city and zip. You get a straight yes or no the same day, from a person.' },
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
            title="Somebody should be looking at your roof. Every year. Free."
            lede="Roof Watch is a free maintenance program for North Texas homes. Once a year, a vetted local roofer walks your roof, writes down what they find, photographs it, and fixes the small stuff on the spot. The report lands in your own account, and it stays yours forever. Keller, Roanoke, Grapevine, Southlake, Flower Mound, Fort Worth. No contract. No pitch. Nobody circling your house with a ladder and an agenda."
          />
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Enroll by text. One message, done.</p>
            <p>Text <strong>ROOF WATCH</strong> and your city to <strong>{PHONE_DISPLAY}</strong>. A real coordinator texts back the same day, confirms your address, and books your inspection window. That is the entire signup. No forms with twelve required fields, no “someone will reach out.”</p>
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
            <h2 id="rw-yours">The inspection is free. The record is the point.</h2>
            <p>Any roofer will tell you what they found. Fewer will write it down, photograph it, and file it somewhere <em>you</em> control. That is the difference here: year after year, your actual roof, on the record, in your account. Not in some company’s CRM where it doubles as a call list.</p>
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
            <p>A vetted local pro walks the whole roof system and writes down what is actually up there. Plain language, photos, a date, and a name on it.</p>
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
            <p>The small stuff the inspection turns up, like a dried sealant bead, an exposed fastener, or one cracked shingle, gets handled free within the written program limits. The fix goes in your file right next to the finding. Bigger stuff becomes a written, photographed scope you can take to any company in Texas. Or to nobody. Your roof, your call.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-why">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Why it costs nothing</p>
            <h2 id="rw-why">The honest answer to “okay, what’s the catch?”</h2>
            <p>{SITE_NAME} exists to build homeowner-owned records of real homes. Roof Watch is how that record gets built for roofs. The local contractors who carry the inspections do it because a documented, well-kept roof is how a good company earns trust, and eventually real work, without ever knocking on your door uninvited. Everybody’s incentives face the same direction. Yours.</p>
            <p>You never have to hire anyone. There is no membership tier, no card on file, no fine print where “free” quietly grows an asterisk. The written limits show up before your first inspection, and the reports are yours no matter what.</p>
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
            <p>Text <strong>ROOF WATCH</strong> and your city to <strong>{PHONE_DISPLAY}</strong>. Sixty seconds now, one less thing to wonder about every time the sky turns green.</p>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--primary" href={PHONE_SMS}>Text ROOF WATCH now</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Enroll online</a>
            </p>
            <p style={{ marginTop: '1rem' }}>Still in research mode? Fair. Start with the <Link href="/roof-watch/guides/">Roof Watch guides</Link> or the <Link href="/services/roofing/">Texas roofing guide</Link>, and come back the next time a thunderstorm makes you think about your roof.</p>
          </div>
        </div>
      </section>
    </>
  )
}
