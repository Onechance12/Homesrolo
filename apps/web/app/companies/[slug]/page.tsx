import type { Metadata } from 'next'
import Link from 'next/link'

// These were synthetic demonstration URLs in an earlier static export. Render
// can continue serving a removed file from an older deploy, so keep explicit
// redirect artifacts until the host has fully forgotten those paths.
const RETIRED_SAMPLE_SLUGS = ['demo', 'sample-roofworks', 'sample-windowcraft'] as const

export const dynamicParams = false

export const metadata: Metadata = {
  title: 'Professional page moved',
  description: 'This retired demonstration URL now points to Homesrolo information for home professionals.',
  alternates: { canonical: '/for-professionals/' },
  robots: { index: false, follow: true },
}

export function generateStaticParams() {
  return RETIRED_SAMPLE_SLUGS.map(slug => ({ slug }))
}

export default function RetiredCompanyPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/for-professionals/" />
      <section className="section">
        <div className="shell prose">
          <p className="eyebrow">Page moved</p>
          <h1>This demonstration listing has been retired.</h1>
          <p>Homesrolo does not currently publish a contractor directory.</p>
          <p><Link className="btn btn--primary" href="/for-professionals/">Continue to information for home professionals</Link></p>
        </div>
      </section>
    </>
  )
}
