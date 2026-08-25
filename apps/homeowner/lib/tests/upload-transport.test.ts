import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSignedStorageUploadTransport } from '../port/transport.ts'

test('signed storage transport PUTs opaque bytes without cookies, referrer, or filename', async () => {
  const payload = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
  const path = `${'hhom_' + 'h'.repeat(43)}/${'hobj_' + 'p'.repeat(43)}`
  const signedUrl = 'https://project.supabase.co/storage/v1/object/upload/sign/'
    + `homesrolo-homeowner-dev-uploads/${path}?token=signed-token`
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []
  const transport = createSignedStorageUploadTransport(async (input, init) => {
    calls.push({ input, init })
    return new Response(null, { status: 200 })
  })
  const result = await transport({ signedUrl, path, token: 'signed-token', payload })
  assert.deepEqual(result, { kind: 'reply', status: 200, body: undefined })
  const captured = calls[0]
  assert.ok(captured)
  assert.equal(captured.input, signedUrl)
  assert.equal(captured.init?.method, 'PUT')
  assert.equal(captured.init?.credentials, 'omit')
  assert.equal(captured.init?.referrerPolicy, 'no-referrer')
  assert.deepEqual(captured.init?.headers, {
    'content-type': 'application/octet-stream',
    'cache-control': 'max-age=0',
    'x-upsert': 'false',
  })
  assert.equal(captured.init?.body, payload)
  assert.equal(JSON.stringify(captured).includes('filename'), false)
})

test('signed storage transport preserves an ambiguous network failure as a value', async () => {
  const transport = createSignedStorageUploadTransport(async () => {
    throw new TypeError('connection reset after request body was sent')
  })
  assert.deepEqual(await transport({
    signedUrl: 'https://project.supabase.co/signed',
    path: `${'hhom_' + 'h'.repeat(43)}/${'hobj_' + 'p'.repeat(43)}`,
    token: 'signed-token',
    payload: new Uint8Array([1]).buffer,
  }), { kind: 'network_failure' })
})
