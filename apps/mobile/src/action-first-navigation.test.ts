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
    /if \(prompt === undefined\) \{[\s\S]*consumedPrompt\.current = null[\s\S]*promptIdentity[\s\S]*planRoloHydration\(prompt, null\)[\s\S]*resetConversationState\([\s\S]*roloStorage\.remove\(persistenceScope\)/,
    'an explicit Start prompt is consumed once, resets local state, and removes the stored thread',
  )
  assert.match(
    roloScreen,
    /async function send\([\s\S]*if \(prompt !== undefined\) router\.setParams\(\{ prompt: undefined \}\)/,
    'a deep-link prompt clears only from a mounted message action',
  )
  assert.doesNotMatch(
    roloScreen,
    /prompt && turns\.length === 0/,
    'a new Today action must not be ignored just because Rolo already has a thread',
  )
  assert.match(
    roloScreen,
    /const version = conversationVersion\.current[\s\S]*roloRequestCanCommit\(version, conversationVersion\.current, mounted\.current\)/,
    'an older request cannot write its reply into the newly-started conversation',
  )
})

test('a stale Rolo request cannot release the active request guard', () => {
  const sendFunction = roloScreen.match(
    /async function send\([\s\S]*?\n  async function saveProposal\(/,
  )?.[0]

  assert.ok(sendFunction, 'the Rolo send lifecycle must remain inspectable')
  assert.match(
    sendFunction,
    /finally \{\s*if \(roloRequestCanCommit\(version, conversationVersion\.current, mounted\.current\)\) \{\s*sendInFlight\.current = false\s*setBusy\(false\)\s*\}\s*\}/,
    'only the mounted current request may clear the shared send guard and busy state',
  )
})

test('Rolo opens Home details instead of dropping that suggestion into the Library tab', () => {
  assert.match(roloScreen,
    /destination === 'library'\)[\s\S]*pathname: '\/home\/\[homeId\]\/care'/)
  assert.match(roloScreen,
    /destination === 'details'\)[\s\S]*pathname: '\/home\/\[homeId\]\/details'/)
})

test('the former Rolo people filter opens the saved professional Rolodex', () => {
  assert.match(roloScreen, /filter === 'people'/)
  assert.match(
    roloScreen,
    /redirectToPeople[\s\S]*<Redirect href=\{\{ pathname: '\/home\/\[homeId\]\/people', params: \{ homeId \} \}\}/,
  )
})
