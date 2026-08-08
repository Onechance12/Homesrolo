// =============================================================================
// Canonical encoding primitives for the homeowner-share wire contract
// =============================================================================
// Every cross-repo value — manifest bytes, digests, receipt identity — is
// derived through these functions and nothing else. If Jobrolo and Homesrolo
// disagree about a single byte here, every downstream digest diverges and the
// two systems silently stop agreeing about what was authorized.
//
// The canonical form, reconciled byte-for-byte against Jobrolo's published
// golden manifest (see WIRE_GOLDEN in homeowner-share.v1.ts):
//
//   - Object keys sorted ascending by code unit, recursively.
//   - Primitives emitted by JSON.stringify.
//   - No insignificant whitespace.
//   - UTF-8 bytes.
//   - Digests as lowercase hex.
//
// This file has no network access, no state, and no dependencies outside the
// Node standard library.
// =============================================================================

import { createHash } from 'node:crypto'

/**
 * Thrown when a value cannot be canonicalized. Canonicalization fails loudly
 * rather than dropping a key, because a silently dropped field is a field that
 * one side signed and the other never saw.
 */
export class CanonicalizationError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(`${message} at ${path || '<root>'}`)
    this.name = 'CanonicalizationError'
    this.path = path
  }
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return 'null'

  const type = typeof value

  if (type === 'string') return JSON.stringify(value)

  if (type === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new CanonicalizationError('non-finite number is not canonicalizable', path)
    }
    // Object.is separates -0 from 0; they share a JSON form but not an identity,
    // so refusing it keeps "same canonical bytes" equivalent to "same value".
    if (Object.is(value, -0)) {
      throw new CanonicalizationError('negative zero is not canonicalizable', path)
    }
    return JSON.stringify(value)
  }

  if (type === 'boolean') return JSON.stringify(value)

  if (type === 'undefined') {
    throw new CanonicalizationError('undefined is not canonicalizable', path)
  }

  if (type === 'bigint' || type === 'function' || type === 'symbol') {
    throw new CanonicalizationError(`${type} is not canonicalizable`, path)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  if (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null) {
    throw new CanonicalizationError('only plain objects are canonicalizable', path)
  }

  const keys = Object.keys(record).sort()
  const parts: string[] = []
  for (const key of keys) {
    const child = record[key]
    if (child === undefined) {
      throw new CanonicalizationError(`key "${key}" is undefined`, path)
    }
    parts.push(`${JSON.stringify(key)}:${canonicalize(child, path ? `${path}.${key}` : key)}`)
  }
  return `{${parts.join(',')}}`
}

/** Canonical JSON: recursively sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, '')
}

/** UTF-8 byte length of a canonical encoding, which is what the caps bound. */
export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** Lowercase hex SHA-256 over the UTF-8 bytes of `text`. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

/** Digest of a value's canonical encoding. The only way a digest is produced. */
export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value))
}

const SHA256_HEX = /^[0-9a-f]{64}$/

/** Lowercase hex only. An uppercase digest is a different string and refused. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value)
}

// Exactly three fractional digits and a literal Z. "2026-08-08T12:00:00Z" and
// "2026-08-08T12:00:00.000+00:00" name the same instant but are different bytes,
// so only one spelling is accepted.
const UTC_MILLIS_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * Canonical UTC millisecond timestamp. Round-tripped through Date so that
 * shapes which parse but are not real instants ("2026-02-30T…") are refused.
 */
export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_MILLIS_INSTANT.test(value)) return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  return new Date(parsed).toISOString() === value
}

/** Milliseconds since epoch for a value already known to be canonical. */
export function instantToMillis(value: string): number {
  return Date.parse(value)
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * Canonical unpadded base64url of exactly `byteLength` bytes. Padding, standard
 * base64 alphabet, and trailing whitespace are all refused so that a signature
 * has exactly one spelling.
 */
export function isBase64Url(value: unknown, byteLength: number): value is string {
  if (typeof value !== 'string' || !BASE64URL.test(value)) return false
  const expectedChars = Math.ceil((byteLength * 4) / 3)
  if (value.length !== expectedChars) return false
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== byteLength) return false
  // Re-encode: a canonical encoding survives the round trip unchanged, while a
  // value with stray high bits in the final character does not.
  return decoded.toString('base64url') === value
}
