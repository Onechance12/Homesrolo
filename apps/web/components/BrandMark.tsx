type BrandMarkProps = {
  readonly size?: number
  readonly className?: string
}

/**
 * The home sits inside an open loop: one property with a history that keeps
 * moving. The mark is intentionally one colour so it survives small sizes,
 * print, favicons, and light/dark surfaces without a special-case redraw.
 */
export function BrandMark({ size = 26, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M48.6 53.4A25 25 0 1 1 56.5 34C56.2 40.5 52.2 45.2 45.5 46.5"
        stroke="currentColor"
        strokeWidth="5.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 46.5V30.8L30.5 20.4a2.3 2.3 0 0 1 3 0l12 10.4v15.7h-9v-8.8a4.5 4.5 0 0 0-9 0v8.8h-9"
        stroke="currentColor"
        strokeWidth="5.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
