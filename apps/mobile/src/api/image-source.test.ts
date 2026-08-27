import assert from 'node:assert/strict'
import test from 'node:test'
import { loadProtectedWebImage, requiresProtectedWebFetch } from './image-source.ts'

const token = `session_${'a'.repeat(32)}`
const source = {
  uri: 'https://app.homesrolo.com/api/v1/homes/example/artifacts/example/preview',
  headers: { authorization: `Bearer ${token}`, 'x-homesrolo-client': 'native.v1' },
}

test('protected web images use an ephemeral no-cache authenticated fetch', async () => {
  const request: { input?: string; init?: RequestInit } = {}
  let revoked: string | null = null
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    request.input = String(input)
    if (init !== undefined) request.init = init
    return new Response(new Blob(['image'], { type: 'image/png' }), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '5' },
    })
  }) as typeof fetch
  const objectUrls = {
    createObjectURL: () => 'blob:https://app.homesrolo.com/preview',
    revokeObjectURL: (uri: string) => { revoked = uri },
  }

  const lease = await loadProtectedWebImage(source, new AbortController().signal, fetcher, objectUrls)
  assert.equal(lease.uri, 'blob:https://app.homesrolo.com/preview')
  assert.equal(request?.input, source.uri)
  assert.equal(request?.init?.credentials, 'omit')
  assert.equal(request?.init?.cache, 'no-store')
  assert.equal(request?.init?.redirect, 'error')
  assert.deepEqual(request?.init?.headers, {
    authorization: `Bearer ${token}`,
    accept: 'image/jpeg, image/png',
    'x-homesrolo-client': 'native.v1',
  })
  lease.release()
  assert.equal(revoked, lease.uri)
})

test('protected image loading rejects insecure URLs and non-image responses', async () => {
  const unusedFetch = (async () => { throw new Error('must not fetch') }) as typeof fetch
  await assert.rejects(
    loadProtectedWebImage({ ...source, uri: 'http://example.com/private.jpg' }, new AbortController().signal, unusedFetch),
    /invalid_image_url/,
  )
  await assert.rejects(
    loadProtectedWebImage(source, new AbortController().signal, async () => (
      new Response('not an image', { status: 200, headers: { 'content-type': 'text/html' } })
    )),
    /invalid_image_content_type/,
  )
  assert.equal(requiresProtectedWebFetch(source), true)
  assert.equal(requiresProtectedWebFetch({ uri: 'data:image/png;base64,AA==', headers: {} }), false)
})
