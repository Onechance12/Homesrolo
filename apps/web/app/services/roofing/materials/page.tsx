import type { Metadata } from 'next'
import { RoofingArticle } from '../../../../components/RoofingArticle.tsx'
import { ROOFING_MATERIALS_GUIDE } from '../../../../lib/content/education.ts'

export const metadata: Metadata = {
  title: 'Best roofing materials for Texas heat, hail, and wind',
  description: 'Compare asphalt shingles, impact-resistant shingles, metal, tile, slate, and composite roofing for North Texas, including the roof parts hidden underneath.',
  alternates: { canonical: '/services/roofing/materials/' },
  openGraph: { title: 'Roofing materials for Texas homes', description: 'Compare common roof systems for North Texas heat, hail, wind, price, and repairability.', url: '/services/roofing/materials/' },
}

const SOURCES = [
  { label: 'Roofing materials', publisher: 'National Roofing Contractors Association', href: 'https://www.nrca.net/roofing-guidelines/roofing-materials' },
  { label: 'Hail impact-resistant shingle ratings', publisher: 'Insurance Institute for Business & Home Safety', href: 'https://ibhs.org/hail/relative-impact-resistance-of-asphalt-shingles/' },
  { label: 'Hail and how it damages roofs', publisher: 'Insurance Institute for Business & Home Safety', href: 'https://ibhs.org/natural-weathering-and-hazard-exposure/' },
  { label: 'Parts of a residential roof', publisher: 'GAF', href: 'https://www.gaf.com/en-us/plan-design/homeowner-education/roof-parts' },
] as const

const RELATED = [
  { href: '/services/roofing/cost/', title: 'Understand roof cost', description: 'See how product choice and assembly details change the total.' },
  { href: '/services/roofing/choose-a-contractor/', title: 'Choose a contractor', description: 'Confirm that the written scope names the exact product and system.' },
  { href: '/services/roofing/dfw/', title: 'DFW roofing guide', description: 'Put the material decision in North Texas weather and permit context.' },
] as const

export default function RoofingMaterialsPage() {
  return <RoofingArticle eyebrow="Roofing materials" title="Which roofing material fits a Texas home?" lede="Compare the exact product, the full roof system, local weather, repair options, installer experience, price, and warranty before choosing a material." quickAnswer="Architectural asphalt shingles are the common starting point for North Texas homes. Metal, tile, slate, and composite products can fit certain homes and budgets, but each system has different installation, weight, hail, repair, and maintenance considerations. The exact product matters more than the category name." pathname="/services/roofing/materials/" sections={ROOFING_MATERIALS_GUIDE} sources={SOURCES} related={RELATED} />
}
