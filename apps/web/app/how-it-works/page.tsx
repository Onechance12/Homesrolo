import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { HOW_IT_WORKS_STEPS } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'How it works',
  description:
    'Start one private record for a home, add past, current, and planned projects, and see which storage and sharing features are still being built.',
  canonical: '/how-it-works/',
})

export default function HowItWorksPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="How it works"
            title="Start the home’s history with what you know."
            lede="The private account and whole-home project record work today. Files, sharing, and public proof are separate capabilities that remain off until their controls are ready."
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
              whole-home project records work today. A homeowner can record work that is planned, underway, or
              already completed across the property in a separate authenticated application.
            </p>
            <p>
              File uploads, invitations, sharing, production home research, and delivery of a project to the
              Homesrolo professional network are not available yet. Starting a private project does not hire a
              contractor or send the request outside the homeowner account.
            </p>
            <p>
              Public company and project examples remain synthetic. A private home file never becomes public just
              because an account or project was created.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <a className="btn btn--primary" href={HOMEOWNER_SIGNIN_URL}>Open my home Rolodex</a>
              <Link className="btn btn--quiet" href="/how-we-verify/">What a verified fact means</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
