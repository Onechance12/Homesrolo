import { createHash } from 'node:crypto'
import sharp from 'sharp'
import {
  HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES,
  HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_DIMENSION,
  HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES,
  HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS,
  HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES,
  HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_DIMENSION,
  homeownerCheckupPhotoObservationInputSchema,
  type HomeownerCheckupPhotoArea,
} from '../../../../src/homeowner/homeowner-checkup-photos.v1.ts'
import {
  HomeownerApiError,
  type HomeownerApiCheckupPhotoUploadReservation,
  type HomeownerApiService,
} from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HOMEOWNER_NATIVE_CLIENT_HEADER,
  homeownerMutationRequestAllowed,
  homeownerRequestAuthentication,
} from './request-auth.ts'
import { homeownerApiService, homeownerRuntimeConfiguration } from './runtime.ts'

const REF = '[A-Za-z0-9_-]{43}'
const HOME_REF = new RegExp(`^hhom_${REF}$`)
const PHOTO_REF = new RegExp(`^hpho_${REF}$`)
const COMMAND_REF = new RegExp(`^hcmd_${REF}$`)
const ALLOWED_INPUT_MEDIA_TYPES = new Set(['image/jpeg', 'image/png'])
const BODY_READ_DEADLINE_MS = 15_000
const SHARP_TIMEOUT_SECONDS = 15
const ALLOWED_PHOTO_HEADERS = new Set([
  HOMEOWNER_NATIVE_CLIENT_HEADER,
  'x-homesrolo-command-ref',
  'x-homesrolo-observed-on',
  'x-homesrolo-photo-area',
  'x-homesrolo-view-label',
  'x-homesrolo-caption',
])

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

export class PhotoTransformBusyError extends Error {}

// The free Render worker has 512 MiB. Disable libvips' shared cache, use one
// worker, and admit only one whole upload (including body buffering) at a time.
sharp.cache(false)
sharp.concurrency(1)
let uploadActive = false
let analysisTransformActive = false
type CheckupPhotoContentVariant = 'full' | 'thumbnail'
const activeContentReads: Record<CheckupPhotoContentVariant, number> = { full: 0, thumbnail: 0 }
const contentReadCaps: Record<CheckupPhotoContentVariant, number> = { full: 4, thumbnail: 12 }
const contentQueueCaps: Record<CheckupPhotoContentVariant, number> = { full: 8, thumbnail: 32 }
const contentReadQueues: Record<CheckupPhotoContentVariant, Array<{
  readonly resolve: (release: () => void) => void
  readonly reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}>> = { full: [], thumbnail: [] }
const CONTENT_QUEUE_WAIT_MS = 5_000

function releaseContentRead(variant: CheckupPhotoContentVariant): void {
  const next = contentReadQueues[variant].shift()
  if (next) {
    clearTimeout(next.timer)
    // Transfer this slot directly; the active count stays unchanged.
    next.resolve(() => releaseContentRead(variant))
    return
  }
  activeContentReads[variant] -= 1
}

function acquireContentRead(variant: CheckupPhotoContentVariant): Promise<() => void> {
  if (activeContentReads[variant] < contentReadCaps[variant]) {
    activeContentReads[variant] += 1
    return Promise.resolve(() => releaseContentRead(variant))
  }
  const queue = contentReadQueues[variant]
  if (queue.length >= contentQueueCaps[variant]) throw new PhotoTransformBusyError()
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = queue.indexOf(waiter)
        if (index >= 0) queue.splice(index, 1)
        reject(new PhotoTransformBusyError())
      }, CONTENT_QUEUE_WAIT_MS),
    }
    queue.push(waiter)
  })
}

type CheckupPhotoHttpService = Pick<HomeownerApiService,
  | 'preauthorizeCheckupPhotoUpload'
  | 'preauthorizeCheckupPhotoRead'
  | 'reserveCheckupPhotoUpload'
  | 'completeCheckupPhotoUpload'
  | 'rejectCheckupPhotoUpload'
  | 'readCheckupPhotoContent'
  | 'deleteCheckupPhoto'>

export interface CheckupPhotoHttpDependencies {
  readonly appOrigin: string
  readonly service: CheckupPhotoHttpService
}

function problem(status: number, code: string, extraHeaders = {} as Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}

function mappedError(error: unknown): Response {
  if (error instanceof PhotoTransformBusyError) {
    return problem(429, 'rate_limited', { 'retry-after': '5' })
  }
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  if (error.code === 'conflict') return problem(409, 'conflict')
  if (error.code === 'rate_limited') {
    return problem(429, 'rate_limited', { 'retry-after': '5' })
  }
  return problem(503, 'unavailable')
}

