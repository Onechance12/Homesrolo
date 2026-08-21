import { Illustration, type IllustrationKind } from '../../components/Illustration.tsx'
import { PageHeader, Sections } from '../../components/Prose.tsx'
import { IDEAS_INTRO } from '../../lib/content/education.ts'
import { publicPageMetadata } from '../../lib/public-metadata.ts'

export const metadata = publicPageMetadata({
  title: 'Ideas',
  description:
    'Inspiration grounded in real work. Boards are not built yet; when they are, they will be assembled only '
    + 'from projects a homeowner chose to release.',
  canonical: '/ideas/',
})

const PLANNED_BOARDS: ReadonlyArray<{ kind: IllustrationKind; title: string; body: string }> = [
  {
    kind: 'roofline',
    title: 'Roof profiles and materials',
    body: 'Shingle lines, standing seam, and tile, each shown with the material actually used and the year it '
      + 'went on rather than an unattributed photograph.',
  },
  {
    kind: 'siding',
    title: 'Exterior finishes',
    body: 'Siding, trim, and colour, saved against the product that was installed so a favourite is something '
      + 'you can ask for by name.',
  },
  {
    kind: 'window',
    title: 'Windows and doors',
    body: 'Openings and glazing, with the frame material and the work performed attached to each entry.',
  },
  {
    kind: 'paint',
    title: 'Colour and light',
    body: 'Palettes drawn from projects that exist, so a saved idea can be traced back to a real house.',
  },
]

export default function IdeasPage() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <PageHeader
            eyebrow="Inspiration"
            title="Ideas you can trace back to real work"
            lede="A photograph tells you what something looked like. A released project tells you what it was
              made of, who did it, and when."
          />
        </div>
      </section>

      <section className="section section--sunken" style={{ paddingBlockStart: '3rem' }}>
        <div className="shell">
          <Sections sections={IDEAS_INTRO} />
          <div className="synthetic-banner" style={{ marginTop: '2rem', maxWidth: 'var(--measure)' }}>
            <strong>Not built yet.</strong> The boards below describe what is planned. They contain no images
            collected from anywhere, and the drawings are generated in code.
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2 className="prose" style={{ marginBottom: '1.75rem' }}>Planned boards</h2>
          <div className="grid grid--4">
            {PLANNED_BOARDS.map(board => (
              <article key={board.title} className="card">
                <Illustration kind={board.kind} />
                <h3 className="card__title" style={{ marginTop: '1.15rem', fontSize: '1.05rem' }}>{board.title}</h3>
                <p style={{ fontSize: '0.94rem' }}>{board.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
