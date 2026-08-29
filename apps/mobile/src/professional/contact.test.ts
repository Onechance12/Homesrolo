import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROFESSIONAL_PORTAL_URL,
  professionalInvitationNotice,
  professionalInvitationTextUrl,
  professionalSignupRequest,
  publicEmailUrl,
  publicPhoneUrl,
} from './contact.ts'

test('builds contact links only from bounded company-provided phone and email values', () => {
  assert.equal(publicPhoneUrl('(817) 555-0141'), 'tel:8175550141')
  assert.equal(publicPhoneUrl('+1 817 555 0141'), 'tel:+18175550141')
  assert.equal(publicPhoneUrl('call-me'), null)
  assert.equal(publicEmailUrl(' Hello@Example.com '), 'mailto:hello%40example.com')
  assert.equal(publicEmailUrl('not-an-email'), null)
})

test('professional notices point to the bounded Pro portal without leaking home or work details', () => {
  const invitation = professionalInvitationNotice()
  const signup = professionalSignupRequest()
  assert.match(invitation, new RegExp(PROFESSIONAL_PORTAL_URL.replaceAll('.', '\\.')))
  assert.match(invitation, /does not include the home, address, work details, or files/)
  assert.doesNotMatch(invitation, /project title|homeRef|projectRef/i)
  assert.match(signup, /does not share my home or create a project invitation/)
  assert.match(signup, /create your company profile/)
})

test('builds a text notice only for a valid company-provided phone number', () => {
  const url = professionalInvitationTextUrl('(817) 555-0141')
  assert.match(url ?? '', /^sms:8175550141\?&body=/)
  assert.match(decodeURIComponent(url ?? ''), /https:\/\/app\.homesrolo\.com\/pro/)
  assert.equal(professionalInvitationTextUrl('not-a-number'), null)
})
