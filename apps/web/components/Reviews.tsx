import {
  REVIEW_DIMENSION_LABELS,
  isBodyVisible,
  orderReviews,
  summariseDimensions,
  type VerifiedProjectReview,
} from '../lib/directory/review.v1.ts'

const STATE_LABELS: Record<string, string> = {
  // Deliberately NOT "Verified project". Nothing verifies the project link, so
  // a chip saying otherwise would be the overclaim this pass exists to remove.
  published: 'Sample — unverified',
  disputed_under_review: 'Disputed — under review',
  removed_policy_violation: 'Removed',
  removed_by_author: 'Withdrawn by the author',
}

const DISCLOSURE_LABELS: Record<string, string> = {
  incentive_offered: 'An incentive was offered for this review',
  employee_or_insider: 'Written by an employee or insider',
  related_party: 'Written by a related party',
}

function stateChip(state: string): string {
  // A published sample gets a neutral chip, not a green one. Green reads as
  // "checked", and nothing here has been checked.
  if (state === 'disputed_under_review') return 'chip chip--caution'
  return 'chip chip--neutral'
}

/**
 * Per-dimension averages, never a single headline figure.
 *
 * Every other platform prints one number, and that number is what companies
 * then buy. Showing five means a homeowner can see that a company is careful
 * but slow, which is the thing they actually wanted to know.
 */
export function DimensionSummary({ reviews }: { reviews: readonly VerifiedProjectReview[] }) {
  const summaries = summariseDimensions(reviews)
  if (summaries.length === 0) return null

  return (
    <dl className="review__scores" aria-label="Average scores by dimension">
      {summaries.map(summary => (
        <div key={summary.dimension} className="score-row">
          <dt>{summary.label}</dt>
          <div className="score-bar" role="presentation">
            <span style={{ width: `${(summary.average / 5) * 100}%` }} />
          </div>
          <dd>
            {summary.average.toFixed(1)}<span aria-hidden="true"> / 5</span>
            <span className="sr-only"> out of 5, from {summary.count} scores</span>
            <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}> ({summary.count})</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ReviewList({ reviews }: { reviews: readonly VerifiedProjectReview[] }) {
  const ordered = orderReviews(reviews)

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1.25rem' }}>
      {ordered.map(review => {
        const visible = isBodyVisible(review)
        const disclosure = DISCLOSURE_LABELS[review.disclosure]
        return (
          <li key={review.reviewId} className={visible ? 'review' : 'review review--muted'}>
            <div className="review__head">
              <span className={stateChip(review.state)}>{STATE_LABELS[review.state] ?? review.state}</span>
              <span className="review__meta">
                {review.submittedOn} · project <code>{review.releasedProjectRef}</code>
              </span>
            </div>

            {review.stateReason ? (
              <p className="review__meta"><strong>Why:</strong> {review.stateReason}</p>
            ) : null}

            {visible ? (
              <p className="review__body">{review.body}</p>
            ) : (
              <p className="review__withheld">
                The text of this review is withheld. The entry stays so the count never changes quietly.
              </p>
            )}

            {disclosure ? <p className="review__meta"><strong>Disclosure:</strong> {disclosure}</p> : null}

            {visible && review.scores.length > 0 ? (
              <dl className="review__scores">
                {review.scores.map(score => (
                  <div key={score.dimension} className="score-row">
                    <dt>{REVIEW_DIMENSION_LABELS[score.dimension]}</dt>
                    <div className="score-bar" role="presentation">
                      <span style={{ width: `${(score.score / 5) * 100}%` }} />
                    </div>
                    <dd>{score.score}<span aria-hidden="true"> / 5</span><span className="sr-only"> out of 5</span></dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {review.companyResponse ? (
              <div className="response">
                <p className="response__who">
                  Response from the company · {review.companyResponse.responderRole.replace(/_/g, ' ')} ·{' '}
                  {review.companyResponse.respondedOn}
                </p>
                <p>{review.companyResponse.body}</p>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
