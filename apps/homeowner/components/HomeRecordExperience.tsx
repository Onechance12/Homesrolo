'use client'

import Link from 'next/link'
import { useRef } from 'react'
import type { HomeRecordProgress, HomeProgressTrackId } from '../lib/home-record-progress.ts'
import type { HomeRecordProfile } from '../lib/port/types.ts'

const HOME_AREAS = [
  'Interior & remodel',
  'Heating & cooling',
  'Plumbing',
  'Electrical',
  'Appliances',
  'Exterior & gutters',
  'Roof',
  'Yard & landscaping',
  'Pest control',
  'Pool',
  'New construction',
  'Something else',
] as const

const TRACK_MARK: Record<HomeProgressTrackId, string> = {
  know: '01',
  protect: '02',
  care: '03',
  remember: '04',
}

interface HomeRecordExperienceProps {
  readonly homeId: string
  readonly label: string
  readonly locality: string
  readonly progress: HomeRecordProgress
  readonly homeRecord: HomeRecordProfile | null
  readonly uploadsEnabled: boolean
  readonly checkupsEnabled: boolean
  readonly synthetic: boolean
}

function HomeRecordHouse({ progress }: { readonly progress: HomeRecordProgress }) {
  return (
    <div className="record-house" aria-hidden="true">
      <svg viewBox="0 0 360 260" role="img">
        <path className="record-house__loop" d="M294 207A125 125 0 1 1 303 75" />
        <path className="record-house__roof" d="M89 130 180 52l91 78" />
        <path className="record-house__walls" d="M106 126v91h148v-91" />
        <path className="record-house__door" d="M158 217v-57h44v57" />
        {progress.tracks.map((track, index) => (
          <circle
            key={track.id}
            className={track.completed > 0 ? 'record-house__step record-house__step--lit' : 'record-house__step'}
            cx={index % 2 === 0 ? 132 : 228}
            cy={index < 2 ? 116 : 153}
            r="8"
          />
        ))}
      </svg>
      <span className="record-house__count">{progress.documentedSteps}<small>of {progress.totalSteps}</small></span>
    </div>
  )
}

