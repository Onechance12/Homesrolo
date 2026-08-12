import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_FORT_WORTH_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Fort Worth roofing guide: permits, decking, scope, and records',
  description: 'Fort Worth homeowner roofing information: when permits apply, decking and structural work, underlayment, drip edge, contractor scope, costs, and closeout records.',
  alternates: { canonical: '/services/roofing/fort-worth/' },
  openGraph: { title: 'Fort Worth roofing guide for homeowners', description: 'Understand Fort Worth roof permit triggers, hidden assembly details, and project records.', url: '/services/roofing/fort-worth/' },
}

const SOURCES = [
  { label: 'Residential permitting: roofing', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information' },
  { label: 'Roofing frequently asked questions', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/files/assets/public/v/1/development-services/documents/roofing-faq.pdf' },
  { label: 'Dallas/Fort Worth climate summary', publisher: 'NOAA National Centers for Environmental Information', href: 'https://www.ncei.noaa.gov/pub/access/cebrequests/2023lcdannual/01202313DFW.pdf' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Roof cost guide', description: 'Account for tear-off, deck repairs, roof geometry, and local closeout.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Contractor checklist', description: 'Make permit responsibility and deck-repair pricing visible in writing.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Add the broader North Texas weather and material context.' },
] as const

export default function FortWorthRoofingPage() {
  return <RoofingArticle eyebrow="Fort Worth, Texas" title="Roofing in Fort Worth: permits, scope, and proof" lede="Fort Worth draws a specific line between shingle replacement and work on the deck or roof structure. The project record needs to capture when the scope crosses that line." pathname="/services/roofing/fort-worth/" sections={ROOFING_FORT_WORTH_GUIDE} sources={SOURCES} related={RELATED} />
}
