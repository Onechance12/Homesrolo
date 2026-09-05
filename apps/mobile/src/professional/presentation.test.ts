import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProfessionalOrganization } from '../api/model.ts'
import {
  cleanServiceAreas,
  formatMoney,
  matchesProfessional,
  proposalScopePayload,
  slugFor,
} from './presentation.ts'

const organization: ProfessionalOrganization = {
  organizationRef: 'horg_123456789012345678901234',
  slug: 'clear-sky-roofing',
  displayName: 'Clear Sky Roofing',
  description: 'Roof repair and replacement',
  trades: ['roofing'],
  serviceAreas: ['Fort Worth', 'Tulsa'],
  publicationState: 'published',
  provenance: 'company_self_reported',
  revision: 1,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
}

test('professional search covers name, service area, and trade without changing trust', () => {
  assert.equal(matchesProfessional(organization, 'tulsa'), true)
  assert.equal(matchesProfessional(organization, 'Roofing'), true)
  assert.equal(matchesProfessional(organization, 'plumber'), false)
  assert.equal(matchesProfessional(organization, '', 'roofing'), true)
  assert.equal(matchesProfessional(organization, '', 'hvac'), false)
})

test('profile helpers normalize only user-provided public fields', () => {
  assert.equal(slugFor('  Pearson Home Services, LLC  '), 'pearson-home-services-llc')
  assert.deepEqual(cleanServiceAreas('Fort Worth\nTulsa\n fort worth\n'), ['Fort Worth', 'Tulsa'])
})

test('service areas preserve city-state commas through profile edit and save', () => {
  const savedAreas = ['Fort Worth, Texas', 'Tulsa, Oklahoma', 'Dallas–Fort Worth, TX']
  for (const lineEnding of ['\n', '\r\n', '\r']) {
    assert.deepEqual(cleanServiceAreas(savedAreas.join(lineEnding)), savedAreas)
  }
  assert.deepEqual(
    cleanServiceAreas(' Fort Worth, Texas \r\n\nTulsa, Oklahoma\rfort worth, texas\n'),
    ['Fort Worth, Texas', 'Tulsa, Oklahoma'],
  )
  assert.deepEqual(cleanServiceAreas('Dallas, Fort Worth, Texas'), ['Dallas, Fort Worth, Texas'])
})

test('service-area cleanup retains its bounded nonempty case-insensitive list', () => {
  assert.deepEqual(cleanServiceAreas(' \nA\nTX\ntx\n'), ['TX'])
  const areas = Array.from({ length: 42 }, (_, index) => `Area ${index}, Texas`)
  assert.deepEqual(cleanServiceAreas(areas.join('\n')), areas.slice(0, 40))
})

test('proposal helpers keep written scope primary and money optional', () => {
  assert.equal(formatMoney(undefined), 'Total not stated')
  assert.equal(formatMoney(1_250_050), '$12,500.50')
  assert.deepEqual(proposalScopePayload({
    project_scope: 'Replace the damaged fence panels.',
    exclusions: 'Staining is not included.',
  }), {
    project_scope: { status: 'included', detail: 'Replace the damaged fence panels.' },
    exclusions: { status: 'excluded', detail: 'Staining is not included.' },
  })
})
