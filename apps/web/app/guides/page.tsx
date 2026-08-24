import Link from 'next/link'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Homeowner guides for care, repairs, and projects',
  description: 'Plain-language homeowner guides for urgent problems, maintenance, home systems, repairs, remodels, proposals, project records, and roofing.',
  canonical: '/guides/',
})

const URGENT_STARTS = [
  {
    title: 'Water is entering the home',
    first: 'Protect people first. If it is safe and you know the correct control, stop the local fixture or main water supply for a plumbing leak. Keep away from energized equipment and sagging ceilings.',
    record: 'Note the first observed time, weather or activity, exact location, water path, shutoff action, photographs from a safe place, and emergency work performed.',
  },
  {
    title: 'You smell gas or an alarm sounds',
    first: 'Leave the area and follow the utility, fire department, alarm manufacturer, or emergency-service instructions that apply. Do not stay inside to investigate or operate switches.',
    record: 'The record comes after people are safe. Keep the time, alarm or odor location, utility or emergency contact, findings supplied, and work performed.',
  },
  {
    title: 'Something electrical is hot, arcing, or smoking',
    first: 'Do not touch damaged equipment or open a panel. Move people away, call emergency services when there is fire or immediate danger, and use a qualified electrician or utility for the system involved.',
    record: 'Keep the affected circuit or area if known, what was operating, observable signs, protective device action, and the professional finding and repair.',
  },
  {
    title: 'Heating or cooling stopped',
    first: 'Check simple user controls, an obviously dirty filter, and whether the home has lost power. Do not repeatedly reset a breaker, bypass a safety, open equipment, handle refrigerant, or work on gas components.',
    record: 'Write down equipment, indoor and outdoor conditions, thermostat display, sounds, odors, water, error codes, recent service, and what changed before the failure.',
  },
  {
    title: 'A storm may have damaged the property',
    first: 'Stay away from downed lines, unstable trees, flooded electrical areas, damaged structures, and unsafe roofs. Use safe temporary protection and qualified help where needed.',
    record: 'Separate the storm date, weather source, homeowner observations, each inspection, temporary work, proposals, insurer documents, and completed repairs.',
  },
  {
    title: 'An appliance or fixture is leaking',
    first: 'Stop using it. If safe and familiar, shut off the appliance or fixture supply and protect the surrounding area. Water near power, fuel, or a concealed space changes the urgency.',
    record: 'Keep the model and serial number, leak location, operating state, shutoff action, affected materials, service diagnosis, part number, and repair result.',
  },
] as const

const GUIDE_PATHS = [
  { title: 'Heating & cooling', body: 'Filters, equipment identity, service history, warning signs, and the line between a homeowner check and licensed work.', href: '/home-care/#heating-cooling' },
  { title: 'Plumbing & water', body: 'Shutoffs, quiet leak locations, water-heater facts, repair records, and urgent boundaries.', href: '/home-care/#plumbing' },
  { title: 'Electrical', body: 'Panel access, alarm records, visible warning signs, safe device tests, and what not to open.', href: '/home-care/#electrical' },
  { title: 'Roof & gutters', body: 'Ground-level observations, attic clues, drainage, storm records, and the documents a roof needs.', href: '/home-care/#roof-gutters' },
  { title: 'Exterior & drainage', body: 'Windows, doors, siding, finishes, soil, openings, and the route water takes around the home.', href: '/home-care/#exterior' },
  { title: 'Yard, pool & pest', body: 'Irrigation, equipment access, recurring pest patterns, exterior chemicals, and property service records.', href: '/home-care/#yard-pool-pest' },
  { title: 'Home safety', body: 'Shutoff locations, alarms, exits, household needs, emergency contacts, and immediate-danger boundaries.', href: '/home-care/#home-safety' },
  { title: 'Seasonal rounds', body: 'Four repeatable passes through the home that can adapt to the climate, equipment, and property.', href: '/home-care/#seasonal-rounds' },
] as const

