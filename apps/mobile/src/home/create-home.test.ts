import assert from 'node:assert/strict'
import test from 'node:test'
import { PreviewHomesroloApi } from '../preview/api.ts'
import { createReviewedHome } from './create-home.ts'
import { reviewNewHomeAddress } from './onboarding.ts'

test('creates the same revisioned home record from first-run and add-home flows', async () => {
  const api = new PreviewHomesroloApi()
  const reviewed = reviewNewHomeAddress({
    line1: '18 Shoreline Road',
    line2: '',
    city: 'Kingston',
    regionCode: 'OK',
    postalCode: '73439',
  })
  assert.equal(reviewed.ok, true)
  if (!reviewed.ok) return

  const home = await createReviewedHome(api, {
    label: 'Lake house',
    reviewedAddress: reviewed.value,
    createCommandRef: await api.newCommandRef(),
    recordCommandRef: await api.newCommandRef(),
  })

  assert.equal(home.displayLabel, 'Lake house')
  const record = await api.getHomeRecord(home.homeRef)
  assert.equal(record.revision, 2)
  assert.deepEqual(record.address, reviewed.value.address)
})
