import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_CONTRACTOR_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'How to choose a roofing contractor in Texas',
  description: 'A neutral Texas roofer checklist: company identity, insurance, references, written scope, materials, permits, warranties, deductible law, and claim boundaries.',
  alternates: { canonical: '/services/roofing/choose-a-contractor/' },
  openGraph: { title: 'How to choose a roofing contractor in Texas', description: 'Check evidence, scope, insurance, permits, warranties, and Texas legal boundaries—not just stars.', url: '/services/roofing/choose-a-contractor/' },
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

export default function ChooseRoofingContractorPage() {
  return <RoofingArticle eyebrow="Texas contractor checklist" title="How to choose a roofing contractor in Texas" lede="The best comparison is evidence first: who the company is, what is insured, what will be installed, who handles permits, what the contract says, and which promises survive in writing." pathname="/services/roofing/choose-a-contractor/" sections={ROOFING_CONTRACTOR_GUIDE} sources={SOURCES} related={RELATED} />
}
