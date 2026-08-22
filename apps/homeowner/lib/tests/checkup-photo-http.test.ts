import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES,
  HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES,
} from '../../../../src/homeowner/homeowner-checkup-photos.v1.ts'
import {
  checkupPhotoDeleteEnvelopeAllowed,
  checkupPhotoUploadEnvelopeAllowed,
  handleCheckupPhotoContent,
  handleCheckupPhotoDelete,
  handleCheckupPhotoUpload,
  sanitizeHomeownerCheckupPhoto,
  type CheckupPhotoHttpDependencies,
} from '../server/checkup-photo-http.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const HOME = ref('hhom', 'h')
const PHOTO = ref('hpho', 'p')
const COMMAND = ref('hcmd', 'c')
const ORIGIN = 'https://app.homesrolo.com'
const photoView = {
  photoRef: PHOTO,
  homeRef: HOME,
  observedOn: '2026-08-20',
  area: 'front_exterior' as const,
  viewLabel: 'Front door from the walkway',
  caption: '',
  fullUrl: `/api/v1/homes/${HOME}/photo-checkups/${PHOTO}/full`,
  thumbnailUrl: `/api/v1/homes/${HOME}/photo-checkups/${PHOTO}/thumbnail`,
  width: 1200,
  height: 800,
  createdAt: '2026-08-21T12:00:00.000Z',
}

function service(overrides: Partial<CheckupPhotoHttpDependencies['service']> = {}) {
  return {
    async preauthorizeCheckupPhotoUpload() {},
    async preauthorizeCheckupPhotoRead() {},
    async reserveCheckupPhotoUpload() { return { state: 'available' as const, photo: photoView } },
    async completeCheckupPhotoUpload() { return photoView },
    async rejectCheckupPhotoUpload() {},
    async readCheckupPhotoContent() {
      return { photo: photoView, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
    },
    async deleteCheckupPhoto() { return { photoRef: PHOTO, state: 'deleted' as const } },
    ...overrides,
  } satisfies CheckupPhotoHttpDependencies['service']
}

function dependencies(
  overrides: Partial<CheckupPhotoHttpDependencies['service']> = {},
): CheckupPhotoHttpDependencies {
  return { appOrigin: ORIGIN, service: service(overrides) }
}

function uploadRequest(bytes: Uint8Array, headers: Record<string, string> = {}, url = `${ORIGIN}/upload`) {
  const body = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(body).set(bytes)
  return new Request(url, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'image/jpeg',
      'content-length': String(bytes.byteLength),
      'x-homesrolo-command-ref': COMMAND,
      'x-homesrolo-observed-on': '2026-08-20',
      'x-homesrolo-photo-area': 'front_exterior',
      'x-homesrolo-view-label': encodeURIComponent('Front door from the walkway'),
      'x-homesrolo-caption': '',
      ...headers,
    },
    body,
  })
}

test('photo upload envelope is exact-origin, exact-type, unencoded, queryless, and bounded', () => {
  const request = uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]))
  assert.equal(checkupPhotoUploadEnvelopeAllowed(request, ORIGIN), true)
  for (const candidate of [
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { origin: 'https://evil.test' }),
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { 'content-type': 'image/webp' }),
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { 'content-encoding': 'gzip' }),
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { 'content-length': '10485761' }),
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { 'x-homesrolo-extra': 'no' }),
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), {}, `${ORIGIN}/upload?extra=1`),
  ]) assert.equal(checkupPhotoUploadEnvelopeAllowed(candidate, ORIGIN), false)
})

test('exact-home authorization rejects before the upload body reader is acquired', async () => {
  let bodyReaderCalls = 0
  const fakeRequest = {
    method: 'POST',
    url: `${ORIGIN}/upload`,
    headers: uploadRequest(new Uint8Array([0xff, 0xd8, 0xff])).headers,
    body: {
      getReader() {
        bodyReaderCalls += 1
        throw new Error('body must not be read')
      },
    },
  } as unknown as Request
  const response = await handleCheckupPhotoUpload(fakeRequest, HOME, dependencies({
    async preauthorizeCheckupPhotoUpload() { throw new HomeownerApiError('signed_out') },
  }))
  assert.equal(response.status, 401)
  assert.equal(bodyReaderCalls, 0)
})

