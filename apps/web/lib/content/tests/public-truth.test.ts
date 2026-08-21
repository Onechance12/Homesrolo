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
} from '../../site.ts'
import { ROOF_WATCH_GUIDES } from '../roof-watch-guides.ts'

const homepage = readFileSync('apps/web/app/page.tsx', 'utf8')
const agentPage = readFileSync('apps/web/app/for-agents/page.tsx', 'utf8')
const footer = readFileSync('apps/web/components/SiteFooter.tsx', 'utf8')
const layout = readFileSync('apps/web/app/layout.tsx', 'utf8')

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

test('homepage separates the live product from the future release model', () => {
  assert.match(SITE_DESCRIPTION, /home Rolodex/)
  assert.ok(SITE_DESCRIPTION.length <= 160)
  assert.match(SITE_DESCRIPTION, /being built/)
  assert.match(homepage, /The complete Home\s*Project Passport shown here is the\s*broader product model—not a live sharing or public-proof flow/)
  assert.match(homepage, /Public releases,\s*recipient sharing, and release-backed reviews are not live today/)
  assert.match(homepage, /Roof Watch is Homesrolo&rsquo;s first field program, not the boundary of the product/)

  for (const stalePromise of [
    /The Home Project Passport is how real work becomes/,
    /Because a release names its own provenance, it can later substantiate/,
    /keep every later photo, product, invoice, and warranty/,
  ]) {
    assert.doesNotMatch(homepage, stalePromise)
  }
})
