import Link from 'next/link'
import { DocumentaryImage } from '../components/DocumentaryImage.tsx'
import { Illustration } from '../components/Illustration.tsx'
import { HOMEOWNER_SIGNIN_URL, ROOF_WATCH_SMS_URL, SITE_DESCRIPTION } from '../lib/site.ts'

export const metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

const PILLARS = [
  {
    kind: 'frame' as const,
    title: 'Live now: the private Rolodex',
    body: 'A homeowner can create a private account and record planned, active, or completed work across the home. '
      + 'Secure file uploads, homeowner-controlled sharing, and public project proof are not live yet.',
  },
  {
    kind: 'roofline' as const,
    title: 'Product model: the Passport',
    body: 'The Home Project Passport is the model being built: work, materials, dates, warranties, and approved '
      + 'photos organized around the home, with the homeowner deciding what may leave the private record.',
  },
  {
    kind: 'window' as const,
    title: 'Later: proof with provenance',
    body: 'After a real release and verification flow exists, a homeowner-approved project could substantiate a '
      + 'company profile or review. Homesrolo does not claim that public proof exists today.',
  },
]

const CHAIN = [
  {
    title: 'Work is recorded',
    body: 'The model starts with facts about the job: materials, dates, who performed it, and the warranty.',
    provenance: 'designed source · project record',
  },
  {
    title: 'The homeowner reviews it',
    body: 'The homeowner would review the exact record before anything could move outside the private account.',
    provenance: 'designed control · homeowner',
  },
  {
    title: 'They release what they choose',
    body: 'The planned release would name the approved fields, recipient, purpose, date, and withdrawal state.',
    provenance: 'planned capability · not live',
  },
  {
    title: 'The proof can travel',
    body: 'Only a verified, currently active release could later support a public project statement or review.',
    provenance: 'future proof · verification required',
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
        <span><strong>owner-controlled</strong> by design</span>
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
                A roof gets replaced, a kitchen gets remodeled, an HVAC system changes hands—and five years later
                the history is in a drawer, an old email, or a company that no longer exists. Homesrolo is the home
                Rolodex: a durable history for the people who live in or work on a home. Today, a homeowner can open
                a private account and record past, current, or planned work across the property. The complete Home
                Project Passport shown here is the broader product model—not a live sharing or public-proof flow.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.75rem' }}>
                <a className="btn btn--primary" href={HOMEOWNER_SIGNIN_URL}>
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
                  <span className="stamp">Product model</span>
                </div>
                <Illustration kind="roofline" label="Simplified drawing of a pitched roof and wall elevation" />
                <dl style={{ margin: '1.25rem 0 0' }}>
                  <div className="passport__row"><dt>Work</dt><dd>Full tear-off and replacement</dd></div>
                  <div className="passport__row"><dt>Material</dt><dd>30-year architectural shingle</dd></div>
                  <div className="passport__row"><dt>Completed</dt><dd>May 2026</dd></div>
                  <div className="passport__row"><dt>Warranty</dt><dd>Workmanship and manufacturer</dd></div>
                  <div className="passport__row"><dt>Release control</dt><dd>The homeowner</dd></div>
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
            <p className="kicker">Sheet 02 · <strong>The product model</strong></p>
            <h2 id="chain-heading">The release chain Homesrolo is working toward.</h2>
            <p>
              These four stations describe the intended control model, not a feature claim. Public releases,
              recipient sharing, and release-backed reviews are not live today.
            </p>
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

      <section className="section" aria-labelledby="home-roof-watch">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <p className="kicker">Sheet 04 · <strong>First field program</strong></p>
              <h2 id="home-roof-watch">Check the roof once a year. Keep the report.</h2>
              <p>
                Roof Watch is Homesrolo&rsquo;s first field program, not the boundary of the product. Roofing is the
                first deep record because it is expensive, hard to see, and easy to lose track of; the broader home
                Rolodex is designed for every system, room, upgrade, and project. Today, Roof Watch offers a free
                annual roof visit at participating North Texas addresses, with written findings and available
                photos when conditions allow. Current availability, the assigned professional, and the program
                limits are sent before scheduling.
              </p>
              <p>
                The report records visible conditions. It is not a roof certification, insurance decision, or
                requirement to hire the inspecting professional for later work.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Link className="btn btn--primary" href="/roof-watch/">See how Roof Watch works</Link>{' '}
                <a className="btn btn--quiet" href={ROOF_WATCH_SMS_URL}>Text to check availability</a>
              </p>
            </div>
            <figure className="article-field-photo" style={{ marginTop: 0 }}>
              <DocumentaryImage
                src="/images/roof-watch/roof-field-and-hip-ridge-detail.webp"
                width={1200}
                height={991}
                sizes="(max-width: 48rem) 100vw, 50vw"
                alt="Brown asphalt-shingle roof field with adjoining hip and ridge lines"
              />
              <figcaption>
                An archival field photo from the operator&rsquo;s roof library. It shows the orientation detail a
                useful report can preserve; it is not a Roof Watch finding about a particular home.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="section section--night">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div className="prose">
              <p className="kicker">Sheet 05 · <strong>Start a project</strong></p>
              <h2>The home comes before the <em>contractor.</em></h2>
              <p>
                A home project should begin with the property, the need, and the history already attached to it.
                Homesrolo starts there instead of asking you to sort through a paid list of companies.
              </p>
              <p>
                Today, you can record planned, active, or completed work across roofing, interiors, HVAC, plumbing,
                electrical, exterior work, appliances, landscaping, pest care, pools, and new construction. Secure
                document and photo uploads are not live yet, so this page does not promise storage the product cannot provide.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <Link className="btn btn--quiet" href="/professionals/" style={{ borderColor: 'var(--night-rule)', color: 'var(--night-ink)' }}>
                  Start a home project <span className="btn__arrow" aria-hidden="true">→</span>
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
