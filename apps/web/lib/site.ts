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

/** The separate authenticated homeowner application. */
export const HOMEOWNER_APP_ORIGIN = 'https://homesrolo-homeowner-v2.onrender.com'

/** Public Roof Watch contact. Keep the SMS copy limited to service intent. */
export const ROOF_WATCH_PHONE_DISPLAY = '(817) 886-2418'
export const ROOF_WATCH_SMS_URL = 'sms:+18178862418?&body=ROOF%20WATCH%20-%20Please%20check%20availability%20for%20my%20city%20and%20ZIP.'

export function roofWatchSmsUrl(city: string): string {
  const message = `ROOF WATCH ${city.toUpperCase()} - Please check availability for ZIP `
  return `sms:+18178862418?&body=${encodeURIComponent(message)}`
}

/**
 * The only public-to-private roofing handoff. The value is deliberately a
 * closed enum rather than homeowner text, an address, or another identifier.
 */
export const HOMEOWNER_ROOFING_SIGNIN_URL = `${HOMEOWNER_APP_ORIGIN}/signin?intent=not_sure`

/**
 * Roof Watch can carry only the existing inspection choice into the private
 * app. This opens a private project draft; it does not schedule a visit or
 * send anything to a contractor.
 */
export const HOMEOWNER_ROOF_WATCH_SIGNIN_URL = `${HOMEOWNER_APP_ORIGIN}/signin?intent=inspection`

export type NavItem = { readonly href: string; readonly label: string }

export const PRIMARY_NAV: readonly NavItem[] = Object.freeze([
  { href: '/how-it-works/', label: 'Home record' },
  { href: '/services/roofing/', label: 'Roofing' },
  { href: '/roof-watch/', label: 'Roof Watch' },
  { href: '/professionals/', label: 'Start a project' },
  { href: '/how-we-verify/', label: 'How we verify' },
  { href: '/for-professionals/', label: 'For pros' },
  { href: '/about/', label: 'About' },
])

/** Routes that belong in the sitemap. Synthetic profiles are excluded. */
export const INDEXABLE_ROUTES: readonly string[] = Object.freeze([
  '/',
  '/how-it-works/',
  '/how-we-verify/',
  '/professionals/',
  '/academy/',
  '/services/roofing/',
  '/roof-watch/',
  '/roof-watch/guides/',
  '/roof-watch/guides/hail-first-72-hours/',
  '/roof-watch/guides/roof-inspection-report/',
  '/roof-watch/guides/texas-heat-roof/',
  '/roof-watch/guides/selling-documented-home/',
  '/roof-watch/keller/',
  '/roof-watch/roanoke/',
  '/roof-watch/grapevine/',
  '/roof-watch/southlake/',
  '/roof-watch/flower-mound/',
  '/roof-watch/fort-worth/',
  '/services/roofing/repair-or-replace/',
  '/services/roofing/cost/',
  '/services/roofing/materials/',
  '/services/roofing/choose-a-contractor/',
  '/services/roofing/dfw/',
  '/services/roofing/dallas/',
  '/services/roofing/fort-worth/',
  '/ideas/',
  '/for-professionals/',
  '/for-agents/',
  '/about/',
  '/editorial-standards/',
])
