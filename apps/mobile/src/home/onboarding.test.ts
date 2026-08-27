import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewNewHomeAddress, sameHomeRecordAddress } from './onboarding.ts'

test('reviews explicit address fields without parsing or inventing any part', () => {
  const result = reviewNewHomeAddress({
    line1: ' 123 Main Street ',
    line2: ' Unit 4B ',
    city: ' Fort Worth ',
    regionCode: 'tx',
    postalCode: ' 76102 ',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value.address, {
    line1: '123 Main Street', line2: 'Unit 4B', city: 'Fort Worth',
    regionCode: 'TX', postalCode: '76102', countryCode: 'US',
  })
  assert.equal(result.value.privateLocationLabel, '123 Main Street, Unit 4B · Fort Worth, TX 76102')
  assert.equal(sameHomeRecordAddress(result.value.address, result.value.address), true)
})

test('requires each structured address fact instead of guessing from one line', () => {
  const base = {
    line1: '123 Main Street', line2: '', city: 'Tulsa', regionCode: 'OK', postalCode: '74103',
  }
  assert.deepEqual(reviewNewHomeAddress({ ...base, city: '' }), {
    ok: false, message: 'Add the city.',
  })
  assert.deepEqual(reviewNewHomeAddress({ ...base, regionCode: 'Oklahoma' }), {
    ok: false, message: 'Use the two-letter state abbreviation.',
  })
  assert.deepEqual(reviewNewHomeAddress({ ...base, postalCode: '7410' }), {
    ok: false, message: 'Use a five-digit ZIP code.',
  })
})

test('keeps the complete address structured when the private card label needs shortening', () => {
  const result = reviewNewHomeAddress({
    line1: '1'.repeat(120), line2: '2'.repeat(120), city: 'C'.repeat(80),
    regionCode: 'TX', postalCode: '76102',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.address.line2, '2'.repeat(120))
  assert.ok(result.value.privateLocationLabel.length <= 200)
})
