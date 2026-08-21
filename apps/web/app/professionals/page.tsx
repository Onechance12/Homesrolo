import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_ROOFING_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Start a roof project',
  description: 'Create a private Homesrolo home record and start a roofing project without browsing contractor listings.',
  canonical: '/professionals/',
})

export default function ProfessionalsPage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Roofing project"
            title="Start with your home, not a contractor list"
            lede="Create a private Homesrolo account, add the home, and tell us what the roof needs. Your home record becomes the starting point for the project and stays with the property."
          />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a className="btn btn--primary" href={HOMEOWNER_ROOFING_SIGNIN_URL}>
              Create my home account <span className="btn__arrow" aria-hidden="true">&rarr;</span>
            </a>
            <Link className="btn btn--quiet" href="/services/roofing/">Review the roofing guide</Link>
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
              <p>Start the property record with the address and the basic facts you know.</p>
              <span className="provenance">one home workspace</span>
            </li>
            <li>
              <h3>Open the roof project</h3>
              <p>Choose repair, replacement, inspection, or storm damage and tell us how soon you need help.</p>
              <span className="provenance">roof-specific request</span>
            </li>
            <li>
              <h3>Keep the record</h3>
              <p>The project remains attached to the home so documents, photos, products, and warranties can follow it.</p>
              <span className="provenance">built for the next owner too</span>
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
              <strong>What happens next.</strong> Your first roofing request is saved privately in your home workspace. Network routing will be introduced as a narrow, reviewed handoff; it will not expose the rest of your home record or silently create a contractor identity.
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
