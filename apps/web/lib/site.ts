export const SITE_NAME = 'Homesrolo'

export const SITE_TAGLINE = 'The durable record of a home'

export const SITE_DESCRIPTION =
  'Homesrolo is the operating layer and trusted memory for a home. The Home Project Passport is a '
  + 'homeowner-released record of real work: what was done, who did it, which materials, and what is warranted.'

/**
 * Used for canonical URLs and the sitemap. No network call is made with it at
 * any point; it is a string the export bakes in.
 */
export const SITE_ORIGIN = 'https://homesrolo.com'

export type NavItem = { readonly href: string; readonly label: string }

export const PRIMARY_NAV: readonly NavItem[] = Object.freeze([
  { href: '/how-it-works/', label: 'How it works' },
  { href: '/how-we-verify/', label: 'How we verify' },
  { href: '/professionals/', label: 'Professionals' },
  { href: '/academy/', label: 'Academy' },
  { href: '/services/roofing/', label: 'Roofing' },
  { href: '/ideas/', label: 'Ideas' },
  { href: '/for-professionals/', label: 'For pros' },
])

/** Routes that belong in the sitemap. Synthetic profiles are excluded. */
export const INDEXABLE_ROUTES: readonly string[] = Object.freeze([
  '/',
  '/how-it-works/',
  '/how-we-verify/',
  '/professionals/',
  '/academy/',
  '/services/roofing/',
  '/services/roofing/cost/',
  '/services/roofing/materials/',
  '/services/roofing/choose-a-contractor/',
  '/services/roofing/dfw/',
  '/services/roofing/dallas/',
  '/services/roofing/fort-worth/',
  '/ideas/',
  '/for-professionals/',
])
