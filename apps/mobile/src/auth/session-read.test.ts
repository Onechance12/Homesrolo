import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerSession } from '../api/model.ts'
import { readSessionWithRetry } from './session-read.ts'

const SIGNED_OUT: ServerSession = {
  apiVersion: 'homeowner-api.v1-draft',
  kind: 'signed_out',
  capabilities: {
    emailCodeSignIn: true,
    magicLinkSignIn: false,
    persistence: false,
    projectQuotes: false,
    homeResearch: false,
    homeAssistant: false,
    homeAssistantVision: false,
    uploads: false,
    photoCheckups: false,
    projectReview: false,
    projectReviewAttachments: false,
    homeRecordHandoffs: false,
    invitations: false,
    sharing: false,
  },
}

function failure(status: number, code: string): Error & { readonly status: number } {
  return Object.assign(new Error(code), { status })
}

test('startup session read absorbs two short retryable outages', async () => {
  const pauses: number[] = []
  const results: Array<ServerSession | Error> = [
    failure(0, 'network_unavailable'),
    failure(503, 'unavailable'),
    SIGNED_OUT,
  ]
  const session = await readSessionWithRetry({
    async session() {
      const result = results.shift()
      if (result instanceof Error) throw result
      if (!result) throw new Error('unexpected extra read')
      return result
    },
  }, async milliseconds => { pauses.push(milliseconds) })

  assert.equal(session, SIGNED_OUT)
  assert.deepEqual(pauses, [250, 700])
  assert.deepEqual(results, [])
})

test('startup session read does not retry authentication or malformed responses', async () => {
  for (const error of [
    failure(401, 'signed_out'),
    failure(200, 'invalid_response'),
    new Error('programming error'),
  ]) {
    let calls = 0
    let pauses = 0
    await assert.rejects(readSessionWithRetry({
      async session() { calls += 1; throw error },
    }, async () => { pauses += 1 }), candidate => candidate === error)
    assert.equal(calls, 1)
    assert.equal(pauses, 0)
  }
})
