import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_DALLAS_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Dallas roofing guide: permits, costs, contractors, and records',
  description: 'Dallas homeowner roofing information: roof permits, cost variables, bid comparison, contractor scope, materials, warranties, and project closeout records.',
  alternates: { canonical: '/services/roofing/dallas/' },
  openGraph: { title: 'Dallas roofing guide for homeowners', description: 'Understand Dallas roof permits, pricing variables, scope, and the records worth keeping.', url: '/services/roofing/dallas/' },
}

const SOURCES = [
  { label: 'Residential permitting and inspections', publisher: 'City of Dallas', href: 'https://dallas.gov/departments/sustainabledevelopment/buildinginspection/Pages/residential.aspx' },
  { label: 'DallasNow terminology reference: roofing permits', publisher: 'City of Dallas Planning & Development', href: 'https://dallas.gov/departments/pnv/Documents/DallasNow%20Terminology%20Reference%20Guide_6.27.25.pdf' },
  { label: 'Dallas roof replacement cost data (updated August 2026)', publisher: 'Angi', href: 'https://www.angi.com/articles/how-much-does-roof-replacement-cost/tx/dallas' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Roof cost guide', description: 'Understand the variables behind a Dallas roofing price.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Contractor checklist', description: 'Compare evidence, scope, permits, and warranty terms.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Add the broader North Texas weather and material context.' },
] as const

export default function DallasRoofingPage() {
  return (
    <RoofingArticle eyebrow="Dallas, Texas" title="Roofing in Dallas: a homeowner's field guide" lede="Dallas roofing projects should connect the city permit, measured scope, exact materials, contractor documents, and a complete closeout package." quickAnswer="Dallas uses a roofing permit record for roof installation, repair, or replacement. Confirm who pulls it, compare the measured scope and exact materials, and keep the permit and completion records with the home." pathname="/services/roofing/dallas/" sections={ROOFING_DALLAS_GUIDE} sources={SOURCES} related={RELATED}>
      <section className="section" aria-labelledby="dallas-project-file">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">The Dallas project file</p>
            <h2 id="dallas-project-file">A permit number is the start of the record, not the whole record</h2>
            <p>Homesrolo connects the city record to the contract and the work at the house. That matters when a future buyer sees a permit but still needs to know which product was installed, what wood was replaced, who performed the work, and which warranties can transfer.</p>
          </div>
          <div className="grid grid--3">
            <article className="card"><p className="eyebrow">Before tear-off</p><h3 className="card__title">Match the permit to the project</h3><p>Save the permit number, property, applicant or contractor, described work, issue date, and any stated inspection requirements.</p></article>
            <article className="card"><p className="eyebrow">During construction</p><h3 className="card__title">Record scope changes</h3><p>Photograph discovered deck damage and other hidden conditions. Keep the written quantity, unit price, approval, and resulting permit communication together.</p></article>
            <article className="card"><p className="eyebrow">Before final payment</p><h3 className="card__title">Confirm closeout</h3><p>Collect the city result that applies, final invoice, change orders, installation photos, warranty registrations, and contractor warranty.</p></article>
          </div>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="dallas-bid-questions">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">Dallas estimate review</p>
              <h2 id="dallas-bid-questions">Five lines that prevent most price confusion</h2>
              <p>Dallas prices vary because the homes and scopes vary. These details make the total traceable back to the work.</p>
            </div>
            <ul className="plain-checklist">
              <li>Measured roof squares and the report used</li>
              <li>Number of tear-off layers and disposal included</li>
              <li>Deck replacement price per sheet and approval method</li>
              <li>Exact flashing, ventilation, and accessory scope</li>
              <li>Permit, inspection, cleanup, warranty, and closeout responsibilities</li>
            </ul>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
