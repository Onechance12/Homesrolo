import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import { configuredProjectReviewService, homeownerRuntimeConfiguration } from './runtime.ts'

const MAX_JSON_BYTES = 4 * 1024
const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function mapped(error: unknown) {
  if (!(error instanceof HomeownerApiError)) return response(503, { error: { code: 'unavailable' } })
  if (error.code === 'signed_out') return response(401, { error: { code: 'signed_out' } })
  if (error.code === 'forbidden') return response(403, { error: { code: 'forbidden' } })
  if (error.code === 'not_found') return response(404, { error: { code: 'not_found' } })
  if (error.code === 'conflict') return response(409, { error: { code: 'conflict' } })
  if (error.code === 'invalid_request') return response(400, { error: { code: 'invalid_request' } })
  return response(503, { error: { code: 'unavailable' } })
}

async function boundedJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const length = request.headers.get('content-length')
  if (mediaType !== 'application/json'
    || (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_JSON_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  if (!byteLength) return null
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength })
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

export async function submitProjectForHomesroloReview(
  request: Request,
  homeRef: string,
  projectRef: string,
) {
  const configuration = homeownerRuntimeConfiguration()
  const service = configuredProjectReviewService()
  if (!configuration || !service) return response(503, { error: { code: 'unavailable' } })
  if (request.method !== 'POST' || request.headers.get('origin') !== configuration.appOrigin) {
    return response(403, { error: { code: 'forbidden' } })
  }
  const body = await boundedJson(request)
  if (body === null) return response(400, { error: { code: 'invalid_request' } })
  try {
    const context = { sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')) }
    const operation = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { operation?: unknown }).operation
      : null
    const result = operation === 'preview'
      ? await service.preview(context, homeRef, projectRef, body)
      : await service.submit(context, homeRef, projectRef, body)
    if ('disclosureDigest' in result) return response(200, { data: result })
    return response(result.status === 'awaiting_chance_review' ? 201 : 202, { data: result })
  } catch (error) {
    return mapped(error)
  }
}
