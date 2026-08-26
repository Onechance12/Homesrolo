import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apiPath, base64Url, boundedRoloConversation, commandRef, envelopeData, isHomeRef, isSessionToken,
  nativeRequestHeaders, normalizedRoloSelectedPhoto, normalizeApiOrigin, problemCode,
  roloPhotoReviewPresenceAllowed,
} from './protocol.ts'

test('normalizes only safe API origins', () => {
  assert.equal(normalizeApiOrigin('https://app.homesrolo.com/'), 'https://app.homesrolo.com')
  assert.equal(normalizeApiOrigin('http://127.0.0.1:3100'), 'http://127.0.0.1:3100')
  assert.throws(() => normalizeApiOrigin('http://example.com'))
  assert.throws(() => normalizeApiOrigin('https://app.homesrolo.com/api'))
})

test('mints canonical command references without padding', () => {
  assert.equal(base64Url(new Uint8Array([0xff, 0xee, 0xdd])), '_-7d')
  const ref = commandRef(new Uint8Array(32).fill(7))
  assert.match(ref, /^hcmd_[A-Za-z0-9_-]{43}$/)
  assert.equal(ref.length, 48)
  assert.throws(() => commandRef(new Uint8Array(31)))
})

test('keeps identifier and session validation exact', () => {
  assert.equal(isHomeRef(`hhom_${'A'.repeat(43)}`), true)
  assert.equal(isHomeRef(`hprj_${'A'.repeat(43)}`), false)
  assert.equal(isSessionToken('abc_1234567890-XYZ'), true)
  assert.equal(isSessionToken('contains a space'), false)
  assert.equal(apiPath('homes', `hhom_${'A'.repeat(43)}`, 'projects'),
    `/api/v1/homes/hhom_${'A'.repeat(43)}/projects`)
})

test('keeps Rolo photo analysis bound to one exact consented artifact', () => {
  const artifactRef = `hart_${'A'.repeat(43)}`
  assert.deepEqual(normalizedRoloSelectedPhoto({
    source: 'artifact', artifactRef, consentToAnalyze: true,
  }), {
    source: 'artifact', artifactRef, consentToAnalyze: true,
  })
  for (const malformed of [
    null,
    [],
    { source: 'artifact', artifactRef, consentToAnalyze: false },
    { source: 'artifact', artifactRef: 'hart_short', consentToAnalyze: true },
    { source: 'url', artifactRef, consentToAnalyze: true },
    { source: 'artifact', artifactRef, consentToAnalyze: true, previewUrl: 'https://example.test' },
  ]) assert.equal(normalizedRoloSelectedPhoto(malformed), null)

  const selected = normalizedRoloSelectedPhoto({
    source: 'artifact', artifactRef, consentToAnalyze: true,
  })
  assert.ok(selected)
  assert.equal(roloPhotoReviewPresenceAllowed(selected, true), true)
  assert.equal(roloPhotoReviewPresenceAllowed(selected, false), true,
    'a boundary refusal answers without opening the selected photo')
  assert.equal(roloPhotoReviewPresenceAllowed(null, false), true)
  assert.equal(roloPhotoReviewPresenceAllowed(null, true), false,
    'the server cannot return photo observations when no photo was selected')
})

test('accepts one-key data envelopes and bounded problems', () => {
  assert.deepEqual(envelopeData({ data: { ok: true } }), { ok: true })
  assert.throws(() => envelopeData({ data: {}, extra: true }))
  assert.deepEqual(problemCode({ error: { code: 'rate_limited', retryAfterSeconds: 30 } }), {
    code: 'rate_limited', retryAfterSeconds: 30,
  })
  assert.deepEqual(problemCode({ nope: true }), { code: 'unavailable' })
})

test('builds the exact native bootstrap and bearer headers', () => {
  assert.deepEqual(nativeRequestHeaders(null, 'json'), {
    accept: 'application/json',
    'x-homesrolo-client': 'native.v1',
    'content-type': 'application/json',
  })
  assert.deepEqual(nativeRequestHeaders('abc_1234567890-XYZ'), {
    accept: 'application/json',
    'x-homesrolo-client': 'native.v1',
    authorization: 'Bearer abc_1234567890-XYZ',
  })
  assert.throws(() => nativeRequestHeaders('bad token'))
})

test('bounds Rolo context to the server contract while preserving newest turns', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    text: `${index}:`.padEnd(1_400, 'x'),
  }))
  const conversation = { pendingWork: null, unansweredFollowUpQuestion: 'Which unit?' }
  const bounded = boundedRoloConversation('  help my house  ', history, conversation)
  assert.equal(bounded.message, 'help my house')
  assert.equal(bounded.conversation.unansweredFollowUpQuestion, 'Which unit?')
  assert.ok(bounded.history.length <= 16)
  assert.ok(bounded.history.every(turn => turn.text.length <= 900))
  assert.ok(bounded.message.length
    + bounded.history.reduce((total, turn) => total + turn.text.length, 0)
    + (bounded.conversation.unansweredFollowUpQuestion?.length ?? 0) <= 12_000)
  assert.match(bounded.history.at(-1)?.text ?? '', /^9:/)
  assert.throws(() => boundedRoloConversation('x'.repeat(1_601), [], {
    pendingWork: null,
    unansweredFollowUpQuestion: null,
  }))
})
