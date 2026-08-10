/**
 * Code-native illustrations.
 *
 * No photographs, no stock imagery, no remote assets. Every visual is drawn
 * from tokens in the stylesheet, which keeps the export self-contained, avoids
 * any network fetch, and avoids implying that a synthetic project has a real
 * photograph behind it.
 */

export type IllustrationKind = 'roofline' | 'gutter' | 'siding' | 'window' | 'paint' | 'frame'

const CLAY = 'var(--clay)'
const RULE = 'var(--rule-strong)'
const INK = 'var(--ink-faint)'

function Shapes({ kind }: { kind: IllustrationKind }) {
  switch (kind) {
    case 'roofline':
      return (
        <>
          <path d="M20 96 L110 38 L200 96" fill="none" stroke={CLAY} strokeWidth="3" strokeLinejoin="round" />
          <path d="M38 96 L38 132 L182 132 L182 96" fill="none" stroke={RULE} strokeWidth="2.5" />
          {[52, 74, 96, 118, 140, 162].map(x => (
            <line key={x} x1={x} y1="96" x2={x} y2="132" stroke={RULE} strokeWidth="1.25" />
          ))}
          <rect x="96" y="106" width="28" height="26" fill="none" stroke={INK} strokeWidth="1.75" />
        </>
      )
    case 'gutter':
      return (
        <>
          <path d="M18 52 L202 52" stroke={CLAY} strokeWidth="4" strokeLinecap="round" />
          <path d="M18 62 L202 62" stroke={RULE} strokeWidth="2" />
          <path d="M176 62 L176 128 L150 128" fill="none" stroke={CLAY} strokeWidth="3" strokeLinejoin="round" />
          {[40, 70, 100, 130].map(x => (
            <line key={x} x1={x} y1="62" x2={x} y2="74" stroke={INK} strokeWidth="1.5" />
          ))}
        </>
      )
    case 'siding':
      return (
        <>
          {[46, 66, 86, 106, 126].map(y => (
            <rect key={y} x="34" y={y} width="152" height="16" rx="2" fill="none" stroke={y === 86 ? CLAY : RULE} strokeWidth="2" />
          ))}
        </>
      )
    case 'window':
      return (
        <>
          <rect x="52" y="38" width="116" height="104" rx="4" fill="none" stroke={CLAY} strokeWidth="3" />
          <line x1="110" y1="38" x2="110" y2="142" stroke={RULE} strokeWidth="2" />
          <line x1="52" y1="90" x2="168" y2="90" stroke={RULE} strokeWidth="2" />
          <rect x="44" y="142" width="132" height="8" rx="2" fill="none" stroke={INK} strokeWidth="2" />
        </>
      )
    case 'paint':
      return (
        <>
          <rect x="60" y="34" width="100" height="60" rx="4" fill="none" stroke={RULE} strokeWidth="2" />
          <path d="M60 94 L160 94 L160 132 L60 132 Z" fill="none" stroke={CLAY} strokeWidth="3" />
          <path d="M110 34 L110 20" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </>
      )
    case 'frame':
    default:
      return (
        <>
          <rect x="40" y="40" width="140" height="100" rx="6" fill="none" stroke={RULE} strokeWidth="2.5" />
          <path d="M40 76 L180 76" stroke={CLAY} strokeWidth="2.5" />
          <circle cx="62" cy="58" r="5" fill="none" stroke={INK} strokeWidth="1.75" />
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
