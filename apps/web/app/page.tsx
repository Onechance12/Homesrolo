import Link from 'next/link'
import { DocumentaryImage } from '../components/DocumentaryImage.tsx'
import { HOMEOWNER_SIGNIN_URL, ROOF_WATCH_SMS_URL, SITE_DESCRIPTION } from '../lib/site.ts'

export const metadata = {
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

const HOME_TASKS = [
  {
    label: 'Maintain it',
    title: 'Stay ahead of the ordinary stuff',
    body: 'Build a simple rhythm for filters, drains, alarms, exterior checks, seasonal service, and the systems you rely on every day.',
    href: '/home-care/',
  },
  {
    label: 'Fix it',
    title: 'Start with the problem, not a sales pitch',
    body: 'Write down what changed, what you can safely observe, and the questions that need answers before work begins.',
    href: '/guides/#something-is-wrong',
  },
  {
    label: 'Plan it',
    title: 'Give a repair or remodel a real shape',
    body: 'Define the room, goal, known facts, and scope questions before the work begins, then record the project as it moves.',
    href: '/home-projects/',
  },
  {
    label: 'Remember it',
    title: 'Add work that already happened',
    body: 'An approximate year, a company name, and one remembered detail are enough to start rebuilding the home’s history.',
    href: '/home-record/',
  },
  {
    label: 'Compare it',
    title: 'Read proposals row by row',
    body: 'Compare the work, named materials, allowances, exclusions, payment steps, and closeout—not just the number at the bottom.',
    href: '/home-projects/#compare-proposals',
  },
  {
    label: 'Check the roof',
    title: 'Keep a dated roof record',
    body: 'Learn what a useful inspection should contain or check whether the free Roof Watch program serves your area.',
    href: '/roof-watch/',
  },
] as const

const HOME_CHAPTERS = [
  { title: 'Interior & remodel', href: '/home-projects/#remodels', note: 'Rooms, scope, selections, and project decisions' },
  { title: 'Heating & cooling', href: '/home-care/#heating-cooling', note: 'Filters, service, equipment, and comfort' },
  { title: 'Plumbing', href: '/home-care/#plumbing', note: 'Shutoffs, leaks, fixtures, and water heating' },
  { title: 'Electrical', href: '/home-care/#electrical', note: 'Panels, protection devices, alarms, and lighting' },
  { title: 'Roof & gutters', href: '/home-care/#roof-gutters', note: 'Drainage, visible conditions, and roof history' },
  { title: 'Exterior', href: '/home-care/#exterior', note: 'Siding, paint, windows, doors, and drainage' },
  { title: 'Appliances', href: '/home-record/#appliances', note: 'What to identify before service or replacement' },
  { title: 'Yard, pool & pest', href: '/home-care/#yard-pool-pest', note: 'Property care outside the walls' },
  { title: 'Home safety', href: '/home-care/#home-safety', note: 'Alarms, exits, shutoffs, and urgent boundaries' },
  { title: 'New construction', href: '/home-projects/#new-construction', note: 'Selections, walkthroughs, changes, and handoff' },
  { title: 'Past work', href: '/home-record/#past-work', note: 'Repairs and replacements worth remembering' },
  { title: 'Something else', href: '/home-projects/#start-a-project', note: 'If it belongs to the home, start there' },
] as const

const PROJECT_SAFETY = [
  {
    title: 'Name the work clearly',
    body: 'A useful project starts with the room, system, problem, and result you expect—not only a company name and a total.',
  },
  {
    title: 'Compare the written scope',
    body: 'Materials, quantities, preparation, protection, allowances, exclusions, payment steps, and cleanup should be visible before you choose.',
  },
  {
    title: 'Record every change',
    body: 'When the plan changes, write down what changed, why it changed, what it costs, and who agreed before the work moves on.',
  },
  {
    title: 'Close the loop',
    body: 'Record the completed work and final date, then note where the supporting paperwork can be found.',
  },
] as const

const FEATURED_GUIDES = [
  {
    title: 'A seasonal walk around the home',
    body: 'A calm, repeatable check of the systems and places that are easiest to forget.',
    href: '/home-care/#seasonal-rounds',
  },
  {
    title: 'What to do when something is wrong',
    body: 'Start with safety, protect the house, record what happened, and know when to stop.',
    href: '/guides/#something-is-wrong',
  },
  {
    title: 'Make two project proposals comparable',
    body: 'Turn different wording into the same set of questions without pretending every house has one right price.',
    href: '/home-projects/#compare-proposals',
  },
  {
    title: 'Understand the roof before hiring a roofer',
    body: 'Texas roofing guidance on scope, materials, contractor checks, and the records worth keeping.',
    href: '/services/roofing/',
  },
] as const

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="shell">
          <div className="home-hero__layout">
            <div className="home-hero__copy">
              <p className="home-hero__eyebrow">One private record for your home</p>
              <h1>Every home has a history. Keep yours.</h1>
              <p className="home-hero__lede">
                Keep projects, service visits, photos, files, materials, warranties, and decisions connected to one
                home—from new construction through every repair, replacement, and remodel that follows.
              </p>
              <div className="home-hero__actions">
                <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>
                  Create my Home Record <span className="btn__arrow" aria-hidden="true">→</span>
                </a>
                <a className="btn btn--night" href="#sample-home-record">See an example</a>
              </div>
              <ul className="home-hero__proof" aria-label="Homesrolo account basics">
                <li>Private by default</li>
                <li>The whole home, not one trade</li>
                <li>Start with what you know</li>
              </ul>
            </div>

            <div id="sample-home-record" className="home-stream" role="group" aria-label="Illustrative private home timeline">
              <span className="home-stream__tab home-stream__tab--one" aria-hidden="true" />
              <span className="home-stream__tab home-stream__tab--two" aria-hidden="true" />
              <div className="home-stream__head">
                <div>
                  <span>Sample home record</span>
                  <strong>The Martin home</strong>
                </div>
                <span className="status-pill status-pill--private">Private</span>
              </div>
              <ol className="home-stream__list">
                <li>
                  <span className="activity-dot activity-dot--live" aria-hidden="true" />
                  <div>
                    <strong>New construction handoff</strong>
                    <span>2019 · systems and finish details recorded</span>
                  </div>
                  <span className="activity-state">Origin</span>
                </li>
                <li>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <strong>Upstairs AC service</strong>
                    <span>2021 · service visit</span>
                  </div>
                  <span className="activity-state activity-state--quiet">Service</span>
                </li>
                <li>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <strong>Water heater replacement</strong>
                    <span>2023 · product and warranty saved</span>
                  </div>
                  <span className="activity-state activity-state--quiet">Project</span>
                </li>
                <li>
                  <span className="activity-dot activity-dot--live" aria-hidden="true" />
                  <div>
                    <strong>Kitchen remodel</strong>
                    <span>2026 · decisions and completed work</span>
                  </div>
                  <span className="activity-state">Today</span>
                </li>
              </ol>
              <p className="home-stream__note">Illustrative record · different people, products, and projects; one history</p>
            </div>
          </div>

          <div className="home-paths" aria-label="Ways to use Homesrolo">
            <div><strong>Care for it</strong><span>Build a repeatable rhythm around the whole home.</span></div>
            <div><strong>Work on it</strong><span>Give every repair, remodel, and service visit a clear record.</span></div>
            <div><strong>Remember it</strong><span>Keep the useful facts after the project is over.</span></div>
          </div>
        </div>
      </section>

      <section className="section home-start" aria-labelledby="start-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Start with today</p>
            <h2 id="start-heading">What does your home need right now?</h2>
            <p>
              You do not need a complete history or a perfect plan. Pick the thing in front of you and Homesrolo will
              help you think through what matters.
            </p>
          </div>
          <div className="home-task-grid">
            {HOME_TASKS.map((task, index) => (
              <Link key={task.label} className="home-task-card" href={task.href}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{task.label}</p>
                <h3>{task.title}</h3>
                <p>{task.body}</p>
                <strong>Start here <span aria-hidden="true">→</span></strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section whole-home" aria-labelledby="whole-home-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">The whole home</p>
            <h2 id="whole-home-heading">Every room. Every system. Every chapter.</h2>
            <p>
              Homesrolo gives projects across the whole property the same organized starting point, whether the work
              is inside, outside, routine, urgent, planned, active, or years in the past.
            </p>
          </div>
          <ul className="home-index">
            {HOME_CHAPTERS.map((chapter, index) => (
              <li key={chapter.title}>
                <Link href={chapter.href}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{chapter.title}</strong>
                  <small>{chapter.note}</small>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section photo-checkups" aria-labelledby="photo-checkups-heading">
        <div className="shell photo-checkups__layout">
          <div className="section-heading">
            <p className="eyebrow">See what changed</p>
            <h2 id="photo-checkups-heading">Look at the same place twice. That is when a photo gets useful.</h2>
            <p>
              A random camera roll is hard to read later. A repeatable view—front elevation, water heater pan,
              under-sink cabinet, attic access, fence line—turns an ordinary photo into a dated point of comparison.
            </p>
            <p className="boundary-note">
              A photo can show change. It cannot diagnose the cause or prove that work is safe. Treat it as a record,
              then use the right professional when the answer requires one.
            </p>
            <p className="section-action"><Link className="btn btn--primary" href="/home-care/#seasonal-rounds">Build a seasonal round</Link></p>
          </div>
          <div className="checkup-preview" role="group" aria-label="Illustrative seasonal photo checkup">
            <div className="checkup-preview__head">
              <div>
                <span>Front exterior</span>
                <strong>Driveway view</strong>
              </div>
              <span className="status-pill status-pill--record">Dated views</span>
            </div>
            <div className="checkup-preview__pair">
              <div className="snapshot-card">
                <div className="snapshot-card__frame" aria-hidden="true"><span /></div>
                <strong>March 12</strong>
                <span>Spring round</span>
              </div>
              <div className="snapshot-card">
                <div className="snapshot-card__frame snapshot-card__frame--later" aria-hidden="true"><span /></div>
                <strong>August 18</strong>
                <span>Summer round</span>
              </div>
            </div>
            <p>Same place · similar angle · clear observed date</p>
          </div>
        </div>
      </section>

      <section className="home-protection" aria-labelledby="home-protection-heading">
        <div className="shell">
          <div className="home-protection__intro">
            <p className="home-protection__label">Homeowner control</p>
            <h2 id="home-protection-heading">A better project starts before anyone shows up.</h2>
            <p>
              The homeowner should be able to understand the job, compare written work, keep a record of changes,
              and remember who did what. That is useful whether the project is a faucet, an air conditioner, a roof,
              or a full kitchen.
            </p>
          </div>
          <div className="home-protection__grid">
            {PROJECT_SAFETY.map((item, index) => (
              <article key={item.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="home-protection__action">
            <Link className="btn btn--signal" href="/home-projects/">Plan a home project</Link>
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="featured-guides-heading">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Useful before the sales call</p>
            <h2 id="featured-guides-heading">Clear homeowner guides, organized around the job at hand.</h2>
            <p>Start with the problem, learn the language, write down the right questions, and keep the useful facts.</p>
          </div>
          <div className="hub-card-grid hub-card-grid--four" style={{ marginTop: '2.5rem' }}>
            {FEATURED_GUIDES.map(guide => (
              <Link key={guide.title} className="hub-link-card" href={guide.href}>
                <h3>{guide.title}</h3>
                <p>{guide.body}</p>
                <strong>Read the guide <span aria-hidden="true">→</span></strong>
              </Link>
            ))}
          </div>
          <p className="section-action"><Link className="btn btn--quiet" href="/guides/">Browse all homeowner guides</Link></p>
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
            <p className="eyebrow">One home program</p>
            <h2 id="home-roof-watch">Roof Watch is one useful chapter—not the whole house.</h2>
            <p>
              At participating North Texas addresses, Roof Watch offers a free annual roof visit with written visible
              findings and photos when conditions allow. Program limits and the assigned professional are provided
              before scheduling.
            </p>
            <p>
              The record is not a roof certification, insurance decision, or requirement to hire the inspecting
              professional.
            </p>
            <div className="section-actions">
              <Link className="btn btn--primary" href="/roof-watch/">See Roof Watch</Link>
              <a className="btn btn--quiet" href={ROOF_WATCH_SMS_URL}>Text to check my address</a>
            </div>
          </div>
        </div>
      </section>

      <section className="home-final">
        <div className="shell home-final__inner">
          <div>
            <p className="eyebrow">Start small</p>
            <h2>Give your home somewhere to remember.</h2>
            <p>Add the project you are planning, the repair you remember, or the system you want to understand next.</p>
          </div>
          <div className="home-final__actions">
            <a className="btn btn--signal" href={HOMEOWNER_SIGNIN_URL}>Create my Home Record</a>
            <Link className="btn btn--night" href="/home-record/">See what belongs in a home record</Link>
          </div>
        </div>
      </section>
    </>
  )
}
