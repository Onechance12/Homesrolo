import Link from 'next/link'
import { Illustration } from '../components/Illustration.tsx'
import { HOMEOWNER_APP_ORIGIN, SITE_DESCRIPTION } from '../lib/site.ts'

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

const CHAIN = [
  {
    title: 'Work is recorded',
    body: 'A company writes down what it actually did: materials, dates, the crew, the warranty.',
    provenance: 'recorded by the company',
  },
  {
    title: 'The homeowner reviews it',
    body: 'The record is theirs to read. Nothing about their home moves anywhere without them.',
    provenance: 'controlled by the homeowner',
  },
  {
    title: 'They release what they choose',
    body: 'A release is a decision with a date and a name on it, and it can be narrowed or withdrawn.',
    provenance: 'released · revocable',
  },
  {
    title: 'The proof can travel',
    body: 'A released project can substantiate a profile or ground a review — and it names its own source.',
    provenance: 'source attached, always',
  },
]

/**
 * Leader lines annotating the passport document, drawn the way callouts are
 * drawn on an architectural sheet: from the document's edge out to its margin
 * notes, each line ending in an inked dot. Desktop only; the tags collapse
 * into the document's own footer note on smaller screens.
 */
function PassportCallouts() {
  return (
    <>
      <svg className="callouts__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="d1" d="M64 14 C 71 14, 71 10, 76 10" style={{ vectorEffect: 'non-scaling-stroke', strokeDasharray: 60, strokeDashoffset: 60 }} />
        <path className="d2" d="M67 48 C 72 48, 72 46, 76 46" style={{ vectorEffect: 'non-scaling-stroke', strokeDasharray: 60, strokeDashoffset: 60 }} />
        <path className="d3" d="M60 87 C 70 87, 70 82, 76 82" style={{ vectorEffect: 'non-scaling-stroke', strokeDasharray: 60, strokeDashoffset: 60 }} />
        <circle className="d1" cx="64" cy="14" r="1.1" style={{ vectorEffect: 'non-scaling-stroke' }} />
        <circle className="d2" cx="67" cy="48" r="1.1" style={{ vectorEffect: 'non-scaling-stroke' }} />
        <circle className="d3" cx="60" cy="87" r="1.1" style={{ vectorEffect: 'non-scaling-stroke' }} />
      </svg>
      <span className="callout-tag d1" style={{ top: '7%', right: 0 }}>
        <span><strong>who</strong> did the work</span>
      </span>
      <span className="callout-tag d2" style={{ top: '43%', right: 0 }}>
        <span><strong>what</strong> went on the roof</span>
      </span>
      <span className="callout-tag d3" style={{ top: '79%', right: 0 }}>
        <span><strong>released</strong> by the owner</span>
      </span>
    </>
  )
}

export default function HomePage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'center' }}>
            <div className="prose">
              <p className="kicker">Sheet 01 · <strong>The record</strong></p>
              <h1>Your home should <em>remember</em> its own history.</h1>
              <p className="lede">
                Roofs get replaced, gutters get rerun, and five years later the paperwork is in a drawer, an old
                email, or a company that no longer exists. Homesrolo is the durable record of a home — and the
                Home Project Passport is how real work becomes something a homeowner actually holds.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.75rem' }}>
                <a className="btn btn--primary" href={`${HOMEOWNER_APP_ORIGIN}/signin`}>
                  Create my home account <span className="btn__arrow" aria-hidden="true">→</span>
                </a>
                <Link className="btn btn--quiet" href="/services/roofing/">Get roofing help</Link>
              </div>
            </div>

            <div className="callouts hero-doc">
              <div className="passport" aria-labelledby="passport-sample">
                <p className="passport__serial">
                  <span>Passport entry</span>
                  <span aria-hidden="true">№ 0000-SAMPLE</span>
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <h2 id="passport-sample" style={{ fontSize: '1.25rem' }}>Roof replacement</h2>
                  <span className="stamp">Released</span>
                </div>
                <Illustration kind="roofline" label="Simplified drawing of a pitched roof and wall elevation" />
                <dl style={{ margin: '1.25rem 0 0' }}>
                  <div className="passport__row"><dt>Work</dt><dd>Full tear-off and replacement</dd></div>
                  <div className="passport__row"><dt>Material</dt><dd>30-year architectural shingle</dd></div>
                  <div className="passport__row"><dt>Completed</dt><dd>May 2026</dd></div>
                  <div className="passport__row"><dt>Warranty</dt><dd>Workmanship and manufacturer</dd></div>
                  <div className="passport__row"><dt>Released by</dt><dd>The homeowner</dd></div>
                </dl>
                <p className="provenance" style={{ marginTop: '1rem' }}>
                  Synthetic example. Nothing here describes a real home or a real company.
                </p>
              </div>
              <PassportCallouts />
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="chain-heading">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="kicker">Sheet 02 · <strong>The release chain</strong></p>
            <h2 id="chain-heading">One line, four stations, no shortcuts.</h2>
          </div>
          <ol className="chain">
            {CHAIN.map(station => (
              <li key={station.title}>
                <h3>{station.title}</h3>
                <p>{station.body}</p>
                <span className="provenance">{station.provenance}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2.5rem' }}>
            <p className="kicker">Sheet 03 · <strong>Three layers</strong></p>
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

      <section className="section section--night">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div className="prose">
              <p className="kicker">Sheet 04 · <strong>Start a project</strong></p>
              <h2>The home comes before the <em>contractor.</em></h2>
              <p>
                A roof project should begin with the house, the problem, and the records already attached to it.
                Homesrolo starts there instead of asking you to sort through a paid list of companies.
              </p>
              <p>
                Create the home record, describe the roof need, and keep every later photo, product, invoice, and
                warranty with that same property file.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Link className="btn btn--quiet" href="/professionals/" style={{ borderColor: 'var(--night-rule)', color: 'var(--night-ink)' }}>
                  Start a roof project <span className="btn__arrow" aria-hidden="true">→</span>
                </Link>
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
