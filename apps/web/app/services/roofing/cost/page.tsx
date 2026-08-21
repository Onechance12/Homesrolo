import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_COST_GUIDE } from '../../../../lib/content/education.ts'
import { publicPageMetadata } from '../../../../lib/public-metadata.ts'
import { HOMEOWNER_ROOFING_SIGNIN_URL } from '../../../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'How much does a new roof cost in Texas?',
  description: 'No generic online price can quote a roof accurately. Learn which scope details change a Texas roof replacement and compare actual proposals line by line.',
  canonical: '/services/roofing/cost/',
  openGraphType: 'article',
  socialTitle: 'Roof replacement cost in Texas and DFW',
  socialDescription: 'Learn why roof prices vary and compare the written scope in actual proposals line by line.',
})

const SOURCES = [
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
      eyebrow="Texas roof cost guide"
      title="What does a new roof cost in Texas?"
      lede="Two houses with the same floor plan can require different roofing work. Roof shape, flashing, valleys, ventilation, decking, access, material system, labor, overhead, and profit all belong to the actual project."
      quickAnswer="An address or house square footage is not enough to price a roof. Compare the written proposals for that roof, and read the scope line by line before treating the totals as comparable. Homesrolo organizes the differences; it does not decide what the roof should cost."
      pathname="/services/roofing/cost/"
      sections={ROOFING_COST_GUIDE}
      sources={SOURCES}
      related={RELATED}
      dateModified="2026-08-21"
    >
      <section className="section">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Why one number falls short</p>
            <h2>The same house can still be a different roofing job</h2>
            <p>Floor area does not show roof area, pitch, hips, valleys, stories, penetrations, low-slope sections, access, or existing layers. It also cannot show whether old flashing can remain, how ventilation must be balanced, or what the crew will find after tear-off.</p>
            <p>Some conditions remain unknown until a professional examines the roof or removal exposes the assembly. A broad online range can provide background context; the written proposals for this roof are the actual numbers available for comparison.</p>
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
            <p className="eyebrow">Same total, different scope</p>
            <h2 id="roof-bid-example">Compare what is written before comparing totals</h2>
            <p>A proposal can look complete and still leave important decisions open. These are ordinary examples of the difference between a one-page total and a defined roof project.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th>Scope question</th><th>Wording that needs clarification</th><th>Details that make proposals comparable</th></tr></thead>
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

      <section className="section" aria-labelledby="save-roof-proposals">
        <div className="shell">
          <div className="grid grid--2" style={{ alignItems: 'start', gap: '3rem' }}>
            <div className="prose">
              <p className="eyebrow">Use your own proposals</p>
              <h2 id="save-roof-proposals">Record the proposals. Compare the scope.</h2>
              <p>Give each proposal a private label, then mark what it says about measurement, materials, tear-off, decking, valleys, flashing, penetrations, ventilation, permits, cleanup, warranties, payment terms, and exclusions. When reviewed private uploads are available, the original PDF can be linked to that record.</p>
              <p><a className="btn btn--primary" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Compare my roof proposals</a></p>
            </div>
            <div className="note">
              <strong>Homesrolo does not estimate the roof, rank the proposals, or automatically send proposal details or files anywhere.</strong>{' '}
              It gives you one private place to see what is stated, what you have not reviewed, and what still needs a question. Anything included in a Jobrolo review is separately selected and consented to.
            </div>
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
