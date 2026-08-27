import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactContentFromResponse,
  MAX_ARTIFACT_CONTENT_BYTES,
  safeArtifactDisplayName,
} from './artifact-content.ts'

test('reads a bounded private artifact and safely decodes its filename', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\nprivate')
  const response = new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.byteLength),
      'content-disposition': "attachment; filename=\"download\"; filename*=UTF-8''Roof%20warranty.pdf",
    },
  })
  const content = await artifactContentFromResponse(response, 'hart_example')
  assert.equal(content.displayName, 'Roof warranty.pdf')
  assert.equal(content.mediaType, 'application/pdf')
  assert.equal(content.byteLength, bytes.byteLength)
  assert.deepEqual(content.bytes, bytes)
})

test('rejects mismatched, oversized, and unsupported private payloads', async () => {
  await assert.rejects(
    artifactContentFromResponse(new Response('small', {
      headers: { 'content-type': 'application/pdf', 'content-length': '99' },
    }), 'hart_example'),
    /invalid_artifact_content_length/,
  )
  await assert.rejects(
    artifactContentFromResponse(new Response('text', {
      headers: { 'content-type': 'text/plain' },
    }), 'hart_example'),
    /invalid_artifact_content_type/,
  )
  const oversized = new Response('x', {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(MAX_ARTIFACT_CONTENT_BYTES + 1),
    },
  })
  await assert.rejects(
    artifactContentFromResponse(oversized, 'hart_example'),
    /invalid_artifact_content_length/,
  )
})

test('removes path and control characters from a download name', () => {
  assert.equal(safeArtifactDisplayName('../Roof\\invoice\u0000.pdf', 'application/pdf'),
    '.. Roof invoice .pdf')
  assert.equal(safeArtifactDisplayName('', 'application/pdf'), 'Homesrolo document.pdf')
})
