export const SITE_NAME = 'Homesrolo'

export const SITE_TAGLINE = 'Every home has a history. Keep yours.'

export const SITE_DESCRIPTION =
  'Keep one private home workspace for whole-home project records, historical projects, JPEG and PNG photo checkups, and homeowner-entered roof proposal notes.'

export const SOCIAL_CARD_ALT = 'Homesrolo — one private record for your home'

/**
 * Used for canonical URLs and the sitemap. No network call is made with it at
 * any point; it is a string the export bakes in.
 */
export const SITE_ORIGIN = 'https://homesrolo.com'

/** The separate authenticated homeowner application. */
export const HOMEOWNER_APP_ORIGIN = 'https://homesrolo-homeowner-v2.onrender.com'
export const HOMEOWNER_SIGNIN_URL = `${HOMEOWNER_APP_ORIGIN}/signin`

/**
 * Public contact is text-only. Keep the number, SMS intents, and display copy
 * here so a page cannot quietly introduce a second contact policy.
 */
export const HOMESROLO_TEXT_NUMBER_E164 = '+18178862418'
export const HOMESROLO_TEXT_NUMBER_DISPLAY = '(817) 886-2418'

function textMessageUrl(message: string): string {
  return `sms:${HOMESROLO_TEXT_NUMBER_E164}?&body=${encodeURIComponent(message)}`
}

export const ROOF_WATCH_PHONE_DISPLAY = HOMESROLO_TEXT_NUMBER_DISPLAY
export const ROOF_WATCH_SMS_URL = textMessageUrl('ROOF WATCH - Please check availability for my city and ZIP.')
export const AGENT_PHONE_DISPLAY = HOMESROLO_TEXT_NUMBER_DISPLAY
export const AGENT_SMS_URL = textMessageUrl("AGENT - I'm a real estate agent and I want the details.")

export function roofWatchSmsUrl(city: string): string {
  const message = `ROOF WATCH ${city.toUpperCase()} - Please check availability for ZIP `
  return textMessageUrl(message)
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
  { href: '/home-care/', label: 'Home care' },
  { href: '/home-projects/', label: 'Home projects' },
  { href: '/home-record/', label: 'Home record' },
  { href: '/guides/', label: 'Guides' },
  { href: '/how-it-works/', label: 'How it works' },
  { href: '/about/', label: 'About' },
])

/** Routes that belong in the sitemap. Synthetic profiles are excluded. */
export const INDEXABLE_ROUTES: readonly string[] = Object.freeze([
  '/',
  '/home-care/',
  '/home-projects/',
  '/home-record/',
  '/guides/',
  '/how-it-works/',
  '/privacy/',
  '/security/',
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
  '/for-professionals/',
  '/for-agents/',
  '/about/',
  '/editorial-standards/',
])
