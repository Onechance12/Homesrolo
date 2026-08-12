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
  { href: '/services/roofing/materials/', title: 'Compare roofing materials', description: 'Separate material categories from actual product and assembly details.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Compare contractors', description: 'The evidence and contract terms that matter before a project starts.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Weather, local rules, and records for North Texas homes.' },
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
    </RoofingArticle>
  )
}
