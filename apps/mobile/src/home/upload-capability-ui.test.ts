import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('home and project libraries gate upload controls without gating saved files', () => {
  const surfaces = [
    read('app/home/[homeId]/care.tsx'),
    read('src/components/ProjectFiles.tsx'),
  ]

  for (const source of surfaces) {
    assert.match(source, /auth\.session\.capabilities\.uploads/)
    assert.match(source, /showUploadActions = uploadsEnabled \|\| previewMode/)
    assert.match(source, /if \(!uploadsEnabled\) return/)
    assert.match(source, /\{showUploadActions \? \(/)
    assert.match(source, /api\.listArtifacts\(homeId\)/)
  }
})

test('preview keeps its safe upload-stop behavior while unavailable accounts get one clear notice', () => {
  const home = read('app/home/[homeId]/care.tsx')
  const project = read('src/components/ProjectFiles.tsx')

  for (const source of [home, project]) {
    assert.match(source, /if \(previewMode\) \{[\s\S]*?PREVIEW_UPLOAD_NOTICE[\s\S]*?return/)
  }
  assert.match(home, /Adding photos and files isn’t available right now\. Your saved library is still here\./)
  assert.match(project, /Adding photos and files isn’t available for this work right now\. Saved files are still readable\./)
  assert.match(project, /showUploadActions[\s\S]*?No photos or files have been saved with this work yet\./)
})
