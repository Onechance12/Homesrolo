import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES,
  HOMEOWNER_SHARE_MAX_MANIFEST_BYTES,
  homeownerShareCanonicalJson,
  type HomeownerShareConsentReceipt,
} from '../../../../src/contracts/homeowner-share.v1.ts'
import type {
  HomeRecordHandoffSourcePort,
  HomeRecordHandoffSourceResult,
} from '../../../../src/homeowner/home-record-handoff.v1.ts'

export const JOBROLO_HANDOFF_TRANSPORT_VERSION =
  'jobrolo-homesrolo-project-handoff-transport.v1' as const

const CLIENT_ID = /^[A-Za-z0-9._-]{3,64}$/
const SHA256 = /^[a-f0-9]{64}$/
const HMAC_SIGNATURE = /^[A-Za-z0-9_-]{43}$/
const MAX_OFFER_BYTES = HOMEOWNER_SHARE_MAX_MANIFEST_BYTES + 16 * 1024

const configurationSchema = z.object({
  enabled: z.literal('true'),
  origin: z.string().url().transform(value => new URL(value)).refine(
    value => value.protocol === 'https:'
      || value.hostname === 'localhost'
      || value.hostname === '127.0.0.1',
    'must use HTTPS outside local development',
  ),
  clientId: z.string().regex(CLIENT_ID),
  sharedSecret: z.string().min(32).max(512).regex(/^\S+$/),
}).strict()

export interface JobroloHandoffClientConfiguration {
  readonly origin: string
  readonly clientId: string
  readonly sharedSecret: string
}

export function readJobroloHandoffClientConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): JobroloHandoffClientConfiguration | null {
  const parsed = configurationSchema.safeParse({
    enabled: environment.HOMESROLO_JOBROLO_HANDOFF_ENABLED,
    origin: environment.HOMESROLO_JOBROLO_HANDOFF_ORIGIN,
    clientId: environment.HOMESROLO_JOBROLO_HANDOFF_CLIENT_ID,
    sharedSecret: environment.HOMESROLO_JOBROLO_HANDOFF_SHARED_SECRET,
  })
  if (!parsed.success) return null
  const origin = parsed.data.origin
  if (origin.username || origin.password || origin.search || origin.hash
    || (origin.pathname !== '/' && origin.pathname !== '')) return null
  return Object.freeze({
    origin: origin.origin,
    clientId: parsed.data.clientId,
    sharedSecret: parsed.data.sharedSecret,
  })
}

export class JobroloHandoffTransportError extends Error {
  readonly disposition: 'not_available' | 'unknown_outcome'

  constructor(disposition: 'not_available' | 'unknown_outcome') {
    super(disposition)
    this.name = 'JobroloHandoffTransportError'
    this.disposition = disposition
  }
}

export function jobroloHandoffClaimPath(shareId: string) {
  return `/api/integrations/homesrolo/v1/project-handoffs/${shareId}/claim`
}

export function jobroloHandoffArtifactPath(shareId: string, artifactRef: string) {
  return `/api/integrations/homesrolo/v1/project-handoffs/${shareId}/artifacts/${artifactRef}`
}

export function jobroloHandoffRequestSigningMaterial(input: {
  readonly method: 'POST'
  readonly pathname: string
  readonly timestamp: string
  readonly nonce: string
  readonly bodySha256: string
}) {
  return [
    JOBROLO_HANDOFF_TRANSPORT_VERSION,
    input.method,
    input.pathname,
    input.timestamp,
    input.nonce,
    input.bodySha256,
  ].join('\n')
}

export function jobroloHandoffResponseSigningMaterial(input: {
  readonly pathname: string
  readonly requestTimestamp: string
  readonly requestNonce: string
  readonly requestBodySha256: string
  readonly statusCode: number
  readonly contentType: string
  readonly responseBodySha256: string
}) {
  return [
    JOBROLO_HANDOFF_TRANSPORT_VERSION,
    'RESPONSE',
    'POST',
    input.pathname,
    input.requestTimestamp,
    input.requestNonce,
    input.requestBodySha256,
    String(input.statusCode),
    input.contentType,
    input.responseBodySha256,
  ].join('\n')
}

