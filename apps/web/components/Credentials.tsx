import {
  effectiveCredentialState,
  findCourse,
  type AcademyCredential,
} from '../lib/directory/credential.v1.ts'

const STATE_LABELS: Record<string, string> = {
  earned: 'Earned',
  expired: 'Lapsed — needs renewal',
  suspended_pending_review: 'Suspended pending review',
  withdrawn: 'Withdrawn',
}

function stateChip(state: string): string {
  if (state === 'earned') return 'chip chip--confirmed'
  if (state === 'suspended_pending_review' || state === 'withdrawn') return 'chip chip--stale'
  return 'chip chip--caution'
}

/**
 * A credential shows its own weight: hours completed, assessment score, the
 * date it was earned, and the date it lapses. A badge with none of that is
 * exactly the thing this replaces.
 */
export function CredentialList({
  credentials,
  today,
}: {
  credentials: readonly AcademyCredential[]
  today: string
}) {
  if (credentials.length === 0) {
    return (
      <p style={{ color: 'var(--ink-faint)', fontSize: '0.94rem' }}>
        This company holds no Academy credentials.
      </p>
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
      {credentials.map(credential => {
        const state = effectiveCredentialState(credential, today)
        const course = findCourse(credential.courseId)
        const lapsed = state !== 'earned'
        return (
          <li key={credential.credentialId} className={lapsed ? 'credential credential--lapsed' : 'credential'}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span className={lapsed ? 'seal seal--lapsed' : 'seal'} aria-hidden="true">
                {course ? `${course.hours}h` : '—'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1.02rem' }}>{course?.title ?? credential.courseId}</strong>
                  <span className={stateChip(state)}>{STATE_LABELS[state] ?? state}</span>
                </div>
                <p className="credential__hours" style={{ marginTop: '0.4rem' }}>
                  {credential.hoursCompleted} hours completed · assessment {credential.assessmentScore}
                  {' '}· earned {credential.earnedOn} · {lapsed ? 'lapsed' : 'renews by'} {credential.expiresOn}
                </p>
                {credential.stateReason ? (
                  <p style={{ fontSize: '0.88rem', color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
                    {credential.stateReason}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
