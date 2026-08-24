import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { HOW_IT_WORKS_STEPS } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMEOWNER_SIGNIN_URL } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'How it works',
  description:
    'Start a home record, organize planned and completed projects, and use repeatable photo checkups to remember how the property changes.',
  canonical: '/how-it-works/',
})

export default function HowItWorksPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="How it works"
            title="Give the home one place to remember."
            lede="Start with what you know. Add projects from any point in the home’s life, repeat useful photos over time, and keep the next decision connected to the last one."
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
            <h2>What you can keep in Homesrolo</h2>
            <p>
              A passwordless account gives each home its own workspace. Record projects that are planned,
              underway, completed, or remembered from a previous year across every major part of the property.
            </p>
            <p>
              Photo checkups save a dated JPEG or PNG by area and repeatable view, then place the newest two
              observations together. Roofing projects can also keep homeowner-entered notes about what written
              proposals include or leave out. Homesrolo does not diagnose a photo, score a price, or choose a
              contractor.
            </p>
            <p>
              Creating a home or project does not hire a professional, send a lead, publish the address, or give
              another person access. It is the homeowner’s record first.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <a className="btn btn--primary" href={HOMEOWNER_SIGNIN_URL}>Open my home</a>
              <Link className="btn btn--quiet" href="/home-record/">See what belongs in a home record</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
