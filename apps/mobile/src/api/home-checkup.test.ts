import assert from 'node:assert/strict'
import test from 'node:test'
import {
  homeCheckupUploadHeaders,
  parseDeletedHomeCheckupPhoto,
  parseHomeCheckupPhoto,
} from './home-checkup.ts'

const homeRef = `hhom_${'A'.repeat(43)}`
const photoRef = `hpho_${'B'.repeat(43)}`
const base = `/api/v1/homes/${homeRef}/photo-checkups/${photoRef}`

const photo = {
  photoRef,
  homeRef,
  observedOn: '2026-08-26',
  area: 'roofline' as const,
  viewLabel: 'Garage roofline',
  caption: 'Same view after the storm.',
  fullUrl: `${base}/full`,
  thumbnailUrl: `${base}/thumbnail`,
  width: 1600,
  height: 1200,
  createdAt: '2026-08-26T12:00:00.000Z',
}

test('accepts only exact-home Home Watch metadata and image routes', () => {
  assert.deepEqual(parseHomeCheckupPhoto(photo), photo)
  assert.equal(parseHomeCheckupPhoto({ ...photo, area: 'siding' }).area, 'siding')
  assert.equal(parseHomeCheckupPhoto({ ...photo, area: 'windows_doors' }).area, 'windows_doors')
  assert.equal(parseHomeCheckupPhoto({ ...photo, area: 'drainage' }).area, 'drainage')
  assert.throws(() => parseHomeCheckupPhoto({ ...photo, fullUrl: 'https://example.test/photo.jpg' }))
  assert.throws(() => parseHomeCheckupPhoto({ ...photo, extra: true }))
  assert.throws(() => parseHomeCheckupPhoto({ ...photo, observedOn: '2026-02-30' }))
  assert.deepEqual(parseDeletedHomeCheckupPhoto({ photoRef, state: 'deleted' }), {
    photoRef, state: 'deleted',
  })
})

test('builds the existing bounded raw-photo envelope without inventing fields', () => {
  const headers = homeCheckupUploadHeaders({
    commandRef: `hcmd_${'C'.repeat(43)}`,
    observedOn: '2026-08-26',
    area: 'roofline',
    viewLabel: ' Garage roofline ',
    caption: ' North & west ',
    file: {
      uri: 'file:///photo.jpg', name: 'photo.jpg', mediaType: 'image/jpeg',
      byteLength: 20, lifecycle: 'external-source',
    },
  })
  assert.deepEqual(headers, {
    'x-homesrolo-command-ref': `hcmd_${'C'.repeat(43)}`,
    'x-homesrolo-observed-on': '2026-08-26',
    'x-homesrolo-photo-area': 'roofline',
    'x-homesrolo-view-label': 'Garage%20roofline',
    'x-homesrolo-caption': 'North%20%26%20west',
  })
  assert.equal(homeCheckupUploadHeaders({
    commandRef: `hcmd_${'D'.repeat(43)}`,
    observedOn: '2026-08-26',
    area: 'roofline',
    viewLabel: 'Garage roofline',
    caption: '',
    file: {
      uri: 'file:///photo.jpg', name: 'photo.jpg', mediaType: 'image/jpeg',
      byteLength: 20, lifecycle: 'external-source',
    },
  })?.['x-homesrolo-caption'], undefined)
  assert.equal(homeCheckupUploadHeaders({
    commandRef: 'bad', observedOn: '2026-08-26', area: 'roofline',
    viewLabel: 'Roofline', caption: '',
    file: { uri: 'file:///photo.jpg', name: 'photo.jpg', mediaType: 'image/jpeg', byteLength: 20 },
  }), null)
})
