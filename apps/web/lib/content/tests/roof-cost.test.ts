import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { auditResponse } from '../../../../../src/constitution/detector.ts'
import { ROOFING_COST_GUIDE, ROOFING_QUICK_ANSWERS } from '../education.ts'

const page = readFileSync('apps/web/app/services/roofing/cost/page.tsx', 'utf8')

test('roof cost page targets the question without inventing a generic roof price', () => {
  assert.match(page, /How much does a new roof cost in Texas\?/)
  assert.match(page, /An address or house square footage is not enough to price a roof/)
  assert.match(page, /Homesrolo organizes the differences; it does not decide what the roof should cost/)
  assert.match(page, /Compare my roof proposals/)
  assert.match(page, /Keep the original written proposal in your own records/)
  assert.doesNotMatch(page, /uploads are available|upload the original PDF|attach the proposal/i)
  assert.match(page, /Anything included in a Jobrolo review is separately selected and consented to/)
  assert.match(page, /HOMEOWNER_ROOFING_SIGNIN_URL/)
  assert.doesNotMatch(page, /\$\s?\d|Angi|Home Depot|Lowe[’']?s|retail material price/i)
})

test('roof cost education compares scope without ranking price or contractors', () => {
  const quickAnswer = ROOFING_QUICK_ANSWERS.find(item =>
    item.question === 'How much does a roof replacement cost in Dallas?')
  assert.ok(quickAnswer)
  const copy = [
    quickAnswer.answer,
    ...ROOFING_COST_GUIDE.flatMap(section => [section.heading, ...section.body]),
  ]
  for (const text of copy) {
    assert.deepEqual(auditResponse(text).violations, [], text)
    assert.doesNotMatch(text, /\$\s?\d|fair price|overpriced|best (?:bid|proposal|contractor)|recommend(?:ed)? contractor/i)
  }
  assert.match(copy.join(' '), /included, excluded, allowance, or not stated/i)
  assert.match(copy.join(' '), /without deciding which price is right for the home/i)
})
