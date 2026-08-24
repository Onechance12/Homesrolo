import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRemotePort } from '../port/remote.ts'
import {
  decodeHomeRecordHandoffList,
  decodeHomeRecordHandoffPreview,
  WireError,
} from '../port/wire.ts'
import { HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT } from '../port/types.ts'
import type { JsonTransport, TransportRequest } from '../port/transport.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const homeRef = ref('hhom', 'h')
const shareId = ref('hshr', 's')
const itemRef = ref('hproj', 'i')
const commandRef = ref('hcmd', 'c')

const preview = Object.freeze({
  handoffRef: ref('hhof', 'o'),
  shareId,
  state: 'received',
  receivedAt: '2026-08-24T12:00:00.000Z',
  expiresAt: '2026-08-31T12:00:00.000Z',
  previewDigest: 'd'.repeat(64),
  acceptanceText: HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT,
  items: [{
    artifactRef: itemRef,
    projectionKind: 'work_completion_record',
    label: 'Project completion record',
    mediaType: 'application/pdf',
    byteLength: 2400,
    decision: 'pending',
    copyState: 'not_started',
  }],
})

test('handoff decoders accept only the browser-safe exact projection', () => {
  const decoded = decodeHomeRecordHandoffPreview(preview, 'data')
  assert.equal(decoded.shareId, preview.shareId)
  assert.equal(decoded.items[0]?.artifactRef, itemRef)
  assert.equal(decodeHomeRecordHandoffList([preview], 'data').length, 1)
  for (const mutated of [
    { ...preview, acceptanceText: 'Sure, import it.' },
    { ...preview, recipientRef: ref('hrcp', 'r') },
    { ...preview, storageObjectRef: ref('hobj', 'x') },
    { ...preview, items: [...preview.items, preview.items[0]] },
    { ...preview, items: [{ ...preview.items[0], byteLength: 1024 * 1024 + 1 }] },
    { ...preview, items: [{ ...preview.items[0], mediaType: 'text/html' }] },
    { ...preview, items: [{ ...preview.items[0], mediaType: 'image/jpeg' }] },
    { ...preview, items: [{ ...preview.items[0], mediaType: 'image/png' }] },
    { ...preview, items: [{ ...preview.items[0], label: 'Invoice' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_status_summary' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_schedule_summary' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_document_copy' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_photo_set' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_warranty_record' }] },
    { ...preview, items: [{ ...preview.items[0], projectionKind: 'work_invoice_receipt' }] },
    { ...preview, expiresAt: preview.receivedAt },
  ]) {
    assert.throws(() => decodeHomeRecordHandoffPreview(mutated, 'data'), WireError)
  }
})

test('remote handoff methods build only exact-home same-origin JSON requests', async () => {
  const requests: TransportRequest[] = []
  const replies: Record<string, unknown> = {
    [`GET /api/v1/homes/${homeRef}/handoffs`]: [preview],
    [`POST /api/v1/homes/${homeRef}/handoffs/${shareId}/claim`]: preview,
    [`GET /api/v1/homes/${homeRef}/handoffs/${shareId}`]: preview,
    [`POST /api/v1/homes/${homeRef}/handoffs/${shareId}/accept`]: {
      ...preview,
      state: 'accepted',
      items: [{
        ...preview.items[0],
        decision: 'accepted',
        copyState: 'available',
        homeownerArtifactRef: ref('hart', 'a'),
      }],
    },
    [`POST /api/v1/homes/${homeRef}/handoffs/${shareId}/reject`]: {
      ...preview,
      state: 'rejected',
    },
  }
  const transport: JsonTransport = async request => {
    requests.push(request)
    const value = replies[`${request.method} ${request.path}`]
    return value === undefined
      ? { kind: 'reply', status: 404, body: { error: { code: 'not_found' } } }
      : { kind: 'reply', status: 200, body: { data: value } }
  }
  const port = createRemotePort(transport)
  assert.ok((await port.listHomeRecordHandoffs(homeRef)).ok)
  assert.ok((await port.claimHomeRecordHandoff(homeRef, shareId)).ok)
  assert.ok((await port.previewHomeRecordHandoff(homeRef, shareId)).ok)
  assert.ok((await port.acceptHomeRecordHandoff(homeRef, shareId, {
    commandRef,
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [itemRef],
    consentAccepted: true,
  })).ok)
  assert.ok((await port.rejectHomeRecordHandoff(homeRef, shareId, {
    commandRef,
    reviewedPreviewDigest: preview.previewDigest,
  })).ok)
  assert.deepEqual(requests, [
    { method: 'GET', path: `/api/v1/homes/${homeRef}/handoffs` },
    {
      method: 'POST',
      path: `/api/v1/homes/${homeRef}/handoffs/${shareId}/claim`,
      body: {},
    },
    { method: 'GET', path: `/api/v1/homes/${homeRef}/handoffs/${shareId}` },
    {
      method: 'POST',
      path: `/api/v1/homes/${homeRef}/handoffs/${shareId}/accept`,
      body: {
        commandRef,
        reviewedPreviewDigest: preview.previewDigest,
        selectedArtifactRefs: [itemRef],
        consentAccepted: true,
      },
    },
    {
      method: 'POST',
      path: `/api/v1/homes/${homeRef}/handoffs/${shareId}/reject`,
      body: { commandRef, reviewedPreviewDigest: preview.previewDigest },
    },
  ])
  assert.equal(JSON.stringify(requests).includes('recipientRef'), false)
  assert.equal(JSON.stringify(requests).includes('principalRef'), false)
  assert.equal(JSON.stringify(requests).includes('address'), false)
  assert.equal(JSON.stringify(requests).includes('email'), false)
})

test('a claim response cannot swap the exact share selected by the homeowner', async () => {
  const port = createRemotePort(async () => ({
    kind: 'reply',
    status: 200,
    body: { data: { ...preview, shareId: ref('hshr', 'x') } },
  }))
  assert.deepEqual(
    await port.claimHomeRecordHandoff(homeRef, shareId),
    { ok: false, error: 'invalid' },
  )
})

test('malformed handoff refs and consent never become network requests', async () => {
  let calls = 0
  const port = createRemotePort(async () => {
    calls += 1
    return { kind: 'network_failure' as const }
  })
  assert.deepEqual(
    await port.claimHomeRecordHandoff(homeRef, 'hshr_short'),
    { ok: false, error: 'not_found' },
  )
  assert.deepEqual(
    await port.previewHomeRecordHandoff(homeRef, 'hshr_short'),
    { ok: false, error: 'not_found' },
  )
  assert.deepEqual(await port.acceptHomeRecordHandoff(homeRef, shareId, {
    commandRef,
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [] as unknown as [string],
    consentAccepted: true,
  }), { ok: false, error: 'invalid' })
  assert.deepEqual(await port.acceptHomeRecordHandoff(homeRef, shareId, {
    commandRef,
    reviewedPreviewDigest: preview.previewDigest,
    selectedArtifactRefs: [itemRef, ref('hproj', 'x')] as unknown as [string],
    consentAccepted: true,
  }), { ok: false, error: 'invalid' })
  assert.equal(calls, 0)
})
