import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../../components/Prose.tsx'
import { ROOF_WATCH_GUIDES } from '../../../lib/content/roof-watch-guides.ts'

export const metadata: Metadata = {
  title: 'Roof Watch guides: straight talk about North Texas roofs',
  description: 'Storm playbooks, inspection know-how, and the slow ways Texas weather ages a roof. Written for homeowners, not for search engines, though the search engines are welcome too.',
  alternates: { canonical: '/roof-watch/guides/' },
}

export default function RoofWatchGuidesPage() {
  return (
    <section className="section">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/roof-watch/">Roof Watch</Link> <span aria-hidden="true">/</span> Guides
        </nav>
        <PageHeader
          eyebrow="Roof Watch guides"
          title="Straight talk about North Texas roofs"
          lede="No scare tactics, no countdown timers, no five hundred words of filler before the answer. Just the stuff a homeowner actually needs to know, written by people who’d rather explain a roof than sell you one."
        />
        <div className="grid grid--2" style={{ marginTop: '2rem' }}>
          {ROOF_WATCH_GUIDES.map(guide => (
            <div key={guide.slug} className="card">
              <p className="eyebrow">{guide.eyebrow}</p>
              <h2 className="card__title"><Link href={`/roof-watch/guides/${guide.slug}/`}>{guide.title}</Link></h2>
              <p>{guide.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
