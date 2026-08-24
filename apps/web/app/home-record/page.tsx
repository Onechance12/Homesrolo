import Link from 'next/link'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Build a useful record for your home',
  description: 'A homeowner checklist for organizing project history and locating equipment details, photos, warranties, receipts, insurance, tax, inventory, and sale records.',
  canonical: '/home-record/',
})

const RECORD_SECTIONS = [
  {
    id: 'past-work',
    title: 'Projects & past work',
    summary: 'The repairs, replacements, remodels, maintenance, and construction decisions that changed the house.',
    keep: ['Area or system', 'Problem or goal', 'Approximate and final dates', 'Company and responsible contact', 'Written scope and changes', 'Products and materials installed', 'Final result and unfinished items', 'Where invoices, warranties, and photographs live'],
  },
  {
    id: 'systems',
    title: 'Home systems',
    summary: 'Heating and cooling, plumbing, electrical, roof, solar, security, irrigation, pool equipment, and other systems that need service over time.',
    keep: ['System name and location', 'Manufacturer and model', 'Installation year if known', 'Filter, part, fuel, size, or capacity details', 'Service company', 'Service and repair history', 'Operating or care notes', 'Warranty and manual location'],
  },
  {
    id: 'appliances',
    title: 'Appliances & equipment',
    summary: 'The exact identity that makes a future part, manual, recall check, or service call less of a scavenger hunt.',
    keep: ['Room and appliance type', 'Manufacturer', 'Model and serial number', 'Purchase or installation date', 'Finish or color', 'Store or installer', 'Consumable or replacement part numbers', 'Receipt, manual, and warranty location'],
  },
  {
    id: 'photos',
    title: 'Dated photographs',
    summary: 'Images that show a starting condition, concealed work, completed work, or the same view at different times.',
    keep: ['Observed date', 'Exact area and viewpoint', 'Reason the photo was taken', 'Before, during, after, or routine check', 'Who supplied the image', 'What the photo cannot show', 'Related project or service visit', 'Original file location'],
  },
  {
    id: 'documents',
    title: 'Documents, receipts & warranties',
    summary: 'The paper trail that proves what was proposed, approved, purchased, installed, paid, permitted, covered, or maintained.',
    keep: ['Document type and date', 'Project, product, or system it belongs to', 'Company or issuing organization', 'Important term or expiration date', 'Registration requirement', 'Transfer requirement', 'Original location', 'Related contact'],
  },
  {
    id: 'insurance-tax',
    title: 'Insurance, tax & valuation',
    summary: 'Records about coverage, claims, property taxes, valuations, improvements, and transactions—kept separate from contractor opinions.',
    keep: ['Document source and date', 'Coverage or tax period', 'Property and named parties', 'Claim or account reference', 'Improvement or valuation description', 'Communication log', 'Professional contact', 'Original secure location'],
  },
  {
    id: 'inventory',
    title: 'Home inventory',
    summary: 'A room-by-room account of important belongings and installed products that can help with care, replacement, moving, or a loss record.',
    keep: ['Room or location', 'Item description', 'Brand, model, and serial number', 'Purchase date and seller', 'Observed value or receipt amount with date', 'Condition notes', 'Photographs', 'Receipt, warranty, or appraisal location'],
  },
  {
    id: 'sale-handoff',
    title: 'Sale & home handoff',
    summary: 'The selected history a homeowner may use to answer questions when the property changes hands.',
    keep: ['Major improvement dates', 'Known product and system details', 'Permits and inspection records that apply', 'Transferable warranties and instructions', 'Recent service history', 'Known open items', 'Property-specific manuals and contacts', 'The source behind every supplied fact'],
  },
] as const

const FIRST_RECORD = [
  { label: 'One past project', example: 'Kitchen remodel, around 2019, company name unknown' },
  { label: 'One major system', example: 'Upstairs AC, model from the equipment label' },
  { label: 'One service contact', example: 'The plumber who already knows where the shutoff is' },
  { label: 'One repeated home task', example: 'Filter size and the date it was last changed' },
  { label: 'One unanswered question', example: 'When was the water heater actually installed?' },
] as const

const RECORD_RULES = [
  { title: 'Source beats confidence', body: 'A model label, invoice, permit record, manufacturer document, or dated photograph says more than a memory presented as certain.' },
  { title: 'Dates need context', body: 'Record whether a date is exact, approximate, observed, issued, installed, serviced, or merely entered into the record.' },
  { title: 'Different voices stay separate', body: 'A homeowner observation, contractor proposal, manufacturer instruction, insurer document, and government record answer different questions.' },
  { title: 'Unknown stays unknown', body: 'Leave the gap visible. Add the answer later with its source instead of smoothing the story with a guess.' },
] as const

