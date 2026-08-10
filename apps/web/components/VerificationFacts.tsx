import { type VerificationFact, effectiveStatus } from '../lib/directory/public-profile.v1.ts'
import { displayFact } from '../lib/directory/projection.ts'

function chipClass(status: string): string {
  if (status === 'confirmed') return 'chip chip--confirmed'
  if (status === 'expired') return 'chip chip--stale'
  if (status === 'self_reported' || status === 'pending_review') return 'chip chip--caution'
  return 'chip chip--neutral'
}

/**
 * Renders five independent facts, never a summary.
 *
 * Each row is a definition list of status, source, and date because those three
 * together are what makes a claim checkable. A green chip on its own would be
 * exactly the blanket badge this product refuses to publish.
 */
export function VerificationFacts({
  facts,
  today,
}: {
  facts: readonly VerificationFact[]
  today: string
}) {
  return (
    <ul className="facts">
      {facts.map(fact => {
        const shown = displayFact(fact, today)
        const status = effectiveStatus(fact, today)
        return (
          <li key={fact.dimension} className="fact">
            <div className="fact__head">
              <span className="fact__dimension">{shown.dimension}</span>
              <span className={chipClass(status)}>{shown.statusLabel}</span>
            </div>
            <p className="fact__statement">{shown.statement}</p>
            <dl className="fact__meta">
              <div>
                <dt>Source:</dt>
                <dd>{shown.sourceLabel}</dd>
              </div>
              <div>
                <dt>{shown.asOfLabel.startsWith('Checked') ? 'When:' : 'As of:'}</dt>
                <dd>{shown.asOfLabel.replace(/^Checked /, '')}</dd>
              </div>
              {shown.expiresLabel ? (
                <div>
                  <dt>Expiry:</dt>
                  <dd>{shown.expiresLabel.replace(/^Expires /, '')}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
