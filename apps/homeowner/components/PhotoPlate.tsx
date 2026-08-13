import type { ProjectPhoto } from '../lib/port/types.ts'

/**
 * Drawn photo plates. The shell renders code-native art instead of image
 * files: this component is synthetic-only, and private uploads are served only
 * through authenticated exact-artifact routes. A
 * placeholder that looked like a photograph would imply one had happened.
 */

const CLAY = 'var(--clay)'
const RULE = 'var(--rule-strong)'
const INK = 'var(--ink-faint)'

function Art({ kind }: { kind: ProjectPhoto['art'] }) {
  switch (kind) {
    case 'roof':
      return (
        <>
          <path d="M20 70 L80 34 L140 70" fill="none" stroke={CLAY} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M32 70 L32 92 L128 92 L128 70" fill="none" stroke={RULE} strokeWidth="2" />
          {[46, 62, 78, 94, 110].map(x => <line key={x} x1={x} y1="70" x2={x} y2="92" stroke={RULE} strokeWidth="1" />)}
          <circle cx="80" cy="34" r="2" fill={CLAY} />
        </>
      )
    case 'gutter':
      return (
        <>
          <path d="M18 46 L142 46" stroke={CLAY} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M120 46 L120 88 L100 88" fill="none" stroke={CLAY} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {[36, 60, 84].map(x => <line key={x} x1={x} y1="52" x2={x} y2="60" stroke={INK} strokeWidth="1.4" />)}
        </>
      )
    case 'window':
      return (
        <>
          <rect x="46" y="30" width="68" height="62" rx="3" fill="none" stroke={CLAY} strokeWidth="2.5" />
          <line x1="80" y1="30" x2="80" y2="92" stroke={RULE} strokeWidth="1.6" />
          <line x1="46" y1="61" x2="114" y2="61" stroke={RULE} strokeWidth="1.6" />
        </>
      )
    case 'interior':
      return (
        <>
          <path d="M24 88 L24 44 L80 30 L136 44 L136 88" fill="none" stroke={RULE} strokeWidth="2" strokeLinejoin="round" />
          <rect x="58" y="58" width="20" height="30" fill="none" stroke={CLAY} strokeWidth="2" />
          <rect x="92" y="56" width="24" height="18" fill="none" stroke={INK} strokeWidth="1.6" />
        </>
      )
    case 'exterior':
    default:
      return (
        <>
          <path d="M22 88 L22 58 L52 38 L82 58 L82 88 Z" fill="none" stroke={CLAY} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="94" y="58" width="44" height="30" fill="none" stroke={RULE} strokeWidth="2" />
          <line x1="12" y1="92" x2="148" y2="92" stroke={INK} strokeWidth="1.4" />
        </>
      )
  }
}

export function PhotoPlate({ photo }: { photo: ProjectPhoto }) {
  return (
    <figure className="plate" style={{ margin: 0 }}>
      <svg viewBox="0 0 160 104" role="presentation" aria-hidden="true" focusable="false">
        <Art kind={photo.art} />
      </svg>
      <figcaption>
        <span className="plate__caption">{photo.caption}</span>
        <span className="mono">{photo.takenOn} · drawn placeholder — no photo exists</span>
      </figcaption>
    </figure>
  )
}
