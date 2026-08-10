import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { VERIFY_PRINCIPLES } from '../../lib/content/education.ts'
import { VERIFICATION_DIMENSIONS, NO_BLANKET_VERIFICATION_NOTICE } from '../../lib/directory/public-profile.v1.ts'
import { DIMENSION_LABELS } from '../../lib/directory/projection.ts'

export const metadata = {
  title: 'How we verify',
  description:
    'Homesrolo publishes no overall verified badge. Five dimensions are checked and displayed separately, each '
    + 'with its status, source, and the date it was checked.',
}

const DIMENSION_NOTES: Record<string, string> = {
  business_identity: 'Does a registered business entity matching this name exist?',
  license_jurisdiction: 'What licence is held, issued by whom, covering which trades and which places?',
  insurance: 'What cover was evidenced, by which insurer certificate, and through what period?',
  project_proof: 'Has a homeowner released a project record naming this company? This is the one dimension that cannot be self-asserted.',
  review_provenance: 'Where does any review come from, and is it tied to a released project?',
}

export default function HowWeVerifyPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Trust"
            title="Five facts, each with a source and a date."
            lede="A single verified badge is the most convenient thing a directory can publish and the least
              honest. It hides which part was checked and how long ago."
          />
          <div className="note" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            {NO_BLANKET_VERIFICATION_NOTICE}
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <h2>The five dimensions</h2>
            <p>Each is checked and displayed on its own. A gap in one is not a verdict on the rest.</p>
          </div>
          <div className="grid grid--2">
            {VERIFICATION_DIMENSIONS.map(dimension => (
              <article key={dimension} className="card">
                <h3 className="card__title">{DIMENSION_LABELS[dimension]}</h3>
                <p>{DIMENSION_NOTES[dimension]}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <Sections sections={VERIFY_PRINCIPLES} />
          <hr className="divider" />
          <div className="prose">
            <h2>Corrections and disputes</h2>
            <p>
              A record about a business can be wrong, and a directory with no route to fix it is a liability to
              everyone in it. A correction process is a launch requirement rather than a later addition: a company
              will be able to contest a fact, the contested state will be visible while it is reviewed, and the
              outcome will carry its own date and source like any other fact.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn--quiet" href="/professionals/">See how a listing reads</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
