import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_DFW_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'DFW roofing guide for Dallas Fort Worth homeowners',
  description: 'Dallas Fort Worth roofing information about North Texas hail, wind, heat, city permit differences, materials, contractor scopes, and roof records.',
  alternates: { canonical: '/services/roofing/dfw/' },
  openGraph: { title: 'Dallas Fort Worth roofing guide', description: 'North Texas roofing, permits, materials, contractor scopes, and project records.', url: '/services/roofing/dfw/' },
}

const SOURCES = [
  { label: 'Dallas/Fort Worth climate summary', publisher: 'NOAA National Centers for Environmental Information', href: 'https://www.ncei.noaa.gov/pub/access/cebrequests/2023lcdannual/01202313DFW.pdf' },
  { label: 'Residential permitting', publisher: 'City of Fort Worth', href: 'https://www.fortworthtexas.gov/departments/development-services/permits/residential-information' },
  { label: 'Residential permitting and inspections', publisher: 'City of Dallas', href: 'https://dallas.gov/departments/sustainabledevelopment/buildinginspection/Pages/residential.aspx' },
] as const

const RELATED = [
  { href: '/services/roofing/dallas/', title: 'Dallas roofing guide', description: 'City permit context and closeout records for Dallas homes.' },
  { href: '/services/roofing/fort-worth/', title: 'Fort Worth roofing guide', description: 'The local line between shingle replacement and structural work.' },
  { href: '/services/roofing/materials/', title: 'Texas roofing materials', description: 'Compare common systems against North Texas conditions.' },
] as const

export default function DfwRoofingPage() {
  return <RoofingArticle eyebrow="Dallas Fort Worth" title="A DFW roofing guide for homeowners" lede="North Texas roofs face hot summers, severe thunderstorms, and different permit rules from one city to the next. This guide explains what to check before work begins and what to save afterward." quickAnswer="For a DFW roofing project, verify the rule for the property’s city, compare the complete roof system instead of the shingle alone, confirm the contractor and insurance, and keep photographs and closeout documents with the home." pathname="/services/roofing/dfw/" sections={ROOFING_DFW_GUIDE} sources={SOURCES} related={RELATED} />
}
