import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ROOF_WATCH_ROUTE_LAST_MODIFIED } from '../../../app/sitemap.ts'
import {
  AGENT_PHONE_DISPLAY,
  AGENT_SMS_URL,
  HOMESROLO_TEXT_NUMBER_DISPLAY,
  HOMESROLO_TEXT_NUMBER_E164,
  ROOF_WATCH_PHONE_DISPLAY,
  SITE_DESCRIPTION,
  INDEXABLE_ROUTES,
  PRIMARY_NAV,
} from '../../site.ts'
import { ROOF_WATCH_GUIDES } from '../roof-watch-guides.ts'

const homepage = readFileSync('apps/web/app/page.tsx', 'utf8')
const homeRecordDeck = readFileSync('apps/web/components/HomeRecordDeck.tsx', 'utf8')
const globalCss = readFileSync('apps/web/app/globals.css', 'utf8')
const agentPage = readFileSync('apps/web/app/for-agents/page.tsx', 'utf8')
const footer = readFileSync('apps/web/components/SiteFooter.tsx', 'utf8')
const layout = readFileSync('apps/web/app/layout.tsx', 'utf8')
const privacy = readFileSync('apps/web/app/privacy/page.tsx', 'utf8')
const security = readFileSync('apps/web/app/security/page.tsx', 'utf8')

test('public contact stays centralized and text-only', () => {
  assert.equal(HOMESROLO_TEXT_NUMBER_E164, '+18178862418')
  assert.equal(AGENT_PHONE_DISPLAY, HOMESROLO_TEXT_NUMBER_DISPLAY)
  assert.equal(ROOF_WATCH_PHONE_DISPLAY, HOMESROLO_TEXT_NUMBER_DISPLAY)
  assert.match(AGENT_SMS_URL, /^sms:\+18178862418\?&body=AGENT/)
  assert.match(agentPage, /AGENT_PHONE_DISPLAY/)
  assert.match(agentPage, /AGENT_SMS_URL/)
  assert.match(footer, /ROOF_WATCH_SMS_URL/)

  const telephoneScheme = ['te', 'l:'].join('')
  assert.equal([agentPage, footer, layout].some(source => source.includes(telephoneScheme)), false)
  assert.doesNotMatch(layout, /telephone|contactPoint/)
})

test('seller guide uses the current TREC form landing page and truthful sitemap date', () => {
  const guide = ROOF_WATCH_GUIDES.find(item => item.slug === 'selling-documented-home')
  if (!guide) throw new Error('selling-documented-home guide is missing')
  assert.equal(guide.dateModified, '2026-08-21')
  assert.equal(ROOF_WATCH_ROUTE_LAST_MODIFIED['/roof-watch/guides/selling-documented-home/'], guide.dateModified)
  assert.ok(guide.sources.some(source => (
    source.label === 'Seller’s Disclosure Notice (Form 55-1)'
    && source.href === 'https://www.trec.texas.gov/forms/sellers-disclosure-notice'
  )))
  assert.equal(guide.sources.some(source => source.href.includes('OP-H.pdf')), false)
})

test('homepage and navigation present one working whole-home product', () => {
  assert.match(SITE_DESCRIPTION, /private home workspace/)
  assert.ok(SITE_DESCRIPTION.length <= 160)
  assert.match(SITE_DESCRIPTION, /whole-home project records, historical projects/)
  assert.match(SITE_DESCRIPTION, /JPEG and PNG photo checkups/)
  for (const route of ['/home-care/', '/home-projects/', '/home-record/', '/guides/']) {
    assert.ok(INDEXABLE_ROUTES.includes(route), `${route} must be indexable`)
    assert.match(homepage, new RegExp(route.replaceAll('/', '\\/')))
  }
  assert.deepEqual(PRIMARY_NAV.map(item => item.href), [
    '/home-care/', '/home-projects/', '/home-record/', '/guides/', '/how-it-works/', '/about/',
  ])
  assert.match(homepage, /Roof Watch is one useful chapter/)
  assert.match(homepage, /Every home has a history\. Keep yours\./)
  assert.match(homepage, /Private by default/)
  for (const card of ['Roof replacement', 'Kitchen remodel', 'Exterior paint', 'Home wish list', 'Insurance & property']) {
    assert.ok(homeRecordDeck.includes(card), `the illustrative Home Record deck is missing ${card}`)
  }
  assert.match(homeRecordDeck, /<ol[\s\S]*home-record-deck__track[\s\S]*tabIndex=\{0\}/)
  assert.match(homeRecordDeck, /Illustrative cards/)
  assert.doesNotMatch(homeRecordDeck, /setInterval|autoplay/)
  assert.doesNotMatch(homeRecordDeck, /home-record-deck__track[^>]*aria-hidden/)
  assert.match(globalCss, /\.home-record-deck__track\s*\{[\s\S]*overflow-x:\s*auto[\s\S]*scroll-snap-type:\s*inline mandatory/)
  assert.match(globalCss, /\.home-record-deck__track > li\s*\{[\s\S]*scroll-snap-align:\s*start/)
  assert.doesNotMatch(globalCss, /\.home-stream::(?:before|after)/,
    'the fake stacked timeline layers must not return')

  for (const roadmapLanguage of [
    /private[- ]beta/i,
    /coming soon/i,
    /not live yet/i,
    /in development/i,
    /not available today/i,
  ]) {
    assert.doesNotMatch(homepage, roadmapLanguage)
    assert.doesNotMatch(footer, roadmapLanguage)
  }
})

test('public trust pages state the current account and photo boundary', () => {
  assert.match(footer, /href="\/privacy\/"/)
  assert.match(footer, /href="\/security\/"/)
  assert.match(privacy, /does not publish it, create a public profile, or send it to a contractor/)
  assert.match(privacy, /JPEG or PNG/)
  assert.match(privacy, /not sent to a contractor, Jobrolo, a public page/)
  assert.match(security, /Exact-home authorization/)
  assert.match(security, /opaque, HttpOnly session cookie/)
  assert.match(security, /bounded PDF, JPEG, and PNG uploads/)
  assert.match(security, /Seasonal checkups use their own image-only path/)
  assert.match(privacy, /A sale does not automatically transfer a Homesrolo account/)
})
