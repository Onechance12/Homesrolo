import assert from 'node:assert/strict'
import test from 'node:test'
import {
  legacyHomeRef,
  legacyProfessionalSlug,
  legacyProfessionalTrade,
  legacyProjectRef,
  oneRouteParam,
} from './legacy-route.ts'

const homeRef = `hhom_${'H'.repeat(43)}`
const projectRef = `hprj_${'P'.repeat(43)}`

test('only preserves exact legacy route identifiers', () => {
  assert.equal(legacyHomeRef(homeRef), homeRef)
  assert.equal(legacyHomeRef([homeRef]), null)
  assert.equal(legacyHomeRef('hhom_short'), null)
  assert.equal(legacyProjectRef(projectRef), projectRef)
  assert.equal(legacyProjectRef('../settings'), null)
  assert.equal(oneRouteParam(['one', 'two']), null)
})

test('normalizes only supported public professional route values', () => {
  assert.equal(legacyProfessionalSlug(' Clear-Sky-Roofing '), 'clear-sky-roofing')
  assert.equal(legacyProfessionalSlug('https://bad.example'), null)
  assert.equal(legacyProfessionalTrade('roofing'), 'roofing')
  assert.equal(legacyProfessionalTrade('unknown-trade'), null)
})
