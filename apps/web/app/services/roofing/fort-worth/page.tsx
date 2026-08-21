import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_FORT_WORTH_GUIDE } from '../../../../lib/content/education.ts'
import { publicPageMetadata } from '../../../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Fort Worth roofing guide: permits, decking, scope, and records',
  description: 'Fort Worth homeowner roofing information: when permits apply, decking and structural work, underlayment, drip edge, contractor scope, costs, and closeout records.',
  canonical: '/services/roofing/fort-worth/',
  openGraphType: 'article',
  socialTitle: 'Fort Worth roofing guide for homeowners',
  socialDescription: 'Understand Fort Worth roof permit triggers, hidden assembly details, and project records.',
})

const SOURCES = [
  { label: 'Residential permitting: roofing', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information' },
  { label: 'Roofing frequently asked questions', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/files/assets/public/v/1/development-services/documents/roofing-faq.pdf' },
  { label: 'Dallas/Fort Worth climate summary', publisher: 'NOAA National Centers for Environmental Information', href: 'https://www.ncei.noaa.gov/pub/access/cebrequests/2023lcdannual/01202313DFW.pdf' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Roof cost guide', description: 'Account for tear-off, deck repairs, roof geometry, and local closeout.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Contractor checklist', description: 'Make permit responsibility and deck-repair pricing visible in writing.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Add the broader North Texas weather and material context.' },
] as const

export default function FortWorthRoofingPage() {
  return (
    <RoofingArticle eyebrow="Fort Worth, Texas" title="Roofing in Fort Worth: permits, scope, and proof" lede="Fort Worth's permit rule can change once tear-off exposes damaged wood. The scope should explain how that change is priced, approved, permitted, and documented." quickAnswer="Fort Worth does not require a permit for shingle replacement alone. A permit is required when decking, lathing, sheathing, rafters, or ridge boards are replaced. Put the wood-repair price and permit responsibility in the contract." pathname="/services/roofing/fort-worth/" sections={ROOFING_FORT_WORTH_GUIDE} sources={SOURCES} related={RELATED}>
      <section className="section" aria-labelledby="fort-worth-decking">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">When tear-off changes the job</p>
            <h2 id="fort-worth-decking">A simple decking process keeps a hidden condition from becoming a blank check</h2>
            <p>Fort Worth’s permit trigger makes deck discovery more than a price change. The contractor and homeowner need a clear pause point before damaged wood is covered.</p>
          </div>
          <ol className="chain">
            <li><h3>Expose</h3><p>The old covering is removed and the deck can be seen.</p><span className="provenance">No guessing before tear-off</span></li>
            <li><h3>Document</h3><p>Photographs show the location and condition of proposed replacement areas.</p><span className="provenance">Evidence tied to the roof</span></li>
            <li><h3>Price and approve</h3><p>The quantity uses the contract unit price and the homeowner approves the written change.</p><span className="provenance">No surprise total</span></li>
            <li><h3>Permit and close out</h3><p>The responsible party follows the city requirement and the final invoice matches the documented quantity.</p><span className="provenance">A complete Fort Worth record</span></li>
          </ol>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="fort-worth-hidden-details">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">Photograph before covering</p>
              <h2 id="fort-worth-hidden-details">The most useful roof photos are not the finished-roof photos</h2>
              <p>The finished roof matters, but it does not show the assembly underneath. Ask for a repeatable set of progress photographs that can be understood years later.</p>
            </div>
            <ul className="plain-checklist">
              <li>Each slope after tear-off and before new material</li>
              <li>Every replaced deck area with location and quantity</li>
              <li>Underlayment, valleys, edges, and transitions before shingles</li>
              <li>Chimney, wall, skylight, and pipe flashing details</li>
              <li>Intake and exhaust ventilation changes</li>
              <li>Product labels and the completed roof from every elevation</li>
            </ul>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
