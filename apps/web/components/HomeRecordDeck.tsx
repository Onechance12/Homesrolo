import type { CSSProperties } from 'react'
import { DocumentaryImage } from './DocumentaryImage.tsx'

const CARDS = [
  {
    id: 'kitchen',
    tab: 'Interior',
    kind: 'Remodel · 2026',
    title: 'Kitchen remodel',
    summary: 'Selections, decisions, changes, and the finished room keep one project history.',
    records: ['Cabinet and counter selections', 'Approved changes', 'Final photos and care notes'],
    accent: '#63c7dc',
  },
  {
    id: 'roof',
    tab: 'Roof',
    kind: 'Completed project · 2024',
    title: 'Roof replacement',
    summary: 'The exact system, the work that was covered up, and the closeout records stay together.',
    records: ['Contract and approved scope', 'Progress and completion photos', 'Product and workmanship warranties'],
    accent: '#c8ef4d',
  },
  {
    id: 'paint',
    tab: 'Exterior',
    kind: 'Finish record · 2025',
    title: 'Exterior paint',
    summary: 'The color is still findable years after the leftover can and the original crew are gone.',
    records: ['Manufacturer and color code', 'Prep and repair scope', 'Completion date and company'],
    accent: '#f0a66f',
  },
  {
    id: 'wishlist',
    tab: 'Ideas',
    kind: 'Planning notes',
    title: 'Home wish list',
    summary: 'Products and ideas can wait beside the room they belong to until it is time to decide.',
    records: ['Dishwasher shortlist', 'Dining light measurements', 'Patio furniture ideas'],
    accent: '#d8b4ef',
  },
  {
    id: 'property',
    tab: 'Property',
    kind: 'Homeowner-entered notes',
    title: 'Insurance & property',
    summary: 'Important dates and property records have a home without pretending Homesrolo interprets coverage.',
    records: ['Policy renewal reminder', 'Tax valuation record', 'Inventory and appraisal notes'],
    accent: '#75ddb0',
  },
] as const

function KitchenVisual() {
  return (
    <div className="record-visual record-visual--kitchen" role="img" aria-label="Illustrated kitchen with cabinets, counter, sink, and pendant lights">
      <span className="record-kitchen__lights" aria-hidden="true" />
      <span className="record-kitchen__cabinets" aria-hidden="true" />
      <span className="record-kitchen__counter" aria-hidden="true" />
      <span className="record-kitchen__island" aria-hidden="true" />
    </div>
  )
}

function PaintVisual() {
  return (
    <div className="record-visual record-visual--paint" role="img" aria-label="Illustrated home exterior with three saved paint colors">
      <span className="record-paint__house" aria-hidden="true" />
      <span className="record-paint__door" aria-hidden="true" />
      <span className="record-paint__swatches" aria-hidden="true"><i /><i /><i /></span>
    </div>
  )
}

function WishlistVisual() {
  return (
    <div className="record-visual record-visual--wishlist" role="img" aria-label="Illustrated home wish list with saved product and material ideas">
      <span aria-hidden="true"><i /><i /><i /></span>
      <strong aria-hidden="true">Saved for the home</strong>
    </div>
  )
}

function PropertyVisual() {
  return (
    <div className="record-visual record-visual--property" role="img" aria-label="Illustrated property file with renewal date, valuation, and inventory notes">
      <span className="record-property__shield" aria-hidden="true" />
      <span className="record-property__lines" aria-hidden="true"><i /><i /><i /></span>
      <strong aria-hidden="true">Private property file</strong>
    </div>
  )
}

export function HomeRecordDeck() {
  return (
    <section id="sample-home-record" className="home-record-deck" aria-labelledby="sample-record-heading">
      <div className="home-record-deck__head">
        <div>
          <span>Illustrative Home Record</span>
          <h2 id="sample-record-heading">The Martin home</h2>
        </div>
        <span className="status-pill status-pill--private">Private</span>
      </div>
      <p className="home-record-deck__intro">One home. Different kinds of cards. Swipe through the record.</p>

      <ol
        className="home-record-deck__track"
        tabIndex={0}
        aria-label="Example Home Record cards. Scroll horizontally to browse."
      >
        {CARDS.map((card, index) => (
          <li key={card.id}>
            <article className="home-record-card" style={{ '--card-accent': card.accent } as CSSProperties}>
              <span className="home-record-card__tab">{card.tab}</span>
              {card.id === 'roof' ? (
                <div className="record-visual record-visual--photo">
                  <DocumentaryImage
                    src="/images/roof-watch/laminated-shingle-ridge-detail.webp"
                    width={1200}
                    height={774}
                    sizes="(max-width: 48rem) 76vw, 23rem"
                    alt="Close view of laminated asphalt shingles and a ridge-cap line"
                  />
                </div>
              ) : null}
              {card.id === 'kitchen' ? <KitchenVisual /> : null}
              {card.id === 'paint' ? <PaintVisual /> : null}
              {card.id === 'wishlist' ? <WishlistVisual /> : null}
              {card.id === 'property' ? <PropertyVisual /> : null}
              <div className="home-record-card__body">
                <p className="home-record-card__meta"><span>{card.kind}</span><span>{String(index + 1).padStart(2, '0')} / {String(CARDS.length).padStart(2, '0')}</span></p>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
                <ul>
                  {card.records.map(record => <li key={record}>{record}</li>)}
                </ul>
              </div>
            </article>
          </li>
        ))}
      </ol>

      <div className="home-record-deck__footer">
        <span>Swipe or scroll · {CARDS.length} cards</span>
        <span className="home-record-deck__count" aria-hidden="true">
          {CARDS.map(card => <i key={card.id} />)}
        </span>
      </div>
      <p className="home-record-deck__note">Illustrative cards. Homeowner-entered details are not professional findings or coverage advice.</p>
    </section>
  )
}
