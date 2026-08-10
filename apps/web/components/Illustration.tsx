/**
 * Code-native illustrations, drawn as drafting-sheet details.
 *
 * No photographs, no stock imagery, no remote assets. Every visual is drawn
 * from tokens in the stylesheet, which keeps the export self-contained, avoids
 * any network fetch, and avoids implying that a synthetic project has a real
 * photograph behind it.
 *
 * The vocabulary is an architect's: primary strokes in clay, construction
 * lines dashed, dimension lines with perpendicular ticks and a measurement
 * label in the ledger mono. The primary stroke carries the `draw` class and
 * inks itself in on arrival (reduced motion lands it already drawn).
 */

export type IllustrationKind = 'roofline' | 'gutter' | 'siding' | 'window' | 'paint' | 'frame'

const CLAY = 'var(--clay)'
const RULE = 'var(--rule-strong)'
const INK = 'var(--ink-faint)'
const MONO = 'var(--font-mono)'

/** A horizontal dimension line with end ticks and a centred label. */
function Dim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g aria-hidden="true">
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth="0.75" />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke={INK} strokeWidth="0.75" />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke={INK} strokeWidth="0.75" />
      <text
        x={(x1 + x2) / 2}
        y={y - 4}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize="8.5"
        letterSpacing="0.08em"
        fill={INK}
      >
        {label}
      </text>
    </g>
  )
}

function Shapes({ kind }: { kind: IllustrationKind }) {
  switch (kind) {
    case 'roofline':
      return (
        <>
          {/* Construction lines first, the way a sheet is actually drawn. */}
          <line x1="10" y1="96" x2="210" y2="96" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <line x1="110" y1="24" x2="110" y2="140" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <path className="draw" d="M20 96 L110 38 L200 96" fill="none" stroke={CLAY} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M38 96 L38 132 L182 132 L182 96" fill="none" stroke={RULE} strokeWidth="2.5" />
          {[52, 74, 96, 118, 140, 162].map(x => (
            <line key={x} x1={x} y1="96" x2={x} y2="132" stroke={RULE} strokeWidth="1.25" />
          ))}
          <rect x="96" y="106" width="28" height="26" fill="none" stroke={INK} strokeWidth="1.75" />
          {/* Ridge marker and pitch note, like a real elevation. */}
          <circle cx="110" cy="38" r="2.5" fill={CLAY} />
          <Dim x1={20} x2={200} y={150} label="EAVE — EAVE" />
        </>
      )
    case 'gutter':
      return (
        <>
          <line x1="10" y1="52" x2="210" y2="52" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <path className="draw" d="M18 52 L202 52" stroke={CLAY} strokeWidth="4" strokeLinecap="round" />
          <path d="M18 62 L202 62" stroke={RULE} strokeWidth="2" />
          <path className="draw draw--late" d="M176 62 L176 128 L150 128" fill="none" stroke={CLAY} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {[40, 70, 100, 130].map(x => (
            <line key={x} x1={x} y1="62" x2={x} y2="74" stroke={INK} strokeWidth="1.5" />
          ))}
          <circle cx="176" cy="62" r="2.5" fill={CLAY} />
          <Dim x1={18} x2={202} y={150} label="RUN" />
        </>
      )
    case 'siding':
      return (
        <>
          <line x1="34" y1="30" x2="34" y2="150" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <line x1="186" y1="30" x2="186" y2="150" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          {[46, 66, 86, 106, 126].map(y => (
            <rect
              key={y}
              className={y === 86 ? 'draw' : undefined}
              x="34" y={y} width="152" height="16" rx="2"
              fill="none" stroke={y === 86 ? CLAY : RULE} strokeWidth="2"
            />
          ))}
          <Dim x1={34} x2={186} y={158} label="COURSE WIDTH" />
        </>
      )
    case 'window':
      return (
        <>
          <line x1="110" y1="24" x2="110" y2="156" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <rect className="draw" x="52" y="38" width="116" height="104" rx="4" fill="none" stroke={CLAY} strokeWidth="3" />
          <line x1="110" y1="38" x2="110" y2="142" stroke={RULE} strokeWidth="2" />
          <line x1="52" y1="90" x2="168" y2="90" stroke={RULE} strokeWidth="2" />
          <rect x="44" y="142" width="132" height="8" rx="2" fill="none" stroke={INK} strokeWidth="2" />
          <Dim x1={52} x2={168} y={160} label="R.O." />
        </>
      )
    case 'paint':
      return (
        <>
          <rect x="60" y="34" width="100" height="60" rx="4" fill="none" stroke={RULE} strokeWidth="2" />
          <path className="draw" d="M60 94 L160 94 L160 132 L60 132 Z" fill="none" stroke={CLAY} strokeWidth="3" strokeLinejoin="round" />
          <path d="M110 34 L110 20" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <Dim x1={60} x2={160} y={150} label="COVERAGE" />
        </>
      )
    case 'frame':
    default:
      return (
        <>
          <line x1="26" y1="76" x2="194" y2="76" stroke={RULE} strokeWidth="0.75" strokeDasharray="3 5" />
          <rect className="draw" x="40" y="40" width="140" height="100" rx="6" fill="none" stroke={RULE} strokeWidth="2.5" />
          <path className="draw draw--late" d="M40 76 L180 76" stroke={CLAY} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="62" cy="58" r="5" fill="none" stroke={INK} strokeWidth="1.75" />
          <Dim x1={40} x2={180} y={155} label="RECORD" />
        </>
      )
  }
}

export function Illustration({ kind, label }: { kind: IllustrationKind; label?: string }) {
  return (
    <svg
      className="figure"
      viewBox="0 0 220 170"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Shapes kind={kind} />
    </svg>
  )
}
