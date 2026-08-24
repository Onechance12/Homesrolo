import Link from 'next/link'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Plan, track, and remember home projects',
  description: 'Practical homeowner guidance for repairs, maintenance, remodels, new construction, written proposals, changes, and project closeout.',
  canonical: '/home-projects/',
})

const PROJECT_TYPES = [
  { title: 'A repair', body: 'Start with the symptom, affected area, timing, earlier attempts, and the result the house needs—not a guess at the cause.' },
  { title: 'Routine maintenance', body: 'Name the exact equipment or area, service interval, work expected, and what should be recorded after the visit.' },
  { title: 'A replacement', body: 'Keep the old model or material, reason for replacement, measurements, options considered, selected product, and disposal or removal plan.' },
  { title: 'A remodel', body: 'Separate layout, function, finishes, fixtures, trade work, protection, selections, allowances, and the decisions that can hold up the schedule.' },
  { title: 'New construction', body: 'Track plan and selection changes, site observations, walkthrough items, installed products, responsible parties, and the final home handoff.' },
  { title: 'Past work', body: 'Record what you remember now. Approximate dates and partial details can be corrected when an invoice, label, permit, or old photograph turns up.' },
] as const

const PROJECT_STAGES = [
  { step: '01', title: 'Define it', body: 'Room or system, problem or goal, known facts, measurements, priorities, constraints, and questions.' },
  { step: '02', title: 'Compare it', body: 'Written scope, products, quantities, allowances, exclusions, schedule, protection, payment, and closeout.' },
  { step: '03', title: 'Record the decision', body: 'What you selected, why, which written version controls, and who is responsible for the next move.' },
  { step: '04', title: 'Track changes', body: 'What changed, why it changed, price and time effect, and approval before changed work continues.' },
  { step: '05', title: 'Close it out', body: 'Final walkthrough, unfinished items, final invoice, proof of payment, products, warranties, permits, service contacts, and care instructions.' },
] as const

const PROPOSAL_ROWS = [
  { label: 'Work area', question: 'Does it identify the exact room, elevation, unit, surface, or equipment involved?' },
  { label: 'Preparation', question: 'What is removed, protected, moved, cleaned, tested, or repaired before the visible work starts?' },
  { label: 'Products', question: 'Are manufacturer, line, model, size, color, finish, and performance requirements named where they matter?' },
  { label: 'Quantity', question: 'Can you see how much work or material is included and where an allowance begins?' },
  { label: 'Unknown conditions', question: 'What cannot be seen yet, how will it be priced, and who must approve it?' },
  { label: 'People & schedule', question: 'Who is responsible, who supervises, when can the area be used, and what can change the schedule?' },
  { label: 'Payment', question: 'What triggers each payment, and what must be complete or delivered before final payment?' },
  { label: 'Closeout', question: 'Are cleanup, testing, walkthrough, corrections, permits, warranties, manuals, receipts, and product details included?' },
] as const

const REMODEL_DECISIONS = [
  'What problem should the room solve better than it does today?',
  'Which walls, openings, plumbing, electrical, ventilation, or structure may change?',
  'Which dimensions control cabinets, fixtures, appliances, furniture, clearances, and paths through the room?',
  'Which selections must be made before ordering or rough-in work?',
  'Which products are long-lead, difficult to repair, or dependent on another choice?',
  'How will dust, water, pets, children, access, security, and daily life be handled?',
] as const

const CONSTRUCTION_HANDOFF = [
  'Final plans and the change record',
  'Selections with exact product and color details',
  'Walkthrough and correction list with completion notes',
  'Permit, inspection, and occupancy records that apply',
  'Equipment, appliance, fixture, finish, and paint information',
  'Manufacturer and builder warranty documents and contacts',
  'Utility, shutoff, irrigation, low-voltage, and maintenance information',
  'Dated photographs of work that is now concealed when available',
] as const

