import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'For home service professionals',
  description: 'A practical record checklist for contractors and home service professionals working with a Homesrolo homeowner.',
  canonical: '/for-professionals/',
})

const HANDOFF = [
  {
    title: 'Before work starts',
    body: 'Put the business name, primary contact, written scope, exclusions, allowances, schedule, payment terms, and insurance information where the homeowner can review them.',
  },
  {
    title: 'When the scope changes',
    body: 'Describe the change, the reason, the price or allowance, and the schedule effect before doing the added work. A text message is better than silence; a clear written change is better than a scattered text thread.',
  },
  {
    title: 'While the work is open',
    body: 'Take useful progress photos, name products precisely, flag concealed conditions, and identify who approved each decision. Do not make the homeowner reconstruct the job from memory.',
  },
  {
    title: 'At closeout',
    body: 'Leave the final invoice, proof of payment, permit or inspection result when applicable, product details, care instructions, and both manufacturer and workmanship warranty terms.',
  },
] as const

export default function ForProfessionalsPage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="For home service professionals"
            title="Make your work easy for a homeowner to understand."
            lede="Homesrolo is not a contractor CRM and it does not sell leads. It gives the homeowner one place to remember the work. A clean handoff makes that record useful long after the crew leaves."
          />
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">The homeowner-ready handoff</p>
            <h2>Four moments that prevent most record problems</h2>
          </div>
          <div className="grid grid--2">
            {HANDOFF.map(item => (
              <article className="card" key={item.title}>
                <h3 className="card__title">{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">A simple standard</p>
              <h2>Good work deserves a good record.</h2>
              <p>A homeowner should be able to answer what was done, by whom, when, with which product, under what warranty, and what changed along the way. That applies to a roof, an air conditioner, a bathroom, a fence, or a two-hour service visit.</p>
              <p>Homesrolo keeps that history on the homeowner side. Professionals can continue using their own estimating, scheduling, and CRM systems.</p>
            </div>
            <div className="note">
              <strong>Keep the boundary clear.</strong> Never ask for a homeowner’s sign-in link or password. Creating a project inside Homesrolo does not send the project to a contractor or grant access to the home record.
            </div>
          </div>
          <p style={{ marginTop: '2.5rem' }}>
            <Link className="btn btn--primary" href="/home-projects/">See the homeowner project guide</Link>{' '}
            <Link className="btn btn--quiet" href="/guides/">Browse homeowner guides</Link>
          </p>
        </div>
      </section>
    </>
  )
}
