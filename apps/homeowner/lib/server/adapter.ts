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
import { homeownerApiService } from './runtime.ts'

function toWebResponse(response: HomeownerHttpResponse): Response {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: response.headers,
  })
}

export async function handleHomeownerRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const handler = createHomeownerHttpHandler(homeownerApiService())
  const response = await handler({
    method: request.method,
    pathname: url.pathname,
    search: url.search,
    hasBody: request.body !== null,
    sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')),
  })
  return toWebResponse(response)
}
