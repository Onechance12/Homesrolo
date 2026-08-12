import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_CONTRACTOR_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'How to choose a roofing contractor in Texas',
  description: 'A neutral Texas roofer checklist: company identity, insurance, references, written scope, materials, permits, warranties, deductible law, and claim boundaries.',
  alternates: { canonical: '/services/roofing/choose-a-contractor/' },
  openGraph: { title: 'How to choose a roofing contractor in Texas', description: 'Check the company, insurance, scope, materials, permits, references, warranties, and Texas insurance rules.', url: '/services/roofing/choose-a-contractor/' },
}

const SOURCES = [
  { label: 'Selecting a roofing contractor', publisher: 'Roofing Contractors Association of Texas', href: 'https://www.rcat.net/selecting-a-roofing-contractor.html' },
  { label: 'Roofing and insurance: know the law', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html' },
  { label: 'How to avoid a home improvement scam', publisher: 'Federal Trade Commission', href: 'https://consumer.ftc.gov/articles/how-avoid-home-improvement-scam' },
  { label: 'Unlicensed individuals and entities adjusting claims: FAQ', publisher: 'Texas Department of Insurance', href: 'https://www.tdi.texas.gov/bulletins/2014/documents/unlicensedfaq.pdf' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Compare roof costs', description: 'Turn proposals into the same rows before comparing totals.' },
  { href: '/services/roofing/materials/', title: 'Compare materials', description: 'Know which exact product and assembly details belong in the scope.' },
  { href: '/how-we-verify/', title: 'How Homesrolo verifies', description: 'See why each fact needs its own source, status, and date.' },
] as const

const QUESTIONS = [
  'What is the legal company name and physical business address?',
  'Can the insurance certificate be confirmed with the issuing agent?',
  'Who will supervise the crew working on the house?',
  'How many roofing squares are included, and where did the measurement come from?',
  'Which manufacturer and exact product line will be installed?',
  'What underlayment, flashing, vents, pipe boots, starter, and ridge material are included?',
  'What is the price per sheet if damaged decking is found?',
  'Who obtains the permit and provides the closeout record?',
  'How are change orders approved?',
  'What do the workmanship and manufacturer warranties cover?',
  'What are the payment milestones and cancellation terms?',
  'Which project documents and photographs will the homeowner receive?',
] as const

export default function ChooseRoofingContractorPage() {
  return (
    <RoofingArticle eyebrow="Texas contractor checklist" title="How to choose a roofing contractor in Texas" lede="Confirm the company, insurance, crew, materials, scope, permits, payment terms, and warranties before signing a roofing contract." quickAnswer="A good roofing comparison starts with documents you can check. Confirm the business and insurance, compare itemized scopes, call recent local references, verify permit responsibility, and put every product, price, and promise in writing." pathname="/services/roofing/choose-a-contractor/" sections={ROOFING_CONTRACTOR_GUIDE} sources={SOURCES} related={RELATED}>
      <section className="section">
        <div className="shell">
          <div className="prose">
            <p className="eyebrow">Take this list to the estimate</p>
            <h2>12 questions to ask a roofer</h2>
            <ol className="question-list">
              {QUESTIONS.map(question => <li key={question}>{question}</li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="section section--night" aria-labelledby="roofer-red-flags">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <p className="eyebrow">Slow down here</p>
            <h2 id="roofer-red-flags">Seven signs the paperwork is not ready for a signature</h2>
            <p>One weak detail does not prove a company is dishonest. It does mean the question should be answered before money or control of the project changes hands.</p>
          </div>
          <div className="grid grid--2">
            <article className="card"><h3 className="card__title">The company identity moves around</h3><p>The sales name, legal name, payment name, contract name, and insurance name do not match, or no physical business address is provided.</p></article>
            <article className="card"><h3 className="card__title">The insurance proof cannot be verified</h3><p>A screenshot or certificate is offered, but the issuing agent cannot confirm current coverage for the company doing the work.</p></article>
            <article className="card"><h3 className="card__title">The price is only “insurance proceeds”</h3><p>The agreement takes whatever insurance pays but does not define a measured construction scope, exact products, or homeowner-selected upgrades.</p></article>
            <article className="card"><h3 className="card__title">Hidden work has no unit price</h3><p>Decking, flashing, code work, or other changes are simply “extra” with no price, evidence requirement, or approval process.</p></article>
            <article className="card"><h3 className="card__title">A fast signature matters more than a clear scope</h3><p>Questions are brushed aside, blank spaces remain, verbal promises are not added, or a same-day decision is treated as the only way to keep the price.</p></article>
            <article className="card"><h3 className="card__title">The deductible becomes a discount</h3><p>The proposal offers to waive, absorb, rebate, credit, or hide an insurance deductible. Texas law prohibits that arrangement.</p></article>
            <article className="card"><h3 className="card__title">Completion has no definition</h3><p>Final payment is due when the crew finishes, but the agreement says nothing about cleanup, punch-list work, permit result, invoice, photos, warranty, or lien paperwork.</p></article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="contractor-proof-packet">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="eyebrow">Before the deposit</p>
              <h2 id="contractor-proof-packet">Build a small proof packet for the company and the project</h2>
              <p>Homesrolo separates the company check from the project decision. A real company can still write an incomplete scope. A detailed proposal can still come from a company whose current insurance or identity has not been confirmed.</p>
            </div>
            <ul className="plain-checklist">
              <li><strong>Company:</strong> legal name, business address, responsible contact, and how long that entity has operated.</li>
              <li><strong>Insurance:</strong> certificate, policy dates, named insured, and independent confirmation from the issuing agent.</li>
              <li><strong>Local:</strong> recent nearby references, city registration when required, and permit responsibility.</li>
              <li><strong>Project:</strong> measurement, exact scope, exact products, change rules, schedule, property protection, and payment triggers.</li>
              <li><strong>Closeout:</strong> inspection or permit result, invoice, proof of payment, photographs, warranties, registration, and lien documents when applicable.</li>
            </ul>
          </div>
        </div>
      </section>
    </RoofingArticle>
  )
}
