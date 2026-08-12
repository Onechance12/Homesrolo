import Link from 'next/link'
import { CONSTITUTION_DISCLOSURES } from '../lib/content/education.ts'
import { HOMEOWNER_APP_ORIGIN } from '../lib/site.ts'

/**
 * The colophon is drawn as a drawing sheet's title block, because that is what
 * it is: the box in the corner that says who drew the sheet and under what
 * revision. The disclosures are not fine print here. They are the product's
 * boundary, and a homeowner reading a page about insurance terminology needs
 * them on the same page, not buried in a terms document they will never open —
 * so they get a ruled panel of their own, not a smaller font.
 */
export function SiteFooter() {
  return (
    <footer className="colophon">
      <div className="shell">
        <div className="titleblock">
          <div className="titleblock__grid">
            <div className="titleblock__cell">
              <h2>Homesrolo</h2>
              <p style={{ color: 'var(--ink-faint)', fontSize: '0.94rem', marginTop: '0.5rem', maxWidth: '32ch' }}>
                The durable record of a home, built from work a homeowner chose to release.
              </p>
            </div>
            <div className="titleblock__cell">
              <h2>Learn</h2>
              <Link href="/how-it-works/">How it works</Link>
              <Link href="/how-we-verify/">How we verify</Link>
              <Link href="/services/roofing/">Roofing guide</Link>
              <Link href="/services/roofing/cost/">Roof cost</Link>
              <Link href="/services/roofing/materials/">Roof materials</Link>
              <Link href="/services/roofing/choose-a-contractor/">Contractor checklist</Link>
              <Link href="/services/roofing/dfw/">DFW roofing</Link>
            </div>
            <div className="titleblock__cell">
              <h2>Homesrolo</h2>
              <Link href="/professionals/">Start a roof project</Link>
              <a href={`${HOMEOWNER_APP_ORIGIN}/signin`}>Homeowner sign in</a>
              <Link href="/for-professionals/">For professionals</Link>
              <Link href="/about/">About</Link>
              <Link href="/editorial-standards/">Editorial standards</Link>
            </div>
          </div>
          <div className="titleblock__meta" aria-hidden="true">
            <span>Homeowner education</span>
            <span>Private home account</span>
            <span>Project records</span>
            <span>Sources shown</span>
          </div>
        </div>

        <div className="disclosures">
          <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {CONSTITUTION_DISCLOSURES.map(line => <li key={line}>{line}</li>)}
            <li>
              Private homeowner accounts and home records live in a separate authenticated application.
              Homesrolo does not publish a homeowner&rsquo;s property file as a contractor listing.
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
