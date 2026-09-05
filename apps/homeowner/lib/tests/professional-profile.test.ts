import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { cleanServiceAreas } from '../professional-profile.ts'

test('legacy company editor preserves city-state service areas on an unchanged save', () => {
  const savedAreas = ['Fort Worth, Texas', 'Tulsa, Oklahoma', 'Dallas–Fort Worth, TX']
  for (const lineEnding of ['\n', '\r\n', '\r']) {
    assert.deepEqual(cleanServiceAreas(savedAreas.join(lineEnding)), savedAreas)
  }
  const editor = readFileSync(new URL('../../components/ProfessionalHub.tsx', import.meta.url), 'utf8')
  assert.match(editor, /import \{ cleanServiceAreas \} from '\.\.\/lib\/professional-profile\.ts'/)
  assert.match(editor, /const areas = cleanServiceAreas\(serviceAreas\)/)
})

test('legacy service-area cleanup deduplicates whole names and retains its limits', () => {
  assert.deepEqual(
    cleanServiceAreas(' Fort Worth, Texas \r\n\nTulsa, Oklahoma\rfort worth, texas\nA\n'),
    ['Fort Worth, Texas', 'Tulsa, Oklahoma'],
  )
  assert.deepEqual(cleanServiceAreas('Dallas, Fort Worth, Texas'), ['Dallas, Fort Worth, Texas'])
  const areas = Array.from({ length: 42 }, (_, index) => `Area ${index}, Texas`)
  assert.deepEqual(cleanServiceAreas(areas.join('\n')), areas.slice(0, 40))
})
