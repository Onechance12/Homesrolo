import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { AGENT_PHONE_DISPLAY, AGENT_SMS_URL, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Homesrolo for real estate agents',
  description: 'Help clients start a private home Rolodex and check Roof Watch, its first field program—a practical closing gift that does not replace your CRM.',
  canonical: '/for-agents/',
  socialTitle: 'A closing gift that does not end up in a cabinet',
  socialDescription: 'Help buyers start documenting their home and check Roof Watch availability. Homesrolo for real estate agents.',
})

const FAQ = [
  { question: 'What does this cost me or my client?', answer: 'There is currently no agent fee or Roof Watch enrollment fee. Annual inspections are offered at no charge for participating addresses, and the written limits are supplied before scheduling. Some minor maintenance may be included within those limits. There is no referral kickback or required contractor purchase.' },
  { question: 'Is this a CRM? Do I have to move my pipeline?', answer: 'No. Keep your CRM and transaction software. Homesrolo is for the homeowner’s private record and project history, not the agent’s pipeline.' },
  { question: 'Who controls the home record?', answer: 'The homeowner controls the private account. An agent does not automatically receive reports, project details, or account access. Homeowner-controlled sharing is a later feature, not something we claim is live today.' },
  { question: 'What exactly exists today, and what is coming?', answer: 'Today, a client can create a private Homesrolo account, record past, current, or planned work across the home, compare roof proposals, and text to check Roof Watch availability. Secure file uploads, homeowner-controlled sharing, an agent view, and listing-ready exports are still coming.' },
] as const

export default function ForAgentsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Homesrolo for real estate agents',
    description: 'A practical closing gift: help a buyer start a private home record and check Roof Watch availability.',
    dateModified: '2026-08-21',
    isAccessibleForFree: true,
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
            title="A closing gift that doesn’t end up in a cabinet"
            lede="Help a buyer start a private home Rolodex and check Roof Watch availability. Roofing is the first field program under a broader record for the home—not the limit of Homesrolo. It does not require moving your CRM or give the agent automatic access to homeowner data."
          />
          <div className="answer-box" style={{ marginTop: '2rem' }}>
            <p className="kicker">Agents start here</p>
            <p>Text <strong>AGENT</strong> with your name and brokerage to <strong>{AGENT_PHONE_DISPLAY}</strong>. We’ll send the current program details and simple language for your closing packet. If a client follows up, have them include your name so we know who introduced them.</p>
            <p style={{ marginTop: '1rem' }}><a className="btn btn--primary" href={AGENT_SMS_URL}>Text AGENT now</a></p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="fa-gift">
        <div className="shell">
          <div className="stack" style={{ '--stack-gap': '2.5rem' } as React.CSSProperties}>
            <section className="prose">
              <h2 id="fa-gift">The gift, from your client’s side of it</h2>
              <p>They close on the house. In the packet is a simple note from you: open a private Homesrolo account, start the home record, and text to see whether Roof Watch serves the address. For participating addresses, the homeowner receives the written program limits before scheduling and receives the completed findings afterward. Photos are included when conditions allow.</p>
              <p>Roof Watch is the first useful example, not the entire idea. The private project record already accepts past, current, and planned work across roofing, interiors, HVAC, plumbing, electrical work, paint, gutters, appliances, and whatever comes next. Secure file storage and sharing across that history are still being built.</p>
              <p>The report belongs with the homeowner’s records; it does not automatically come back to the agent. We will not promise that a closing gift creates a referral. The useful part is simpler: you helped the client start documenting the home before the next repair, storm, or sale.</p>
            </section>
            <section className="prose">
              <h2>Sell-side: the listing with receipts</h2>
              <p>When a buyer’s inspector flags the roof, a seller who kept dated reports, photos, repair receipts, product details, and warranties can answer with records instead of memory. That does not prevent another inspection or guarantee a smoother negotiation. It gives everyone the same starting facts.</p>
              <p>“This home comes with its records” is a useful listing sentence only when the records actually exist and the homeowner chooses what to provide. The new <Link href="/roof-watch/guides/selling-documented-home/">selling with roof documentation guide</Link> shows what belongs in that packet—and what it cannot prove.</p>
            </section>
            <section className="prose">
              <h2>What it is—and what is not live yet</h2>
              <p>Today, the homeowner can create a private account, record past, current, or planned work across the home, compare roof proposals, and check Roof Watch availability by text. Secure uploads, homeowner-controlled sharing, an agent view, and listing-ready exports are not live yet. We are saying that plainly because a home record only works if the product is as honest as the records inside it.</p>
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
            <p>Text <strong>AGENT</strong> with your name and brokerage to <strong>{AGENT_PHONE_DISPLAY}</strong>.</p>
            <p style={{ marginTop: '1rem' }}>Curious what your clients get? See <Link href="/roof-watch/">Roof Watch</Link> and <Link href="/how-it-works/">how the home record works</Link>.</p>
          </div>
        </div>
      </section>
    </>
  )
}