function hasOnlyKnownPhotoHeaders(headers: Headers): boolean {
  for (const [name] of headers) {
    if (name.startsWith('x-homesrolo-') && !ALLOWED_PHOTO_HEADERS.has(name)) return false
  }
  return true
}

function strictInputMediaType(request: Request): 'image/jpeg' | 'image/png' | null {
  const value = request.headers.get('content-type')?.toLowerCase() ?? ''
  return ALLOWED_INPUT_MEDIA_TYPES.has(value) ? value as 'image/jpeg' | 'image/png' : null
}

export function checkupPhotoUploadEnvelopeAllowed(
  request: Request,
  expectedOrigin: string,
): boolean {
  const length = request.headers.get('content-length')
  const authentication = homeownerRequestAuthentication(request)
  return request.method === 'POST'
    && new URL(request.url).search === ''
    && homeownerMutationRequestAllowed(request, expectedOrigin, authentication)
    && !!length
    && /^\d+$/.test(length)
    && Number(length) > 0
    && Number(length) <= HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES
    && !request.headers.has('content-encoding')
    && strictInputMediaType(request) !== null
    && hasOnlyKnownPhotoHeaders(request.headers)
}

export function checkupPhotoDeleteEnvelopeAllowed(
  request: Request,
  expectedOrigin: string,
): boolean {
  const authentication = homeownerRequestAuthentication(request)
  return request.method === 'DELETE'
    && new URL(request.url).search === ''
    && homeownerMutationRequestAllowed(request, expectedOrigin, authentication)
    && request.body === null
    && !request.headers.has('content-encoding')
    && !request.headers.has('content-type')
    && hasOnlyKnownPhotoHeaders(request.headers)
}

async function boundedRawBody(request: Request, declared: number): Promise<Uint8Array> {
  if (!request.body) throw new HomeownerApiError('invalid_request')
  const reader = request.body.getReader()
  const bytes = new Uint8Array(declared)
  let offset = 0
  const deadline = Date.now() + BODY_READ_DEADLINE_MS
  while (true) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      await reader.cancel()
      throw new HomeownerApiError('invalid_request')
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new HomeownerApiError('invalid_request')), remaining)
    })
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await Promise.race([reader.read(), timedOut])
    } catch (error) {
      await reader.cancel()
      throw error
    } finally {
      if (timer) clearTimeout(timer)
    }
    const { done, value } = chunk
    if (done) break
    if (offset + value.byteLength > declared
      || offset + value.byteLength > HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES) {
      await reader.cancel()
      throw new HomeownerApiError('invalid_request')
    }
    bytes.set(value, offset)
    offset += value.byteLength
  }
  if (offset !== declared) throw new HomeownerApiError('invalid_request')
  return bytes
}

