import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_COST_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Roof replacement cost in Texas and Dallas Fort Worth',
  description: 'A transparent Texas roof cost guide: roof squares, 2026 Dallas price context, materials, pitch, tear-off, decking, flashing, ventilation, permits, and bid comparison.',
  alternates: { canonical: '/services/roofing/cost/' },
  openGraph: { title: 'Roof replacement cost in Texas and DFW', description: 'Understand what changes a roof price and compare bids line by line.', url: '/services/roofing/cost/' },
}

const SOURCES = [
  { label: 'Dallas roof replacement cost data (updated August 2026)', publisher: 'Angi', href: 'https://www.angi.com/articles/how-much-does-roof-replacement-cost/tx/dallas' },
  { label: 'Roof replacement cost and estimate factors', publisher: 'GAF', href: 'https://www.gaf.com/en-us/plan-design/homeowner-education/roof-cost' },
  { label: 'Residential permitting', publisher: 'City of Dallas', href: 'https://dallas.gov/departments/sustainabledevelopment/buildinginspection/Pages/residential.aspx' },
] as const

const RELATED = [
  { href: '/services/roofing/repair-or-replace/', title: 'Repair or replace?', description: 'Compare the evidence for a targeted repair and a complete roof system.' },
  { href: '/services/roofing/materials/', title: 'Compare roofing materials', description: 'Separate material categories from actual product and assembly details.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Compare contractors', description: 'The evidence and contract terms that matter before a project starts.' },
] as const

export default function RoofingCostPage() {
  return (
    <RoofingArticle
      eyebrow="Texas roofing costs"
      title="What does a roof replacement cost in Texas?"
      lede="Roof prices make more sense once you separate the measurement, materials, labor, wood repair, permits, and warranty. Here is a practical way to compare Dallas Fort Worth estimates."
      quickAnswer="Angi reports a 2026 Dallas average of $10,054, with most projects in its data falling between $5,960 and $14,203. That is a market benchmark, not a quote for a particular house. Start with the roof measurement and compare the same scope items on every bid."
      pathname="/services/roofing/cost/"
      sections={ROOFING_COST_GUIDE}
      sources={SOURCES}
      related={RELATED}
    >
      <section className="section">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">2026 Dallas context</p>
            <h2>A published range is a benchmark, not a bid</h2>
            <p><a href="https://www.angi.com/articles/how-much-does-roof-replacement-cost/tx/dallas">Angi’s Dallas cost guide</a>, updated in August 2026, reports an average of $10,054 and a typical range of $5,960 to $14,203. GAF cites a 2025 national average of $17,631 from Verisk. The two figures come from different data sets and cover different markets. Neither number replaces a measured local bid.</p>
            <p>Use online estimates to set expectations. Use the written scope to decide what you are buying.</p>
            <table className="cost-table">
              <thead><tr><th>Cost driver</th><th>What changes</th><th>What the proposal needs to state</th></tr></thead>
              <tbody>
                <tr><td data-label="Cost driver">Roof quantity</td><td data-label="What changes">Squares, pitch, hips, valleys, waste</td><td data-label="Proposal detail">Measured area and source diagram</td></tr>
                <tr><td data-label="Cost driver">Material system</td><td data-label="What changes">Product tier, accessories, warranty</td><td data-label="Proposal detail">Manufacturer and exact product line</td></tr>
                <tr><td data-label="Cost driver">Removal and deck</td><td data-label="What changes">Layers, disposal, damaged sheathing</td><td data-label="Proposal detail">Tear-off and per-sheet deck price</td></tr>
                <tr><td data-label="Cost driver">Complexity</td><td data-label="What changes">Stories, slope, access, penetrations</td><td data-label="Proposal detail">Included charges and exclusions</td></tr>
                <tr><td data-label="Cost driver">Local closeout</td><td data-label="What changes">Permit, inspection, cleanup</td><td data-label="Proposal detail">Responsible party and delivered record</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section section--night" aria-labelledby="roof-bid-example">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Why the lowest bid is sometimes not the lowest cost</p>
            <h2 id="roof-bid-example">Two totals are not comparable until the scope matches</h2>
            <p>A proposal can look complete and still leave the expensive decisions for later. The differences below are ordinary examples of what hides between a one-page total and a defined roof project.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th>Scope question</th><th>Bid that leaves risk open</th><th>Bid that defines the work</th></tr></thead>
              <tbody>
                <tr><th>Roof quantity</th><td>Replace complete roof</td><td>States measured squares, report source, pitch, and waste</td></tr>
                <tr><th>Deck repairs</th><td>Wood extra if needed</td><td>Price per sheet, photo requirement, approval, and quantity on final invoice</td></tr>
                <tr><th>Flashing</th><td>Replace as necessary</td><td>Names valleys, walls, chimney, step flashing, counterflashing, and exclusions</td></tr>
                <tr><th>Ventilation</th><td>Install vents</td><td>States intake and exhaust type, count, placement, and whether old openings are closed</td></tr>
                <tr><th>Warranty</th><td>Lifetime roof</td><td>Identifies product, workmanship term, manufacturer coverage, registration, and exclusions</td></tr>
                <tr><th>Closeout</th><td>Final payment on completion</td><td>Defines completion as cleanup, punch list, permit result, invoice, photos, and warranties delivered</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="read-roof-bid">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">A ten-minute first pass</p>
            <h2 id="read-roof-bid">Read the scope before reading the total</h2>
            <ol className="question-list">
              <li><strong>Find the measurement.</strong> Mark the roof squares and the report or diagram used.</li>
              <li><strong>Circle every exact product.</strong> Manufacturer, product line, color, underlayment, starter, ridge, vents, and accessories should be named.</li>
              <li><strong>Underline every open price.</strong> Look for allowance, additional, as needed, unforeseen, code, and change order.</li>
              <li><strong>Find the water details.</strong> Valleys, walls, chimney, skylights, pipe penetrations, edge metal, and low-slope transitions need a stated treatment.</li>
              <li><strong>Read the payment trigger.</strong> Know what the company must finish and deliver before each payment becomes due.</li>
              <li><strong>Define done.</strong> Cleanup, permit closeout, punch list, final invoice, photographs, warranty registration, and lien paperwork should not be assumed.</li>
            </ol>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
