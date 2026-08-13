import Link from 'next/link'
import { HOMEOWNER_APP_ORIGIN } from '../lib/site.ts'

/**
 * The colophon keeps the visual character of a drawing-sheet title block while
 * presenting a conventional public-site footer and concise legal boundary.
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
                One organized history for the work, documents, and decisions that shape a home.
              </p>
            </div>
            <div className="titleblock__cell">
              <h2>Learn</h2>
              <Link href="/how-it-works/">How it works</Link>
              <Link href="/how-we-verify/">How we verify</Link>
              <Link href="/services/roofing/">Roofing guide</Link>
              <Link href="/services/roofing/repair-or-replace/">Repair or replace</Link>
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

        <p className="footer-legal">
          Homesrolo provides general homeowner education, not legal, insurance, public adjusting, engineering, or contracting advice. Requirements and project conditions vary. Check current local rules and consult an appropriately licensed professional about your situation.
        </p>
      </div>
    </footer>
  )
}