function hmac(secret: string, material: string) {
  return createHmac('sha256', secret).update(material, 'utf8').digest('base64url')
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function equalHmac(left: string, right: string) {
  if (!HMAC_SIGNATURE.test(left) || !HMAC_SIGNATURE.test(right)) return false
  const leftBytes = Buffer.from(left, 'base64url')
  const rightBytes = Buffer.from(right, 'base64url')
  return leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes)
}

interface HandoffExchange {
  readonly response: Response
  readonly pathname: string
  readonly timestamp: string
  readonly nonce: string
  readonly bodySha256: string
}

async function boundedBytes(response: Response, maximumBytes: number) {
  if (response.headers.has('content-encoding') || !response.body) {
    throw new JobroloHandoffTransportError('unknown_outcome')
  }
  const declared = response.headers.get('content-length')
  if (declared !== null
    && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > maximumBytes)) {
    throw new JobroloHandoffTransportError('unknown_outcome')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    chunks.push(value)
  }
  if (byteLength < 1 || (declared !== null && Number(declared) !== byteLength)) {
    throw new JobroloHandoffTransportError('unknown_outcome')
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function exactContentType(response: Response) {
  return response.headers.get('content-type')?.trim().toLowerCase() ?? ''
}

export class SignedJobroloHandoffClient implements HomeRecordHandoffSourcePort {
  readonly #configuration: JobroloHandoffClientConfiguration
  readonly #fetch: typeof fetch
  readonly #now: () => string
  readonly #nonce: () => string

  constructor(input: {
    readonly configuration: JobroloHandoffClientConfiguration
    readonly fetchImpl?: typeof fetch
    readonly now?: () => string
    readonly nonce?: () => string
  }) {
    this.#configuration = input.configuration
    // eslint-disable-next-line no-restricted-globals -- pinned server integration origin
    this.#fetch = input.fetchImpl ?? fetch
    this.#now = input.now ?? (() => new Date().toISOString())
    this.#nonce = input.nonce ?? (() => randomBytes(24).toString('base64url'))
  }

  async claim(input: { readonly shareId: string; readonly recipientRef: string }) {
    return this.#readOffer(input.shareId, {
      recipientRef: input.recipientRef,
    })
  }

  async checkCurrent(input: {
    readonly shareId: string
    readonly recipientRef: string
    readonly manifestDigest: string
  }) {
    return this.#readOffer(input.shareId, {
      recipientRef: input.recipientRef,
      manifestDigest: input.manifestDigest,
    })
  }

  async #readOffer(
    shareId: string,
    bodyValue: { readonly recipientRef: string; readonly manifestDigest?: string },
  ): Promise<HomeRecordHandoffSourceResult> {
    const pathname = jobroloHandoffClaimPath(shareId)
    const exchange = await this.#post(pathname, bodyValue, 15_000, 'application/json')
    const { response } = exchange
    if (exactContentType(response) !== 'application/json; charset=utf-8') {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    const bytes = await boundedBytes(response, MAX_OFFER_BYTES)
    this.#verifyResponse(exchange, bytes)
    if (response.status === 404 || response.status === 410) return { state: 'not_available' }
    if (response.status !== 200) throw new JobroloHandoffTransportError('unknown_outcome')
    try {
      const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
      const envelope = z.object({
        manifest: z.unknown(),
        authorization: z.unknown(),
      }).strict().parse(decoded)
      return { state: 'active', ...envelope }
    } catch {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
  }

  async fetchArtifact(input: {
    readonly shareId: string
    readonly artifactRef: string
    readonly manifestDigest: string
    readonly consent: HomeownerShareConsentReceipt
  }) {
    const pathname = jobroloHandoffArtifactPath(input.shareId, input.artifactRef)
    const exchange = await this.#post(pathname, {
      manifestDigest: input.manifestDigest,
      consent: input.consent,
    }, 60_000, 'application/pdf, image/jpeg, image/png')
    const { response } = exchange
    if (response.status === 404 || response.status === 410) {
      if (exactContentType(response) !== 'application/json; charset=utf-8') {
        throw new JobroloHandoffTransportError('unknown_outcome')
      }
      const errorBytes = await boundedBytes(response, 16 * 1024)
      this.#verifyResponse(exchange, errorBytes)
      throw new JobroloHandoffTransportError('not_available')
    }
    if (response.status !== 200) throw new JobroloHandoffTransportError('unknown_outcome')
    const mediaType = exactContentType(response)
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mediaType)) {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    if (response.headers.get('content-length') === null) {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    const declaredDigest = response.headers.get('x-jobrolo-artifact-sha256') ?? ''
    if (!SHA256.test(declaredDigest)) throw new JobroloHandoffTransportError('unknown_outcome')
    const bytes = await boundedBytes(response, HOMEOWNER_SHARE_MAX_ARTIFACT_BYTES)
    this.#verifyResponse(exchange, bytes)
    const payloadSha256 = sha256(bytes)
    if (payloadSha256 !== declaredDigest) throw new JobroloHandoffTransportError('unknown_outcome')
    return {
      bytes,
      mediaType,
      byteLength: bytes.byteLength,
      payloadSha256,
    }
  }

  async #post(
    pathname: string,
    bodyValue: unknown,
    timeoutMs: number,
    accept: string,
  ): Promise<HandoffExchange> {
    const body = homeownerShareCanonicalJson(bodyValue)
    const bodySha256 = sha256(body)
    const timestamp = this.#now()
    const nonce = this.#nonce()
    const endpoint = new URL(pathname, this.#configuration.origin)
    if (endpoint.origin !== this.#configuration.origin || endpoint.pathname !== pathname
      || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    let response: Response
    try {
      response = await this.#fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept,
          authorization: `Homesrolo-Handoff-HMAC ${this.#configuration.clientId}`,
          'content-type': 'application/json; charset=utf-8',
          'x-homesrolo-body-sha256': bodySha256,
          'x-homesrolo-nonce': nonce,
          'x-homesrolo-signature': hmac(
            this.#configuration.sharedSecret,
            jobroloHandoffRequestSigningMaterial({
              method: 'POST',
              pathname,
              timestamp,
              nonce,
              bodySha256,
            }),
          ),
          'x-homesrolo-timestamp': timestamp,
        },
        body,
      })
    } catch {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
    return { response, pathname, timestamp, nonce, bodySha256 }
  }

  #verifyResponse(exchange: HandoffExchange, bytes: Uint8Array) {
    const contentType = exchange.response.headers.get('content-type') ?? ''
    const responseBodySha256 = sha256(bytes)
    const declaredVersion = exchange.response.headers.get('x-jobrolo-transport-version') ?? ''
    const declaredSha256 = exchange.response.headers.get('x-jobrolo-response-sha256') ?? ''
    const declaredSignature = exchange.response.headers.get('x-jobrolo-response-signature') ?? ''
    const expectedSignature = hmac(
      this.#configuration.sharedSecret,
      jobroloHandoffResponseSigningMaterial({
        pathname: exchange.pathname,
        requestTimestamp: exchange.timestamp,
        requestNonce: exchange.nonce,
        requestBodySha256: exchange.bodySha256,
        statusCode: exchange.response.status,
        contentType,
        responseBodySha256,
      }),
    )
    if (declaredVersion !== JOBROLO_HANDOFF_TRANSPORT_VERSION
      || declaredSha256 !== responseBodySha256
      || !equalHmac(declaredSignature, expectedSignature)) {
      throw new JobroloHandoffTransportError('unknown_outcome')
    }
  }
}

export function jobroloHandoffClientForEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): HomeRecordHandoffSourcePort | null {
  const configuration = readJobroloHandoffClientConfiguration(environment)
  return configuration ? new SignedJobroloHandoffClient({ configuration }) : null
}
