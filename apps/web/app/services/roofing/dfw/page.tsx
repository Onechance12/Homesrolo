import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_DFW_GUIDE } from '../../../../lib/content/education.ts'
import { publicPageMetadata } from '../../../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'DFW roofing guide for Dallas Fort Worth homeowners',
  description: 'Dallas Fort Worth roofing information about North Texas hail, wind, heat, city permit differences, materials, contractor scopes, and roof records.',
  canonical: '/services/roofing/dfw/',
  openGraphType: 'article',
  socialTitle: 'Dallas Fort Worth roofing guide',
  socialDescription: 'North Texas roofing, permits, materials, contractor scopes, and project records.',
})

const SOURCES = [
  { label: 'Dallas/Fort Worth climate summary', publisher: 'NOAA National Centers for Environmental Information', href: 'https://www.ncei.noaa.gov/pub/access/cebrequests/2023lcdannual/01202313DFW.pdf' },
  { label: 'Help after a storm', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/consumer/storms/recoverytips.html' },
  { label: 'Roof 101: wind and hail test standards', publisher: 'Insurance Institute for Business & Home Safety', href: 'https://ibhs.org/roof-101/' },
  { label: 'Residential permitting', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information' },
  { label: 'Residential permitting and inspections', publisher: 'City of Dallas', href: 'https://dallas.gov/departments/sustainabledevelopment/buildinginspection/Pages/residential.aspx' },
] as const

const RELATED = [
  { href: '/services/roofing/dallas/', title: 'Dallas roofing guide', description: 'City permit context and closeout records for Dallas homes.' },
  { href: '/services/roofing/fort-worth/', title: 'Fort Worth roofing guide', description: 'The local line between shingle replacement and structural work.' },
  { href: '/services/roofing/materials/', title: 'Texas roofing materials', description: 'Compare common systems against North Texas conditions.' },
] as const

export default function DfwRoofingPage() {
  return (
    <RoofingArticle eyebrow="Dallas Fort Worth" title="A DFW roofing guide for homeowners" lede="North Texas roofs face hot summers, severe thunderstorms, and different permit rules from one city to the next. This guide explains what to check before work begins and what to save afterward." quickAnswer="For a DFW roofing project, verify the rule for the property's city, compare the complete roof system instead of the shingle alone, confirm the contractor and insurance, and keep photographs and closeout documents with the home." pathname="/services/roofing/dfw/" sections={ROOFING_DFW_GUIDE} sources={SOURCES} related={RELATED}>
      <section className="section" aria-labelledby="dfw-after-storm">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">After a North Texas storm</p>
            <h2 id="dfw-after-storm">Build the timeline before the door knocks start</h2>
            <p>A DFW storm can produce calls, inspections, weather reports, sales pitches, and insurance paperwork within days. A useful home record keeps each item tied to its source and date so the homeowner can see what is known, what is an opinion, and what still needs proof.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead><tr><th>Record</th><th>What it can establish</th><th>What it cannot establish by itself</th></tr></thead>
              <tbody>
                <tr><th>Dated homeowner photos</th><td>Visible conditions, water entry, displaced items, and the timing of observations</td><td>Full roof condition, hidden construction, repair scope, or policy coverage</td></tr>
                <tr><th>Weather report</th><td>Reported hail, wind, or other conditions near an area and time</td><td>What struck one house or caused one mark</td></tr>
                <tr><th>Roof inspection</th><td>Conditions the inspector observed and documented within the inspection limits</td><td>Facts outside the inspection, policy interpretation, or guaranteed future performance</td></tr>
                <tr><th>Contractor proposal</th><td>The work, products, price, and terms that company is offering</td><td>What an insurer owes or whether every proposed item is covered</td></tr>
                <tr><th>Insurance communication</th><td>The carrier’s claim position, estimate, request, or payment at that time</td><td>The final construction contract or proof that work was completed</td></tr>
                <tr><th>Closeout package</th><td>What was installed, changed, paid, permitted, photographed, and warranted</td><td>A promise that the roof will never need repair</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="dfw-roof-scope">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">North Texas scope questions</p>
              <h2 id="dfw-roof-scope">A shingle name is not a severe-weather plan</h2>
              <p>The proposal should connect the selected product to the way the roof edges, deck, valleys, penetrations, flashing, and ventilation will be installed. Those details matter when hail, wind, and wind-driven rain return.</p>
            </div>
            <ul className="plain-checklist">
              <li>Exact shingle or panel and its current hail and wind test information</li>
              <li>Deck attachment and what happens if loose or damaged decking is found</li>
              <li>Underlayment, valley, edge, starter, and flashing details</li>
              <li>Intake and exhaust ventilation calculation, not only a vent count</li>
              <li>Dry-in and emergency response plan if weather interrupts construction</li>
              <li>Photographs required before each hidden layer is covered</li>
            </ul>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