test('malformed photo metadata is rejected after authorization but before body acquisition', async () => {
  const invalidHeaders = [
    ['x-homesrolo-observed-on', '2026-02-30'],
    ['x-homesrolo-observed-on', '9999-12-31'],
    ['x-homesrolo-photo-area', 'kitchen'],
    ['x-homesrolo-view-label', ''],
    ['x-homesrolo-view-label', encodeURIComponent('  ')],
    ['x-homesrolo-view-label', encodeURIComponent('bad\nlabel')],
    ['x-homesrolo-caption', encodeURIComponent('x'.repeat(241))],
  ] as const
  for (const [name, value] of invalidHeaders) {
    let bodyReaderCalls = 0
    let authorizationCalls = 0
    const valid = uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]))
    valid.headers.set(name, value)
    const fakeRequest = {
      method: 'POST',
      url: `${ORIGIN}/upload`,
      headers: valid.headers,
      body: {
        getReader() {
          bodyReaderCalls += 1
          throw new Error('body must not be read')
        },
      },
    } as unknown as Request
    const response = await handleCheckupPhotoUpload(fakeRequest, HOME, dependencies({
      async preauthorizeCheckupPhotoUpload() { authorizationCalls += 1 },
    }))
    assert.equal(response.status, 400, `${name}: ${value}`)
    assert.equal(authorizationCalls, 1, `${name}: ${value}`)
    assert.equal(bodyReaderCalls, 0, `${name}: ${value}`)
  }
})

test('declared length mismatch is rejected before reserve or transform', async () => {
  let reserveCalls = 0
  const response = await handleCheckupPhotoUpload(
    uploadRequest(new Uint8Array([0xff, 0xd8, 0xff]), { 'content-length': '4' }),
    HOME,
    dependencies({
      async reserveCheckupPhotoUpload() {
        reserveCalls += 1
        return { state: 'available', photo: photoView }
      },
    }),
  )
  assert.equal(response.status, 400)
  assert.equal(reserveCalls, 0)
})

test('one process slot covers body buffering through persistence and busy requests get 429', async () => {
  const jpeg = new Uint8Array(await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#336699' },
  }).jpeg().toBuffer())
  let entered!: () => void
  const enteredReserve = new Promise<void>(resolve => { entered = resolve })
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const first = handleCheckupPhotoUpload(uploadRequest(jpeg), HOME, dependencies({
    async reserveCheckupPhotoUpload() {
      entered()
      await hold
      return { state: 'available', photo: photoView }
    },
  }))
  await enteredReserve
  const busy = await handleCheckupPhotoUpload(uploadRequest(jpeg), HOME, dependencies())
  assert.equal(busy.status, 429)
  assert.equal(busy.headers.get('retry-after'), '5')
  assert.deepEqual(await busy.json(), { error: { code: 'rate_limited' } })
  release()
  assert.equal((await first).status, 201)
})

test('Sharp outputs bounded one-frame JPEG derivatives with metadata stripped', async () => {
  const input = new Uint8Array(await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: '#8c765f' },
  }).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer())
  const result = await sanitizeHomeownerCheckupPhoto(input)
  assert.ok(result.fullBytes.byteLength <= HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES)
  assert.ok(result.thumbnailBytes.byteLength <= HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES)
  const full = await sharp(result.fullBytes).metadata()
  const thumbnail = await sharp(result.thumbnailBytes).metadata()
  assert.equal(full.format, 'jpeg')
  assert.equal(thumbnail.format, 'jpeg')
  assert.ok(Math.max(full.width ?? 0, full.height ?? 0) <= 2048)
  assert.ok(Math.max(thumbnail.width ?? 0, thumbnail.height ?? 0) <= 480)
  for (const metadata of [full, thumbnail]) {
    assert.equal(metadata.pages ?? 1, 1)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
    assert.equal(metadata.xmp, undefined)
    assert.equal(metadata.orientation, undefined)
  }
})

