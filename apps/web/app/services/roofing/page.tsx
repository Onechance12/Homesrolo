import Link from 'next/link'
import { PageHeader, Sections } from '../../../components/Prose.tsx'
import { CONSTITUTION_DISCLOSURES, ROOFING_GUIDE } from '../../../lib/content/education.ts'

export const metadata = {
  title: 'Roofing: a homeowner’s guide',
  description:
    'What a roof replacement generally involves, how estimates are typically structured, the terms that appear '
    + 'on roofing paperwork, and what tends to be worth recording.',
}

export default function RoofingGuidePage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Homeowner guide"
            title="Roofing, explained in general terms"
            lede="What the work usually involves, how estimates are normally built, and which details are worth
              writing down while you still have them."
          />
          <div className="note" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            <strong>This is general education.</strong> It describes how things commonly work and does not
            address any particular roof, policy, estimate, or claim.
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <Sections sections={ROOFING_GUIDE} />
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>Where Homesrolo stops</h2>
            <ul style={{ color: 'var(--ink-soft)', paddingLeft: '1.15rem' }}>
              {CONSTITUTION_DISCLOSURES.map(line => <li key={line} style={{ marginBottom: '0.45rem' }}>{line}</li>)}
              <li style={{ marginBottom: '0.45rem' }}>
                Homesrolo is not an engineering firm and does not assess the condition of a structure.
              </li>
            </ul>
            <p style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn--quiet" href="/how-it-works/">How a project becomes a record</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
