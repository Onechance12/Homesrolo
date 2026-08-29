import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  HOME_WATCH_TEXT_NUMBER_DISPLAY,
  HOME_WATCH_TEXT_NUMBER_E164,
  managedExteriorHomeWatchMessage,
  managedExteriorHomeWatchSmsUrl,
} from './home-watch-contact.ts'

test('managed Home Watch uses the established Homesrolo text number and names Roof Watch as one part', () => {
  assert.equal(HOME_WATCH_TEXT_NUMBER_E164, '+18178862418')
  assert.equal(HOME_WATCH_TEXT_NUMBER_DISPLAY, '(817) 886-2418')
  assert.equal(
    managedExteriorHomeWatchMessage('Fort Worth, TX 76102'),
    'HOME WATCH - Please check managed exterior Home Watch availability for Fort Worth, TX 76102. I am interested in a documented exterior check covering the roof (Roof Watch), gutters, siding, windows and exterior drainage.',
  )
  assert.match(managedExteriorHomeWatchSmsUrl(), /^sms:\+18178862418\?&body=/)
  const publicSite = readFileSync(new URL('../../../web/lib/site.ts', import.meta.url), 'utf8')
  assert.match(publicSite, /HOMESROLO_TEXT_NUMBER_E164 = '\+18178862418'/)
})

test('managed Home Watch bounds and cleans optional location copy before placing it in a text', () => {
  const message = managedExteriorHomeWatchMessage(` Tulsa,\n OK ${'7'.repeat(100)} `)
  assert.doesNotMatch(message, /\n/)
  assert.ok(message.length < 320)
})
