import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Bids and People render the private invitation label before consulting discovery', () => {
  for (const relative of [
    '../components/ProjectProfessionalWorkspace.tsx',
    '../../app/home/[homeId]/people.tsx',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    assert.match(source,
      /invitation\.professionalDisplayLabel \?\? organization\?\.displayName \?\? 'Invited company'/)
  }
})
