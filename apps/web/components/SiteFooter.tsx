import Link from 'next/link'
import { HOMEOWNER_SIGNIN_URL, ROOF_WATCH_PHONE_DISPLAY, ROOF_WATCH_SMS_URL } from '../lib/site.ts'
import { BrandMark } from './BrandMark.tsx'

export function SiteFooter() {
  return (
    <footer className="colophon">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <p className="footer-brand__name"><BrandMark size={30} /><span>homesrolo</span></p>
            <p>
              A private home workspace for current projects, historical work, seasonal photo checkups, and roof
              proposal notes.
            </p>
            <a className="footer-home-link" href={HOMEOWNER_SIGNIN_URL}>
              Open my home <span aria-hidden="true">→</span>
            </a>
          </div>
          <div>
            <h2>Your home</h2>
            <Link href="/home-care/">Home care</Link>
            <Link href="/home-projects/">Home projects</Link>
            <Link href="/home-record/">Home record</Link>
            <Link href="/guides/">Homeowner guides</Link>
          </div>
          <div>
            <h2>Learn</h2>
            <Link href="/how-it-works/">How it works</Link>
            <Link href="/roof-watch/">Roof Watch</Link>
            <Link href="/roof-watch/guides/">Roof Watch guides</Link>
            <Link href="/services/roofing/">Roofing center</Link>
          </div>
          <div>
            <h2>Homesrolo</h2>
            <Link href="/about/">About Homesrolo</Link>
            <Link href="/for-professionals/">For home professionals</Link>
            <Link href="/for-agents/">For real estate agents</Link>
            <Link href="/editorial-standards/">How we research</Link>
            <Link href="/privacy/">Privacy</Link>
            <Link href="/security/">Security</Link>
            <a href={ROOF_WATCH_SMS_URL}>Text Roof Watch: {ROOF_WATCH_PHONE_DISPLAY}</a>
          </div>
        </div>

        <p className="footer-legal">
          Homesrolo provides general homeowner education, not legal, insurance, public adjusting, engineering, or
          contracting advice. Requirements and project conditions vary. Check current local rules and consult an
          appropriately licensed professional about your situation.
        </p>
      </div>
    </footer>
  )
}
