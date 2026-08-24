import HomeProjectsPage from '../home-projects/page.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Home projects',
  description: 'Plan home projects, compare written scopes, record approvals, and keep the finished work connected to the property.',
  canonical: '/home-projects/',
  index: false,
})

/** The old path sounded like a contractor directory. It now resolves to the homeowner project guide. */
export default function ProfessionalsPage() {
  return <HomeProjectsPage />
}
