import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const companyPage = read('app/companies/[slug]/page.tsx')
const robots = read('app/robots.ts')
const sitemap = read('app/sitemap.ts')
const professionals = read('app/professionals/page.tsx')
const roofing = read('app/services/roofing/page.tsx')
const site = read('lib/site.ts')

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
  assert.match(css, /--ink:\s*oklch\(/)
  assert.match(css, /--paper:\s*oklch\(/)
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

// --- synthetic listings stay out of search ------------------------------------

test('company profiles are noindex at the source, not just in the built output', () => {
  assert.match(companyPage, /robots:\s*\{\s*index:\s*false/,
    'a synthetic company page must never be indexable')
  assert.match(companyPage, /follow:\s*false/)
  assert.match(companyPage, /export const dynamicParams = false/,
    'an unknown slug must 404 rather than render')
})

test('robots.txt disallows the company namespace and the sitemap omits it', () => {
  assert.match(robots, /disallow:\s*\['\/companies\/'\]/)
  assert.doesNotMatch(sitemap, /companies/,
    'a sitemap entry is an invitation to index a company that does not exist')
})

test('the synthetic banner is a note landmark on every demo surface', () => {
  assert.match(companyPage, /className="synthetic-banner"[^>]*role="note"/,
    'the sample-data warning must be announced, not just styled')
  assert.match(css, /\.synthetic-banner\s*\{/)
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

test('the profile renders the retraction disclaimers, not just the model', () => {
  assert.match(companyPage, /REVIEW_PROOF_DISCLAIMER/)
  assert.match(companyPage, /CREDENTIAL_DEMO_DISCLAIMER/)
  assert.match(companyPage, /CLAIM_DEMO_DISCLAIMER/)
  assert.match(companyPage, /REVIEW_ACTIVATION_REQUIREMENTS/)
})

test('the homeowner conversion path starts a project instead of publishing a contractor directory', () => {
  assert.match(site, /HOMEOWNER_APP_ORIGIN = 'https:\/\/app\.homesrolo\.com'/)
  assert.match(site, /label: 'Start a project'/)
  assert.match(professionals, /Create my home account/)
  assert.match(professionals, /Start with your home, not a contractor list/)
  assert.doesNotMatch(professionals, /SYNTHETIC_PROFILES|sample listings|ordered by name/)
  assert.match(roofing, /Start my roof project/)
})
