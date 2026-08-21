import Link from 'next/link'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_REPAIR_REPLACE_GUIDE } from '../../../../lib/content/education.ts'
import { publicPageMetadata } from '../../../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Roof repair vs replacement: a Texas homeowner decision guide',
  description: 'Should a roof be repaired or replaced? Compare leaks, roof age, damage extent, material matching, repair history, cost, storm evidence, and written inspection findings.',
  canonical: '/services/roofing/repair-or-replace/',
  openGraphType: 'article',
  socialTitle: 'Roof repair or replacement? A Texas homeowner guide',
  socialDescription: 'Use condition, repairability, written scope, and cost evidence instead of a blanket age or percentage rule.',
})

const SOURCES = [
  { label: 'Understanding residential roof repairs', publisher: 'GAF', href: 'https://www.gaf.com/en-us/blog/your-home/understanding-residential-roof-repairs-how-do-i-know-if-my-roof-needs-to-be-replaced-734dcc7e-9074-4ef7-8ad4-e5297f93a8da' },
  { label: 'Guide to roof repairs', publisher: 'GAF', href: 'https://www.gaf.com/en-us/plan-design/homeowner-education/roof-damage/roof-repair' },
  { label: 'Insurance and your roof', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/tips/replacing-your-roof.html' },
  { label: 'Hail damage: what to do next', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/tips/after-hail-or-windstorms.html' },
  { label: 'Maintaining residential roof systems', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofingguidelines/pdf?id=169193&k=2173279' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Compare roof costs', description: 'Turn repair and replacement proposals into the same scope rows.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Choose a roofing contractor', description: 'Verify the company, inspection, written scope, payment terms, and warranty.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Add North Texas storm, material, and city-rule context.' },
] as const

const FAQ = [
  {
    question: 'Can a roof be repaired instead of replaced?',
    answer: 'Often, yes. A repair is easier to support when the problem is isolated, the surrounding roof remains serviceable, compatible material is available, and the written scope fixes the source rather than only covering the symptom.',
  },
  {
    question: 'Does a leaking roof need to be replaced?',
    answer: 'Not automatically. A leak may come from one pipe boot, wall flashing, valley, vent, fastener, or small roof area. Repeated leaks, widespread deterioration, unsafe decking, or an unreliable tie-in can make replacement more reasonable to compare.',
  },
  {
    question: 'How old is too old to repair a roof?',
    answer: 'There is no single age that answers the question for every roof. Installation quality, material, maintenance, storms, repair history, brittleness, matching material, and present condition matter along with the installation date.',
  },
  {
    question: 'Can only one section or slope of a roof be replaced?',
    answer: 'Sometimes. The decision depends on the roof design, tie-in details, material compatibility, appearance, code and permit requirements, manufacturer instructions, and whether the remaining roof can be worked around without causing damage.',
  },
  {
    question: 'What should a roof repair estimate include?',
    answer: 'A useful repair estimate identifies the exact location, removal area, deck or flashing work, replacement materials, tie-in method, photographs, exclusions, price, change-order process, cleanup, and workmanship coverage.',
  },
  {
    question: 'Does an insurance estimate decide whether the roof is repaired or replaced?',
    answer: 'An insurance estimate records a carrier position at that time. A construction decision still needs roof-specific condition evidence, a defined scope, local requirements, repairability, and a contractor proposal. Policy questions belong with a licensed insurance professional.',
  },
] as const

export default function RoofRepairOrReplacePage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <RoofingArticle
        eyebrow="Roof repair or replacement"
        title="Should the roof be repaired or replaced?"
        lede="Skip the one-number rules. A useful decision connects the leak or damage to the roof’s actual condition, repairability, scope, cost, and remaining uncertainty."
        quickAnswer="A roof can often be repaired when the problem is isolated and the surrounding system can accept a durable tie-in. Replacement deserves comparison when failures are repeated or widespread, materials cannot be worked around or matched reliably, deeper assembly problems exist, or repairs would leave too much unresolved. Age is evidence, not the verdict."
        pathname="/services/roofing/repair-or-replace/"
        sections={ROOFING_REPAIR_REPLACE_GUIDE}
        sources={SOURCES}
        related={RELATED}
      >
        <section className="section" aria-labelledby="repair-replace-matrix">
          <div className="shell">
            <div className="prose" style={{ marginBottom: '2rem' }}>
              <p className="eyebrow">Condition before conclusion</p>
              <h2 id="repair-replace-matrix">What changes the repair-or-replacement decision?</h2>
              <p>No single row decides the project. The useful question is whether the observed problem can be corrected without leaving an unreliable roof around it.</p>
            </div>
            <div className="table-scroll">
              <table className="compare">
                <thead><tr><th>Observed situation</th><th>Evidence that supports a repair</th><th>Evidence that makes replacement worth comparing</th></tr></thead>
                <tbody>
                  <tr><th>One active leak</th><td>A confirmed local source with sound surrounding material and a defined tie-in</td><td>Several possible sources, wet or damaged decking across a larger area, or earlier repairs that did not hold</td></tr>
                  <tr><th>Missing or damaged shingles</th><td>A small mapped area, compatible material, and shingles that can be lifted without breaking nearby courses</td><td>Damage across multiple slopes, brittle surrounding shingles, failed seals, or no reliable material match</td></tr>
                  <tr><th>Older roof</th><td>Known installation, limited repair history, serviceable field material, and sound flashings and deck</td><td>Unknown assembly, repeated repairs, widespread wear, fragile material, or several systems reaching failure together</td></tr>
                  <tr><th>Storm concern</th><td>Isolated documented damage with a specific repair scope</td><td>Roof-wide observations supported by photographs and a scope that explains why spot work would remain unreliable</td></tr>
                  <tr><th>High repair price</th><td>The repair restores a defined area with useful workmanship coverage and leaves a serviceable surrounding roof</td><td>Several repairs approach the cost of a complete system while leaving old underlayment, flashings, or uncertain areas in place</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section section--night" aria-labelledby="roof-leak-now">
          <div className="shell">
            <div className="grid grid--2" style={{ alignItems: 'start', gap: '3rem' }}>
              <div className="prose">
                <p className="eyebrow">If water is entering now</p>
                <h2 id="roof-leak-now">Protect the house before debating the whole roof</h2>
                <p>People and active electrical hazards come first. Safe photographs, the time water appeared, affected rooms, temporary protection, and receipts create a useful starting record. Walking on a wet or storm-damaged roof adds risk and is not required to document an interior leak.</p>
                <p><a href="https://www.tdi.texas.gov/tips/after-hail-or-windstorms.html" rel="noreferrer">Texas Department of Insurance storm steps</a></p>
              </div>
              <ol className="question-list">
                <li>Record where water appeared and whether it changes with wind direction or rain intensity.</li>
                <li>Photograph ceilings, walls, floors, belongings, and safe attic observations before cleanup changes the scene.</li>
                <li>Keep the emergency dry-in or temporary-repair scope and every receipt.</li>
                <li>Ask the inspection to identify the suspected entry point and the evidence supporting that conclusion.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="roofing-shortcuts">
          <div className="shell">
            <div className="prose" style={{ marginBottom: '2rem' }}>
              <p className="eyebrow">Four shortcuts that hide the real answer</p>
              <h2 id="roofing-shortcuts">A simple rule is useful only when it fits the roof</h2>
            </div>
            <div className="grid grid--2">
              <article className="card"><h3 className="card__title">“It is over 15 years old”</h3><p>Age changes the risk and repair economics, but it does not replace photographs, material condition, repair history, and a roof-specific scope.</p></article>
              <article className="card"><h3 className="card__title">“More than 30% means replacement”</h3><p>Percentage rules appear often online. The real boundary can depend on jurisdiction, roof design, material, tie-ins, manufacturer instructions, and what the measured area actually represents.</p></article>
              <article className="card"><h3 className="card__title">“The insurance estimate says so”</h3><p>A carrier estimate and a contractor scope answer different questions. Keep each document with its author, date, assumptions, and later revisions.</p></article>
              <article className="card"><h3 className="card__title">“The leak was sealed”</h3><p>Sealant may be part of a repair, but a useful closeout record still identifies the source, preparation, materials, repaired area, photographs, and workmanship coverage.</p></article>
            </div>
          </div>
        </section>

        <section className="section section--sunken" aria-labelledby="decision-packet">
          <div className="shell">
            <div className="grid grid--2" style={{ alignItems: 'start', gap: '3rem' }}>
              <div className="prose">
                <p className="eyebrow">The decision packet</p>
                <h2 id="decision-packet">Ask both options to answer the same six questions</h2>
                <p>A homeowner cannot compare “repair for $900” with “roof for $18,000” until both proposals define the problem and the work. The packet below turns competing opinions into comparable records.</p>
                <p><Link href="/services/roofing/cost/">Use the roof-cost guide to compare the final scopes.</Link></p>
              </div>
              <ol className="question-list">
                <li>What exact condition was observed, and where is it on the roof diagram?</li>
                <li>What is the most likely source, and what evidence supports that conclusion?</li>
                <li>What material must be removed to complete the repair or replacement?</li>
                <li>What remains unknown until material is opened, and how is that change priced?</li>
                <li>What areas and future failures are excluded from this scope and warranty?</li>
                <li>What photographs and closeout documents will prove what was completed?</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="repair-replace-faq">
          <div className="shell">
            <div className="prose" style={{ marginBottom: '2rem' }}>
              <p className="eyebrow">Quick answers</p>
              <h2 id="repair-replace-faq">Roof repair versus replacement FAQ</h2>
            </div>
            <div className="grid grid--2">
              {FAQ.map(item => (
                <article className="answer-card" key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </RoofingArticle>
    </>
  )
}
