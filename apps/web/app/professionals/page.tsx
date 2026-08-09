import Link from 'next/link'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { READING_A_LISTING, LISTING_NOT_ENDORSEMENT } from '../../lib/content/education.ts'
import { SYNTHETIC_PROFILES, SYNTHETIC_NOTICE } from '../../lib/directory/fixtures.ts'
import { NEUTRAL_ORDERING_STATEMENT, neutralOrder } from '../../lib/directory/ordering.ts'
import { effectiveStatus } from '../../lib/directory/public-profile.v1.ts'
import { DIMENSION_LABELS } from '../../lib/directory/projection.ts'

export const metadata = {
  title: 'Professionals',
  description:
    'Sample company listings ordered by name. Verification is shown as separate facts with sources and dates, '
    + 'and placement is never for sale.',
}

/** Build-time constant so the static export is deterministic. */
const TODAY = '2026-08-09'

const TRADE_LABELS: Record<string, string> = {
  roofing: 'Roofing',
  gutters: 'Gutters',
  siding: 'Siding',
  windows_doors: 'Windows & doors',
  exterior_painting: 'Exterior painting',
  general_contracting: 'General contracting',
}

export default function ProfessionalsPage() {
  const ordered = neutralOrder(SYNTHETIC_PROFILES)

  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Directory"
            title="Professionals"
            lede="Every listing below is synthetic. The format is real: neutral categories, coarse service areas,
              and verification shown as separate facts rather than one badge."
          />
          <div className="synthetic-banner" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            <strong>Sample data.</strong> Every listing on this page is synthetic. {SYNTHETIC_NOTICE}
          </div>
          <div className="note" style={{ marginTop: '1rem', maxWidth: 'var(--measure)' }}>
            {NEUTRAL_ORDERING_STATEMENT} {LISTING_NOT_ENDORSEMENT}
          </div>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <h2 className="prose" style={{ marginBottom: '1.5rem' }}>
            {ordered.length} sample listings, ordered by name
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1.25rem' }}>
            {ordered.map(profile => {
              const confirmed = profile.verificationFacts.filter(
                fact => effectiveStatus(fact, TODAY) === 'confirmed',
              )
              return (
                <li key={profile.slug} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <h3 className="card__title">
                      <Link href={`/companies/${profile.slug}/`}>{profile.displayName}</Link>
                    </h3>
                    <span className="chip chip--neutral">Synthetic</span>
                  </div>
                  <p>{profile.summary}</p>
                  <div style={{ marginTop: '1rem' }}>
                    {profile.tradeCategories.map(trade => (
                      <span key={trade} className="tag">{TRADE_LABELS[trade] ?? trade}</span>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.86rem', color: 'var(--ink-faint)', marginTop: '0.75rem' }}>
                    Service areas: {profile.serviceAreas.join(' · ')}
                  </p>
                  <p style={{ fontSize: '0.86rem', color: 'var(--ink-faint)', marginTop: '0.35rem' }}>
                    {confirmed.length === 0
                      ? 'No dimension is currently confirmed. Open the listing to see what was checked.'
                      : `Confirmed: ${confirmed.map(fact => DIMENSION_LABELS[fact.dimension]).join(', ')}. Open the listing for the other dimensions.`}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <Sections sections={READING_A_LISTING} />
        </div>
      </section>
    </>
  )
}
