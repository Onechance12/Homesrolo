import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { FOR_PROFESSIONALS } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'For professionals',
  description:
    'What a released project record means for a company: proof instead of adjectives, no paid placement, no '
    + 'purchased verification, and no leads for sale.',
  canonical: '/for-professionals/',
})

const NOT_FOR_SALE = [
  'Paid placement or a ranking boost. Listings are ordered by name, and the ordering reads nothing else.',
  'Purchased verification. No payment can create, upgrade, or accelerate a fact.',
  'Leads or referrals. Homesrolo does not sell introductions and does not take a fee for routing work.',
  'Review manipulation. Homesrolo publishes no reviews yet, and when it does they will be tied to released projects.',
]

export default function ForProfessionalsPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="For professionals"
            title="Proof outlasts marketing."
            lede="A released project names the materials, the dates, and the homeowner who chose to publish it.
              That is a different kind of claim from a page of adjectives."
          />
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <Sections sections={FOR_PROFESSIONALS} />
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div className="prose">
              <h2>What is not for sale</h2>
              <ul style={{ color: 'var(--ink-soft)', paddingLeft: '1.15rem' }}>
                {NOT_FOR_SALE.map(line => <li key={line} style={{ marginBottom: '0.6rem' }}>{line}</li>)}
              </ul>
              <p>
                If sponsored placement ever exists, it will be labelled as such and kept out of neutral ordering.
                That is a commitment about structure, not a promise about intentions.
              </p>
            </div>
            <div className="stack" style={{ '--stack-gap': '1rem' } as React.CSSProperties}>
              <div className="note">
                <strong>Regulated professionals are a separate lane.</strong> Public adjusters and other licensed
                claim professionals cannot be mixed into ordinary contractor listings or into any compensated
                steering, and that lane needs its own review before it exists.
              </div>
              <div className="note">
                <strong>Your work product stays yours.</strong> A homeowner releasing a project does not hand
                over your files. The release names what was published and nothing else.
              </div>
              <div className="note">
                <strong>The professional side is not live.</strong> Professional sign-up, profile claiming,
                and professional accounts are not available yet. Homeowner accounts and private roof projects
                are a separate live system.
              </div>
            </div>
          </div>
          <p style={{ marginTop: '2.5rem' }}>
            <Link className="btn btn--quiet" href="/how-we-verify/">How verification works</Link>
          </p>
        </div>
      </section>
    </>
  )
}
