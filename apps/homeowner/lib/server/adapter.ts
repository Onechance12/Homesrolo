/**
 * SERVER-ONLY Next route adapter: Web Request in, Web Response out, with the
 * merged framework-neutral handler doing every routing and policy decision.
 *
 * What this file may do is deliberately tiny: read the method, the pathname,
 * the query string's presence, whether a body exists, and the ONE named
 * session cookie — as an opaque handle. It copies nothing else. Headers,
 * body content, and every other cookie are ignored, so browser input cannot
 * smuggle a principal, role, home, provider id, storage ref, or capability
 * into the boundary: HomeownerHttpRequest has no field to put one in.
 */

import { createHomeownerHttpHandler } from '../../../../src/homeowner/homeowner-http.v1.ts'
import type { HomeownerHttpResponse } from '../../../../src/homeowner/homeowner-http.v1.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import { homeownerApiService, homeownerRuntimeConfiguration } from './runtime.ts'

function toWebResponse(response: HomeownerHttpResponse): Response {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: response.headers,
  })
}

// A fully reviewed 18-row proposal can carry bounded detail on every row.
// Eight KiB contains that strict schema while remaining far below a generic
// document body or file-upload surface.
const MAX_JSON_BYTES = 8192

export function mutationOriginAllowed(
  method: string,
  requestOrigin: string | null,
  expectedOrigin: string,
): boolean {
  return method !== 'POST' || requestOrigin === expectedOrigin
}

function forbiddenMutationResponse(): Response {
  return new Response(JSON.stringify({ error: { code: 'forbidden' } }), {
    status: 403,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function boundedJsonBody(request: Request): Promise<unknown> {
  if (request.method !== 'POST' || request.body === null) return undefined
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') return undefined
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) return undefined
  try {
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let byteLength = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_JSON_BYTES) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
    if (byteLength === 0) return undefined
    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export async function handleHomeownerRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const configuration = homeownerRuntimeConfiguration()
  if (configuration && !mutationOriginAllowed(
    request.method,
    request.headers.get('origin'),
    configuration.appOrigin,
  )) {
    return forbiddenMutationResponse()
  }
  const handler = createHomeownerHttpHandler(homeownerApiService())
  const hasBody = request.body !== null
  const jsonBody = await boundedJsonBody(request)
  const response = await handler({
    method: request.method,
    pathname: url.pathname,
    search: url.search,
    hasBody,
    jsonBody,
    sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')),
  })
  return toWebResponse(response)
}
