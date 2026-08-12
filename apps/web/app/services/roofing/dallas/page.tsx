import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_DALLAS_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Dallas roofing guide: permits, costs, contractors, and records',
  description: 'Dallas homeowner roofing information: roof permits, cost variables, bid comparison, contractor scope, materials, warranties, and project closeout records.',
  alternates: { canonical: '/services/roofing/dallas/' },
  openGraph: { title: 'Dallas roofing guide for homeowners', description: 'Understand Dallas roof permits, pricing variables, scope, and the records worth keeping.', url: '/services/roofing/dallas/' },
}

const SOURCES = [
  { label: 'Residential permitting and inspections', publisher: 'City of Dallas', href: 'https://dallas.gov/departments/sustainabledevelopment/buildinginspection/Pages/residential.aspx' },
  { label: 'DallasNow terminology reference: roofing permits', publisher: 'City of Dallas Planning & Development', href: 'https://dallas.gov/departments/pnv/Documents/DallasNow%20Terminology%20Reference%20Guide_6.27.25.pdf' },
  { label: 'Dallas roof replacement cost data (updated August 2026)', publisher: 'Angi', href: 'https://www.angi.com/articles/how-much-does-roof-replacement-cost/tx/dallas' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Roof cost guide', description: 'Understand the variables behind a Dallas roofing price.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Contractor checklist', description: 'Compare evidence, scope, permits, and warranty terms.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Add the broader North Texas weather and material context.' },
] as const

export default function DallasRoofingPage() {
  return <RoofingArticle eyebrow="Dallas, Texas" title="Roofing in Dallas: the homeowner’s field guide" lede="A useful Dallas roofing plan connects the city permit record, a line-by-line construction scope, exact materials, contractor evidence, and a complete closeout file." pathname="/services/roofing/dallas/" sections={ROOFING_DALLAS_GUIDE} sources={SOURCES} related={RELATED} />
}
