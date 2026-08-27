import assert from 'node:assert/strict'
import test from 'node:test'
import { safeCacheArtifactFileName } from './artifact-file-name.ts'

test('builds a bounded cache filename without path traversal', () => {
  assert.equal(safeCacheArtifactFileName({
    artifactRef: 'hart_abcdefghijklmnop',
    displayName: '../../Roof warranty.pdf',
  }), 'efghijklmnop-Roof warranty.pdf')
  assert.ok(safeCacheArtifactFileName({
    artifactRef: 'hart_abc',
    displayName: 'x'.repeat(300) + '.pdf',
  }).length <= 133)
})
