import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  homesroloJobroloCanonicalJson,
  homesroloJobroloProjectIntakeReceiptSchema,
  homesroloJobroloReceiptSigningMaterial,
  homesroloJobroloRequestSigningMaterial,
  homesroloJobroloSha256,
  parseHomesroloJobroloProjectIntake,
  type HomesroloJobroloProjectIntake,
  type HomesroloJobroloProjectIntakeReceipt,
} from '../../../../src/contracts/homesrolo-jobrolo-project-intake.v1.ts'

const CLIENT_ID = /^[A-Za-z0-9._-]{3,64}$/
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/
const MAX_RECEIPT_BYTES = 8 * 1024

const configurationSchema = z.object({
  enabled: z.literal('true'),
  endpoint: z.string().url().transform(value => new URL(value)).refine(
    value => value.protocol === 'https:'
      || value.hostname === 'localhost'
      || value.hostname === '127.0.0.1',
    'must use HTTPS outside local development',
  ),
  clientId: z.string().regex(CLIENT_ID),
  sharedSecret: z.string().min(32).max(512).regex(/^\S+$/),
}).strict()

export interface JobroloIntakeClientConfiguration {
  readonly endpoint: string
  readonly clientId: string
  readonly sharedSecret: string
}

export function readJobroloIntakeClientConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): JobroloIntakeClientConfiguration | null {
  const parsed = configurationSchema.safeParse({
    enabled: environment.HOMESROLO_JOBROLO_INTAKE_ENABLED,
    endpoint: environment.HOMESROLO_JOBROLO_INTAKE_URL,
    clientId: environment.HOMESROLO_JOBROLO_INTAKE_CLIENT_ID,
    sharedSecret: environment.HOMESROLO_JOBROLO_INTAKE_SHARED_SECRET,
  })
  if (!parsed.success) return null
  const endpoint = parsed.data.endpoint
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null
  if (endpoint.pathname !== '/api/integrations/homesrolo/v1/project-intakes') return null
  return Object.freeze({
    endpoint: endpoint.href,
    clientId: parsed.data.clientId,
    sharedSecret: parsed.data.sharedSecret,
  })
}

export class JobroloIntakeDeliveryError extends Error {
  readonly disposition: 'definitive_rejection' | 'unknown_outcome'

  constructor(disposition: 'definitive_rejection' | 'unknown_outcome') {
    super(disposition)
    this.name = 'JobroloIntakeDeliveryError'
    this.disposition = disposition
  }
}

function hmac(secret: string, material: string): string {
  return createHmac('sha256', secret).update(material, 'utf8').digest('base64url')
}

function equalSignature(left: string, right: string): boolean {
  if (!SIGNATURE.test(left) || !SIGNATURE.test(right)) return false
  const leftBytes = Buffer.from(left, 'base64url')
  const rightBytes = Buffer.from(right, 'base64url')
  return leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes)
}

async function boundedReceipt(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new JobroloIntakeDeliveryError('unknown_outcome')
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RECEIPT_BYTES)) {
    throw new JobroloIntakeDeliveryError('unknown_outcome')
  }
  if (response.headers.has('content-encoding') || !response.body) {
    throw new JobroloIntakeDeliveryError('unknown_outcome')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_RECEIPT_BYTES) {
      await reader.cancel()
      throw new JobroloIntakeDeliveryError('unknown_outcome')
    }
    chunks.push(value)
  }
  if (byteLength < 2) throw new JobroloIntakeDeliveryError('unknown_outcome')
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new JobroloIntakeDeliveryError('unknown_outcome')
  }
}

export interface JobroloIntakeTransport {
  deliver(input: HomesroloJobroloProjectIntake): Promise<HomesroloJobroloProjectIntakeReceipt>
}

export class SignedJobroloIntakeClient implements JobroloIntakeTransport {
  readonly #configuration: JobroloIntakeClientConfiguration
  // Server-to-server transport is isolated here; browser code cannot import it.
  readonly #fetch: typeof fetch
  readonly #now: () => string
  readonly #nonce: () => string

  constructor(input: {
    readonly configuration: JobroloIntakeClientConfiguration
    readonly fetchImpl?: typeof fetch
    readonly now?: () => string
    readonly nonce?: () => string
  }) {
    this.#configuration = input.configuration
    // eslint-disable-next-line no-restricted-globals -- exact configured integration seam
    this.#fetch = input.fetchImpl ?? fetch
    this.#now = input.now ?? (() => new Date().toISOString())
    this.#nonce = input.nonce ?? (() => randomBytes(24).toString('base64url'))
  }

  async deliver(input: HomesroloJobroloProjectIntake) {
    const request = parseHomesroloJobroloProjectIntake(input)
    const body = homesroloJobroloCanonicalJson(request)
    const bodySha256 = homesroloJobroloSha256(body)
    const timestamp = this.#now()
    const nonce = this.#nonce()
    const endpoint = new URL(this.#configuration.endpoint)
    const material = homesroloJobroloRequestSigningMaterial({
      method: 'POST',
      pathname: endpoint.pathname,
      timestamp,
      nonce,
      bodySha256,
    })
    let response: Response
    try {
      response = await this.#fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        // Jobrolo may spend up to 100 seconds fetching, scanning, and storing
        // explicitly selected files before its signed terminal receipt. Keep
        // the caller alive beyond that reviewed receiver boundary so normal
        // attachment submissions do not become false unknown outcomes.
        signal: AbortSignal.timeout(125_000),
        headers: {
          accept: 'application/json',
          authorization: `Homesrolo-HMAC ${this.#configuration.clientId}`,
          'content-type': 'application/json',
          'x-homesrolo-body-sha256': bodySha256,
          'x-homesrolo-nonce': nonce,
          'x-homesrolo-signature': hmac(this.#configuration.sharedSecret, material),
          'x-homesrolo-timestamp': timestamp,
        },
        body,
      })
    } catch {
      throw new JobroloIntakeDeliveryError('unknown_outcome')
    }
    if (response.status !== 200 && response.status !== 201) {
      // An unsigned HTTP error cannot prove the receiver made no durable
      // effect; callers must reconcile instead of automatically resubmitting.
      throw new JobroloIntakeDeliveryError('unknown_outcome')
    }

    const bodyValue = await boundedReceipt(response)
    const receipt = homesroloJobroloProjectIntakeReceiptSchema.parse(bodyValue)
    if (receipt.submissionRef !== request.submissionRef
      || receipt.requestNonce !== nonce
      || receipt.requestBodySha256 !== bodySha256
      || receipt.disclosureDigest !== request.consent.disclosureDigest) {
      throw new JobroloIntakeDeliveryError('unknown_outcome')
    }
    const receiptBodySha256 = homesroloJobroloSha256(homesroloJobroloCanonicalJson(receipt))
    const declaredReceiptSha256 = response.headers.get('x-jobrolo-receipt-sha256') ?? ''
    const declaredReceiptSignature = response.headers.get('x-jobrolo-receipt-signature') ?? ''
    const expectedReceiptSignature = hmac(
      this.#configuration.sharedSecret,
      homesroloJobroloReceiptSigningMaterial(receipt),
    )
    if (declaredReceiptSha256 !== receiptBodySha256
      || !equalSignature(declaredReceiptSignature, expectedReceiptSignature)) {
      throw new JobroloIntakeDeliveryError('unknown_outcome')
    }
    return receipt
  }
}

export function jobroloIntakeClientForEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): JobroloIntakeTransport | null {
  const configuration = readJobroloIntakeClientConfiguration(environment)
  return configuration ? new SignedJobroloIntakeClient({ configuration }) : null
}
