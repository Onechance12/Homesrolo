import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { HOW_IT_WORKS_STEPS } from '../../lib/content/education.ts'
import { HOMEOWNER_ROOFING_SIGNIN_URL } from '../../lib/site.ts'

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
            <h2>What works today, and what comes next</h2>
            <p>
              Private passwordless homeowner accounts, private home files, guided starting details, and private
              roof-project requests work today. They live in a separate authenticated homeowner application; a
              project started there is saved to that homeowner&rsquo;s home file.
            </p>
            <p>
              File uploads, invitations, sharing, the homeowner assistant, and delivery of a project to the
              Homesrolo professional network are not available yet. Starting a private project does not hire a
              contractor or send the request outside the homeowner account.
            </p>
            <p>
              Public company and project examples remain synthetic. A private home file never becomes public just
              because an account or project was created.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <a className="btn btn--primary" href={HOMEOWNER_ROOFING_SIGNIN_URL}>Start a roof project</a>
              <Link className="btn btn--quiet" href="/how-we-verify/">What a verified fact means</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
