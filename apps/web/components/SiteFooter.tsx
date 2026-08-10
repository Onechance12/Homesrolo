import Link from 'next/link'
import { CONSTITUTION_DISCLOSURES, LISTING_NOT_ENDORSEMENT } from '../lib/content/education.ts'
import { NEUTRAL_ORDERING_STATEMENT } from '../lib/directory/ordering.ts'

/**
 * The disclosures are not fine print here. They are the product's boundary, and
 * a homeowner reading a page about insurance terminology needs them on the same
 * page, not buried in a terms document they will never open.
 */
export function SiteFooter() {
  return (
    <footer className="colophon">
      <div className="shell">
        <div className="grid grid--3">
          <div>
            <h2>Homesrolo</h2>
            <p style={{ color: 'var(--ink-faint)', fontSize: '0.94rem', marginTop: '0.5rem', maxWidth: '32ch' }}>
              The durable record of a home, built from work a homeowner chose to release.
            </p>
          </div>
          <div>
            <h2>Learn</h2>
            <Link href="/how-it-works/">How it works</Link>
            <Link href="/how-we-verify/">How we verify</Link>
            <Link href="/services/roofing/">Roofing guide</Link>
            <Link href="/ideas/">Ideas</Link>
          </div>
          <div>
            <h2>Directory</h2>
            <Link href="/professionals/">Professionals</Link>
            <Link href="/for-professionals/">For professionals</Link>
          </div>
        </div>

        <div className="disclosures">
          <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {CONSTITUTION_DISCLOSURES.map(line => <li key={line}>{line}</li>)}
            <li>{LISTING_NOT_ENDORSEMENT}</li>
            <li>{NEUTRAL_ORDERING_STATEMENT}</li>
            <li>
              Homesrolo does not copy or republish content from other review sites. Outside links are
              attributed and their content stays on the source.
            </li>
            <li>
              Phase 0.5 preview. Every company and project shown is synthetic, and no account, upload, or
              sharing feature exists yet.
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