export default function HomeProjectsPage() {
  return (
    <>
      <section className="hub-hero">
        <div className="shell hub-hero__layout">
          <div>
            <p className="eyebrow">Home projects</p>
            <h1>Give the work a clear record before the details get scattered.</h1>
            <p className="hub-hero__lede">
              A home project can be a service call, a repair, a full remodel, new construction, or something that
              happened years ago. The useful record is the same: what the home needed, what was proposed, what changed,
              who performed the work, and what the next homeowner should know.
            </p>
            <div className="hub-hero__actions">
              <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Start a private project</a>
              <Link className="btn btn--night" href="/home-record/">See the whole home record</Link>
            </div>
          </div>
          <aside className="hub-hero__aside" aria-label="The five parts of a home project">
            <strong>One project, five parts</strong>
            <ol>{PROJECT_STAGES.map(stage => <li key={stage.step}><span>{stage.step}</span>{stage.title}</li>)}</ol>
          </aside>
        </div>
      </section>

      <nav className="hub-jump" aria-label="Home project topics">
        <div className="shell">
          <a href="#start-a-project">Start a project</a>
          <a href="#project-record">Project record</a>
          <a href="#compare-proposals">Compare proposals</a>
          <a href="#remodels">Remodels</a>
          <a href="#new-construction">New construction</a>
          <a href="#closeout">Closeout</a>
        </div>
      </nav>

      <section id="start-a-project" className="section hub-section" aria-labelledby="start-project-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Start with the kind of work</p>
            <h2 id="start-project-heading">Every project deserves more than a name and a price.</h2>
            <p>Choose the closest starting point. If the project changes shape later, the record can change with it.</p>
          </div>
          <div className="hub-card-grid hub-card-grid--three" style={{ marginTop: '2.5rem' }}>
            {PROJECT_TYPES.map(item => (
              <article key={item.title} className="hub-card">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="project-record" className="section section--sunken hub-section" aria-labelledby="record-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">The project record</p>
            <h2 id="record-heading">Build the story in the order the work actually happens.</h2>
            <p>A clean record separates observations, proposals, homeowner decisions, performed work, and final documents instead of blending them into one sales summary.</p>
          </div>
          <ol className="hub-timeline">
            {PROJECT_STAGES.map(stage => (
              <li key={stage.step}>
                <span>{stage.step}</span>
                <div><h3>{stage.title}</h3><p>{stage.body}</p></div>
              </li>
            ))}
          </ol>
          <p className="hub-callout"><strong>Unknown is a valid answer.</strong> An honest blank is more useful than a confident guess. Add the source and date when a missing fact becomes known.</p>
        </div>
      </section>

      <section id="compare-proposals" className="section hub-section" aria-labelledby="compare-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Proposal comparison</p>
            <h2 id="compare-heading">A total is not a scope.</h2>
            <p>
              The same house can produce different prices because proposals may describe different work, products,
              quantities, access, risk, warranties, overhead, and profit. Homesrolo does not tell a homeowner what a
              project should cost. The useful job is making the written work easier to compare.
            </p>
          </div>
          <div className="hub-compare" role="table" aria-label="Questions for comparing home project proposals">
            {PROPOSAL_ROWS.map(row => (
              <div key={row.label} role="row">
                <strong role="rowheader">{row.label}</strong>
                <p role="cell">{row.question}</p>
              </div>
            ))}
          </div>
          <div className="hub-split" style={{ marginTop: '2.5rem' }}>
            <div className="hub-note">
              <p className="hub-card__label">Before choosing</p>
              <p>Ask each company to clarify its own writing. Do not silently fill one proposal’s gaps with promises made in conversation or details borrowed from another proposal.</p>
            </div>
            <div className="hub-note">
              <p className="hub-card__label">Before signing</p>
              <p>Make sure the final scope, selections, payment schedule, change process, and closeout requirements are in the agreement you are actually approving.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="remodels" className="section section--sunken hub-section" aria-labelledby="remodel-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">Interior remodels</p>
            <h2 id="remodel-heading">The pretty choices only work when the hidden decisions line up.</h2>
            <p>
              Kitchens, bathrooms, flooring, paint, lighting, built-ins, and furniture all depend on dimensions,
              clearances, rough-in locations, preparation, lead times, protection, and the order of work. Keep the
              inspiration, but tie each selected item to the room and decision it affects.
            </p>
          </div>
          <div className="hub-note">
            <p className="hub-card__label">Questions worth answering early</p>
            <ul>{REMODEL_DECISIONS.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </section>

      <section id="new-construction" className="section hub-section" aria-labelledby="construction-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">New construction</p>
            <h2 id="construction-heading">The home record should begin before move-in day.</h2>
            <p>
              Plans change, selections get substituted, walls close, and dozens of small decisions become nearly
              impossible to recreate. Whether you are the homeowner, builder, contractor, or real estate professional,
              the cleanest handoff names what was actually installed and where the supporting record lives.
            </p>
          </div>
          <div className="hub-card-grid hub-card-grid--two" style={{ marginTop: '2.5rem' }}>
            <article className="hub-card">
              <p className="hub-card__label">During the build</p>
              <h3>Record changes while the work is still visible.</h3>
              <p>Keep plan revisions, selection changes, written approvals, responsible people, site observations, walkthrough items, and dated photographs of concealed work when they are available and safe to take.</p>
            </article>
            <article className="hub-card">
              <p className="hub-card__label">At handoff</p>
              <h3>Leave the next person more than a stack of unlabeled papers.</h3>
              <ul>{CONSTRUCTION_HANDOFF.map(item => <li key={item}>{item}</li>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section id="closeout" className="section section--sunken hub-section" aria-labelledby="closeout-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">Project closeout</p>
            <h2 id="closeout-heading">“The crew left” is not the same as “the project is complete.”</h2>
            <p>Agree on what closes the job while everyone still remembers the agreement. The final record should make later maintenance, warranty service, and a future sale easier.</p>
          </div>
          <aside className="hub-note">
            <p className="hub-card__label">Closeout check</p>
            <ul>
              <li>Walk through the completed work and write down corrections</li>
              <li>Confirm testing, cleanup, and protection removal</li>
              <li>Keep final product, color, model, and installer details</li>
              <li>Collect final invoice, payment record, warranties, manuals, and permit results that apply</li>
              <li>Record the service contact and any required care or registration</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Start where the project is</p>
            <h2>Planned, active, finished, or years ago—it belongs with the home.</h2>
            <p>Add what you know now. The useful record can get better as the project moves or older details turn up.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Start a private project</a>
            <Link className="btn btn--night" href="/guides/">Browse homeowner guides</Link>
          </div>
        </div>
      </section>
    </>
  )
}
