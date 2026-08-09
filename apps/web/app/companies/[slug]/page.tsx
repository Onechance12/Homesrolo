import { notFound } from 'next/navigation'
import { Illustration } from '../../../components/Illustration.tsx'
import { VerificationFacts } from '../../../components/VerificationFacts.tsx'
import { Sections } from '../../../components/Prose.tsx'
import { LISTING_NOT_ENDORSEMENT, READING_A_LISTING } from '../../../lib/content/education.ts'
import { SYNTHETIC_PROFILES, SYNTHETIC_NOTICE, findSyntheticProfile } from '../../../lib/directory/fixtures.ts'
import { NO_BLANKET_VERIFICATION_NOTICE } from '../../../lib/directory/public-profile.v1.ts'
import { toPublicProjection } from '../../../lib/directory/projection.ts'
import { NEUTRAL_ORDERING_STATEMENT } from '../../../lib/directory/ordering.ts'

const TODAY = '2026-08-09'

const TRADE_LABELS: Record<string, string> = {
  roofing: 'Roofing',
  gutters: 'Gutters',
  siding: 'Siding',
  windows_doors: 'Windows & doors',
  exterior_painting: 'Exterior painting',
  general_contracting: 'General contracting',
}

const LINK_LABELS: Record<string, string> = {
  company_website: 'Company website',
  google_business_profile: 'Google Business Profile',
  bbb: 'Better Business Bureau',
  angi: 'Angi',
  pinterest: 'Pinterest',
}

/**
 * Only these slugs exist in the export. With `dynamicParams = false`, any other
 * path is a build-time 404 rather than a page rendered from nothing.
 */
export function generateStaticParams() {
  return SYNTHETIC_PROFILES.map(profile => ({ slug: profile.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile = findSyntheticProfile(slug)
  if (!profile) return { title: 'Listing not found' }
  return {
    title: `${profile.displayName} (sample listing)`,
    description: profile.summary,
    // Synthetic listings are never indexed. A search result pointing at an
    // invented company is a real-world harm even when the page says so.
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = findSyntheticProfile(slug)
  if (!found) notFound()

  // Render from the allowlisted projection, never from the raw record.
  const profile = toPublicProjection(found)

  return (
    <>
      <section className="section" style={{ paddingBlockEnd: '2rem' }}>
        <div className="shell">
          <div className="synthetic-banner" style={{ marginBottom: '2rem' }} role="note">
            <strong>Sample listing.</strong> {SYNTHETIC_NOTICE}
          </div>

          <div className="prose">
            <p className="eyebrow">Company profile</p>
            <h1>{profile.displayName}</h1>
            <p className="lede">{profile.summary}</p>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            {profile.tradeCategories.map(trade => (
              <span key={trade} className="tag">{TRADE_LABELS[trade] ?? trade}</span>
            ))}
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)', marginTop: '0.75rem' }}>
            Service areas: {profile.serviceAreas.join(' · ')}
          </p>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlock: '3rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '1.5rem' }}>
            <h2>What has been checked</h2>
            <p>{NO_BLANKET_VERIFICATION_NOTICE}</p>
          </div>
          <VerificationFacts facts={profile.verificationFacts} today={TODAY} />
        </div>
      </section>

      {profile.portfolioPreview.length > 0 ? (
        <section className="section">
          <div className="shell">
            <div className="prose" style={{ marginBottom: '1.5rem' }}>
              <h2>Project records</h2>
              <p>
                A released project is one the homeowner chose to publish, with materials and dates attached. An
                unreleased project has no project proof, and that difference is shown rather than smoothed over.
              </p>
            </div>
            <div className="grid grid--3">
              {profile.portfolioPreview.map(item => (
                <article key={item.id} className="card">
                  <Illustration kind={item.illustration} />
                  <h3 className="card__title" style={{ marginTop: '1.15rem', fontSize: '1.05rem' }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: '0.94rem' }}>{item.summary}</p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--ink-faint)', marginTop: '0.85rem' }}>
                    {TRADE_LABELS[item.tradeCategory]} · {item.serviceArea} · completed {item.completedOn}
                  </p>
                  <p style={{ marginTop: '0.75rem' }}>
                    <span className={item.homeownerReleased ? 'chip chip--confirmed' : 'chip chip--neutral'}>
                      {item.homeownerReleased ? 'Homeowner released' : 'Not released'}
                    </span>
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section section--sunken">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div>
              <div className="prose" style={{ marginBottom: '1.25rem' }}>
                <h2>Elsewhere</h2>
                <p>
                  Homesrolo links out and attributes. It does not copy, mirror, or restate what is on another
                  site, and any rating there belongs to that organisation.
                </p>
              </div>
              {profile.externalLinks.length === 0 ? (
                <p style={{ color: 'var(--ink-faint)', fontSize: '0.94rem' }}>
                  No external links are listed for this sample company.
                </p>
              ) : (
                <ul className="link-list">
                  {profile.externalLinks.map(link => (
                    <li key={link.kind} className="link-list__item">
                      <a href={link.url} rel="nofollow noopener noreferrer external" target="_blank">
                        {LINK_LABELS[link.kind] ?? link.kind}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      <p className="link-list__attrib">{link.attribution}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="prose" style={{ marginBottom: '1.25rem' }}>
                <h2>Disclosures</h2>
              </div>
              <ul style={{ paddingLeft: '1.1rem', color: 'var(--ink-soft)', fontSize: '0.94rem' }}>
                {profile.relationshipDisclosures.map(line => (
                  <li key={line} style={{ marginBottom: '0.5rem' }}>{line}</li>
                ))}
                <li style={{ marginBottom: '0.5rem' }}>{LISTING_NOT_ENDORSEMENT}</li>
                <li style={{ marginBottom: '0.5rem' }}>{NEUTRAL_ORDERING_STATEMENT}</li>
                <li>
                  This profile shows no private home record, address, claim detail, or data from any
                  contractor&rsquo;s own system.
                </li>
              </ul>
            </div>
          </div>
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
