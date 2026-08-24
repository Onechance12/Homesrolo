import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signPayload,
  type KeyObject,
} from 'node:crypto'
import { createConnection } from 'node:net'
import { z } from 'zod'
import type {
  HomeRecordHandoffConsentSignerPort,
  HomeRecordHandoffScannerPort,
  HomeRecordHandoffTrustPort,
} from '../../../../src/homeowner/home-record-handoff.v1.ts'

const keyId = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/)
const derKey = z.string().min(40).max(8192).regex(/^[A-Za-z0-9+/]+={0,2}$/)
const recipientRef = z.string().regex(/^hrcp_[A-Za-z0-9_-]{43}$/)

const configurationSchema = z.object({
  enabled: z.literal('true'),
  recipientRef,
  jobroloKeyId: keyId,
  jobroloPublicKey: derKey,
  homesroloKeyId: keyId,
  homesroloPrivateKey: derKey,
  clamavHost: z.enum(['127.0.0.1', '::1', 'localhost']),
  clamavPort: z.coerce.number().int().min(1).max(65_535),
  clamavVersion: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._+-]+$/),
}).strict()

export interface HomeRecordHandoffSecurityConfiguration {
  readonly recipientRef: string
  readonly jobroloKeyId: string
  readonly jobroloPublicKey: KeyObject
  readonly homesroloKeyId: string
  readonly homesroloPrivateKey: KeyObject
  readonly clamavHost: '127.0.0.1' | '::1' | 'localhost'
  readonly clamavPort: number
  readonly clamavVersion: string
}

function parseDerKey(input: string, kind: 'public' | 'private'): KeyObject | null {
  try {
    const bytes = Buffer.from(input, 'base64')
    if (bytes.byteLength < 32 || bytes.toString('base64') !== input) return null
    const parsed = kind === 'public'
      ? createPublicKey({ key: bytes, format: 'der', type: 'spki' })
      : createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' })
    if (parsed.type !== kind || parsed.asymmetricKeyType !== 'ed25519') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * This is an independent activation gate. A true transport flag alone cannot
 * enable imports: exact recipient binding, both Ed25519 keys, and a loopback
 * malware scanner must also be configured and valid.
 */
export function readHomeRecordHandoffSecurityConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): HomeRecordHandoffSecurityConfiguration | null {
  const parsed = configurationSchema.safeParse({
    enabled: environment.HOMESROLO_HOME_RECORD_HANDOFF_ENABLED,
    recipientRef: environment.HOMESROLO_HOME_RECORD_HANDOFF_RECIPIENT_REF,
    jobroloKeyId: environment.HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_KEY_ID,
    jobroloPublicKey:
      environment.HOMESROLO_HOME_RECORD_HANDOFF_JOBROLO_ED25519_PUBLIC_KEY_SPKI_BASE64,
    homesroloKeyId: environment.HOMESROLO_HOME_RECORD_HANDOFF_SIGNING_KEY_ID,
    homesroloPrivateKey:
      environment.HOMESROLO_HOME_RECORD_HANDOFF_ED25519_PRIVATE_KEY_PKCS8_BASE64,
    clamavHost: environment.HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_HOST,
    clamavPort: environment.HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_PORT,
    clamavVersion: environment.HOMESROLO_HOME_RECORD_HANDOFF_CLAMAV_VERSION,
  })
  if (!parsed.success) return null
  const jobroloPublicKey = parseDerKey(parsed.data.jobroloPublicKey, 'public')
  const homesroloPrivateKey = parseDerKey(parsed.data.homesroloPrivateKey, 'private')
  if (!jobroloPublicKey || !homesroloPrivateKey) return null
  return Object.freeze({
    recipientRef: parsed.data.recipientRef,
    jobroloKeyId: parsed.data.jobroloKeyId,
    jobroloPublicKey,
    homesroloKeyId: parsed.data.homesroloKeyId,
    homesroloPrivateKey,
    clamavHost: parsed.data.clamavHost,
    clamavPort: parsed.data.clamavPort,
    clamavVersion: parsed.data.clamavVersion,
  })
}

export class PinnedHomeRecordHandoffTrust implements HomeRecordHandoffTrustPort {
  readonly #keyId: string
  readonly #publicKey: KeyObject

  constructor(keyIdValue: string, publicKey: KeyObject) {
    this.#keyId = keyIdValue
    this.#publicKey = publicKey
  }

  async resolveJobroloAuthorizationKey(requestedKeyId: string) {
    return requestedKeyId === this.#keyId ? this.#publicKey : null
  }
}

export class Ed25519HomeRecordHandoffSigner
implements HomeRecordHandoffConsentSignerPort {
  readonly keyId: string
  readonly #privateKey: KeyObject

  constructor(keyIdValue: string, privateKey: KeyObject) {
    this.keyId = keyIdValue
    this.#privateKey = privateKey
  }

  async sign(payload: string) {
    return signPayload(null, Buffer.from(payload, 'utf8'), this.#privateKey)
      .toString('base64url')
  }
}

interface ClamAvTransportInput {
  readonly host: '127.0.0.1' | '::1' | 'localhost'
  readonly port: number
  readonly bytes: Uint8Array
}

type ClamAvTransport = (input: ClamAvTransportInput) => Promise<string>

function clamdInstream(input: ClamAvTransportInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: input.host, port: input.port })
    let response = Buffer.alloc(0)
    let settled = false
    const finish = (error: Error | null, value?: string) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve(value ?? '')
    }
    socket.setTimeout(30_000, () => finish(new Error('clamav_timeout')))
    socket.once('error', () => finish(new Error('clamav_unavailable')))
    socket.on('data', chunk => {
      response = Buffer.concat([response, chunk])
      if (response.byteLength > 4096) {
        finish(new Error('clamav_response_too_large'))
        return
      }
      const end = response.indexOf(0)
      if (end >= 0) finish(null, response.subarray(0, end).toString('utf8'))
    })
    socket.once('close', () => {
      if (!settled) finish(new Error('clamav_response_incomplete'))
    })
    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0', 'utf8'))
      const source = Buffer.from(input.bytes)
      for (let offset = 0; offset < source.byteLength; offset += 64 * 1024) {
        const chunk = source.subarray(offset, Math.min(source.byteLength, offset + 64 * 1024))
        const length = Buffer.allocUnsafe(4)
        length.writeUInt32BE(chunk.byteLength)
        socket.write(length)
        socket.write(chunk)
      }
      socket.write(Buffer.alloc(4))
    })
  })
}