const PROJECT_GUIDES = [
  { title: 'Start a repair record', body: 'Describe the symptom, area, timing, earlier work, safe observations, and the result needed before guessing at a cause.', href: '/home-projects/#start-a-project' },
  { title: 'Compare written proposals', body: 'Line up scope, preparation, products, quantities, allowances, exclusions, payment, schedule, and closeout.', href: '/home-projects/#compare-proposals' },
  { title: 'Plan an interior remodel', body: 'Connect layout, measurements, selections, rough-in work, lead times, site protection, and the order of decisions.', href: '/home-projects/#remodels' },
  { title: 'Begin a new-construction record', body: 'Track plan changes, selections, walkthrough items, concealed work, installed products, and final handoff.', href: '/home-projects/#new-construction' },
  { title: 'Close out a project', body: 'Define completion, corrections, cleanup, testing, final products, payments, warranties, manuals, and permit results.', href: '/home-projects/#closeout' },
  { title: 'Rebuild past home history', body: 'Use approximate dates and partial facts honestly, then add sources when labels, invoices, permits, or photos turn up.', href: '/home-record/#past-work' },
] as const

const ROOFING_GUIDES = [
  { title: 'Texas roofing center', body: 'Scope, materials, contractor questions, replacement process, insurance terms, closeout, and DFW rules.', href: '/services/roofing/' },
  { title: 'Repair or replace?', body: 'Start with the actual condition, repairability, matching material, written options, and the source of the conclusion.', href: '/services/roofing/repair-or-replace/' },
  { title: 'Compare roof costs without inventing a house price', body: 'Understand measurements, scope, allowances, payment, and why the same house can receive different proposals.', href: '/services/roofing/cost/' },
  { title: 'Roofing materials for North Texas', body: 'Compare exact systems, ratings, repairability, installation details, and proof of what was installed.', href: '/services/roofing/materials/' },
  { title: 'Choose a roofing contractor', body: 'Check business identity, insurance, local requirements, written scope, supervision, payment, and closeout.', href: '/services/roofing/choose-a-contractor/' },
  { title: 'The first 72 hours after hail', body: 'A sourced checklist for safety, observations, temporary protection, records, inspections, and common pressure tactics.', href: '/roof-watch/guides/hail-first-72-hours/' },
  { title: 'What a useful roof inspection report includes', body: 'Location, photographs, observations, limitations, repairability, and a clear separation between evidence and conclusion.', href: '/roof-watch/guides/roof-inspection-report/' },
  { title: 'Selling a home with roof records', body: 'Build a roof packet that answers questions without overstating what any one document proves.', href: '/roof-watch/guides/selling-documented-home/' },
] as const

