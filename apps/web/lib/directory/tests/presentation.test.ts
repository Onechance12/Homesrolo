import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Presentation contracts that can be checked deterministically from source.
 *
 * A live layout probe (headless Chrome at 390x844 and 1440x900) found the
 * touch-target failures these rules fix. The probe is not reproducible in CI
 * without a browser, so the *fixes* are pinned here instead: if someone deletes
 * the target-size block or the reduced-motion block, this fails.
 */

const WEB = path.resolve(import.meta.dirname, '../../..')
const read = (relative: string) => readFileSync(path.join(WEB, relative), 'utf8')

const css = read('app/globals.css')
const layout = read('app/layout.tsx')
const notFound = read('app/not-found.tsx')
const robots = read('app/robots.ts')
const sitemap = read('app/sitemap.ts')
const homeProjects = read('app/home-projects/page.tsx')
const roofing = read('app/services/roofing/page.tsx')
const roofingArticle = read('components/RoofingArticle.tsx')
const howItWorks = read('app/how-it-works/page.tsx')
const site = read('lib/site.ts')
const retiredCompanyPage = read('app/companies/[slug]/page.tsx')

// --- target size (WCAG 2.5.8) -------------------------------------------------

test('standalone links and controls keep a 24px minimum target', () => {
  assert.match(css, /min-height:\s*24px/,
    'the 24px target-size floor must survive; a live probe found 20px links without it')
  for (const selector of ['.nav a', '.colophon a', '.link-list__item > a', '.card__title a', '.nav-list a']) {
    assert.ok(css.includes(selector), `${selector} must be covered by the target-size rule`)
  }
  assert.match(css, /summary\s*\{[^}]*min-height:\s*24px/,
    'a disclosure control is a target too')
})

test('the 404 uses the padded standalone link list rather than bare list items', () => {
  assert.match(notFound, /className="nav-list"/,
    'the suggested-page list was the worst offender in the probe')
})

// --- motion, focus, and contrast ---------------------------------------------

test('reduced motion is honoured', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/)
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/)
})

test('a visible focus ring exists and is never removed without replacement', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid/,
    'focus must be visible on every interactive element')
  // `outline: none` is only acceptable alongside another visible affordance.
  // The simplest guarantee is that it does not appear at all.
  assert.doesNotMatch(css, /outline:\s*(?:none|0)\s*;/,
    'removing the outline breaks keyboard navigation')
})

