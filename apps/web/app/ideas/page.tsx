import HomeProjectsPage from '../home-projects/page.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Home projects and remodel planning',
  description: 'Plan a repair, remodel, upgrade, or new build with a clearer scope, approvals, and closeout record.',
  canonical: '/home-projects/',
  index: false,
})

/** Old inspiration links now land on the complete project-planning guide. */
export default function IdeasPage() {
  return <HomeProjectsPage />
}
