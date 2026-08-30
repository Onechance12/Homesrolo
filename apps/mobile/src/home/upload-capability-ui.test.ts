import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('home and project libraries gate upload controls without gating saved files', () => {
  const home = read('app/home/[homeId]/care.tsx')
  const project = read('src/components/ProjectFiles.tsx')
  const surfaces = [home, project]

  for (const source of surfaces) {
    assert.match(source, /auth\.session\.capabilities\.uploads/)
    assert.match(source, /if \(!uploadsEnabled\) return/)
    assert.match(source, /showUploadActions \? \(/)
    assert.match(source, /api\.listArtifacts\(homeId\)/)
  }
  assert.match(home, /showUploadActions = uploadsEnabled \|\| previewMode/)
  assert.match(project, /showUploadActions = !readOnly && \(uploadsEnabled \|\| previewMode\)/)
  assert.match(project, /readonly readOnly\?: boolean/)
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

test('project photos are staged, organized, and pinned only from an explicit new-camera choice', () => {
  const project = read('src/components/ProjectFiles.tsx')
  const details = read('src/components/PhotoUploadDetails.tsx')

  assert.match(project, /<PhotoUploadDetails/)
  assert.match(project, /newPhotoMetadataDraft\(\)/)
  assert.match(project, /normalizePhotoMetadataDraft\(photoDraft\)/)
  assert.match(project, /pendingPhoto\.source === 'camera' && details\.pinCurrentLocation/)
  assert.match(project, /captureConfirmedDeviceLocation\(\)/)
  assert.match(details, /source === 'camera'/)
  assert.match(details, /locationPin\.latitude\.toFixed\(4\)/)
  assert.match(details, /Saving confirms this private pin/)
  assert.match(details, /A library photo is not pinned to your current location/)
})

test('project photo metadata is revisioned after the exact-project upload without a duplicate retry path', () => {
  const project = read('src/components/ProjectFiles.tsx')

  assert.match(project, /api\.uploadArtifact\(homeId, 'photo', pendingPhoto\.file, projectRef\)/)
  assert.match(project, /artifactMetadataReplacement\(artifact, \{[\s\S]*?projectRef,[\s\S]*?observedOn: details\.observedOn/)
  assert.match(project, /api\.updateArtifactMetadata\(homeId, artifact\.artifactRef/)
  assert.match(project, /expectedRevision: artifact\.revision/)
  assert.match(project, /if \(uploaded\) \{[\s\S]*?setPendingPhoto\(null\)[\s\S]*?cannot upload a duplicate/)
})

test('project photos reuse the typed Rolo deck with controlled stage filtering and search', () => {
  const project = read('src/components/ProjectFiles.tsx')

  assert.match(project, /photoOrderDate\(right\)\.localeCompare\(photoOrderDate\(left\)\)/)
  assert.match(project, /const photoEntries = homeLibraryEntries\(photos, \[\], \[\]\)\.map/)
  assert.match(project, /projectLabel: projectTitle[\s\S]*searchText: `\$\{entry\.searchText\} \$\{projectTitle\}`/)
  assert.match(project, /homeLibraryEntryCards\(photoEntries\)/)
  assert.match(project, /<RoloDeck[\s\S]*?cards=\{photoCards\}/)
  assert.match(project, /axis="horizontal"/)
  assert.match(project, /query=\{photoQuery\}[\s\S]*?onQueryChange=\{setPhotoQuery\}/)
  assert.match(project, /selectedDivider=\{photoPhase\}[\s\S]*?onSelectedDividerChange=\{setPhotoPhase\}/)
  assert.match(project, /id: 'all'[\s\S]*?id: 'before'[\s\S]*?id: 'during'[\s\S]*?id: 'after'[\s\S]*?id: 'reference'/)
  assert.doesNotMatch(project, /photos\.slice\(0, photoLimit\)/)
  assert.doesNotMatch(project, /Show \$\{Math\.min\(PHOTO_PAGE_SIZE/)
})

test('project photo deck resolves protected media and keeps exact preview and Rolo references', () => {
  const project = read('src/components/ProjectFiles.tsx')

  assert.match(project, /renderMedia=\{card => card\.kind === 'photo'[\s\S]*?<ProtectedImage/)
  assert.match(project, /artifactPreviewSource\(homeId, card\.data\.artifactRef\)/)
  assert.match(project, /onOpen=\{openPhotoCard\}/)
  assert.match(project, /setPreviewPhotoRef\(card\.data\.artifactRef\)/)
  assert.match(project, /onAskRolo=\{askRoloAboutPhoto\}/)
  assert.match(project, /openPhotoInRolo\(card\.data\.artifactRef\)/)
  assert.match(project, /artifactRef,[\s\S]*?prompt: 'Help me review this saved photo in the context of this work\./)
  assert.match(project, /onAction=\{\(\) => openPhotoInRolo\(previewPhoto\.artifactRef\)\}/)
})
