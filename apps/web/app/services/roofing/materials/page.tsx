import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_MATERIALS_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Best roofing materials for Texas heat, hail, and wind',
  description: 'Compare asphalt shingles, impact-resistant shingles, metal, tile, slate, and composite roofing for North Texas, including the roof parts hidden underneath.',
  alternates: { canonical: '/services/roofing/materials/' },
  openGraph: { title: 'Roofing materials for Texas homes', description: 'Compare common roof systems for North Texas heat, hail, wind, price, and repairability.', url: '/services/roofing/materials/' },
}

const SOURCES = [
  { label: 'Roofing materials', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofing-guidelines/roofing-materials' },
  { label: 'Hail impact-resistant shingle ratings', publisher: 'Insurance Institute for Business & Home Safety', href: 'https://ibhs.org/hail/relative-impact-resistance-of-asphalt-shingles/' },
  { label: 'Hail and how it damages roofs', publisher: 'Insurance Institute for Business & Home Safety', href: 'https://ibhs.org/natural-weathering-and-hazard-exposure/' },
  { label: 'Parts of a residential roof', publisher: 'GAF', href: 'https://www.gaf.com/en-us/plan-design/homeowner-education/roof-parts' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Understand roof cost', description: 'See how product choice and assembly details change the total.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Choose a contractor', description: 'Confirm that the written scope names the exact product and system.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Put the material decision in North Texas weather and permit context.' },
] as const

export default function RoofingMaterialsPage() {
  return (
    <RoofingArticle eyebrow="Roofing materials" title="Which roofing material fits a Texas home?" lede="Compare the exact product, the full roof system, local weather, repair options, installer experience, price, and warranty before choosing a material." quickAnswer="Architectural asphalt shingles are the common starting point for North Texas homes. Metal, tile, slate, and composite products can fit certain homes and budgets, but each system has different installation, weight, hail, repair, and maintenance considerations. The exact product matters more than the category name." pathname="/services/roofing/materials/" sections={ROOFING_MATERIALS_GUIDE} sources={SOURCES} related={RELATED}>
      <section className="section" aria-labelledby="material-comparison">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Compare the ownership experience</p>
            <h2 id="material-comparison">The best material on paper can be the wrong system for the house</h2>
            <p>Material choice affects structure, details, labor, future repairs, appearance, insurance questions, and who can service the roof. Compare the full ownership picture, not just an advertised lifespan.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th>System</th><th>Why homeowners consider it</th><th>Questions that change the decision</th><th>Record to keep</th></tr></thead>
              <tbody>
                <tr><th>Architectural asphalt</th><td>Familiar installation, broad product selection, and generally easier local repair</td><td>Exact product, hail rating, wind installation, ventilation, algae coverage, and accessory system</td><td>Wrapper or delivery label, color, lot information when available, warranty, and installation photos</td></tr>
                <tr><th>Standing-seam metal</th><td>Long service potential, fewer exposed fasteners, and a distinct appearance</td><td>Panel profile and thickness, clip system, coating, oil canning expectations, penetrations, repair access, and hail appearance</td><td>Panel and coating specification, shop drawings when used, installer details, color, and warranty</td></tr>
                <tr><th>Exposed-fastener metal</th><td>Often a lower entry price than standing seam</td><td>Fastener maintenance, washer life, screw pattern, panel coating, closure details, and who services it later</td><td>Fastener and panel specifications, maintenance terms, and dated service history</td></tr>
                <tr><th>Concrete or clay tile</th><td>Architectural character and long-lived material</td><td>Structural capacity, underlayment life, breakage, walking access, matching pieces, flashing, and qualified local repair</td><td>Structural review if applicable, product profile, spare pieces, underlayment, and installation details</td></tr>
                <tr><th>Composite slate or shake</th><td>Specialty appearance with lower weight than some natural products</td><td>Manufacturer history, fire and impact testing, approved installation, expansion details, availability, and warranty labor</td><td>Exact product, approval and test documents, color blend, installation instructions, and warranty</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="roof-system-questions">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">Look below the visible product</p>
              <h2 id="roof-system-questions">Five material questions most samples do not answer</h2>
              <p>A sample board shows color and texture. It does not show how the roof handles a valley, a wall, a chimney, a pipe, hot attic air, or a future repair.</p>
            </div>
            <ol className="question-list">
              <li>What exact underlayment and leak-barrier approach belongs under this product?</li>
              <li>How are walls, chimneys, valleys, skylights, and pipe penetrations flashed?</li>
              <li>What intake and exhaust ventilation does the manufacturer require?</li>
              <li>What happens when one area needs repair five or ten years from now?</li>
              <li>Which product, labor, tear-off, transfer, and weather events are actually covered by each warranty?</li>
            </ol>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
