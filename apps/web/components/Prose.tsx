import { type EducationalSection } from '../lib/content/education.ts'

/**
 * Renders audited educational copy. The copy itself lives in
 * `lib/content/education.ts` so the constitutional response auditor can run
 * over it in CI; rendering it from anywhere else would route around that gate.
 */
export function Sections({ sections, headingLevel = 2 }: {
  sections: readonly EducationalSection[]
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <div className="stack" style={{ '--stack-gap': '2.5rem' } as React.CSSProperties}>
      {sections.map(section => (
        <section key={section.heading} className="prose">
          <Heading>{section.heading}</Heading>
          {section.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </div>
  )
}

export function PageHeader({ eyebrow, title, lede }: {
  eyebrow: string
  title: string
  lede: string
}) {
  return (
    <div className="prose">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  )
}
