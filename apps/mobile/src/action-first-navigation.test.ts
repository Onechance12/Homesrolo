import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const roloScreen = readFileSync(
  new URL('../app/home/[homeId]/rolo.tsx', import.meta.url),
  'utf8',
)

test('every explicit Start intent replaces the prior Rolo conversation once', () => {
  assert.match(
    roloScreen,
    /if \(!prompt\) return[\s\S]*setTurns\(\[\]\)[\s\S]*setInput\(prompt\.slice\(0, 1_600\)\)[\s\S]*router\.setParams\(\{ prompt: undefined \}\)/,
  )
  assert.doesNotMatch(
    roloScreen,
    /prompt && turns\.length === 0/,
    'a new Today action must not be ignored just because Rolo already has a thread',
  )
  assert.match(
    roloScreen,
    /const version = conversationVersion\.current[\s\S]*version !== conversationVersion\.current/,
    'an older request cannot write its reply into the newly-started conversation',
  )
})
