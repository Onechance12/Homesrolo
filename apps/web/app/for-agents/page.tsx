import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { AGENT_PHONE_DISPLAY, AGENT_SMS_URL, SITE_NAME, SITE_ORIGIN } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Homesrolo for real estate agents',
  description: 'Help buyers start a whole-home project history and a practical photo-checkup habit without replacing your real estate CRM.',
  canonical: '/for-agents/',
  socialTitle: 'A closing gift that does not end up in a cabinet',
  socialDescription: 'Help buyers start documenting their home and check Roof Watch availability. Homesrolo for real estate agents.',
})

const FAQ = [
  { question: 'What does this cost me or my client?', answer: 'There is currently no agent fee or Roof Watch enrollment fee. Annual inspections are offered at no charge for participating addresses, and the written limits are supplied before scheduling. Some minor maintenance may be included within those limits. There is no referral kickback or required contractor purchase.' },
  { question: 'Is this a CRM? Do I have to move my pipeline?', answer: 'No. Keep your CRM and transaction software. Homesrolo is for the homeowner’s private record and project history, not the agent’s pipeline.' },
  { question: 'Who controls the home record?', answer: 'The homeowner controls the account. An agent does not receive reports, project details, photo checkups, or account access. Never ask a client to forward a sign-in link.' },
  { question: 'What can my client use?', answer: 'A client can create a home workspace, record past, current, or planned work across the property, save repeatable photo checkups, keep notes on roof proposals, and text to check Roof Watch availability.' },
] as const

export default function ForAgentsPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Homesrolo for real estate agents',
    description: 'A practical closing gift: help a buyer start a private home record and check Roof Watch availability.',
    dateModified: '2026-08-23',
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
            lede="Help a buyer start a useful history for the whole home. It does not replace your CRM, publish the property, or give the agent access to the homeowner’s account."
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
              <p>They close on the house. In the packet is a simple note from you: open a Homesrolo account, add the home, record the projects you already know about, and take a few repeatable photos before the details fade.</p>
              <p>The project record accepts past, current, and planned work across roofing, interiors, HVAC, plumbing, electrical work, paint, gutters, appliances, landscaping, pools, pest care, and new construction. Roof Watch is an optional local field program, not the definition of Homesrolo.</p>
              <p>The report belongs with the homeowner’s records; it does not automatically come back to the agent. We will not promise that a closing gift creates a referral. The useful part is simpler: you helped the client start documenting the home before the next repair, storm, or sale.</p>
            </section>
            <section className="prose">
              <h2>Sell-side: the listing with receipts</h2>
              <p>When a buyer’s inspector flags the roof, a seller who kept dated reports, photos, repair receipts, product details, and warranties can answer with records instead of memory. That does not prevent another inspection or guarantee a smoother negotiation. It gives everyone the same starting facts.</p>
              <p>“This home comes with its records” is a useful listing sentence only when the records actually exist and the homeowner chooses what to provide. The new <Link href="/roof-watch/guides/selling-documented-home/">selling with roof documentation guide</Link> shows what belongs in that packet—and what it cannot prove.</p>
            </section>
            <section className="prose">
              <h2>A homeowner tool, not an agent database</h2>
              <p>The homeowner uses the account to keep home and project details. Homesrolo does not add the property to an agent dashboard, return the client’s activity to the referring agent, or turn the home into a lead. The value is helping the client begin a habit they can keep after closing.</p>
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
