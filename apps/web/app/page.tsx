import Link from 'next/link'
import { DocumentaryImage } from '../components/DocumentaryImage.tsx'
import { HOMEOWNER_SIGNIN_URL, ROOF_WATCH_SMS_URL, SITE_DESCRIPTION } from '../lib/site.ts'

export const metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

const PROJECT_MODES = [
  {
    label: 'Plan it',
    title: 'Work you are considering',
    body: 'Start with the questions, room, system, or problem. A plan can exist before you choose a company.',
  },
  {
    label: 'Track it',
    title: 'Work happening now',
    body: 'Keep the project name, status, and the facts you want the home to remember in one private place.',
  },
  {
    label: 'Remember it',
    title: 'Work already completed',
    body: 'Record the old remodel, replacement, or repair even when the exact date and every detail are unknown.',
  },
] as const

const HOME_CHAPTERS = [
  'Roof',
  'Interior & remodel',
  'Heating & cooling',
  'Plumbing',
  'Electrical',
  'Exterior & gutters',
  'Yard & landscaping',
  'Appliances',
  'Pest control',
  'Pool',
  'New construction',
  'Something else',
] as const

const FUTURE_CONTROLS = [
  {
    title: 'Invite the pro you chose',
    body: 'A future Project Room starts with the homeowner, not a sold lead or a broadcast to strangers.',
  },
  {
    title: 'Limit what the room can see',
    body: 'The professional should see that project. They should not see the rest of the home record or another company’s proposal.',
  },
  {
    title: 'Approve the exact change',
    body: 'Estimate revisions, scope changes, and arrival details should be explicit before work moves forward.',
  },
  {
    title: 'Keep the handoff',
    body: 'Completion photos, warranties, receipts, and care details should remain with the home after access ends.',
  },
] as const

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="shell">
          <div className="home-hero__layout">
            <div className="home-hero__copy">
              <p className="home-hero__eyebrow">The private Rolodex for your home</p>
              <h1>Your home has a lot to remember.</h1>
              <p className="home-hero__lede">
                Keep maintenance, repairs, remodels, and service visits organized around the home instead of buried
                in texts, email, and drawers. Seasonal photo checkups and roof proposal notes are in private beta.
              </p>
              <div className="home-hero__actions">
                <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>
                  Start my home record <span className="btn__arrow" aria-hidden="true">→</span>
                </a>
                <Link className="btn btn--night" href="/how-it-works/">See how it works</Link>
              </div>
              <ul className="home-hero__proof" aria-label="Homesrolo account promises">
                <li>Address is not published</li>
                <li>Project is not sent to a pro</li>
              </ul>
            </div>

            <div className="home-stream" role="group" aria-label="Illustrative private home activity record">
              <span className="home-stream__tab home-stream__tab--one" aria-hidden="true" />
              <span className="home-stream__tab home-stream__tab--two" aria-hidden="true" />
              <div className="home-stream__head">
                <div>
                  <span>Sample home record</span>
                  <strong>Recent activity</strong>
                </div>
                <span className="status-pill status-pill--private">Private</span>
              </div>
              <ol className="home-stream__list">
                <li>
                  <span className="activity-dot activity-dot--live" aria-hidden="true" />
                  <div>
                    <strong>Kitchen remodel</strong>
                    <span>Completed · project notes recorded</span>
                  </div>
                  <span className="activity-state">Live</span>
                </li>
                <li>
                  <span className="activity-dot activity-dot--beta" aria-hidden="true" />
                  <div>
                    <strong>Front exterior checkup</strong>
                    <span>Two repeatable views saved</span>
                  </div>
                  <span className="activity-state activity-state--beta">Beta</span>
                </li>
                <li>
                  <span className="activity-dot activity-dot--beta" aria-hidden="true" />
                  <div>
                    <strong>Roof proposals</strong>
                    <span>Two homeowner-entered scope records · no price score</span>
                  </div>
                  <span className="activity-state activity-state--beta">Beta</span>
                </li>
                <li>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <strong>Spring AC service</strong>
                    <span>Planned project · details still open</span>
                  </div>
                  <span className="activity-state">Live</span>
                </li>
              </ol>
              <p className="home-stream__note">Illustrative record. Homesrolo does not publish the private home record.</p>
            </div>
          </div>

          <div className="status-rail" role="group" aria-label="Homesrolo product status">
            <div>
              <span className="status-rail__dot status-rail__dot--live" aria-hidden="true" />
              <p><strong>Live now</strong> Private homes and whole-home project records</p>
            </div>
            <div>
              <span className="status-rail__dot status-rail__dot--beta" aria-hidden="true" />
              <p><strong>Private beta</strong> Photo checkups and roof proposal notes</p>
            </div>
            <div>
              <span className="status-rail__dot" aria-hidden="true" />
              <p><strong>In development</strong> Project Rooms, controlled sharing, and arrival details</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section home-start" aria-labelledby="start-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Start wherever you are</p>
            <h2 id="start-heading">You do not need perfect records to begin.</h2>
            <p>
              Add the project you only remember as “around 2019.” Start with the leak you are watching. Unknown is
              allowed. The record gets better as you find things.
            </p>
          </div>
          <div className="project-modes">
            {PROJECT_MODES.map((mode, index) => (
              <article key={mode.label}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{mode.label}</p>
                <h3>{mode.title}</h3>
                <p>{mode.body}</p>
              </article>
            ))}
          </div>
          <p className="section-action">
            <a className="btn btn--primary" href={HOMEOWNER_SIGNIN_URL}>Add the first project</a>
          </p>
        </div>
      </section>

      <section className="section whole-home" aria-labelledby="whole-home-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">The whole home</p>
            <h2 id="whole-home-heading">One home. Every chapter.</h2>
            <p>
              Roofing is where Homesrolo started going deep. The home Rolodex is for every room, system, upgrade,
              service visit, and project that comes next.
            </p>
          </div>
          <ul className="home-index">
            {HOME_CHAPTERS.map((chapter, index) => (
              <li key={chapter}><span>{String(index + 1).padStart(2, '0')}</span>{chapter}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section photo-checkups" aria-labelledby="photo-checkups-heading">
        <div className="shell photo-checkups__layout">
          <div className="section-heading">
            <p className="eyebrow">Private beta · Photo checkups</p>
            <h2 id="photo-checkups-heading">Look at the same place twice. That is when a photo gets useful.</h2>
            <p>
              Seasonal checkups let a homeowner save private JPEG or PNG photos by exact area, repeatable view, and
              observed date. The latest two views can sit together so change is easier to notice.
            </p>
            <p className="boundary-note">
              Homesrolo organizes the record. It does not diagnose damage or decide what a photo means.
            </p>
          </div>
          <div className="checkup-preview" role="group" aria-label="Illustrative seasonal photo checkup interface">
            <div className="checkup-preview__head">
              <div>
                <span>Front exterior</span>
                <strong>Driveway view</strong>
              </div>
              <span className="status-pill status-pill--beta">Private beta</span>
            </div>
            <div className="checkup-preview__pair">
              <div className="snapshot-card">
                <div className="snapshot-card__frame" aria-hidden="true"><span /></div>
                <strong>March 12, 2026</strong>
                <span>Spring checkup</span>
              </div>
              <div className="snapshot-card">
                <div className="snapshot-card__frame snapshot-card__frame--later" aria-hidden="true"><span /></div>
                <strong>August 18, 2026</strong>
                <span>Summer checkup</span>
              </div>
            </div>
            <p>Illustrative interface · checkup photos are not public or sent to a professional</p>
          </div>
        </div>
      </section>

      <section className="section roof-chapter" aria-labelledby="home-roof-watch">
        <div className="shell roof-chapter__layout">
          <figure className="roof-chapter__photo">
            <DocumentaryImage
              src="/images/roof-watch/roof-field-and-hip-ridge-detail.webp"
              width={1200}
              height={991}
              sizes="(max-width: 48rem) 100vw, 52vw"
              alt="Brown asphalt-shingle roof field with adjoining hip and ridge lines"
            />
            <figcaption>
              <details>
                <summary>Field photo · roof ridge orientation</summary>
                <p>
                  An archival photo from the operator’s roof library. It shows the kind of orientation detail a
                  useful record can preserve; it is not a Roof Watch finding about a particular home.
                </p>
              </details>
            </figcaption>
          </figure>
          <div className="section-heading">
            <p className="eyebrow">First field program</p>
            <h2 id="home-roof-watch">Roofing is one chapter. It is the first one we went deep on.</h2>
            <p>
              Roof Watch offers a free annual roof visit at participating North Texas addresses, with written
              findings and photos when conditions allow. Availability, the assigned professional, and the program
              limits are sent before scheduling.
            </p>
            <p>
              The report records visible conditions. It is not a roof certification, insurance decision, or
              requirement to hire the inspecting professional.
            </p>
            <div className="section-actions">
              <Link className="btn btn--primary" href="/roof-watch/">See Roof Watch</Link>
              <a className="btn btn--quiet" href={ROOF_WATCH_SMS_URL}>Text to check my address</a>
            </div>
          </div>
        </div>
      </section>

      <section className="future-control" aria-labelledby="future-control-heading">
        <div className="shell">
          <div className="future-control__intro">
            <p className="future-control__label">Being built · Not live today</p>
            <h2 id="future-control-heading">A safer front door for home projects.</h2>
            <p>
              Homesrolo is building private Project Rooms so a homeowner can know who is coming, what that person
              can see, what changed, and exactly what was approved.
            </p>
          </div>
          <div className="future-control__grid">
            {FUTURE_CONTROLS.map((control, index) => (
              <article key={control.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{control.title}</h3>
                <p>{control.body}</p>
              </article>
            ))}
          </div>
          <p className="future-control__boundary">
            Project Rooms, professional invitations, sharing, visitor identity, and saved approval records are not
            available today. Opening a private project does not hire or contact a professional.
          </p>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Page one</p>
            <h2>Give the next project somewhere to live.</h2>
            <p>Add one project you remember. That is enough to start the home’s history.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Open my home Rolodex</a>
            <Link className="btn btn--night" href="/how-it-works/">How Homesrolo works</Link>
          </div>
        </div>
      </section>
    </>
  )
}
