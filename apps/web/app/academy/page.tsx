import HomeCarePage from '../home-care/page.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Home care',
  description: 'Practical routines for caring for the systems, spaces, and exterior of a home.',
  canonical: '/home-care/',
  index: false,
})

/** Keep old bookmarks useful while search engines consolidate on /home-care/. */
export default function AcademyPage() {
  return <HomeCarePage />
}