/** A truthful, homeowner-facing view of the record already saved for one home. */
export function HomeRecordExperience({
  homeId,
  label,
  locality,
  progress,
  homeRecord,
  uploadsEnabled,
  checkupsEnabled,
  synthetic,
}: HomeRecordExperienceProps) {
  const cardDeck = useRef<HTMLUListElement | null>(null)
  const earnedMilestones = progress.milestones.filter(milestone => milestone.earned)
  const nextMilestone = progress.milestones.find(milestone => !milestone.earned)

  function moveCards(direction: -1 | 1) {
    cardDeck.current?.scrollBy({ left: direction * 320, behavior: 'smooth' })
  }

  return (
    <div className="record-experience">
      <section className="record-hero" aria-labelledby="record-hero-title">
        <div className="record-hero__copy">
          <p className="record-kicker"><span aria-hidden="true" />Private Home Record</p>
          <h1 id="record-hero-title">Every home has a history.<br />Keep yours.</h1>
          <p className="record-hero__home"><strong>{label}</strong><span>{locality}</span></p>
          <p className="record-hero__intro">
            Projects, photos, warranties, receipts, and decisions stay organized around the home—not scattered across inboxes and contractor systems.
          </p>
          <div className="record-hero__actions">
            <Link className="record-btn record-btn--signal" href={`/home/${homeId}/projects`}>Add a project</Link>
            {uploadsEnabled ? (
              <Link className="record-btn record-btn--line" href={`/home/${homeId}/documents`}>Add a home file</Link>
            ) : (
              <Link className="record-btn record-btn--line" href={`/home/${homeId}/documents`}>Open my files</Link>
            )}
          </div>
          <p className="record-hero__privacy">Private by default. You decide what leaves this record.</p>
        </div>
        <div className="record-hero__visual">
          <HomeRecordHouse progress={progress} />
          <div className="record-hero__progress">
            <div>
              <strong>{progress.documentedSteps} of {progress.totalSteps} record steps documented</strong>
              <span>Every completed step comes from something actually saved.</span>
            </div>
            <progress value={progress.documentedSteps} max={progress.totalSteps}>
              {progress.documentedSteps} of {progress.totalSteps}
            </progress>
          </div>
          <p className="record-hero__boundary">This is record progress—not a score of condition, safety, value, or insurability.</p>
        </div>
      </section>

      <section className="record-section home-profile-card" aria-labelledby="home-profile-title">
        <div className="record-section__head home-profile-card__head">
          <div>
            <p className="record-kicker">The home itself</p>
            <h2 id="home-profile-title">Your private home details</h2>
          </div>
          <Link className="record-text-link" href={`/home/${homeId}/details`}>
            {homeRecord?.address ? 'Edit details →' : 'Add address →'}
          </Link>
        </div>
        <div className="home-profile-card__grid">
          <div className="home-profile-card__address">
            <span>Property address</span>
            {homeRecord?.address ? (
              <address>
                <strong>{homeRecord.address.line1}</strong>
                {homeRecord.address.line2 ? <span>{homeRecord.address.line2}</span> : null}
                <span>
                  {homeRecord.address.city}, {homeRecord.address.regionCode}{' '}
                  {homeRecord.address.postalCode}
                </span>
              </address>
            ) : (
              <p>Add the exact address so this history stays attached to the right home.</p>
            )}
          </div>
          <dl className="home-profile-card__facts">
            <div>
              <dt>Home type</dt>
              <dd>{homeRecord?.homeType && homeRecord.homeType !== 'unknown'
                ? homeRecord.homeType.replace('_', ' ')
                : 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Year built</dt>
              <dd>{homeRecord?.yearBuilt
                ? `${homeRecord.yearBuilt.precision === 'approximate' ? 'About ' : ''}${homeRecord.yearBuilt.value}`
                : 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Systems noted</dt>
              <dd>{homeRecord
                ? `${homeRecord.systems.filter(system => system.present !== 'unknown').length} of ${homeRecord.systems.length}`
                : 'Not recorded'}</dd>
            </div>
          </dl>
        </div>
        <p className="home-profile-card__privacy">
          Your full address stays inside this signed-in Home Record. It is not shown on your public profile because there is no public home profile.
        </p>
      </section>

      <section className="record-section record-section--deck" aria-labelledby="rolo-deck-title">
        <div className="record-section__head">
          <div>
            <p className="record-kicker">Your home, card by card</p>
            <h2 id="rolo-deck-title">Open the part you need.</h2>
          </div>
          <div className="rolo-deck__controls" aria-label="Move through Home Record cards">
            <button type="button" onClick={() => moveCards(-1)} aria-label="Previous cards">←</button>
            <button type="button" onClick={() => moveCards(1)} aria-label="Next cards">→</button>
          </div>
        </div>
        <ul className="rolo-deck" ref={cardDeck} aria-label="Home Record cards">
          {progress.cards.map((card, index) => (
            <li className={`rolo-card rolo-card--${card.tone}`} key={card.id}>
              <Link href={card.href}>
                <span className="rolo-card__tab">{String(index + 1).padStart(2, '0')}</span>
                <span className="rolo-card__eyebrow">{card.eyebrow}</span>
                <strong className="rolo-card__metric">{card.metric}</strong>
                <span className="rolo-card__title">{card.title}</span>
                <span className="rolo-card__detail">{card.detail}</span>
                <span className="rolo-card__open">Open card <span aria-hidden="true">↗</span></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="rolo-deck__hint">Swipe or use the arrows to move through the record.</p>
      </section>

      <section className="record-section" aria-labelledby="useful-next-title">
        <div className="record-section__head">
          <div>
            <p className="record-kicker">Three useful things</p>
            <h2 id="useful-next-title">Small moves. A better record.</h2>
          </div>
        </div>
        <ol className="record-missions">
          {progress.missions.map((mission, index) => (
            <li key={`${mission.href}:${mission.label}`}>
              <Link href={mission.href}>
                <span className="record-mission__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="record-mission__body">
                  <strong>{mission.label}</strong>
                  <span>{mission.detail}</span>
                </span>
                <span className="record-mission__time">{mission.minutes}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="record-section" aria-labelledby="record-progress-title">
        <div className="record-section__head">
          <div>
            <p className="record-kicker">Visible progress</p>
            <h2 id="record-progress-title">You can see exactly what counts.</h2>
          </div>
        </div>
        <div className="record-tracks">
          {progress.tracks.map(track => (
            <article className={`record-track record-track--${track.id}`} key={track.id}>
              <div className="record-track__head">
                <span>{TRACK_MARK[track.id]}</span>
                <div><h3>{track.label}</h3><p>{track.summary}</p></div>
                <strong>{track.completed}/{track.total}</strong>
              </div>
              <progress value={track.completed} max={track.total}>{track.completed} of {track.total}</progress>
              {track.evidence.length > 0 ? (
                <ul>{track.evidence.map(item => <li key={item}>{item}</li>)}</ul>
              ) : <p className="record-track__empty">No saved evidence in this group yet.</p>}
            </article>
          ))}
        </div>
      </section>

      <div className="record-split">
        <section className="record-section" aria-labelledby="project-history-title">
          <div className="record-section__head">
            <div>
              <p className="record-kicker">Home timeline</p>
              <h2 id="project-history-title">Project history</h2>
            </div>
            <Link className="record-text-link" href={`/home/${homeId}/projects`}>All projects →</Link>
          </div>
          {progress.chapters.length > 0 ? (
            <ol className="record-chapters">
              {progress.chapters.map(chapter => (
                <li key={chapter.id}>
                  <time>{chapter.on ?? 'Date open'}</time>
                  <Link href={chapter.href}>{chapter.title}</Link>
                  <span>{chapter.detail}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="record-empty">
              <strong>Your first chapter can be from any year.</strong>
              <p>Add past work, something happening now, or an idea you are still planning.</p>
              <Link href={`/home/${homeId}/projects`}>Add the first project →</Link>
            </div>
          )}
        </section>

        <section className="record-section" aria-labelledby="milestones-title">
          <div className="record-section__head">
            <div>
              <p className="record-kicker">Home milestones</p>
              <h2 id="milestones-title">Earned by remembering.</h2>
            </div>
          </div>
          <ul className="record-milestones">
            {earnedMilestones.map(milestone => (
              <li key={milestone.id}>
                <span aria-hidden="true">✓</span>
                <div><strong>{milestone.label}</strong><small>{milestone.detail}</small></div>
              </li>
            ))}
          </ul>
          {nextMilestone ? (
            <div className="record-next-stamp">
              <span>Next</span>
              <div><strong>{nextMilestone.label}</strong><small>{nextMilestone.detail}</small></div>
            </div>
          ) : null}
        </section>
      </div>

      <details className="record-whole-home">
        <summary>
          <span><strong>The whole home belongs here.</strong><small>See all twelve starting points</small></span>
          <span aria-hidden="true">+</span>
        </summary>
        <ul>{HOME_AREAS.map(area => <li key={area}>{area}</li>)}</ul>
        <Link href={`/home/${homeId}/projects`}>Add history from any part of the home →</Link>
      </details>

      {checkupsEnabled ? (
        <p className="record-checkup-link">
          Ready for a seasonal look around? <Link href={`/home/${homeId}/checkups`}>Open private photo checkups →</Link>
        </p>
      ) : null}

      {synthetic ? <p className="record-demo-note">Every entry above is synthetic demo data. This record saves nothing.</p> : null}
    </div>
  )
}
