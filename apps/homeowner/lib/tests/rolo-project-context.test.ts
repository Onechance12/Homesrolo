import assert from 'node:assert/strict'
import test from 'node:test'
import { projectRefFromPath } from '../rolo-project-context.ts'

const projectRef = `hprj_${'p'.repeat(43)}`
const homeRef = `hhom_${'h'.repeat(43)}`

test('Rolo recognizes the current Work Rolodex route', () => {
  assert.equal(projectRefFromPath(`/home/${homeRef}/work/${projectRef}`), projectRef)
  assert.equal(projectRefFromPath(`/home/${homeRef}/work/${projectRef}/photos`), projectRef)
})

test('Rolo keeps recognizing the legacy project route during migration', () => {
  assert.equal(projectRefFromPath(`/home/${homeRef}/projects/${projectRef}`), projectRef)
})

test('Rolo does not invent project context outside an exact work route', () => {
  assert.equal(projectRefFromPath(`/home/${homeRef}/work`), undefined)
  assert.equal(projectRefFromPath(`/home/${homeRef}/rolo?project=${projectRef}`), undefined)
  assert.equal(projectRefFromPath(`/home/${homeRef}/work/hprj_short`), undefined)
})
