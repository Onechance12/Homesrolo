import assert from 'node:assert/strict'
import test from 'node:test'
import { publicEmailUrl, publicPhoneUrl } from './contact.ts'

test('builds contact links only from bounded company-provided phone and email values', () => {
  assert.equal(publicPhoneUrl('(817) 555-0141'), 'tel:8175550141')
  assert.equal(publicPhoneUrl('+1 817 555 0141'), 'tel:+18175550141')
  assert.equal(publicPhoneUrl('call-me'), null)
  assert.equal(publicEmailUrl(' Hello@Example.com '), 'mailto:hello%40example.com')
  assert.equal(publicEmailUrl('not-an-email'), null)
})
