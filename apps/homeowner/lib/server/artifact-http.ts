import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import { homeownerApiService, homeownerRuntimeConfiguration } from './runtime.ts'

const MAX_JSON_BYTES = 8 * 1024
const JSON_READ_TIMEOUT_MS = 5_000
const REF = '[A-Za-z0-9_-]{43}'
const HOME_REF = new RegExp(`^hhom_${REF}$`)
const ARTIFACT_REF = new RegExp(`^hart_${REF}$`)

const JSON_HEADERS = Object.freeze({
  'cache-control': 'private, no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), { status, headers: JSON_HEADERS })
}

function mappedError(error: unknown): Response {
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  if (error.code === 'conflict') return problem(409, 'conflict')
  if (error.code === 'rate_limited') return problem(429, 'rate_limited')
  return problem(503, 'unavailable')
}

async function boundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new HomeownerApiError('invalid_request')
  const declared = Number(request.headers.get('content-length'))
  if (!Number.isSafeInteger(declared) || declared < 2 || declared > MAX_JSON_BYTES) {
    throw new HomeownerApiError('invalid_request')
  }
  const reader = request.body.getReader()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new HomeownerApiError('invalid_request')),
      JSON_READ_TIMEOUT_MS,
    )
  })
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_JSON_BYTES) throw new HomeownerApiError('invalid_request')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
  if (byteLength !== declared) throw new HomeownerApiError('invalid_request')
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HomeownerApiError('invalid_request')
  }
}

export function artifactUploadEnvelopeAllowed(request: Request, expectedOrigin: string): boolean {
  const length = request.headers.get('content-length')
  const mediaType = request.headers.get('content-type')?.toLowerCase() ?? ''
  return request.method === 'POST'
    && new URL(request.url).search === ''
    && request.headers.get('origin') === expectedOrigin
    && !!length && /^\d+$/.test(length)
    && Number(length) >= 2 && Number(length) <= MAX_JSON_BYTES
    && !request.headers.has('content-encoding')
    && mediaType === 'application/json'
}

function requestContext(request: Request) {
  return { sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')) }
}

/** Reserves one opaque private key and returns a short-lived signed PUT. */
export async function handleArtifactUpload(
  request: Request,
  requestedHomeRef: string,
): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  if (!configuration) return problem(503, 'unavailable')
  if (!HOME_REF.test(requestedHomeRef)
    || !artifactUploadEnvelopeAllowed(request, configuration.appOrigin)) {
    return problem(400, 'invalid_request')
  }
  try {
    const context = requestContext(request)
    await homeownerApiService().listArtifacts(context, requestedHomeRef)
    const reservation = await homeownerApiService().reserveArtifactUpload(
      context, requestedHomeRef, await boundedJson(request),
    )
    return new Response(JSON.stringify({ data: reservation }), {
      status: reservation.state === 'available' ? 200 : 202,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    return mappedError(error)
  }
}

export async function handleArtifactUploadCompletion(
  request: Request,
  requestedHomeRef: string,
  requestedArtifactRef: string,
): Promise<Response> {
  const configuration = homeownerRuntimeConfiguration()
  if (!configuration) return problem(503, 'unavailable')
  if (!HOME_REF.test(requestedHomeRef) || !ARTIFACT_REF.test(requestedArtifactRef)
    || !artifactUploadEnvelopeAllowed(request, configuration.appOrigin)) {
    return problem(400, 'invalid_request')
  }
  try {
    const body = await boundedJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'commandRef')
      || typeof (body as { commandRef?: unknown }).commandRef !== 'string') {
      return problem(400, 'invalid_request')
    }
    const artifact = await homeownerApiService().completeArtifactUpload(
      requestContext(request), requestedHomeRef, requestedArtifactRef,
      (body as { commandRef: string }).commandRef,
    )
    return new Response(JSON.stringify({ data: artifact }), {
      status: 201,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    return mappedError(error)
  }
}

async function artifactBytes(
  request: Request,
  requestedHomeRef: string,
  requestedArtifactRef: string,
) {
  if (request.method !== 'GET' || new URL(request.url).search !== ''
    || !HOME_REF.test(requestedHomeRef) || !ARTIFACT_REF.test(requestedArtifactRef)) {
    throw new HomeownerApiError('invalid_request')
  }
  return homeownerApiService().readArtifactContent(
    requestContext(request), requestedHomeRef, requestedArtifactRef,
  )
}

function privatePayloadResponse(
  result: Awaited<ReturnType<typeof artifactBytes>>,
  disposition: 'attachment' | 'inline',
): Response {
  const body = new ArrayBuffer(result.bytes.byteLength)
  new Uint8Array(body).set(result.bytes)
  return new Response(new Blob([body], { type: result.artifact.mediaType }), {
    status: 200,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'content-disposition': `${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(result.artifact.displayName)}`,
      'content-length': String(result.bytes.byteLength),
      'content-security-policy': "default-src 'none'; sandbox",
      'content-type': result.artifact.mediaType,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function handleArtifactDownload(
  request: Request,
  requestedHomeRef: string,
  requestedArtifactRef: string,
): Promise<Response> {
  try {
    return privatePayloadResponse(
      await artifactBytes(request, requestedHomeRef, requestedArtifactRef), 'attachment',
    )
  } catch (error) {
    return mappedError(error)
  }
}

/** Authenticated same-origin image rendering; PDFs remain download-only. */
export async function handleArtifactPreview(
  request: Request,
  requestedHomeRef: string,
  requestedArtifactRef: string,
): Promise<Response> {
  try {
    const result = await artifactBytes(request, requestedHomeRef, requestedArtifactRef)
    if (result.artifact.mediaType !== 'image/jpeg'
      && result.artifact.mediaType !== 'image/png') return problem(404, 'not_found')
    return privatePayloadResponse(result, 'inline')
  } catch (error) {
    return mappedError(error)
  }
}
