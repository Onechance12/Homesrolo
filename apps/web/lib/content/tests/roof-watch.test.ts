import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditResponse } from '../../../../../src/constitution/detector.ts'
import { ROOF_WATCH_ROUTE_LAST_MODIFIED, ROUTE_IMAGES } from '../../../app/sitemap.ts'
import { INDEXABLE_ROUTES, ROOF_WATCH_PHONE_DISPLAY } from '../../site.ts'
import { ROOF_WATCH_CITIES } from '../roof-watch-cities.ts'
import { ROOF_WATCH_GUIDES } from '../roof-watch-guides.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const RISKY_CLAIMS = /do not call your insurance|look before you file|burn(?:ing)? a claim|strongest thing a claim|always goes first|more roof damage per year than any single storm/i
const roofWatchHub = readFileSync('apps/web/app/roof-watch/page.tsx', 'utf8')
const roofWatchGuidesHub = readFileSync('apps/web/app/roof-watch/guides/page.tsx', 'utf8')

function fiveWordShingles(copy: string): Set<string> {
  const words = copy.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return new Set(words.slice(0, -4).map((_, index) => words.slice(index, index + 5).join(' ')))
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

test('Roof Watch city metadata is unique and search-result sized', () => {
  assert.equal(ROOF_WATCH_CITIES.length, 6, 'only established local routes belong in the city collection')
  assert.equal(new Set(ROOF_WATCH_CITIES.map(city => city.slug)).size, ROOF_WATCH_CITIES.length)
  assert.equal(new Set(ROOF_WATCH_CITIES.map(city => city.metaDescription)).size, ROOF_WATCH_CITIES.length)
  const normalizedDescriptions = ROOF_WATCH_CITIES.map(city => city.metaDescription.toLowerCase().replace(city.name.toLowerCase(), '[city]'))
  assert.equal(new Set(normalizedDescriptions).size, ROOF_WATCH_CITIES.length, 'city-name swaps do not count as unique metadata')

  for (const city of ROOF_WATCH_CITIES) {
    assert.match(city.slug, /^[a-z]+(?:-[a-z]+)*$/)
    assert.ok(city.metaDescription.length >= 110, `${city.name} meta description is too short`)
    assert.ok(city.metaDescription.length <= 160, `${city.name} meta description is ${city.metaDescription.length} characters`)
    assert.doesNotMatch(city.metaDescription, /\.\./)
    assert.match(city.dateModified, ISO_DATE)
    assert.ok(city.cardSummary.length >= 50 && city.cardSummary.length <= 120)
    assert.ok(city.local.length >= 3, `${city.name} needs substantive local sections`)
    assert.ok(city.sources.length > 0, `${city.name} needs visible sources for its technical local guidance`)
    assert.ok(
      city.sources.some(source => /Roofing Contractors Association|Occupational Safety and Health Administration/.test(source.publisher)),
      `${city.name} needs a relevant technical roofing or access-safety source`,
    )
    for (const source of city.sources) assert.equal(new URL(source.href).protocol, 'https:')
  }
})

test('Roof Watch checks Texas and Oklahoma without inventing Oklahoma city pages', () => {
  assert.match(roofWatchHub, /Roof Watch availability in Texas and Oklahoma/)
  assert.match(roofWatchHub, /participating Texas and Oklahoma addresses/)
  assert.match(roofWatchHub, /Availability is confirmed address by address/)
  assert.match(roofWatchHub, /'State', name: 'Texas'/)
  assert.match(roofWatchHub, /'State', name: 'Oklahoma'/)
  assert.match(roofWatchHub, /Current detailed Texas city pages/)
  assert.match(roofWatchHub, /Home Watch · Roofs · Texas \+ Oklahoma/)
  assert.match(roofWatchHub, /Roof Watch sits inside Home Watch/)
  assert.doesNotMatch(roofWatchHub, /North Texas/)
  assert.match(roofWatchGuidesHub, /Each guide identifies its region and sources/)
  assert.doesNotMatch(roofWatchGuidesHub, /Texas and Oklahoma homeowners/)
  assert.equal(ROOF_WATCH_CITIES.some(city => city.slug.includes('oklahoma') || city.name.includes('Oklahoma')), false)
})

test('Roof Watch city pages keep distinct local substance', () => {
  const pages = ROOF_WATCH_CITIES.map(city => ({
    name: city.name,
    shingles: fiveWordShingles([
      city.headline,
      city.metaDescription,
      city.cardSummary,
      city.lede,
      ...city.local.flatMap(section => [section.heading, ...section.body]),
      city.faqTwist.question,
      city.faqTwist.answer,
      ...city.sources.map(source => `${source.label} ${source.publisher}`),
    ].join(' ')),
  }))

  for (const [leftIndex, leftPage] of pages.entries()) {
    for (const rightPage of pages.slice(leftIndex + 1)) {
      const similarity = jaccard(leftPage.shingles, rightPage.shingles)
      assert.ok(similarity < 0.2, `${leftPage.name} and ${rightPage.name} are too similar (${similarity.toFixed(3)})`)
    }
  }
})

test('Roof Watch sitemap dates cover every current program route exactly', () => {
  const expected = new Set([
    '/roof-watch/',
    '/roof-watch/guides/',
    ...ROOF_WATCH_CITIES.map(city => `/roof-watch/${city.slug}/`),
    ...ROOF_WATCH_GUIDES.map(guide => `/roof-watch/guides/${guide.slug}/`),
  ])
  const actual = new Set(Object.keys(ROOF_WATCH_ROUTE_LAST_MODIFIED))
  const indexed = new Set(INDEXABLE_ROUTES.filter(route => route === '/roof-watch/' || route.startsWith('/roof-watch/')))

  assert.deepEqual(actual, expected)
  assert.deepEqual(indexed, expected)
  for (const date of Object.values(ROOF_WATCH_ROUTE_LAST_MODIFIED)) assert.match(date, ISO_DATE)
})

test('Roof Watch image sitemap covers every photographed page', () => {
  const expectedRoutes = new Set([
    '/roof-watch/',
    ...ROOF_WATCH_CITIES.map(city => `/roof-watch/${city.slug}/`),
    ...ROOF_WATCH_GUIDES.map(guide => `/roof-watch/guides/${guide.slug}/`),
  ])
  assert.deepEqual(new Set(Object.keys(ROUTE_IMAGES)), expectedRoutes)
  assert.equal(new Set(ROUTE_IMAGES['/roof-watch/']).size, 5)
  for (const images of Object.values(ROUTE_IMAGES)) {
    for (const image of images) assert.match(image, /^\/images\/roof-watch\/[a-z0-9-]+\.webp$/)
  }
})

test('Roof Watch guides show dates and primary sources', () => {
  assert.equal(new Set(ROOF_WATCH_GUIDES.map(guide => guide.slug)).size, ROOF_WATCH_GUIDES.length)

  for (const guide of ROOF_WATCH_GUIDES) {
    assert.ok(guide.description.length >= 110, `${guide.slug} description is too short`)
    assert.ok(guide.description.length <= 160, `${guide.slug} description is ${guide.description.length} characters`)
    assert.match(guide.datePublished, ISO_DATE)
    assert.match(guide.dateModified, ISO_DATE)
    assert.ok(guide.dateModified >= guide.datePublished)
    assert.ok(guide.sources.length >= 2, `${guide.slug} needs at least two reviewed sources`)
    assert.equal(new Set(guide.sources.map(source => source.href)).size, guide.sources.length)
    for (const source of guide.sources) assert.equal(new URL(source.href).protocol, 'https:')
  }
})

test('Roof Watch copy stays inside the education-only boundary', () => {
  const content = [
    ...ROOF_WATCH_CITIES.flatMap(city => [
      city.headline,
      city.metaDescription,
      city.cardSummary,
      city.lede,
      ...city.local.flatMap(section => [section.heading, ...section.body]),
      city.faqTwist.question,
      city.faqTwist.answer,
    ]),
    ...ROOF_WATCH_GUIDES.flatMap(guide => [
      guide.title,
      guide.description,
      ...guide.sections.flatMap(section => [section.heading, ...section.body]),
    ]),
  ]

  for (const copy of content) {
    assert.doesNotMatch(copy, RISKY_CLAIMS)
    const audit = auditResponse(copy)
    assert.deepEqual(audit.violations, [], `copy crosses a constitutional boundary (${audit.violations.join(', ')}): ${copy}`)
    for (const phone of copy.match(/\(\d{3}\) \d{3}-\d{4}/g) ?? []) {
      assert.equal(phone, ROOF_WATCH_PHONE_DISPLAY, 'indexed Roof Watch copy contains a stale phone number')
    }
  }
})

test('public Roof Watch pages do not promise unavailable account storage or enrollment', () => {
  const files = [
    'apps/web/app/roof-watch/page.tsx',
    'apps/web/app/roof-watch/[city]/page.tsx',
    'apps/web/app/roof-watch/guides/[slug]/page.tsx',
    'apps/web/app/services/roofing/page.tsx',
  ]
  const source = files.map(file => readFileSync(file, 'utf8')).join('\n')

  assert.doesNotMatch(source, /enroll online/i)
  assert.doesNotMatch(source, /stays? (?:in your account|there) forever/i)
  assert.doesNotMatch(source, /verified roofing pro|vetted local (?:pro|roofer)/i)
  assert.match(source, /Start a private roof record/)
  assert.match(source, /HOMEOWNER_ROOF_WATCH_SIGNIN_URL/)
  assert.match(source, /check availability/i)
})