test('Sharp rejects invalid and animated source payloads', async () => {
  await assert.rejects(sanitizeHomeownerCheckupPhoto(new Uint8Array([1, 2, 3])))
  const raw = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255])
  const animated = new Uint8Array(await sharp(raw, {
    raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
  }).gif({ loop: 0, delay: [100, 100] }).toBuffer())
  await assert.rejects(sanitizeHomeownerCheckupPhoto(animated))
})

test('private content is same-origin/no-store JPEG and delete requires exact Origin', async () => {
  const content = await handleCheckupPhotoContent(
    new Request(`${ORIGIN}/content`), HOME, PHOTO, 'thumbnail', dependencies(),
  )
  assert.equal(content.status, 200)
  assert.equal(content.headers.get('content-type'), 'image/jpeg')
  assert.match(content.headers.get('cache-control') ?? '', /private, no-store/)
  assert.equal(content.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(content.headers.get('x-content-type-options'), 'nosniff')

  for (const origin of [null, 'https://evil.test']) {
    const headers = origin ? { origin } : undefined
    const request = new Request(`${ORIGIN}/delete`, { method: 'DELETE', headers })
    assert.equal(checkupPhotoDeleteEnvelopeAllowed(request, ORIGIN), false)
    const response = await handleCheckupPhotoDelete(request, HOME, PHOTO, dependencies())
    assert.equal(response.status, 403)
  }
  const allowed = new Request(`${ORIGIN}/delete`, {
    method: 'DELETE', headers: { origin: ORIGIN },
  })
  assert.equal(checkupPhotoDeleteEnvelopeAllowed(allowed, ORIGIN), true)
  assert.equal((await handleCheckupPhotoDelete(allowed, HOME, PHOTO, dependencies())).status, 200)
})

test('a normal thumbnail burst queues safely while full-image overload stays bounded', async () => {
  let thumbnailReads = 0
  let releaseThumbnails!: () => void
  const thumbnailsHeld = new Promise<void>(resolve => { releaseThumbnails = resolve })
  const thumbnailService = dependencies({
    async readCheckupPhotoContent() {
      thumbnailReads += 1
      await thumbnailsHeld
      return { photo: photoView, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
    },
  })
  const thumbnails = Array.from({ length: 13 }, () => handleCheckupPhotoContent(
    new Request(`${ORIGIN}/content`), HOME, PHOTO, 'thumbnail', thumbnailService,
  ))
  while (thumbnailReads < 12) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(thumbnailReads, 12, 'the thirteenth thumbnail waits without buffering content')
  releaseThumbnails()
  assert.deepEqual(await Promise.all(thumbnails).then(items => items.map(item => item.status)),
    Array(13).fill(200))

  let releaseFull!: () => void
  const fullHeld = new Promise<void>(resolve => { releaseFull = resolve })
  const fullService = dependencies({
    async readCheckupPhotoContent() {
      await fullHeld
      return { photo: photoView, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
    },
  })
  const admitted = Array.from({ length: 12 }, () => handleCheckupPhotoContent(
    new Request(`${ORIGIN}/content`), HOME, PHOTO, 'full', fullService,
  ))
  await new Promise(resolve => setTimeout(resolve, 10))
  const overload = await handleCheckupPhotoContent(
    new Request(`${ORIGIN}/content`), HOME, PHOTO, 'full', fullService,
  )
  assert.equal(overload.status, 429)
  releaseFull()
  assert.deepEqual(await Promise.all(admitted).then(items => items.map(item => item.status)),
    Array(12).fill(200))
})
