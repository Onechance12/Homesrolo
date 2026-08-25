import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const appRoot = path.resolve(import.meta.dirname, '../..')
const component = readFileSync(path.join(appRoot, 'components/PrivateArtifacts.tsx'), 'utf8')
const projectPage = readFileSync(
  path.join(appRoot, 'app/home/[homeId]/projects/[projectId]/page.tsx'),
  'utf8',
)
const recordPage = readFileSync(
  path.join(appRoot, 'app/home/[homeId]/documents/page.tsx'),
  'utf8',
)

test('private capture is phone-first, multi-file, bounded, and sequential', () => {
  assert.match(component, /capture="environment"/)
  assert.match(component, /type="file"[\s\S]+multiple/)
  assert.match(component, /MAX_FILE_BYTES = 10 \* 1024 \* 1024/)
  assert.match(component, /HEIC photo[\s\S]+JPEG or PNG copy/)
  assert.match(component, /for \(const queued of queue\)[\s\S]+await upload\(/)
  assert.doesNotMatch(component, /Promise\.all\([^)]*upload/)
})

test('private photo previews render as an authenticated lazy gallery', () => {
  assert.match(component, /record\.kind === 'photo_set' && record\.previewHref/)
  assert.match(component, /<img src=\{photo\.previewHref\}[^>]+loading="lazy"/)
  assert.match(component, /Download original/)
  assert.doesNotMatch(component, /target="_blank"/)
})

test('the project and whole-home record share one capture and gallery surface', () => {
  for (const page of [projectPage, recordPage]) {
    assert.match(page, /PrivateArtifactUploader/)
    assert.match(page, /PrivateArtifactCollection/)
  }
  assert.match(projectPage, /projectRef=\{projectId\}/)
  assert.doesNotMatch(projectPage, /uploadProjectFile/)
  assert.doesNotMatch(recordPage, /<input[\s\S]+type="file"/)
})
