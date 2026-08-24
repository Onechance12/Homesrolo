import EditorialStandardsPage from '../editorial-standards/page.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'How Homesrolo checks information',
  description: 'How Homesrolo checks sources, dates practical guidance, explains limits, and corrects material facts.',
  canonical: '/editorial-standards/',
  index: false,
})

/** Keep the old trust URL useful without maintaining a second, directory-specific explanation. */
export default function HowWeVerifyPage() {
  return <EditorialStandardsPage />
}