export default function HomeRecordPage() {
  return (
    <>
      <section className="hub-hero">
        <div className="shell hub-hero__layout">
          <div>
            <p className="eyebrow">The home record</p>
            <h1>Give the house a memory that outlives your inbox.</h1>
            <p className="hub-hero__lede">
              A home record is the useful story behind the property: what was installed, who worked on it, what changed,
              what needs attention, and where the supporting paper trail lives. Start with the facts you know and let the
              record become more complete over time.
            </p>
            <p className="hub-hero__boundary">
              The signed-in Homesrolo workspace starts with whole-home project history and repeatable photo checkups.
              This page is a checklist for the supporting records you may keep securely elsewhere.
            </p>
            <div className="hub-hero__actions">
              <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home record</a>
              <Link className="btn btn--night" href="/home-projects/">Add a home project</Link>
            </div>
          </div>
          <aside className="hub-hero__aside" aria-label="What the home record connects">
            <strong>A complete home history connects</strong>
            <ol>
              <li><span>01</span> Care and maintenance</li>
              <li><span>02</span> Repairs and remodels</li>
              <li><span>03</span> Products and equipment</li>
              <li><span>04</span> People and companies</li>
              <li><span>05</span> Photos and documents</li>
            </ol>
          </aside>
        </div>
      </section>

      <nav className="hub-jump" aria-label="Home record topics">
        <div className="shell">
          <a href="#start-small">Start small</a>
          <a href="#past-work">Past work</a>
          <a href="#systems">Systems</a>
          <a href="#appliances">Appliances</a>
          <a href="#photos">Photos</a>
          <a href="#documents">Documents</a>
          <a href="#insurance-tax">Insurance & tax</a>
          <a href="#inventory">Inventory</a>
          <a href="#sale-handoff">Home handoff</a>
        </div>
      </nav>

      <section id="start-small" className="section hub-section" aria-labelledby="start-record-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">The first page</p>
            <h2 id="start-record-heading">Five honest entries are better than an empty perfect system.</h2>
            <p>
              Do not wait until every drawer has been sorted. Add one useful fact from each part of the home, name what
              you are unsure about, and return when the next receipt, label, photograph, or service visit supplies more.
            </p>
          </div>
          <div className="hub-note">
            <ol className="hub-first-record">
              {FIRST_RECORD.map((item, index) => (
                <li key={item.label}><span>{index + 1}</span><div><strong>{item.label}</strong><small>{item.example}</small></div></li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section section--sunken hub-section" aria-labelledby="record-map-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">The whole record</p>
            <h2 id="record-map-heading">Keep each fact close to the part of the home it explains.</h2>
            <p>
              A document can stay in the secure place where you already keep it. The record should still say what it is,
              what it belongs to, when it was created, who supplied it, and where the original can be found.
            </p>
          </div>
          <div className="hub-record-list">
            {RECORD_SECTIONS.map(section => (
              <article id={section.id} key={section.id} className="hub-record-section">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.summary}</p>
                </div>
                <ul>{section.keep.map(item => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section hub-section" aria-labelledby="source-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">A record someone else can understand</p>
            <h2 id="source-heading">Keep the source and date beside the fact.</h2>
            <p>
              “New roof” could mean a remembered sales claim, a signed contract date, a permit, a product delivery, or
              completed work. The source and date explain what the words actually prove.
            </p>
          </div>
          <div className="hub-card-grid hub-card-grid--four" style={{ marginTop: '2.5rem' }}>
            {RECORD_RULES.map(rule => (
              <article key={rule.title} className="hub-card"><h3>{rule.title}</h3><p>{rule.body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--sunken hub-section" aria-labelledby="privacy-heading">
        <div className="shell hub-split">
          <div className="section-heading">
            <p className="eyebrow">Private by default</p>
            <h2 id="privacy-heading">The home record is not a public home profile.</h2>
            <p>
              Opening a Homesrolo account creates a private home workspace. The home address is not published, and
              starting a project does not send it to a contractor. Keep sensitive originals in the secure storage you
              trust, and decide deliberately what another person needs for the job in front of them.
            </p>
          </div>
          <aside className="hub-note">
            <p className="hub-card__label">A practical sharing rule</p>
            <p>Share the smallest useful packet: the exact project, the relevant equipment or area, and the documents needed for that task—not the unrelated history of the entire home.</p>
          </aside>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Your home already has a history</p>
            <h2>Start writing it down before the next question arrives.</h2>
            <p>One old project or one equipment label is enough to begin.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home record</a>
            <Link className="btn btn--night" href="/home-care/">Plan a home care round</Link>
          </div>
        </div>
      </section>
    </>
  )
}
