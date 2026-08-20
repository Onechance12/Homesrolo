import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { HOMEOWNER_ROOFING_SIGNIN_URL, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Roof Watch: free yearly roof inspections in North Texas',
  description: 'Roof Watch is Homesrolo’s free residential roof maintenance program: a professional inspection every year, a written condition report in your home’s permanent file, and small repairs handled at no cost within written limits. Serving Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth.',
  alternates: { canonical: '/roof-watch/' },
  openGraph: {
    title: 'Roof Watch — a free yearly roof check, on the record',
    description: 'Free annual roof inspections and condition reports for North Texas homes, with small repairs included within written limits. Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth.',
    url: '/roof-watch/',
  },
}

const PHONE_DISPLAY = '(806) 678-0907'
const PHONE_TEL = 'tel:+18066780907'
const PHONE_SMS = 'sms:+18066780907?&body=ROOF%20WATCH%20-%20I%20want%20to%20enroll%20my%20home.'

const CITIES = ['Keller', 'Roanoke', 'Grapevine', 'Southlake', 'Flower Mound', 'Fort Worth'] as const

const STEPS = [
  {
    title: 'Enroll in a minute',
    body: 'Call, text, or start online. A coordinator confirms your address and sets your first inspection window. There is no cost and no contract, and you can leave the program at any time.',
  },
  {
    title: 'A vetted local roofer inspects every year',
    body: 'A professional from the Homesrolo network walks the roof, photographs its condition, and writes down what is actually there — in plain language, dated and signed.',
  },
  {
    title: 'The findings live in your home’s file',
    body: 'Every inspection becomes a dated, sourced report in your permanent Homesrolo home record. Small maintenance items the inspection surfaces are handled at no cost within the written program limits. Anything larger is documented as an honest written scope you can take anywhere — with no obligation to hire anyone.',
  },
] as const

const FAQ = [
  {
    question: 'Is Roof Watch really free?',
    answer: 'Yes. Enrollment, the yearly inspection, the written condition report, and small covered repairs cost nothing. Your enrollment confirmation lists the exact repair limits in writing before your first inspection.',
  },
  {
    question: 'What counts as a small covered repair?',
    answer: 'Routine maintenance items an inspection commonly surfaces — for example resealing exposed fasteners or minor flashing and shingle fixes — up to the written limits in your enrollment confirmation. Full replacements, structural work, and insurance claim work are never covered silently: they are documented as a separate written scope you are free to decline or take to any company.',
  },
  {
    question: 'Who shows up at my house?',
    answer: 'A verified roofing professional from the Homesrolo contractor network serving your city. Homesrolo is not one roofing company — it is the record layer and the program operator, and participating local contractors carry the inspections.',
  },
  {
    question: 'Which areas does Roof Watch serve?',
    answer: 'Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth, plus nearby North Texas neighborhoods. If you are close but not listed, text us your city and we will tell you honestly whether we can take the home.',
  },
] as const

export default function RoofWatchPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Roof Watch',
    serviceType: 'Residential roof inspection and maintenance program',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    areaServed: CITIES.map(city => ({ '@type': 'City', name: `${city}, TX` })),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free enrollment, free yearly inspection and written condition report, small repairs included within written program limits.' },
    url: `${SITE_ORIGIN}/roof-watch/`,
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Roof Watch · North Texas"
            title="A free yearly roof check, on the record"
            lede="Roof Watch is Homesrolo’s free maintenance program for North Texas homes: a professional inspection every year, a written condition report in your home’s permanent file, and small repairs handled at no cost within written limits. Serving Keller, Roanoke, Grapevine, Southlake, Flower Mound, and Fort Worth."
          />
          <div className="stack" style={{ '--stack-gap': '0.75rem', marginTop: '2rem' } as React.CSSProperties}>
            <p className="eyebrow">Enroll now — takes a minute</p>
            <p>
              <a className="btn btn--primary" href={PHONE_TEL}>Call {PHONE_DISPLAY}</a>{' '}
              <a className="btn" href={PHONE_SMS}>Text ROOF WATCH</a>{' '}
              <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Enroll online</a>
            </p>
            <p className="lede" style={{ fontSize: '0.95rem' }}>Texting is fastest: send the word and your city, and a coordinator replies the same day.</p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="rw-how">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">How it works</p>
            <h2 id="rw-how">Three steps, every year, in writing</h2>
          </div>
          <div className="stack" style={{ '--stack-gap': '2rem' } as React.CSSProperties}>
            {STEPS.map(step => (
              <section key={step.title} className="prose">
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="rw-why">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Why it costs nothing</p>
            <h2 id="rw-why">A maintained roof, a documented home, an honest introduction</h2>
            <p>Roof Watch is how {SITE_NAME} builds the thing it exists to build: durable, homeowner-controlled records of real homes, kept current by accountable local companies. Participating contractors carry the inspections because a documented, well-maintained roof is how they earn a homeowner’s trust — and future work — the right way: in writing, with no pressure and no obligation.</p>
            <p>You are never required to hire anyone. If an inspection surfaces something bigger than the program covers, you get a written scope with photographs, and the record stays yours whether you act on it, shop it, or sit on it.</p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="rw-faq">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Straight answers</p>
            <h2 id="rw-faq">Roof Watch questions</h2>
          </div>
          <div className="stack" style={{ '--stack-gap': '2rem' } as React.CSSProperties}>
            {FAQ.map(item => (
              <section key={item.question} className="prose">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </section>
            ))}
          </div>
          <div className="prose" style={{ marginTop: '2.5rem' }}>
            <p>
              <a className="btn btn--primary" href={PHONE_TEL}>Call {PHONE_DISPLAY}</a>{' '}
              <a className="btn" href={PHONE_SMS}>Text ROOF WATCH</a>
            </p>
            <p>Want the deeper background first? Read the <Link href="/services/roofing/">Texas roofing guide</Link> or see <Link href="/how-it-works/">how the home record works</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
