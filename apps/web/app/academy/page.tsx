import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import {
  ACADEMY_COURSES,
  ASSESSMENT_PASS_MARK,
  CREDENTIAL_LIMITS,
  HOW_A_CREDENTIAL_IS_EARNED,
} from '../../lib/directory/credential.v1.ts'

export const metadata = {
  title: 'Homesrolo Academy',
  description:
    'Credentials contractors earn through coursework and a passed assessment, not accreditation they buy. '
    + 'Ethics, claim boundaries, money management, estimating, warranty, and communication.',
}

const CONTRAST = [
  {
    axis: 'How the badge is obtained',
    others: 'Pay an annual accreditation or membership fee.',
    here: 'Complete the hours, pass the assessment, agree to the conduct standard.',
  },
  {
    axis: 'What it costs to keep',
    others: 'Keep paying. Stop paying and the badge disappears regardless of conduct.',
    here: 'Re-earn it when it expires. Payment cannot award, restore, or extend it.',
  },
  {
    axis: 'Effect on placement',
    others: 'Higher tiers buy better position and more leads.',
    here: 'None. Ordering reads company name only, and never reads credentials.',
  },
  {
    axis: 'What it claims about the work',
    others: 'Implies general trustworthiness without checking any job.',
    here: 'States what was studied and passed. Nothing about any particular job.',
  },
  {
    axis: 'When conduct is questioned',
    others: 'Often unaffected while fees are current.',
    here: 'Suspended or withdrawn, and the change is shown rather than deleted.',
  },
]

export default function AcademyPage() {
  const totalHours = ACADEMY_COURSES.reduce((sum, course) => sum + course.hours, 0)

  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Homesrolo Academy"
            title="A credential you earn, not one you buy."
            lede="Paid accreditation tells a homeowner that a company spent money. It says nothing about how
              that company handles a deductible, a change order, or a callback. So this one cannot be bought
              at any price."
          />

          <dl className="statline" style={{ marginTop: '2.5rem' }}>
            <div>
              <dt>Courses</dt>
              <dd>{ACADEMY_COURSES.length}</dd>
            </div>
            <div>
              <dt>Total hours</dt>
              <dd>{totalHours}</dd>
            </div>
            <div>
              <dt>Pass mark</dt>
              <dd>{ASSESSMENT_PASS_MARK}</dd>
            </div>
            <div>
              <dt>Purchasable</dt>
              <dd>No</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlock: '3.5rem' }}>
        <div className="shell">
          <div className="prose" style={{ marginBottom: '1.75rem' }}>
            <h2>How this differs from paid accreditation</h2>
            <p>
              The comparison below is about structure, not about any particular organisation. Where a badge can
              be bought, a homeowner is right to discount it.
            </p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col">Pay-to-accredit model</th>
                  <th scope="col">Homesrolo Academy</th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST.map(row => (
                  <tr key={row.axis}>
                    <th scope="row">{row.axis}</th>
                    <td>{row.others}</td>
                    <td style={{ color: 'var(--ink)' }}>{row.here}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="prose" style={{ marginBottom: '2rem' }}>
            <h2>The curriculum</h2>
            <p>
              Chosen for the failure modes that actually harm homeowners and sink contractors, rather than for
              what is easy to teach. Two of these exist because good companies lose their licence or their
              business over them without ever intending harm.
            </p>
          </div>

          <div className="grid grid--2">
            {ACADEMY_COURSES.map(course => (
              <article key={course.id} className="card">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <span className="seal" aria-hidden="true">{course.hours}h</span>
                  <div>
                    <h3 className="card__title" style={{ fontSize: '1.1rem' }}>{course.title}</h3>
                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-faint)' }}>
                      Renews every {course.renewalYears} years
                    </p>
                  </div>
                </div>
                <p style={{ marginTop: '1rem' }}>{course.why}</p>
                <ul style={{ marginTop: '0.9rem', paddingLeft: '1.1rem', color: 'var(--ink-soft)', fontSize: '0.92rem' }}>
                  {course.covers.map(item => <li key={item} style={{ marginBottom: '0.3rem' }}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem' }}>
            <div>
              <div className="prose" style={{ marginBottom: '1.5rem' }}>
                <h2>How a credential is earned</h2>
              </div>
              <ol className="steps">
                {HOW_A_CREDENTIAL_IS_EARNED.map(step => (
                  <li key={step}><p style={{ color: 'var(--ink-soft)' }}>{step}</p></li>
                ))}
              </ol>
            </div>
            <div>
              <div className="prose" style={{ marginBottom: '1.5rem' }}>
                <h2>What a credential is not</h2>
                <p>
                  Stated plainly, because a seal on a profile will be over-read otherwise.
                </p>
              </div>
              <ul style={{ paddingLeft: '1.15rem', color: 'var(--ink-soft)', fontSize: '0.95rem' }}>
                {CREDENTIAL_LIMITS.map(limit => (
                  <li key={limit} style={{ marginBottom: '0.7rem' }}>{limit}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="synthetic-banner" style={{ marginTop: '2.5rem' }}>
            <strong>Not open yet.</strong> The Academy is designed and not built. No enrolment, payment, course
            delivery, or assessment exists, and every credential shown anywhere on this site is synthetic.
          </div>

          <p style={{ marginTop: '2rem' }}>
            <Link className="btn btn--quiet" href="/companies/demo/">See credentials on a sample profile</Link>
          </p>
        </div>
      </section>
    </>
  )
}