function inputMagicMatches(bytes: Uint8Array, mediaType: 'image/jpeg' | 'image/png'): boolean {
  if (mediaType === 'image/jpeg') {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  return bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
}

function photoHeaders(request: Request) {
  const commandRef = request.headers.get('x-homesrolo-command-ref') ?? ''
  const observedOn = request.headers.get('x-homesrolo-observed-on') ?? ''
  const area = request.headers.get('x-homesrolo-photo-area') ?? ''
  const encodedViewLabel = request.headers.get('x-homesrolo-view-label') ?? ''
  const encodedCaption = request.headers.get('x-homesrolo-caption') ?? ''
  if (!COMMAND_REF.test(commandRef) || encodedViewLabel.length > 400
    || encodedCaption.length > 1_000) {
    throw new HomeownerApiError('invalid_request')
  }
  let viewLabel: string
  let caption: string
  try {
    viewLabel = decodeURIComponent(encodedViewLabel)
    caption = decodeURIComponent(encodedCaption)
  } catch {
    throw new HomeownerApiError('invalid_request')
  }
  // One canonical representation keeps intermediaries from silently changing
  // a caption that participates in the idempotency digest.
  if (encodeURIComponent(viewLabel) !== encodedViewLabel
    || encodeURIComponent(caption) !== encodedCaption) {
    throw new HomeownerApiError('invalid_request')
  }
  const parsed = homeownerCheckupPhotoObservationInputSchema.safeParse({
    commandRef,
    observedOn,
    area: area as HomeownerCheckupPhotoArea,
    viewLabel,
    caption,
  })
  if (!parsed.success
    || parsed.data.viewLabel !== viewLabel
    || parsed.data.caption !== caption
    || parsed.data.observedOn > new Date().toISOString().slice(0, 10)) {
    throw new HomeownerApiError('invalid_request')
  }
  return parsed.data
}

async function fullDerivativeAtDimension(input: Uint8Array, dimension: number) {
  return sharp(input, {
    animated: false,
    failOn: 'warning',
    limitInputPixels: HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS,
    pages: 1,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .resize({
      width: dimension,
      height: dimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, progressive: true, chromaSubsampling: '4:2:0' })
    .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
    .toBuffer({ resolveWithObject: true })
}

/** Decode once through libvips and persist only fresh JPEG pixel derivatives. */
export async function sanitizeHomeownerCheckupPhoto(input: Uint8Array) {
  try {
    const source = sharp(input, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS,
      pages: 1,
      sequentialRead: true,
    }).timeout({ seconds: SHARP_TIMEOUT_SECONDS })
    const sourceMetadata = await source.metadata()
    if (!sourceMetadata.width || !sourceMetadata.height
      || (sourceMetadata.pages ?? 1) !== 1
      || sourceMetadata.width * sourceMetadata.height > HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS) {
      throw new HomeownerApiError('invalid_request')
    }

    let full: Awaited<ReturnType<typeof fullDerivativeAtDimension>> | null = null
    for (const dimension of [
      HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_DIMENSION,
      1_792,
      1_536,
      1_280,
      1_024,
      800,
    ]) {
      const candidate = await fullDerivativeAtDimension(input, dimension)
      if (candidate.data.byteLength <= HOMEOWNER_CHECKUP_PHOTO_FULL_MAX_BYTES) {
        full = candidate
        break
      }
    }
    if (!full || !full.info.width || !full.info.height) {
      throw new HomeownerApiError('invalid_request')
    }

    let thumbnail: Buffer | null = null
    for (const dimension of [HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_DIMENSION, 400, 320, 240]) {
      const candidate = await sharp(full.data, {
        failOn: 'warning',
        limitInputPixels: HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_PIXELS,
        sequentialRead: true,
      })
        .resize({ width: dimension, height: dimension, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 76, progressive: true, chromaSubsampling: '4:2:0' })
        .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
        .toBuffer()
      if (candidate.byteLength <= HOMEOWNER_CHECKUP_PHOTO_THUMBNAIL_MAX_BYTES) {
        thumbnail = candidate
        break
      }
    }
    if (!thumbnail) throw new HomeownerApiError('invalid_request')

    const fullBytes = new Uint8Array(full.data)
    const thumbnailBytes = new Uint8Array(thumbnail)
    return {
      fullBytes,
      fullPayloadSha256: createHash('sha256').update(fullBytes).digest('hex'),
      thumbnailBytes,
      thumbnailPayloadSha256: createHash('sha256').update(thumbnailBytes).digest('hex'),
      width: full.info.width,
      height: full.info.height,
    }
  } catch (error) {
    if (error instanceof PhotoTransformBusyError || error instanceof HomeownerApiError) throw error
    throw new HomeownerApiError('invalid_request')
  }
}

/**
 * Re-encode one already-authorized saved image for a single Rolo request.
 * This shares the free worker's Sharp slot with uploads so two large image
 * decodes can never contend for memory.
 */
export async function sanitizeHomeownerPhotoForAnalysis(input: Uint8Array) {
  if (input.byteLength < 1 || input.byteLength > HOMEOWNER_CHECKUP_PHOTO_MAX_INPUT_BYTES) {
    throw new HomeownerApiError('invalid_request')
  }
  if (uploadActive || analysisTransformActive) throw new PhotoTransformBusyError()
  analysisTransformActive = true
  try {
    return await sanitizeHomeownerCheckupPhoto(input)
  } finally {
    analysisTransformActive = false
  }
}

export async function handleCheckupPhotoUpload(
  request: Request,
  requestedHomeRef: string,
  dependencies?: CheckupPhotoHttpDependencies,
): Promise<Response> {
  const configuration = dependencies ?? homeownerRuntimeConfiguration()
  if (!configuration) return problem(503, 'unavailable')
  const authentication = homeownerRequestAuthentication(request)
  if (authentication.kind === 'invalid') return problem(400, 'invalid_request')
  if (!HOME_REF.test(requestedHomeRef)
    || !checkupPhotoUploadEnvelopeAllowed(request, configuration.appOrigin)) {
    return problem(400, 'invalid_request')
  }
  const requestContext = {
    sessionHandle: authentication.sessionHandle,
  }
  let reservation: HomeownerApiCheckupPhotoUploadReservation | null = null
  let uploadSlotHeld = false
  try {
    const service = dependencies?.service ?? homeownerApiService()
    // This exact-home controller authorization happens before request buffering.
    await service.preauthorizeCheckupPhotoUpload(requestContext, requestedHomeRef)
    const declared = Number(request.headers.get('content-length'))
    const mediaType = strictInputMediaType(request)
    if (!mediaType) throw new HomeownerApiError('invalid_request')
    // Parse the complete homeowner-authored envelope before it can occupy the
    // sole body/Sharp slot or make the server pull one byte from the stream.
    const headers = photoHeaders(request)
    if (uploadActive || analysisTransformActive) throw new PhotoTransformBusyError()
    uploadActive = true
    uploadSlotHeld = true
    const bytes = await boundedRawBody(request, declared)
    if (!inputMagicMatches(bytes, mediaType)) throw new HomeownerApiError('invalid_request')
    reservation = await service.reserveCheckupPhotoUpload(requestContext, requestedHomeRef, {
      ...headers,
      inputMediaType: mediaType,
      inputByteLength: bytes.byteLength,
      inputPayloadSha256: createHash('sha256').update(bytes).digest('hex'),
    })
    if (reservation.state === 'available') {
      return new Response(JSON.stringify({ data: reservation.photo }), {
        status: 201,
        headers: JSON_HEADERS,
      })
    }
    const sanitized = await sanitizeHomeownerCheckupPhoto(bytes)
    const photo = await service.completeCheckupPhotoUpload(
      requestContext,
      requestedHomeRef,
      reservation.command,
      reservation.reservation,
      sanitized,
    )
    return new Response(JSON.stringify({ data: photo }), {
      status: 201,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    if (reservation?.state === 'reserved') {
      try {
        await (dependencies?.service ?? homeownerApiService()).rejectCheckupPhotoUpload(
          requestContext,
          requestedHomeRef,
          reservation.reservation,
        )
      } catch {
        // A later exact-home request opportunistically reconciles stale rows.
      }
    }
    return mappedError(error)
  } finally {
    if (uploadSlotHeld) uploadActive = false
  }
}

export async function handleCheckupPhotoContent(
  request: Request,
  requestedHomeRef: string,
  requestedPhotoRef: string,
  variant: 'full' | 'thumbnail',
  dependencies?: CheckupPhotoHttpDependencies,
): Promise<Response> {
  if (request.method !== 'GET' || new URL(request.url).search !== ''
    || request.body !== null || !HOME_REF.test(requestedHomeRef)
    || !PHOTO_REF.test(requestedPhotoRef)) {
    return problem(400, 'invalid_request')
  }
  try {
    const service = dependencies?.service ?? homeownerApiService()
    const authentication = homeownerRequestAuthentication(request)
    if (authentication.kind === 'invalid') return problem(400, 'invalid_request')
    const requestContext = {
      sessionHandle: authentication.sessionHandle,
    }
    await service.preauthorizeCheckupPhotoRead(requestContext, requestedHomeRef)
    const release = await acquireContentRead(variant)
    let result: Awaited<ReturnType<CheckupPhotoHttpService['readCheckupPhotoContent']>>
    try {
      result = await service.readCheckupPhotoContent(
        requestContext,
        requestedHomeRef,
        requestedPhotoRef,
        variant,
      )
    } finally {
      release()
    }
    const body = new ArrayBuffer(result.bytes.byteLength)
    new Uint8Array(body).set(result.bytes)
    return new Response(body, {
      status: 200,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'content-disposition': 'inline; filename="home-checkup.jpg"',
        'content-length': String(result.bytes.byteLength),
        'content-security-policy': "default-src 'none'; sandbox",
        'content-type': 'image/jpeg',
        'cross-origin-resource-policy': 'same-origin',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return mappedError(error)
  }
}

export async function handleCheckupPhotoDelete(
  request: Request,
  requestedHomeRef: string,
  requestedPhotoRef: string,
  dependencies?: CheckupPhotoHttpDependencies,
): Promise<Response> {
  const configuration = dependencies ?? homeownerRuntimeConfiguration()
  if (!configuration) return problem(503, 'unavailable')
  if (!HOME_REF.test(requestedHomeRef) || !PHOTO_REF.test(requestedPhotoRef)) {
    return problem(400, 'invalid_request')
  }
  const authentication = homeownerRequestAuthentication(request)
  if (authentication.kind === 'invalid') return problem(400, 'invalid_request')
  if (!checkupPhotoDeleteEnvelopeAllowed(request, configuration.appOrigin)) {
    return problem(403, 'forbidden')
  }
  try {
    const result = await (dependencies?.service ?? homeownerApiService()).deleteCheckupPhoto(
      { sessionHandle: authentication.sessionHandle },
      requestedHomeRef,
      requestedPhotoRef,
    )
    return new Response(JSON.stringify({ data: result }), { status: 200, headers: JSON_HEADERS })
  } catch (error) {
    return mappedError(error)
  }
}