test('colour is defined once as tokens, so contrast is tunable in one place', () => {
  assert.match(css, /--canvas:\s*#f4f7f6/)
  assert.match(css, /--ink:\s*#0b1f2a/)
  assert.match(css, /--signal:\s*#c8ef4d/)
  // Body text must use the darkest ink, not a faint tone.
  assert.match(css, /body\s*\{[^}]*color:\s*var\(--ink\)/)
})

// --- document structure -------------------------------------------------------

test('every page inherits a language, a skip link, and a main landmark', () => {
  assert.match(layout, /<html lang="en">/)
  assert.match(layout, /className="skip-link"/)
  assert.match(layout, /href="#main"/)
  assert.match(layout, /<main id="main"/)
  assert.match(css, /\.skip-link:focus\s*\{[^}]*left:\s*0/,
    'the skip link must become visible on focus')
})

test('dense profile metadata is allowed to wrap on a narrow screen', () => {
  assert.match(css, /@media \(max-width: 30rem\)/)
  assert.match(css, /\.fact__meta > div\s*\{\s*white-space:\s*normal/,
    'the fact meta line must not hold one long unwrappable row on mobile')
})

// --- unfinished listings stay out of the public application ------------------

test('retired synthetic company URLs are redirect-only tombstones', () => {
  assert.equal(existsSync(path.join(WEB, 'app/companies/[slug]/page.tsx')), true)
  for (const slug of ['demo', 'sample-roofworks', 'sample-windowcraft']) {
    assert.match(retiredCompanyPage, new RegExp(`['"]${slug}['"]`))
  }
  assert.match(retiredCompanyPage, /httpEquiv="refresh" content="0; url=\/for-professionals\/"/)
  assert.match(retiredCompanyPage, /canonical:\s*'\/for-professionals\/'/)
  assert.match(retiredCompanyPage, /robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/)
  assert.doesNotMatch(retiredCompanyPage, /fixtures|findSyntheticProfile|VerificationFacts|Reviews/,
    'a retired URL may redirect, but it must never render the internal directory lab')
})

test('robots lets search crawlers observe retired company redirects while the sitemap omits them', () => {
  assert.match(robots, /userAgent:\s*'Googlebot',\s*\.\.\.publicRules/)
  assert.match(robots, /userAgent:\s*'Bingbot',\s*\.\.\.publicRules/)
  assert.match(robots, /userAgent:\s*'OAI-SearchBot',\s*\.\.\.publicRules/)
  assert.match(robots, /userAgent:\s*'GPTBot',\s*\.\.\.trainingRules/)
  assert.match(robots, /trainingRules[\s\S]*disallow:\s*\['\/companies\/'\]/)
  assert.doesNotMatch(sitemap, /companies/,
    'a sitemap entry is an invitation to index a company that does not exist')
})

// --- honest labelling in the UI layer ----------------------------------------

test('no rendered label calls a sample review a verified project', () => {
  const reviews = read('components/Reviews.tsx')
  assert.doesNotMatch(reviews, /published:\s*'Verified project'/,
    'the published chip must not claim verification that does not exist')
  assert.match(reviews, /published:\s*'Sample — unverified'/)
  // A green chip reads as "checked". Published samples must not get one.
  assert.doesNotMatch(reviews, /state === 'published'\) return 'chip chip--confirmed'/)
})

test('the homeowner conversion path starts a project instead of publishing a contractor directory', () => {
  assert.match(site, /HOMEOWNER_APP_ORIGIN = 'https:\/\/homesrolo-homeowner-v2\.onrender\.com'/)
  assert.match(site, /HOMEOWNER_ROOFING_SIGNIN_URL = `\$\{HOMEOWNER_APP_ORIGIN\}\/signin\?intent=not_sure`/)
  assert.match(site, /HOMEOWNER_ROOF_WATCH_SIGNIN_URL = `\$\{HOMEOWNER_APP_ORIGIN\}\/signin\?intent=inspection`/)
  assert.match(site, /label: 'Home care'/)
  for (const route of ['/home-care/', '/home-projects/', '/home-record/', '/guides/', '/how-it-works/', '/about/']) {
    assert.match(site, new RegExp(route.replaceAll('/', '\\/')))
  }
  assert.doesNotMatch(site, /label: 'Roof Watch'|label: 'Roofing'|label: 'For pros'|label: 'For agents'/)
  assert.match(homeProjects, /Start a private project/)
  assert.match(homeProjects, /Give the work a clear record before the details get scattered/)
  assert.doesNotMatch(homeProjects, /SYNTHETIC_PROFILES|sample listings|ordered by name/)
  assert.match(roofing, /Start my roof project/)
  assert.match(roofing, /href=\{HOMEOWNER_ROOFING_SIGNIN_URL\}/)
  assert.match(roofingArticle, /href=\{HOMEOWNER_ROOFING_SIGNIN_URL\}/)
})

test('how it works states the live homeowner boundary without overclaiming', () => {
  assert.match(howItWorks, /passwordless account gives each home its own workspace/)
  assert.match(howItWorks, /planned,\s+underway, completed, or remembered from a previous year/)
  assert.match(howItWorks, /Photo checkups save a dated JPEG or PNG/)
  assert.match(howItWorks, /does not diagnose a photo, score a price, or choose a\s+contractor/)
  assert.match(howItWorks, /does not hire a professional, send a lead, publish the address/)
  assert.doesNotMatch(howItWorks, /private[- ]beta|coming soon|not live yet|in development/i)
})