export class LocalClamAvHomeRecordHandoffScanner
implements HomeRecordHandoffScannerPort {
  readonly #host: HomeRecordHandoffSecurityConfiguration['clamavHost']
  readonly #port: number
  readonly #version: string
  readonly #transport: ClamAvTransport
  readonly #now: () => string

  constructor(input: {
    readonly host: HomeRecordHandoffSecurityConfiguration['clamavHost']
    readonly port: number
    readonly version: string
    readonly transport?: ClamAvTransport
    readonly now?: () => string
  }) {
    this.#host = input.host
    this.#port = input.port
    this.#version = input.version
    this.#transport = input.transport ?? clamdInstream
    this.#now = input.now ?? (() => new Date().toISOString())
  }

  async scan(input: Parameters<HomeRecordHandoffScannerPort['scan']>[0]) {
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > 25 * 1024 * 1024
      || createHash('sha256').update(input.bytes).digest('hex') !== input.expectedSha256) {
      throw new Error('handoff_scan_input_invalid')
    }
    const response = await this.#transport({
      host: this.#host,
      port: this.#port,
      bytes: input.bytes,
    })
    const scannedAt = this.#now()
    if (/^stream: OK$/.test(response)) {
      return {
        verdict: 'clean' as const,
        provider: 'local-clamav',
        version: this.#version,
        scannedAt,
      }
    }
    if (/^stream: .+ FOUND$/.test(response)) {
      return {
        verdict: 'rejected' as const,
        provider: 'local-clamav',
        version: this.#version,
        scannedAt,
        reason: 'content_rejected' as const,
      }
    }
    throw new Error('clamav_scan_unknown')
  }
}

export function homeRecordHandoffSecurityProviders(
  configuration: HomeRecordHandoffSecurityConfiguration,
) {
  return Object.freeze({
    trust: new PinnedHomeRecordHandoffTrust(
      configuration.jobroloKeyId,
      configuration.jobroloPublicKey,
    ),
    signer: new Ed25519HomeRecordHandoffSigner(
      configuration.homesroloKeyId,
      configuration.homesroloPrivateKey,
    ),
    scanner: new LocalClamAvHomeRecordHandoffScanner({
      host: configuration.clamavHost,
      port: configuration.clamavPort,
      version: configuration.clamavVersion,
    }),
  })
}
