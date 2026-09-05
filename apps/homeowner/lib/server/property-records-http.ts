import { createHash } from 'node:crypto'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  propertyLookupRequestSchema, propertyLookupResultSchema, propertyLookupSchema,
  saveHomePropertySchema, homePropertySnapshotSchema, samePropertyAddress,
  type PropertyAddress, type PropertyLookup,
} from '../../../../src/homeowner/property-research.v1.ts'
import { homeownerRequestAuthentication, homeownerMutationRequestAllowed } from './request-auth.ts'
import { PropertyRecordsReceipt } from './property-records-receipt.ts'
import type { PropertyRecordsStore } from './property-records-store.ts'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' }
const MAX_BODY_BYTES = 24 * 1024
const BODY_TIMEOUT_MS = 5_000
function response(status: number, data: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } })
}
function problem(status: number, code: string, headers?: Record<string, string>) {
  return response(status, { error: { code } }, headers)
}
function mapped(error: unknown) {
  if (error instanceof HomeownerApiError) {
    const statuses = { signed_out: 401, forbidden: 403, not_found: 404,
      invalid_request: 400, conflict: 409, rate_limited: 429, unavailable: 503 }
    return problem(statuses[error.code], error.code)
  }
  // Never echo provider response text, submitted addresses, or signed receipts.
  return problem(503, 'unavailable')
}
async function boundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    || request.headers.has('content-encoding') || !request.body
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES))) {
    throw new HomeownerApiError('invalid_request')
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => {})
      reject(new Error('body_timeout'))
    }, BODY_TIMEOUT_MS)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('oversize') }
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch { throw new HomeownerApiError('invalid_request') }
  finally { clearTimeout(timer); reader.releaseLock() }
}

export interface PropertyRecordsHttpDependencies {
  readonly appOrigin: string | null
  readonly requirePrincipal: (sessionHandle: string) => Promise<string>
  readonly lookup: (address: PropertyAddress) => Promise<PropertyLookup>
  readonly store: PropertyRecordsStore | null
  readonly receipts: PropertyRecordsReceipt | null
  readonly now: () => string
}

function authenticate(request: Request, dependencies: PropertyRecordsHttpDependencies, mutation: boolean) {
  if (!dependencies.appOrigin || !dependencies.store || !dependencies.receipts) {
    throw new HomeownerApiError('unavailable')
  }
  const url = new URL(request.url)
  if (url.search || url.hash) throw new HomeownerApiError('invalid_request')
  const auth = homeownerRequestAuthentication(request)
  if (auth.kind === 'invalid') throw new HomeownerApiError('invalid_request')
  if (mutation && !homeownerMutationRequestAllowed(request, dependencies.appOrigin, auth)) {
    throw new HomeownerApiError('forbidden')
  }
  if (!auth.sessionHandle) throw new HomeownerApiError('signed_out')
  return auth.sessionHandle
}

export async function handlePropertyLookupWithDependencies(
  request: Request, dependencies: PropertyRecordsHttpDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return problem(405, 'method_not_allowed', { allow: 'POST' })
  try {
    const handle = authenticate(request, dependencies, true)
    const principalRef = await dependencies.requirePrincipal(handle)
    const parsed = propertyLookupRequestSchema.safeParse(await boundedJson(request))
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    // This shared atomic counter stores only opaque principal IDs, never a
    // draft address or property data. Lookup has no home mutation port.
    if (!await dependencies.store!.consumeLookup(principalRef)) {
      return problem(429, 'rate_limited', { 'retry-after': '600' })
    }
    const lookup = propertyLookupSchema.parse(await dependencies.lookup(parsed.data.address))
    if (!samePropertyAddress(parsed.data.address, lookup.address)) throw new HomeownerApiError('unavailable')
    // Recheck a session that may have been revoked during a slow county call.
    if (await dependencies.requirePrincipal(handle) !== principalRef) throw new HomeownerApiError('signed_out')
    return response(200, { data: propertyLookupResultSchema.parse({ lookup,
      receipt: lookup.status === 'matched' ? dependencies.receipts!.sign(principalRef, lookup) : null,
    }) })
  } catch (error) { return mapped(error) }
}

export async function handleHomePropertyWithDependencies(
  request: Request, homeRef: string, dependencies: PropertyRecordsHttpDependencies,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return problem(405, 'method_not_allowed', { allow: 'GET, POST' })
  }
  try {
    const handle = authenticate(request, dependencies, request.method === 'POST')
    if (!/^hhom_[A-Za-z0-9_-]{43}$/.test(homeRef)) throw new HomeownerApiError('invalid_request')
    const principalRef = await dependencies.requirePrincipal(handle)
    if (request.method === 'GET') {
      const snapshot = await dependencies.store!.read(principalRef, homeRef)
      const data = snapshot === null ? null : homePropertySnapshotSchema.parse(snapshot)
      if (data && data.homeRef !== homeRef) throw new HomeownerApiError('unavailable')
      return response(200, { data })
    }
    const parsed = saveHomePropertySchema.safeParse(await boundedJson(request))
    if (!parsed.success) throw new HomeownerApiError('invalid_request')
    const { address, facts, commandRef, receipt } = parsed.data
    const reviewedAt = dependencies.now()
    if (facts.yearBuilt !== null && facts.yearBuilt > new Date(reviewedAt).getUTCFullYear() + 1) {
      throw new HomeownerApiError('invalid_request')
    }
    const lookup = receipt === null ? null : dependencies.receipts!.verify(receipt, principalRef, address)
    if (receipt !== null && lookup === null) throw new HomeownerApiError('invalid_request')
    const commandDigest = createHash('sha256')
      .update(JSON.stringify({ homeRef, address, facts, lookup })).digest('hex')
    const saved = homePropertySnapshotSchema.parse(await dependencies.store!.save({
      principalRef, homeRef, commandRef, commandDigest, address, facts, lookup, reviewedAt,
    }))
    if (saved.homeRef !== homeRef || !samePropertyAddress(saved.address, address)) {
      throw new HomeownerApiError('unavailable')
    }
    return response(200, { data: saved })
  } catch (error) { return mapped(error) }
}

async function configuredDependencies(): Promise<PropertyRecordsHttpDependencies> {
  const runtime = await import('./runtime.ts')
  const configuration = runtime.homeownerRuntimeConfiguration()
  const records = runtime.configuredPropertyRecords()
  return { appOrigin: configuration?.appOrigin ?? null, store: records?.store ?? null,
    receipts: records?.receipts ?? null,
    lookup: async address => {
      const { lookupPropertyRecords } = await import('./property-records.ts')
      return lookupPropertyRecords(address)
    },
    async requirePrincipal(sessionHandle) {
      const session = await runtime.homeownerApiService().readSession({ sessionHandle })
      if (session.kind !== 'signed_in') throw new HomeownerApiError('signed_out')
      return session.principalRef
    }, now: () => new Date().toISOString() }
}
export async function handlePropertyLookup(request: Request): Promise<Response> {
  return handlePropertyLookupWithDependencies(request, await configuredDependencies())
}
export async function handleHomeProperty(request: Request, homeRef: string): Promise<Response> {
  return handleHomePropertyWithDependencies(request, homeRef, await configuredDependencies())
}
