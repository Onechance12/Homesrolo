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
    </RoofingArticle>
  )
}
