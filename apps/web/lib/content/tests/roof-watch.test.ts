import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditResponse } from '../../../../../src/constitution/detector.ts'
import { ROOF_WATCH_CITIES } from '../roof-watch-cities.ts'
import { ROOF_WATCH_GUIDES } from '../roof-watch-guides.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const RISKY_CLAIMS = /do not call your insurance|look before you file|burn(?:ing)? a claim|strongest thing a claim|always goes first|more roof damage per year than any single storm/i

test('Roof Watch city metadata is unique and search-result sized', () => {
  assert.equal(new Set(ROOF_WATCH_CITIES.map(city => city.slug)).size, ROOF_WATCH_CITIES.length)
  assert.equal(new Set(ROOF_WATCH_CITIES.map(city => city.metaDescription)).size, ROOF_WATCH_CITIES.length)

  for (const city of ROOF_WATCH_CITIES) {
    assert.match(city.slug, /^[a-z]+(?:-[a-z]+)*$/)
    assert.ok(city.metaDescription.length >= 110, `${city.name} meta description is too short`)
    assert.ok(city.metaDescription.length <= 160, `${city.name} meta description is ${city.metaDescription.length} characters`)
    assert.doesNotMatch(city.metaDescription, /\.\./)
    assert.ok(city.cardSummary.length >= 50 && city.cardSummary.length <= 120)
    assert.ok(city.local.length >= 3, `${city.name} needs substantive local sections`)
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
  }
})

test('public Roof Watch pages do not promise unavailable account storage or enrollment', () => {
  const files = [
    'apps/web/app/roof-watch/page.tsx',
    'apps/web/app/roof-watch/[city]/page.tsx',
    'apps/web/app/roof-watch/guides/[slug]/page.tsx',
  ]
  const source = files.map(file => readFileSync(file, 'utf8')).join('\n')

  assert.doesNotMatch(source, /enroll online/i)
  assert.doesNotMatch(source, /stays? (?:in your account|there) forever/i)
  assert.doesNotMatch(source, /verified roofing pro|vetted local (?:pro|roofer)/i)
  assert.match(source, /Start a private roof project/)
  assert.match(source, /check availability/i)
})
