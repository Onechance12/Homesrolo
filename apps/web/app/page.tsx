import Link from 'next/link'
import { Illustration } from '../components/Illustration.tsx'
import { SITE_DESCRIPTION } from '../lib/site.ts'

export const metadata = {
  description: SITE_DESCRIPTION,
}

const PILLARS = [
  {
    kind: 'frame' as const,
    title: 'A private home file',
    body: 'One durable record for the property itself, separate from any company, any job, and any single owner. '
      + 'Being in the file is not the same as being visible: every contribution has a controller, and everything '
      + 'else is closed by default.',
  },
  {
    kind: 'roofline' as const,
    title: 'The Home Project Passport',
    body: 'A homeowner reviews what a company recorded and releases the parts they choose. A released project '
      + 'carries materials, dates, warranty documents, approved photos, and who performed the work.',
  },
  {
    kind: 'window' as const,
    title: 'Proof that travels',
    body: 'Because a release names its own provenance, it can later substantiate a company profile, ground a '
      + 'review in a real project, and answer the questions a future owner or inspector will ask.',
  },
]

export default function HomePage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'center' }}>
            <div className="prose">
              <p className="eyebrow">Phase 0.5 preview</p>
              <h1>Your home should remember its own history.</h1>
              <p className="lede">
                Roofs get replaced, gutters get rerun, and five years later the paperwork is in a drawer, an old
                email, or a company that no longer exists. Homesrolo is the durable record of a home — and the
                Home Project Passport is how real work becomes something a homeowner actually holds.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.75rem' }}>
                <Link className="btn btn--primary" href="/how-it-works/">See how it works</Link>
                <Link className="btn btn--quiet" href="/how-we-verify/">How we verify</Link>
              </div>
            </div>

            <div className="passport" aria-labelledby="passport-sample">
              <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>Sample passport entry</p>
              <h2 id="passport-sample" style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
                Roof replacement
              </h2>
              <Illustration kind="roofline" label="Simplified drawing of a pitched roof and wall elevation" />
              <dl style={{ margin: '1.25rem 0 0' }}>
                <div className="passport__row"><dt>Work</dt><dd>Full tear-off and replacement</dd></div>
                <div className="passport__row"><dt>Material</dt><dd>30-year architectural shingle</dd></div>
                <div className="passport__row"><dt>Completed</dt><dd>May 2026</dd></div>
                <div className="passport__row"><dt>Warranty</dt><dd>Workmanship and manufacturer</dd></div>
                <div className="passport__row"><dt>Released by</dt><dd>The homeowner</dd></div>
              </dl>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginTop: '1rem' }}>
                Synthetic example. Nothing here describes a real home or a real company.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="eyebrow">What Homesrolo is</p>
            <h2>Three layers, and a hard line between them.</h2>
            <p>
              The private record of a home and the public record of a company are different things with different
              rules. Keeping them separate is the whole design, not a detail.
            </p>
          </div>
          <div className="grid grid--3">
            {PILLARS.map(pillar => (
              <article key={pillar.title} className="card">
                <Illustration kind={pillar.kind} />
                <h3 className="card__title" style={{ marginTop: '1.15rem' }}>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div className="prose">
              <p className="eyebrow">Why not just another directory</p>
              <h2>Most listings ask you to trust an adjective.</h2>
              <p>
                Sites full of star ratings and badges rarely tell you what was checked, who checked it, or when.
                Homesrolo starts from the opposite end: a record of work that a homeowner released, with the
                materials and dates attached, and facts that each name their own source.
              </p>
              <p>
                That means some listings look sparse. A company with a confirmed registration and nothing else
                shows exactly that. Sparse and honest is the point.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Link className="btn btn--quiet" href="/professionals/">Look at a sample listing</Link>
              </p>
            </div>
            <div className="stack" style={{ '--stack-gap': '1rem' } as React.CSSProperties}>
              <div className="note">
                <strong>Verification is never for sale.</strong> No payment, sponsorship, or advertising can
                create or upgrade a fact, and listings are ordered by name only.
              </div>
              <div className="note">
                <strong>Your private records stay private.</strong> A public profile never shows a home file, an
                address, a claim detail, or anything from a contractor&rsquo;s own system.
              </div>
              <div className="note">
                <strong>Education, not advice.</strong> Homesrolo explains how things generally work. It does not
                advise on your claim, your policy, or your settlement.
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
