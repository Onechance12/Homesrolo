import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const appRoot = path.resolve(import.meta.dirname, '../..')
const assistant = readFileSync(path.join(appRoot, 'components/AssistantDock.tsx'), 'utf8')
const styles = readFileSync(path.join(appRoot, 'components/AssistantDock.module.css'), 'utf8')
const privacy = readFileSync(path.join(appRoot, '../web/app/privacy/page.tsx'), 'utf8')

test('Rolo offers one bounded camera or library photo without a browser vision shortcut', () => {
  assert.equal((assistant.match(/type="file"/g) ?? []).length, 2)
  assert.equal((assistant.match(/accept="image\/jpeg,image\/png,\.jpg,\.jpeg,\.png"/g) ?? []).length, 2)
  assert.match(assistant, /capture="environment"/)
  assert.doesNotMatch(assistant, /type="file"[\s\S]{0,180}\bmultiple\b/)
  assert.match(assistant, /MAX_PHOTO_BYTES = 10 \* 1024 \* 1024/)
  assert.match(assistant, /HEIC photo[\s\S]*JPEG or PNG copy/)
  assert.doesNotMatch(assistant, /FileReader|readAsDataURL|createObjectURL/)
})

test('a new Rolo photo is saved through the existing artifact port before its ref is sent', () => {
  const upload = assistant.indexOf('await port.uploadPrivateArtifact(homeId')
  const ask = assistant.indexOf('await port.askRolo(homeId')
  assert.ok(upload >= 0, 'the private artifact upload command must be used')
  assert.ok(ask > upload, 'the model request must happen only after private upload succeeds')
  assert.match(assistant, /commandRef: photoToUpload\.commandRef/,
    'an unchanged retry reuses the same upload command')
  assert.match(assistant, /const uploadedPhoto = uploadResult\.value[\s\S]*setSelectedPhotoRef\(uploadedPhoto\.documentRef\)/)
  assert.match(assistant, /artifactRef: selectedPhoto\.documentRef[\s\S]*consentToAnalyze: true/)
  assert.match(assistant, /if \(!uploadResult\.ok\)[\s\S]*return[\s\S]*const userMessage/,
    'a failed upload stops before a chat turn or model request is created')
  assert.match(assistant, /photo is saved to this home[\s\S]*retry without uploading it twice/i,
    'a model failure preserves the newly saved photo for retry')
})

test('new-photo consent and persistence are explained next to the action and in privacy copy', () => {
  assert.match(assistant, /Save this photo to this home and let Rolo inspect a metadata-free copy for this message only\./)
  assert.match(assistant, /hasAttachedPhoto && !photoConsent/)
  assert.match(assistant, /setPhotoConsent\(false\)/)
  assert.match(privacy, /A new attachment is first saved as a private Library photo for that home\./)
  assert.match(privacy, /The private original is not sent/)
  assert.match(styles, /\.photoActions/)
  assert.match(styles, /\.messageRow > button/)
  assert.doesNotMatch(styles, /\.composer button\s*\{/,
    'only the send button receives the circular composer-button treatment')
})
