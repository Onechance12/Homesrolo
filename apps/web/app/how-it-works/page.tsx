import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { HOW_IT_WORKS_STEPS } from '../../lib/content/education.ts'

export const metadata = {
  title: 'How it works',
  description:
    'How a Home Project Passport is made: work is recorded, the homeowner decides what to release, and the '
    + 'released record carries its own provenance.',
}

export default function HowItWorksPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="How it works"
            title="Work happens. The homeowner decides what becomes a record."
            lede="Four steps, and the second one is the one that matters: nothing becomes public because work was
              done. A release is a decision, made by the person whose home it is."
          />
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '2.5rem' }}>
        <div className="shell">
          <ol className="steps">
            {HOW_IT_WORKS_STEPS.map(step => (
              <li key={step.heading}>
                <div className="prose">
                  <h2 style={{ fontSize: '1.25rem' }}>{step.heading}</h2>
                  {step.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="prose">
            <h2>What is not built yet</h2>
            <p>
              This is a preview of the shape, not a working product. There are no accounts, no uploads, no home
              files, no sharing, and no assistant. Every company and project shown anywhere on this site is
              synthetic.
            </p>
            <p>
              The private home file and the cross-system sharing contract are designed and reviewed, and both are
              deliberately inert: the sharing layer authorises nothing at all in its current state.
            </p>
            <p style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn--quiet" href="/how-we-verify/">What a verified fact means</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
