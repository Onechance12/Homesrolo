import { HOMEOWNER_ARTIFACT_MAX_BYTES } from '../../../../src/homeowner/homeowner-artifacts.v1.ts'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import { homeownerApiService, homeownerRuntimeConfiguration } from './runtime.ts'

const MAX_MULTIPART_BYTES = HOMEOWNER_ARTIFACT_MAX_BYTES + 64 * 1024
const REF = '[A-Za-z0-9_-]{43}'
const HOME_REF = new RegExp(`^hhom_${REF}$`)
const ARTIFACT_REF = new RegExp(`^hart_${REF}$`)

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
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
  return problem(503, 'unavailable')
}

async function boundedMultipartFormData(request: Request): Promise<FormData> {
  if (!request.body) throw new HomeownerApiError('invalid_request')
  const declared = Number(request.headers.get('content-length'))
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_MULTIPART_BYTES) {
      await reader.cancel()
      throw new HomeownerApiError('invalid_request')
    }
    chunks.push(value)
  }
  if (byteLength !== declared) throw new HomeownerApiError('invalid_request')
  const body = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': request.headers.get('content-type') ?? '' },
    body,
  }).formData()
}

export function artifactUploadEnvelopeAllowed(request: Request, expectedOrigin: string): boolean {
  const length = request.headers.get('content-length')
  const mediaType = request.headers.get('content-type')?.toLowerCase() ?? ''
  return request.method === 'POST'
    && request.headers.get('origin') === expectedOrigin
    && !!length
    && /^\d+$/.test(length)
    && Number(length) > 0
    && Number(length) <= MAX_MULTIPART_BYTES
    && !request.headers.has('content-encoding')
    && mediaType.startsWith('multipart/form-data;')
    && mediaType.includes('boundary=')
}

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
    const requestContext = {
      sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')),
    }
    // Reject unauthenticated/cross-home callers before buffering multipart
    // bytes, then re-authorize again inside the write operation.
    await homeownerApiService().listArtifacts(requestContext, requestedHomeRef)
    const form = await boundedMultipartFormData(request)
    const allowed = new Set(['commandRef', 'kind', 'projectRef', 'file'])
    if ([...form.keys()].some(key => !allowed.has(key))
      || form.getAll('commandRef').length !== 1
      || form.getAll('kind').length !== 1
      || form.getAll('file').length !== 1
      || form.getAll('projectRef').length > 1) {
      return problem(400, 'invalid_request')
    }
    const commandRef = form.get('commandRef')
    const kind = form.get('kind')
    const projectRef = form.get('projectRef')
    const file = form.get('file')
    if (typeof commandRef !== 'string' || typeof kind !== 'string'
      || (projectRef !== null && typeof projectRef !== 'string')
      || !(file instanceof File)) {
      return problem(400, 'invalid_request')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const artifact = await homeownerApiService().uploadArtifact(
      requestContext,
      requestedHomeRef,
      {
        commandRef,
        kind,
        displayName: file.name,
        ...(projectRef ? { projectRef } : {}),
      },
      bytes,
    )
    return new Response(JSON.stringify({ data: artifact }), {
      status: 201,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    return mappedError(error)
  }
}

export async function handleArtifactDownload(
  request: Request,
  requestedHomeRef: string,
  requestedArtifactRef: string,
): Promise<Response> {
  if (request.method !== 'GET' || new URL(request.url).search !== ''
    || !HOME_REF.test(requestedHomeRef) || !ARTIFACT_REF.test(requestedArtifactRef)) {
    return problem(400, 'invalid_request')
  }
  try {
    const result = await homeownerApiService().readArtifactContent(
      { sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')) },
      requestedHomeRef,
      requestedArtifactRef,
    )
    const body = new ArrayBuffer(result.bytes.byteLength)
    new Uint8Array(body).set(result.bytes)
    return new Response(new Blob([body], { type: result.artifact.mediaType }), {
      status: 200,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(result.artifact.displayName)}`,
        'content-length': String(result.bytes.byteLength),
        'content-security-policy': "default-src 'none'; sandbox",
        'content-type': result.artifact.mediaType,
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return mappedError(error)
  }
}
