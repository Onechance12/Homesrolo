import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_ROOFING_SIGNIN_URL, HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Start a home project',
  description: 'Create a private Homesrolo home record for past, current, or planned work anywhere on the property.',
  canonical: '/professionals/',
})

export default function ProfessionalsPage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Whole-home project record"
            title="Start with the home, not a contractor list"
            lede="Create a private Homesrolo account, add the home, and record work that is planned, active, or already completed. Roofing has a deeper guided path, but it is one chapter in the home’s history."
          />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a className="btn btn--primary" href={HOMEOWNER_SIGNIN_URL}>
              Create my home account <span className="btn__arrow" aria-hidden="true">&rarr;</span>
            </a>
            <a className="btn btn--quiet" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start with a roof need</a>
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">How it starts</p>
            <h2>One short path from question to project</h2>
          </div>
          <ol className="chain">
            <li>
              <h3>Create your account</h3>
              <p>Use an email link. No contractor login and no public home profile.</p>
              <span className="provenance">private homeowner account</span>
            </li>
            <li>
              <h3>Add the home</h3>
              <p>Start the property record with a familiar name, a general area, and only the basic facts you know.</p>
              <span className="provenance">one home workspace</span>
            </li>
            <li>
              <h3>Record the project</h3>
              <p>Plan new work, track something underway, or backfill an older project across any part of the home.</p>
              <span className="provenance">whole-home project record</span>
            </li>
            <li>
              <h3>Keep the record</h3>
              <p>The project remains attached to the home. Secure documents, photos, and sharing will follow only after those features open.</p>
              <span className="provenance">files and sharing not live yet</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">The network</p>
              <h2>You ask Homesrolo for help. You do not shop a paid directory.</h2>
              <p>Homesrolo is the homeowner side of the network. The project starts with the home and its needs. The professional side remains separate, so a homeowner account never becomes a contractor CRM account.</p>
            </div>
            <div className="note">
              <strong>What happens next.</strong> The project is saved privately in the home workspace. Nothing is routed to a professional today; any future handoff must be narrow, reviewed, and separate from the rest of the home record.
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
