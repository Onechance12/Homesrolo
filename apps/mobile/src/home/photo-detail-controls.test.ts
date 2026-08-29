import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function readComponent(name: string) {
  return readFileSync(new URL(`../components/${name}`, import.meta.url), 'utf8')
}

const uploadDetails = readComponent('PhotoUploadDetails.tsx')
const savedEditor = readComponent('SavedPhotoDetailsEditor.tsx')
const ui = readComponent('ui.tsx')

test('Chip exposes a real disabled state and photo-upload metadata freezes during async work', () => {
  assert.match(ui, /export function Chip\([\s\S]*disabled = false/)
  assert.match(ui, /accessibilityState=\{\{ selected, disabled \}\}/)
  assert.match(ui, /disabled=\{disabled\}/)
  assert.match(ui, /disabled && styles\.chipDisabled/)

  assert.match(uploadDetails, /const controlsDisabled = busy \|\| locationBusy/)
  assert.match(uploadDetails, /editable=\{!controlsDisabled\}/)
  assert.match(uploadDetails, /disabled=\{controlsDisabled\}/)
  assert.match(uploadDetails, /accessibilityLabel="Pin my current location"/)
  assert.match(uploadDetails, /'Pin my current location'/)
})

test('saved-photo details use a bounded searchable work chooser and explicit location removal', () => {
  assert.match(savedEditor, /const PROJECT_CHOICE_LIMIT = 8/)
  assert.match(savedEditor, /right\.updatedAt\.localeCompare\(left\.updatedAt\)/)
  assert.match(savedEditor, /reserveSelectedSlot[\s\S]*PROJECT_CHOICE_LIMIT - reserveSelectedSlot/)
  assert.match(savedEditor, /selectedProject \? \[selectedProject, \.\.\.choices\] : choices/)
  assert.match(savedEditor, /label="Find work"[\s\S]*editable=\{!busy\}/)
  assert.match(savedEditor, /the current selection always stays available/)

  assert.match(savedEditor, /readonly removeGeoPin: boolean/)
  assert.match(savedEditor, /readonly onRemoveGeoPinChange: \(removeGeoPin: boolean\) => void/)
  assert.match(savedEditor, /accessibilityRole="checkbox"/)
  assert.match(savedEditor, /Remove saved location when I save/)
  assert.match(savedEditor, /onRemoveGeoPinChange\(!removeGeoPin\)/)
  assert.match(savedEditor, /hint="Leave blank if the date is unknown\."/)
  assert.match(savedEditor, /disabled=\{busy\}/)
})
