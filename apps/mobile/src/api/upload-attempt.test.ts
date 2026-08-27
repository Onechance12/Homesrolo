import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ActiveArtifactUploadAttempts,
  artifactUploadAttemptKey,
  shouldDeleteUploadFile,
} from './upload-attempt.ts'

const intent = {
  homeRef: `hhom_${'h'.repeat(43)}`,
  projectRef: null,
  kind: 'document' as const,
  displayName: 'roof.pdf',
  mediaType: 'application/pdf' as const,
  byteLength: 12,
  payloadSha256: 'a'.repeat(64),
}

test('upload attempt keys bind command facts but not a temporary file URI', () => {
  assert.equal(artifactUploadAttemptKey(intent), artifactUploadAttemptKey({ ...intent }))
  assert.notEqual(
    artifactUploadAttemptKey(intent),
    artifactUploadAttemptKey({ ...intent, payloadSha256: 'b'.repeat(64) }),
  )
  assert.notEqual(
    artifactUploadAttemptKey(intent),
    artifactUploadAttemptKey({ ...intent, homeRef: `hhom_${'x'.repeat(43)}` }),
  )
  assert.notEqual(
    artifactUploadAttemptKey(intent),
    artifactUploadAttemptKey({ ...intent, displayName: 'renamed.pdf' }),
  )
})

test('active retries share one command and retain all staged copies until confirmation', async () => {
  const attempts = new ActiveArtifactUploadAttempts()
  let mints = 0
  const mint = async () => {
    mints += 1
    return `hcmd_${String(mints).repeat(43)}`
  }
  const firstFile = { uri: 'file:///app/cache/first.pdf', lifecycle: 'staged-cache' as const }
  const retryFile = { uri: 'file:///app/cache/retry.pdf', lifecycle: 'staged-cache' as const }

  const [first, retry] = await Promise.all([
    attempts.begin(intent, firstFile, mint),
    attempts.begin(intent, retryFile, mint),
  ])
  assert.equal(mints, 1)
  assert.equal(first.commandRef, retry.commandRef)
  const reserved = attempts.rememberReservation(retry, `hart_${'a'.repeat(43)}`)
  const resumed = await attempts.begin(intent, retryFile, mint)
  assert.equal(resumed.artifactRef, reserved.artifactRef)
  attempts.confirm(resumed)
  assert.deepEqual(attempts.pendingCleanupCandidates(), [firstFile, retryFile])
  attempts.markCleanupComplete(firstFile.uri)
  assert.deepEqual(attempts.pendingCleanupCandidates(), [retryFile])
  attempts.markCleanupComplete(retryFile.uri)
  assert.deepEqual(attempts.pendingCleanupCandidates(), [])

  const later = await attempts.begin(intent, retryFile, mint)
  assert.equal(mints, 2)
  assert.notEqual(later.commandRef, retry.commandRef)
})

test('cleanup requires confirmation, a staged marker, and an actual cache child URI', () => {
  const cache = 'file:///app/cache/'
  assert.equal(shouldDeleteUploadFile({
    uri: 'file:///app/cache/document-picker/file.pdf', lifecycle: 'staged-cache',
  }, cache, true), true)
  assert.equal(shouldDeleteUploadFile({
    uri: 'file:///photos/original.jpg', lifecycle: 'external-source',
  }, cache, true), false)
  assert.equal(shouldDeleteUploadFile({
    uri: 'file:///app/cache/retry.pdf', lifecycle: 'staged-cache',
  }, cache, false), false)
  assert.equal(shouldDeleteUploadFile({
    uri: 'file:///app/cache-not/retry.pdf', lifecycle: 'staged-cache',
  }, cache, true), false)
  assert.equal(shouldDeleteUploadFile({
    uri: 'file:///app/cache/../photos/original.jpg', lifecycle: 'staged-cache',
  }, cache, true), false)
})

test('retry metadata never retains an in-memory browser file', async () => {
  const attempts = new ActiveArtifactUploadAttempts()
  const browserBacked = {
    uri: 'file:///app/cache/private.pdf',
    lifecycle: 'staged-cache' as const,
    browserFile: new Blob(['private']),
  }
  const attempt = await attempts.begin(intent, browserBacked, async () => `hcmd_${'z'.repeat(43)}`)
  attempts.confirm(attempt)
  const [candidate] = attempts.pendingCleanupCandidates()
  assert.deepEqual(candidate, {
    uri: browserBacked.uri,
    lifecycle: 'staged-cache',
  })
  assert.equal(Object.hasOwn(candidate ?? {}, 'browserFile'), false)
})
