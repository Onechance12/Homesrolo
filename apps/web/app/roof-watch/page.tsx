import type { Metadata } from 'next'
import Link from 'next/link'
import { DocumentaryImage } from '../../components/DocumentaryImage.tsx'
import { PageHeader } from '../../components/Prose.tsx'
import { RoofWatchLocationCheck } from '../../components/RoofWatchLocationCheck.tsx'
import {
  HOMEOWNER_ROOF_WATCH_SIGNIN_URL,
  ROOF_WATCH_PHONE_DISPLAY,
  ROOF_WATCH_SMS_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from '../../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../../lib/content/roof-watch-cities.ts'

export const metadata: Metadata = {
  title: 'Roof Watch availability in Texas and Oklahoma',
  description: 'Roof Watch is the roof check inside Homesrolo Home Watch. Check Texas and Oklahoma availability for a free annual visit with written findings and photos.',
  alternates: { canonical: '/roof-watch/' },
  openGraph: {
    type: 'website',
    title: 'Roof Watch availability in Texas and Oklahoma',
    description: 'The roof-specific check inside Homesrolo Home Watch, with written findings, available photos, and clearly stated limits in Texas and Oklahoma.',
    url: '/roof-watch/',
    images: [{ url: '/roof-watch-social-card.png', width: 1200, height: 630, alt: 'Roof Watch: a yearly roof check with the findings in writing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roof Watch availability in Texas and Oklahoma',
    description: 'The roof check inside Homesrolo Home Watch, with written findings, available photos, and limits shared before scheduling.',
    images: [{ url: '/roof-watch-social-card.png', alt: 'Roof Watch: a yearly roof check with the findings in writing' }],
  },
}

const YOURS = [
  {
    label: 'Written record',
    title: 'A report you can keep',
    body: 'You get the written findings and available photos. Save them with the home so next year’s check starts with something real.',
  },
  {
    label: 'Use it anywhere',
    title: 'Share it with anyone you choose',
    body: 'Show it to a contractor, insurer, builder, buyer, or consultant. It records what was visible; it does not certify the roof or decide coverage.',
  },
  {
    label: 'Your decision',
    title: 'No required follow-up contract',
    body: 'You do not have to award later work to the inspecting professional. Ask questions, get another opinion, and keep your copy.',
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

const FIELD_PHOTOS = [
  {
    src: '/images/roof-watch/roof-ridge-cap-and-vent-detail.webp',
    width: 1200,
    height: 900,
    alt: 'Close view of layered ridge-cap shingles and a vent-pipe penetration',
    caption: 'Ridge, transition, and vent views help a later reader understand exactly which roof area the written note describes.',
  },
  {
    src: '/images/roof-watch/round-attic-vent-and-shingle-field.webp',
    width: 1200,
    height: 900,
    alt: 'Round attic vent in a field of dark asphalt shingles',
    caption: 'Penetrations should be photographed with enough surrounding roof visible to make the location recognizable.',
  },
  {
    src: '/images/roof-watch/roof-tear-off-hidden-assembly.webp',
    width: 1200,
    height: 700,
    alt: 'Roof tear-off exposing spaced wood decking and remnants of old felt underlayment',
    caption: 'A tear-off can expose assembly details that are hidden after the roof is closed. That is why progress records matter.',
  },
  {
    src: '/images/roof-watch/laminated-shingle-ridge-detail.webp',
    width: 1200,
    height: 774,
    alt: 'Close view of laminated asphalt shingles and a ridge-cap line',
    caption: 'A close view can preserve course alignment and ridge-cap detail. It is a reference image, not a condition verdict.',
  },
] as const

const FAQ = [
  { question: 'How does Roof Watch fit into Home Watch?', answer: 'Home Watch is Homesrolo’s whole-home rhythm for checking, photographing, maintaining, and remembering the house over time. Roof Watch is its roof-specific professional visit. It contributes one dated roof record; it does not turn Homesrolo into a roofing company.' },
  { question: 'Is the Roof Watch visit free?', answer: 'The annual inspection is offered at no charge for participating addresses. Current availability and the written program limits are sent before scheduling. Some minor maintenance may be included within those limits; anything outside them requires separate authorization.' },
  { question: 'What do I receive after the visit?', answer: 'You receive written findings and the photos available from the completed inspection. Keep that copy with your home records and share it with any professional you choose. It is an observation report, not a roof certification, warranty, or insurance decision.' },
  { question: 'What minor maintenance may be included?', answer: 'The written limits sent before scheduling define it. Depending on the roof and safe access, examples may include a small sealant or exposed-fastener correction. Material-specific work, uncertain conditions, and larger repairs are outside a routine visit unless separately explained and authorized.' },
  { question: 'What happens if the inspection finds something larger?', answer: 'The report should identify the location, include a photo when conditions allow, and explain the recommended next step. You can take that information to any qualified company you trust and compare opinions or bids.' },
  { question: 'Who comes to the house?', answer: 'The coordinator identifies the roofing professional assigned to the visit before the appointment. Ask for the company name, the person who will inspect, the observation method, and any current business or insurance evidence that applies. Homesrolo does not make a blanket verification claim.' },
  { question: 'How often is Roof Watch offered?', answer: 'Roof Watch is designed as a yearly visit. A separate inspection may be appropriate after severe weather, a leak, or a material change. If damage is possible, follow your policy and contact your insurer promptly; do not wait for the annual visit.' },
  { question: 'Does Roof Watch handle insurance claims?', answer: 'No. Roof Watch documents visible roof condition. It does not file, negotiate, or adjust claims, decide coverage, or promise an insurance result. Questions about a possible claim belong with your insurer or another appropriately licensed adviser.' },
  { question: 'Can I check an address anywhere in Texas or Oklahoma?', answer: 'Yes. Text the city and ZIP for an address in Texas or Oklahoma. Availability is confirmed address by address because scheduling, safe access, and service boundaries can change. No visit is booked until the current answer and written limits are provided.' },
  { question: 'Which cities have detailed local pages?', answer: 'Homesrolo currently publishes detailed local Roof Watch pages for Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth. Those pages document established city routes in Texas; they do not limit where a Texas or Oklahoma homeowner can ask us to check availability.' },
] as const

export default function RoofWatchPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Roof Watch',
    serviceType: 'Free annual residential roof inspection program',
    category: 'Homesrolo Home Watch',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: [
      { '@type': 'State', name: 'Texas' },
      { '@type': 'State', name: 'Oklahoma' },
      ...ROOF_WATCH_CITIES.map(city => ({ '@type': 'City', name: `${city.name}, TX` })),
    ],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free annual inspection at participating addresses, with written program limits sent before scheduling.' },
    image: `${SITE_ORIGIN}/roof-watch-social-card.png`,
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
              eyebrow="Home Watch · Roofs · Texas + Oklahoma"
              title="Check the roof once a year. Keep the report."
              lede="Home Watch keeps the whole house on a repeatable care rhythm. Roof Watch is its roof-specific professional visit: at participating Texas and Oklahoma addresses, we photograph what is visible, explain what may need attention, and put the findings in writing. Availability is confirmed address by address."
            />
            <div className="answer-box">
              <p className="kicker">Check your address before you schedule</p>
              <p>Text <strong>ROOF WATCH</strong>, your city, and your ZIP to <strong>{ROOF_WATCH_PHONE_DISPLAY}</strong>. We will reply with current service availability and the written program limits. No roof visit is booked until you have those details.</p>
              <p style={{ marginTop: '1rem' }}>
                <a className="btn btn--primary" href={ROOF_WATCH_SMS_URL}>Text to check availability</a>{' '}
                <a className="btn btn--quiet" href={HOMEOWNER_ROOF_WATCH_SIGNIN_URL}>Start a private roof record</a>
              </p>
            </div>
          </div>
          <figure className="roof-watch-hero-photo">
            <DocumentaryImage
              src="/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp"
              width={1200}
              height={727}
              sizes="(max-width: 48rem) calc(100vw - 2.5rem), 42rem"
              priority
              alt="Finished gray architectural-shingle roof with ridge caps and pipe penetrations"
            />
            <figcaption><strong>From our field archive.</strong> A finished architectural-shingle roof. Every Roof Watch report is written for the home actually inspected.</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-field-photos">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">From the field-photo archive</p>
            <h2 id="rw-field-photos">What a roof record can actually show</h2>
            <p>These examples from our roof-photo archive show why location and context matter. A wide view tells you where you are; a close view preserves the detail. Every Roof Watch report is specific to the roof observed.</p>
          </div>
          <ul
            className="roof-photo-grid"
            tabIndex={0}
            aria-label="Roof field-photo examples. On a small screen, scroll horizontally to browse."
          >
            {FIELD_PHOTOS.map(photo => (
              <li key={photo.src}>
                <figure className="roof-photo">
                  <DocumentaryImage
                    src={photo.src}
                    width={photo.width}
                    height={photo.height}
                    sizes="(max-width: 40rem) 82vw, 50vw"
                    alt={photo.alt}
                  />
                  <figcaption>{photo.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-yours">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">What you receive</p>
            <h2 id="rw-yours">The visit should leave something useful behind</h2>
            <p>A verbal opinion is hard to compare a year later. Roof Watch is built around a written report that identifies the roof areas observed, includes photos when conditions allow, and separates ordinary maintenance from items that need a closer evaluation.</p>
          </div>
          <ol className="roof-watch-deliverables">
            {YOURS.map((item, index) => (
              <li key={item.title}>
                <span className="roof-watch-deliverables__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="roof-watch-deliverables__label">{item.label}</p>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-visit">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">What the yearly visit covers</p>
            <h2 id="rw-visit">A roof-system check, with access limits stated</h2>
            <p>The assigned roofing professional examines the areas that can be reached safely and documents any limits. The report lists the date, inspector, roof areas observed, and findings, and includes the photos available from the visit.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th scope="col">Inspected</th><th scope="col">What the report documents</th></tr></thead>
              <tbody>
                {VISIT.map(([area, detail]) => (
                  <tr key={area}><th scope="row">{area}</th><td>{detail}</td></tr>
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
            <p>{SITE_NAME} gives a home a durable project history. Roof Watch applies that idea to a part of the house that is difficult to see and easy to forget between storms. A consistent inspection format also gives homeowners and roofing professionals a clearer starting point for later maintenance.</p>
            <p>Roof Watch sits inside Home Watch, the whole-home system for repeated checkups, service records, and dated points of comparison. It is one chapter of the home record—not the definition of Homesrolo.</p>
            <p>The annual visit is offered without a membership fee at participating addresses. Availability, who performs the visit, any included maintenance, and the service limits are provided in writing before scheduling. You are not required to hire that professional for later work.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="rw-cities">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Service area</p>
            <h2 id="rw-cities">Check Roof Watch across Texas and Oklahoma</h2>
            <p>Service is checked area by area, not assumed from a state or city list. Tell us where the home is and we will confirm current availability, the assigned professional, and the written program limits before anything is scheduled.</p>
          </div>
          <RoofWatchLocationCheck />
          <details className="roof-watch-city-guides">
            <summary>
              <span>
                <small>Detailed city guides</small>
                <strong>Browse six researched Texas locations</strong>
              </span>
              <span className="roof-watch-city-guides__toggle" aria-hidden="true">+</span>
            </summary>
            <div className="roof-watch-city-guides__body">
              <p>You can check any Texas or Oklahoma city above. These six locations have additional local roofing conditions and reviewed sources—not just a city name added for search.</p>
              <ul>
                {ROOF_WATCH_CITIES.map(city => (
                  <li key={city.slug}>
                    <Link href={`/roof-watch/${city.slug}/`}>
                      <span><strong>{city.name}</strong><small>{city.county}</small></span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>
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
              <a className="btn btn--quiet" href={HOMEOWNER_ROOF_WATCH_SIGNIN_URL}>Start a private roof record</a>
            </p>
            <p style={{ marginTop: '1rem' }}>Not ready to contact anyone? Start with the <Link href="/roof-watch/guides/hail-first-72-hours/">sourced hail-response checklist</Link>, the <Link href="/roof-watch/guides/roof-inspection-report/">inspection-report checklist</Link>, or the <Link href="/services/roofing/">Texas roofing guide</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
