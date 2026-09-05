import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('Home details stays readable while every edit path requires the current Home admin', () => {
  const details = read('app/home/[homeId]/details.tsx')

  assert.match(details, /api\.getHomeRecord\(homeId\)/)
  assert.match(details, /api\.getHousehold\(homeId\)\.catch\(error => \{\s*if \(error instanceof SessionCheckRequired\) throw error\s*return null\s*\}\)/)
  assert.match(details, /household !== null && isCurrentHouseholdController\(household\.members\)/)
  assert.match(details, /if \(!canEdit\) return/)
  assert.match(details, /if \(!canEdit \|\| saving\) return/)
  assert.match(details, /editable=\{canEdit\}/)
  assert.match(details, /disabled=\{!canEdit\}/)
  assert.match(details, /\{canEdit \? <Button label=\{saving \? 'Saving…' : 'Save home details'\}/)
  assert.match(details, /You can still review the shared Home Record\./)
  assert.match(details, /useEffect\(\(\) => \{[\s\S]*actionGeneration\.current \+= 1[\s\S]*setEditing\(null\)[\s\S]*\}, \[homeId\]\)/)
  assert.match(details, /const commandRef = await api\.newCommandRef\(\)[\s\S]*generation !== actionGeneration\.current[\s\S]*api\.updateHomeRecord\(homeId/)
})

test('Home Watch preserves shared history but limits service, upload, and delete actions to the Home admin', () => {
  const checkups = read('app/home/[homeId]/checkups.tsx')

  assert.match(checkups, /api\.listHomeCheckups\(homeId\)/)
  assert.match(checkups, /api\.getHousehold\(homeId\)\.catch\(error => \{\s*if \(error instanceof SessionCheckRequired\) throw error\s*return null\s*\}\)/)
  assert.match(checkups, /household !== null && isCurrentHouseholdController\(household\.members\)/)
  assert.match(checkups, /async function choose[\s\S]*if \(!canManageHomeWatch\) return/)
  assert.match(checkups, /async function save[\s\S]*if \(!canManageHomeWatch/)
  assert.match(checkups, /async function remove[\s\S]*if \(!canManageHomeWatch\) return/)
  assert.match(checkups, /async function openManagedExteriorHomeWatch[\s\S]*if \(!canManageHomeWatch \|\| managedBusy\) return/)
  assert.match(checkups, /formOpen && canManageHomeWatch/)
  assert.match(checkups, /canManageHomeWatch && deleteRef === photo\.photoRef/)
  assert.match(checkups, /You can still review the shared history\./)
  assert.match(checkups, /useEffect\(\(\) => \{[\s\S]*actionGeneration\.current \+= 1[\s\S]*setFile\(null\)[\s\S]*commandRef\.current = null[\s\S]*\}, \[homeId\]\)/)
  assert.match(checkups, /const selected = await pickPhoto\(source\)[\s\S]*generation !== actionGeneration\.current[\s\S]*revokeBrowserDeviceFileUrl\(selected\)/)
  assert.match(checkups, /await api\.uploadHomeCheckup\(homeId[\s\S]*generation !== actionGeneration\.current/)
})

test('view-only household members retain private Rolo chat and saved-photo reads without shared-home writes', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const send = rolo.match(/async function send\([\s\S]*?\n  async function saveProposal\(/)?.[0]

  assert.ok(send, 'the Rolo send boundary must remain inspectable')
  assert.match(rolo, /api\.getHousehold\(homeId\)[\s\S]*canCurrentHouseholdMemberUpdate\(household\.members\)/)
  assert.match(rolo, /\.catch\(\(\) => \{[\s\S]*setCanUpdateSharedHome\(false\)/)
  assert.match(rolo, /api\.listArtifacts\(homeId\)/)
  assert.match(rolo, /availableSavedPhotos\.slice[\s\S]*chooseSavedPhoto\(photo\)/)
  assert.match(send, /const reply = await api\.askRolo\(/)
  assert.match(send, /attachment\?\.state === 'pending' && !canUpdateSharedHome/)
  assert.match(rolo, /if \(!canUpdateSharedHome \|\| previewMode \|\| !uploadsEnabled/)
  assert.match(rolo, /if \(!proposal \|\| !canUpdateSharedHome \|\| saving\) return/)
  assert.match(rolo, /Only an adult household member can share this draft to Work\. It can stay in your private chat\./)
})

test('a stale Rolo save cannot update the next home or conversation', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const save = rolo.match(/async function saveProposal\([\s\S]*?\n  function startFreshConversation\(/)?.[0]

  assert.ok(save, 'the shared Work save lifecycle must remain inspectable')
  assert.match(save, /const version = conversationVersion\.current/)
  assert.match(save, /const commandRef = await api\.newCommandRef\(\)[\s\S]*roloRequestCanCommit\(version, conversationVersion\.current, mounted\.current\)/)
  assert.match(save, /const work = await api\.createWork[\s\S]*roloRequestCanCommit\(version, conversationVersion\.current, mounted\.current\)/)
  assert.match(save, /finally \{[\s\S]*roloRequestCanCommit\(version, conversationVersion\.current, mounted\.current\)[\s\S]*setSaving\(false\)/)
})
