/** Five-stroke icons in the drafting voice. Stroke colour inherits. */

type IconProps = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

export function HouseMark({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)} stroke="none">
      <path d="M4 11 L12 4.5 L20 11" fill="none" stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 11 V19 H17.5 V11" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 15.5 H15" stroke="var(--clay)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2.4" />
    </svg>
  )
}

export function IconHome({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 11 L12 4.5 L20 11" />
      <path d="M6.5 10.5 V19 H17.5 V10.5" />
    </svg>
  )
}

export function IconProjects({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M13.5 6.5 L17.5 10.5 L9.5 18.5 H5.5 V14.5 Z" />
      <path d="M15.5 4.5 L19.5 8.5" />
    </svg>
  )
}

export function IconDocs({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 4.5 H14 L18 8.5 V19.5 H7 Z" />
      <path d="M14 4.5 V8.5 H18" />
      <path d="M9.5 12.5 H15.5 M9.5 15.5 H13.5" />
    </svg>
  )
}

export function IconShield({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 4.5 L18.5 7 V12 C18.5 16 15.8 18.6 12 20 C8.2 18.6 5.5 16 5.5 12 V7 Z" />
      <path d="M9.5 12 L11.5 14 L15 10.5" />
    </svg>
  )
}

export function IconThread({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 5.5 V18.5" strokeDasharray="2.5 3" />
      <circle cx="7" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <path d="M11 6 H18 M11 12 H18 M11 18 H16" />
    </svg>
  )
}

export function IconGear({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5 V7 M12 17 V19.5 M4.5 12 H7 M17 12 H19.5 M6.7 6.7 L8.5 8.5 M15.5 15.5 L17.3 17.3 M17.3 6.7 L15.5 8.5 M8.5 15.5 L6.7 17.3" />
    </svg>
  )
}

export function IconPlus({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 5.5 V18.5 M5.5 12 H18.5" />
    </svg>
  )
}

export function IconWrench({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14.5 4.8 A4.4 4.4 0 0 0 9.6 10.9 L4.8 15.7 A1.8 1.8 0 0 0 7.3 18.2 L12.1 13.4 A4.4 4.4 0 0 0 18.2 8.5 L15.4 11.3 L12.7 8.6 Z" />
    </svg>
  )
}
