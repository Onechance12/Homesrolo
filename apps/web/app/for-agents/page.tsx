import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata: Metadata = {
  title: 'Homesrolo for real estate agents',
  description: 'A closing gift that keeps your name in the house: the home’s permanent record plus free yearly roof inspections for your client. Costs you nothing, works for years, and turns documented homes into easier listings.',
  alternates: { canonical: '/for-agents/' },
  openGraph: {
    title: 'The closing gift that’s still working in year five',
    description: 'Give your buyers their home’s permanent record and free yearly roof inspections, with your name attached. Homesrolo for real estate agents.',
    url: '/for-agents/',
  },
}

const PHONE_DISPLAY = '(817) 886-2418'
const AGENT_SMS = 'sms:+18178862418?&body=AGENT%20-%20I%27m%20a%20real%20estate%20agent%20and%20I%20want%20the%20details.'

const FAQ = [
  { question: 'What does this cost me or my client?', answer: 'Nothing. Roof Watch is a free program: free enrollment, a free professional roof inspection every year, a written photographed report, and small repairs included within written limits. The home record account is free too. There is no agent fee, no referral kickback, and nothing your client will ever be billed for behind your back.' },
  { question: 'Is this a CRM? Do I have to move my pipeline?', answer: 'No. Keep your CRM, your transaction software, your whole stack. Homesrolo manages something none of those tools touch: the truth about the house itself. Think of it as the layer under your tools, not a replacement for any of them.' },
  { question: 'Whose data is the home record?', answer: 'The homeowner’s. Always. Your client owns their reports and chooses what to release and share. That is exactly why the gift lands so well: you are not signing them up for marketing, you are handing them an asset. What you get is the association: you are the agent who set it up.' },
  { question: 'What exactly exists today, and what is coming?', answer: 'Today: your clients can enroll in Roof Watch by text with your name attached, their reports build in their own account, and homeowners can release records they choose to share. Coming: an agent view for the homes your clients choose to share with you, and listing-ready record exports. We would rather under-promise here and let the product catch up in public.' },
] as const

export default function ForAgentsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Homesrolo for real estate agents',
    description: 'A closing gift with a long tail: the home’s permanent record plus free yearly roof inspections, with the agent’s name attached.',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    url: `${SITE_ORIGIN}/for-agents/`,
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
            eyebrow="Homesrolo for real estate agents"
            title="The closing gift that’s still working in year five"
            lede="Wine gets drunk. Cutting boards get shoved in a cabinet. Here’s the other kind of closing gift: your client’s home gets its own permanent record and free yearly roof inspections, and your name is on the whole thing. It costs you nothing, and it’s still introducing you to their friends years from now."
          />
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Agents start here</p>
            <p>Text <strong>AGENT</strong> with your name and brokerage to <strong>{PHONE_DISPLAY}</strong>. You’ll get the how-it-works, the gift language for your closing packet, and a keyword your clients text so every enrollment traces back to you.</p>
            <p style={{ marginTop: '1rem' }}><a className="btn btn--primary" href={AGENT_SMS}>Text AGENT now</a></p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="fa-gift">
        <div className="shell">
          <div className="stack" style={{ '--stack-gap': '2.5rem' } as React.CSSProperties}>
            <section className="prose">
              <h2 id="fa-gift">The gift, from your client’s side of it</h2>
              <p>They close on the house. Somewhere in your closing packet is a card that says their agent set up two things: a private record for their new home, and a free professional roof inspection every year through Roof Watch. A vetted local roofer walks the roof annually, small stuff gets fixed free within written limits, and a photographed report files into an account the homeowner owns.</p>
              <p>Then the part that matters to you. Every year that report shows up, they remember who set it up. When the hail comes and their neighbor is arguing with an insurance adjuster from memory, your client pulls up dated photos. Guess whose name comes up at the barbecue.</p>
            </section>
            <section className="prose">
              <h2>Sell-side: the listing with receipts</h2>
              <p>A documented home is an easier sale, and every agent knows the moment that proves it: the inspection objection. When the buyer’s inspector flags the roof, a seller with a Homesrolo file answers with dated reports and photos instead of a shrug. Negotiations that usually take a week of dueling contractors get settled by paperwork that was sitting there all along.</p>
              <p>“This home comes with its records” is a listing line your competition can’t fake, because the records carry their own provenance: who did the work, when, released by the homeowner on purpose.</p>
            </section>
            <section className="prose">
              <h2>Why not just a binder app?</h2>
              <p>You may have gifted a home-binder app before. Nice idea, and mostly a folder: the homeowner uploads PDFs, the app sends reminders, everyone forgets about it by spring. Homesrolo is built the other way around. Records come from real work by identified companies, homeowners control what gets released, and the roof gets an actual professional on it every year. It’s the difference between a filing cabinet and a maintained, documented home. One of them holds value at resale.</p>
            </section>
            <section className="prose">
              <h2>Straight answers</h2>
            </section>
            {FAQ.map(item => (
              <section key={item.question} className="prose">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </section>
            ))}
          </div>
          <div className="answer-box" style={{ marginTop: '2.5rem' }}>
            <p className="kicker">One text, and your closing packet gets better</p>
            <p>Text <strong>AGENT</strong> with your name and brokerage to <strong>{PHONE_DISPLAY}</strong>.</p>
            <p style={{ marginTop: '1rem' }}>Curious what your clients get? See <Link href="/roof-watch/">Roof Watch</Link> and <Link href="/how-it-works/">how the home record works</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
