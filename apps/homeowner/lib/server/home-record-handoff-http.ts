import {
  HomeownerApiError,
  type HomeownerApiRequestContext,
} from '../../../../src/homeowner/homeowner-api.v1.ts'
import type {
  HomeRecordHandoffPreview,
  HomeRecordHandoffService,
} from '../../../../src/homeowner/home-record-handoff.v1.ts'
import { sessionHandleFromCookieHeader } from './cookie.ts'
import {
  configuredHomeRecordHandoffService,
  homeownerRuntimeConfiguration,
} from './runtime.ts'

const REF = '[A-Za-z0-9_-]{43}'
const HOME_REF = new RegExp(`^hhom_${REF}$`)
const SHARE_REF = new RegExp(`^hshr_${REF}$`)
const MAX_JSON_BYTES = 4 * 1024

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive',
})

type HandoffHttpService = Pick<HomeRecordHandoffService,
  'list' | 'preview' | 'accept' | 'reject' | 'exportHomeRecord'>

export interface HomeRecordHandoffHttpDependencies {
  readonly appOrigin: string
  readonly service: HandoffHttpService
  /** Server-owned closure; its fixed recipient ref never enters this boundary. */
  readonly claimExactShare: (
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedShareId: string,
  ) => Promise<HomeRecordHandoffPreview>
}

export type HomeRecordHandoffHttpOperation =
  | { readonly kind: 'list' }
  | { readonly kind: 'claim'; readonly shareId: string }
  | { readonly kind: 'preview'; readonly shareId: string }
  | { readonly kind: 'accept'; readonly shareId: string }
  | { readonly kind: 'reject'; readonly shareId: string }
  | { readonly kind: 'export' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function problem(status: number, code: string): Response {
  return json(status, { error: { code } })
}

function mappedError(error: unknown): Response {
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  if (error.code === 'conflict') return problem(409, 'conflict')
  if (error.code === 'rate_limited') {
    return new Response(JSON.stringify({ error: { code: 'rate_limited' } }), {
      status: 429,
      headers: { ...JSON_HEADERS, 'retry-after': '5' },
    })
  }
  return problem(503, 'unavailable')
}

function runtimeDependencies(): HomeRecordHandoffHttpDependencies | null {
  const configuration = homeownerRuntimeConfiguration()
  const configured = configuredHomeRecordHandoffService()
  if (!configuration || !configured) return null
  return {
    appOrigin: configuration.appOrigin,
    service: configured.service,
    claimExactShare: configured.claimExactShare,
  }
}

function readEnvelopeAllowed(request: Request, expectedOrigin: string): boolean {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  return request.method === 'GET'
    && url.search === ''
    && request.body === null
    && !request.headers.has('content-type')
    && !request.headers.has('content-encoding')
    && (origin === null || origin === expectedOrigin)
    && (fetchSite === null || fetchSite === 'same-origin')
}

export function homeRecordHandoffMutationEnvelopeAllowed(
  request: Request,
  expectedOrigin: string,
): boolean {
  const url = new URL(request.url)
  const length = request.headers.get('content-length')
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  return request.method === 'POST'
    && url.search === ''
    && request.headers.get('origin') === expectedOrigin
    && request.headers.get('sec-fetch-site') !== 'cross-site'
    && mediaType === 'application/json'
    && !request.headers.has('content-encoding')
    && request.body !== null
    && (length === null || (/^\d+$/.test(length)
      && Number(length) > 0 && Number(length) <= MAX_JSON_BYTES))
}

async function boundedJson(request: Request): Promise<unknown | null> {
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
  if (byteLength < 1) return null
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

function strictEmptyObject(value: unknown): value is Readonly<Record<string, never>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 0
}

/**
 * Authenticated homeowner boundary only. Exact-share activation accepts an
 * empty object; recipient resolution and source claiming remain server-owned.
 */
export async function handleHomeRecordHandoffHttp(
  request: Request,
  requestedHomeRef: string,
  operation: HomeRecordHandoffHttpOperation,
  injectedDependencies?: HomeRecordHandoffHttpDependencies | null,
): Promise<Response> {
  const dependencies = injectedDependencies === undefined
    ? runtimeDependencies()
    : injectedDependencies
  // A disabled deployment has no discoverable endpoint surface.
  if (!dependencies) return problem(404, 'not_found')
  if (!HOME_REF.test(requestedHomeRef)
    || ('shareId' in operation && !SHARE_REF.test(operation.shareId))) {
    return problem(400, 'invalid_request')
  }
  const context = {
    sessionHandle: sessionHandleFromCookieHeader(request.headers.get('cookie')),
  }
  try {
    if (operation.kind === 'list' || operation.kind === 'preview'
      || operation.kind === 'export') {
      if (!readEnvelopeAllowed(request, dependencies.appOrigin)) {
        return problem(400, 'invalid_request')
      }
      if (operation.kind === 'list') {
        return json(200, { data: await dependencies.service.list(context, requestedHomeRef) })
      }
      if (operation.kind === 'preview') {
        return json(200, {
          data: await dependencies.service.preview(
            context,
            requestedHomeRef,
            operation.shareId,
          ),
        })
      }
      const exported = await dependencies.service.exportHomeRecord(context, requestedHomeRef)
      const body = new ArrayBuffer(exported.bytes.byteLength)
      new Uint8Array(body).set(exported.bytes)
      return new Response(body, {
        status: 200,
        headers: {
          'cache-control': 'private, no-store, max-age=0',
          'content-disposition': `attachment; filename="${exported.fileName}"`,
          'content-length': String(exported.byteLength),
          'content-security-policy': "default-src 'none'; sandbox",
          'content-type': exported.mediaType,
          'cross-origin-resource-policy': 'same-origin',
          'digest': `sha-256=${Buffer.from(exported.payloadSha256, 'hex').toString('base64')}`,
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'x-robots-tag': 'noindex, nofollow, noarchive',
        },
      })
    }

    if (!homeRecordHandoffMutationEnvelopeAllowed(request, dependencies.appOrigin)) {
      return problem(403, 'forbidden')
    }
    const body = await boundedJson(request)
    if (body === null) return problem(400, 'invalid_request')
    if (operation.kind === 'claim') {
      if (!strictEmptyObject(body)) return problem(400, 'invalid_request')
      return json(200, {
        data: await dependencies.claimExactShare(
          context,
          requestedHomeRef,
          operation.shareId,
        ),
      })
    }
    const data = operation.kind === 'accept'
      ? await dependencies.service.accept(
          context,
          requestedHomeRef,
          operation.shareId,
          body,
        )
      : await dependencies.service.reject(
          context,
          requestedHomeRef,
          operation.shareId,
          body,
        )
    return json(200, { data })
  } catch (error) {
    return mappedError(error)
  }
}
