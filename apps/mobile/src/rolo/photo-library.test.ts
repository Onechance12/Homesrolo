import assert from 'node:assert/strict'
import test from 'node:test'
import { roloPhotoLibrary, type RoloPhotoCandidate } from './photo-library.ts'

const homeRef = 'hhom_home'
const projectRef = 'hprj_project'

function photo(index: number, overrides: Partial<RoloPhotoCandidate> = {}): RoloPhotoCandidate {
  return {
    artifactRef: `hart_${index}`,
    homeRef,
    projectRef,
    kind: 'photo',
    ...overrides,
  }
}

test('route clearing keeps an older exact-project photo authorized for persisted restoration', () => {
  const olderRoutedPhoto = photo(13)
  const artifacts = [
    ...Array.from({ length: 12 }, (_, index) => photo(index + 1)),
    olderRoutedPhoto,
    photo(14, { projectRef: 'hprj_other' }),
    photo(15, { homeRef: 'hhom_other' }),
    photo(16, { kind: 'document' }),
  ]

  const routed = roloPhotoLibrary(
    artifacts,
    homeRef,
    projectRef,
    olderRoutedPhoto.artifactRef,
  )
  assert.equal(routed.authorizedPhotos.length, 13)
  assert.equal(routed.pickerPhotos.length, 12)
  assert.equal(routed.pickerPhotos[0]?.artifactRef, olderRoutedPhoto.artifactRef,
    'the exact routed photo is promoted into the capped picker')

  const afterRouteClear = roloPhotoLibrary(artifacts, homeRef, projectRef, undefined)
  assert.equal(afterRouteClear.pickerPhotos.length, 12)
  assert.equal(afterRouteClear.pickerPhotos.some(
    item => item.artifactRef === olderRoutedPhoto.artifactRef,
  ), false, 'the older photo may naturally fall outside the presentation cap')
  assert.equal(afterRouteClear.authorizedPhotos.find(
    item => item.artifactRef === olderRoutedPhoto.artifactRef,
  ), olderRoutedPhoto, 'fresh full-scope metadata can still restore its attachment or review')
  assert.equal(afterRouteClear.authorizedPhotos.some(item => item.projectRef !== projectRef), false)
})

test('general-home photo authorization remains exact-home but crosses Work scopes', () => {
  const artifacts = [
    photo(1),
    photo(2, { projectRef: 'hprj_other' }),
    photo(3, { projectRef: null }),
    photo(4, { homeRef: 'hhom_other', projectRef: null }),
  ]

  const library = roloPhotoLibrary(artifacts, homeRef, null, undefined)
  assert.deepEqual(library.authorizedPhotos.map(item => item.artifactRef), [
    'hart_1',
    'hart_2',
    'hart_3',
  ])
})