export default function GuidesPage() {
  return (
    <>
      <section className="hub-hero">
        <div className="shell hub-hero__layout">
          <div>
            <p className="eyebrow">Homeowner guides</p>
            <h1>Start with the problem. Learn the words before the sales call.</h1>
            <p className="hub-hero__lede">
              Homes are complicated. The first useful answer is often not a diagnosis or a price—it is knowing what
              can be checked safely, what facts to gather, which questions make proposals clearer, and where a qualified
              professional needs to take over.
            </p>
            <div className="hub-hero__actions">
              <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
              <Link className="btn btn--night" href="/home-care/">Start with home care</Link>
            </div>
          </div>
          <aside className="hub-hero__aside" aria-label="How to use a homeowner guide">
            <strong>Use a guide to</strong>
            <ol>
              <li><span>01</span> Protect people and the home</li>
              <li><span>02</span> Gather safe observations</li>
              <li><span>03</span> Learn the important words</li>
              <li><span>04</span> Ask comparable questions</li>
              <li><span>05</span> Keep the resulting record</li>
            </ol>
          </aside>
        </div>
      </section>

      <nav className="hub-jump" aria-label="Homeowner guide topics">
        <div className="shell">
          <a href="#something-is-wrong">Something is wrong</a>
          <a href="#care-by-system">Care by system</a>
          <a href="#project-guides">Project guides</a>
          <a href="#roofing-guides">Roofing guides</a>
          <a href="#guide-boundary">What guides can do</a>
        </div>
      </nav>

      <section id="something-is-wrong" className="section hub-section" aria-labelledby="wrong-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">When something is wrong</p>
            <h2 id="wrong-heading">Safety first. Protect the home. Then make the record.</h2>
            <p>
              These are starting actions, not a remote diagnosis. If there is immediate danger, leave the area and use
              emergency services, the appropriate utility, or a qualified professional for the situation.
            </p>
          </div>
          <div className="hub-card-grid hub-card-grid--two" style={{ marginTop: '2.5rem' }}>
            {URGENT_STARTS.map(item => (
              <article key={item.title} className="hub-card hub-card--urgent">
                <h3>{item.title}</h3>
                <p><strong>First:</strong> {item.first}</p>
                <p><strong>Once safe:</strong> {item.record}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="care-by-system" className="section section--sunken hub-section" aria-labelledby="system-guides-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Care by system</p>
            <h2 id="system-guides-heading">Walk the home one system at a time.</h2>
            <p>Each path explains what to observe, what information is worth keeping elsewhere, and where homeowner inspection should stop.</p>
          </div>
          <div className="hub-card-grid hub-card-grid--four" style={{ marginTop: '2.5rem' }}>
            {GUIDE_PATHS.map(guide => (
              <Link key={guide.title} className="hub-link-card" href={guide.href}>
                <h3>{guide.title}</h3><p>{guide.body}</p><strong>Use the guide <span aria-hidden="true">→</span></strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="project-guides" className="section hub-section" aria-labelledby="project-guides-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Repairs, remodels & construction</p>
            <h2 id="project-guides-heading">Make the work easier to explain and harder to lose.</h2>
            <p>Use the same project discipline whether the job takes one hour or one year.</p>
          </div>
          <div className="hub-card-grid hub-card-grid--three" style={{ marginTop: '2.5rem' }}>
            {PROJECT_GUIDES.map(guide => (
              <Link key={guide.title} className="hub-link-card" href={guide.href}>
                <h3>{guide.title}</h3><p>{guide.body}</p><strong>Read this path <span aria-hidden="true">→</span></strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="roofing-guides" className="section section--night hub-section" aria-labelledby="roofing-guides-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Roofing library</p>
            <h2 id="roofing-guides-heading">The first home system Homesrolo went deep on.</h2>
            <p>Roofing has its own detailed Texas and North Texas library. It remains one chapter inside the larger whole-home guide.</p>
          </div>
          <div className="hub-card-grid hub-card-grid--four" style={{ marginTop: '2.5rem' }}>
            {ROOFING_GUIDES.map(guide => (
              <Link key={guide.title} className="roofing-link-card" href={guide.href}>
                <strong>{guide.title}</strong><span>{guide.body}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="guide-boundary" className="section hub-section" aria-labelledby="boundary-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">The useful boundary</p>
            <h2 id="boundary-heading">A guide should sharpen the question, not pretend it inspected the house.</h2>
            <p>
              Public information cannot see concealed conditions, test equipment, interpret a contract or insurance
              policy for you, or determine one correct repair from a paragraph. Use it to prepare, document, and ask
              better questions. Use an appropriately qualified person for the property-specific answer.
            </p>
          </div>
          <aside className="hub-note">
            <p className="hub-card__label">A trustworthy answer names</p>
            <ul>
              <li>What was actually observed</li>
              <li>What remains hidden or untested</li>
              <li>Where the factual rule or instruction came from</li>
              <li>Which conclusion is professional judgment</li>
              <li>What would change the answer</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Use the answer</p>
            <h2>Turn the guide into a better home record.</h2>
            <p>Keep the question, observations, written scope, decision, and final result with the project.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
            <Link className="btn btn--night" href="/home-projects/">Plan a home project</Link>
          </div>
        </div>
      </section>
    </>
  )
}
