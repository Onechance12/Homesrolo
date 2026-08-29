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
    /async function send\([\s\S]*if \(prompt !== undefined \|\| routeArtifactRef\) router\.setParams\(\{ prompt: undefined, artifactRef: undefined \}\)/,
    'a deep-link prompt and exact reviewed-photo reference clear only from a mounted message action',
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
  assert.match(roloScreen,
    /return 'Open Home'[\s\S]*pathname: '\/home\/\[homeId\]\/care'/)
  assert.doesNotMatch(roloScreen, /Open Today/)
})

test('the former Rolo people filter opens the saved professional Rolodex', () => {
  assert.match(roloScreen, /filter === 'people'/)
  assert.match(
    roloScreen,
    /redirectToPeople[\s\S]*<Redirect href=\{\{ pathname: '\/home\/\[homeId\]\/people', params: \{ homeId \} \}\}/,
  )
})

test('Rolo keeps new-photo metadata private and files only the exact reviewed upload', () => {
  assert.match(roloScreen, /setPendingPhotoSource\(source\)/)
  assert.match(roloScreen, /source === 'camera' \? newPhotoMetadataDraft\(\) : null/)

  const locationFunction = roloScreen.match(
    /async function toggleCurrentPhotoLocation\(\)[\s\S]*?\n  async function send\(/,
  )?.[0]
  const sendFunction = roloScreen.match(
    /async function send\([\s\S]*?\n  async function saveProposal\(/,
  )?.[0]

  assert.ok(locationFunction, 'the explicit foreground-location request must remain inspectable')
  assert.ok(sendFunction, 'the Rolo send lifecycle must remain inspectable')
  assert.match(
    locationFunction,
    /captureConfirmedDeviceLocation\(\)[\s\S]*setPendingGeoPin\(pin\)[\s\S]*catch \(caught\)[\s\S]*setLocationNote\(locationRequestFailureNote\(caught\)\)/,
    'the homeowner explicitly requests a foreground reading before sending',
  )
  assert.doesNotMatch(
    sendFunction,
    /captureConfirmedDeviceLocation/,
    'Send must confirm the displayed reading, not silently fetch a new one',
  )
  assert.match(
    roloScreen,
    /locationPinSummary\(pendingGeoPin\)[\s\S]*Sending confirms this pin/,
    'rounded coordinates and accuracy are shown before Send confirms the pin',
  )
  assert.match(
    sendFunction,
    /const geoPin = cameraDetails\?\.pinCurrentLocation \? pendingGeoPin : null[\s\S]*api\.uploadArtifact/,
    'a denied or skipped location request still falls through to the private photo upload',
  )
  assert.match(
    roloScreen,
    /api\.updateArtifactMetadata\([\s\S]*expectedRevision: uploadedPhoto\.revision[\s\S]*artifactMetadataReplacement\(uploadedPhoto, \{[\s\S]*observedOn: cameraDetails\.observedOn[\s\S]*phase: cameraDetails\.phase[\s\S]*geoPin/,
  )
  assert.match(
    roloScreen,
    /newUploadedPhoto && reply\.photoReview && conversationProjectRef === null[\s\S]*setReviewedNewPhoto\(newUploadedPhoto\)/,
  )
  assert.match(
    roloScreen,
    /photoToFile && photoToFile\.projectRef === null[\s\S]*expectedRevision: photoToFile\.revision[\s\S]*artifactMetadataReplacement\(photoToFile, \{ projectRef: work\.projectRef \}\)/,
    'approval must revision-update the newly reviewed photo instead of an arbitrary saved attachment',
  )

  const askStart = roloScreen.indexOf('const reply = await api.askRolo')
  const askEnd = roloScreen.indexOf('\n      if (!roloRequestCanCommit', askStart)
  assert.ok(askStart >= 0 && askEnd > askStart)
  const askCall = roloScreen.slice(askStart, askEnd)
  assert.doesNotMatch(askCall, /geoPin|latitude|longitude|observedOn|phase/,
    'artifact organization and device location must never enter the model request')
})
