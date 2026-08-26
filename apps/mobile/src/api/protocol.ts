const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,256}$/
const HOME_REF_PATTERN = /^hhom_[A-Za-z0-9_-]{43}$/
const PROJECT_REF_PATTERN = /^hprj_[A-Za-z0-9_-]{43}$/
const ARTIFACT_REF_PATTERN = /^hart_[A-Za-z0-9_-]{43}$/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export interface BoundedRoloTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

export function normalizeApiOrigin(input: string): string {
  const url = new URL(input)
  if (url.username || url.password || url.search || url.hash) throw new Error('invalid_api_origin')
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('invalid_api_origin')
  }
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('invalid_api_origin')
  return url.origin
}

export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && SESSION_PATTERN.test(value)
}

export function isHomeRef(value: unknown): value is string {
  return typeof value === 'string' && HOME_REF_PATTERN.test(value)
}

export function isProjectRef(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_REF_PATTERN.test(value)
}

export function isArtifactRef(value: unknown): value is string {
  return typeof value === 'string' && ARTIFACT_REF_PATTERN.test(value)
}

export function base64Url(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    output += BASE64URL[first >> 2]
    output += BASE64URL[((first & 3) << 4) | ((second ?? 0) >> 4)]
    if (second !== undefined) output += BASE64URL[((second & 15) << 2) | ((third ?? 0) >> 6)]
    if (third !== undefined) output += BASE64URL[third & 63]
  }
  return output
}

export function commandRef(randomBytes: Uint8Array): string {
  if (randomBytes.length !== 32) throw new Error('command_ref_requires_32_bytes')
  const encoded = base64Url(randomBytes)
  if (encoded.length !== 43) throw new Error('invalid_command_ref_encoding')
  return `hcmd_${encoded}`
}

export function apiPath(...segments: readonly string[]): string {
  const safe = segments.map(segment => encodeURIComponent(segment))
  return `/api/v1/${safe.join('/')}`
}

export function envelopeData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_envelope')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'data')) {
    throw new Error('invalid_envelope')
  }
  return record.data
}

export function problemCode(value: unknown): { code: string; retryAfterSeconds?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { code: 'unavailable' }
  const error = (value as Record<string, unknown>).error
  if (!error || typeof error !== 'object' || Array.isArray(error)) return { code: 'unavailable' }
  const record = error as Record<string, unknown>
  const code = typeof record.code === 'string' && record.code.length <= 80
    ? record.code
    : 'unavailable'
  const retryAfterSeconds = typeof record.retryAfterSeconds === 'number'
    && Number.isInteger(record.retryAfterSeconds)
    && record.retryAfterSeconds > 0
    ? record.retryAfterSeconds
    : undefined
  return retryAfterSeconds === undefined ? { code } : { code, retryAfterSeconds }
}

export function nativeRequestHeaders(
  token: string | null,
  content: 'none' | 'json' = 'none',
): Record<string, string> {
  if (token !== null && !isSessionToken(token)) throw new Error('invalid_session_token')
  return {
    accept: 'application/json',
    'x-homesrolo-client': 'native.v1',
    ...(content === 'json' ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

export function boundedRoloConversation(
  message: string,
  history: readonly BoundedRoloTurn[],
): { readonly message: string; readonly history: readonly BoundedRoloTurn[] } {
  const cleanMessage = message.trim()
  if (cleanMessage.length < 1 || cleanMessage.length > 1_600
    || CONTROL_CHARACTERS.test(cleanMessage)) {
    throw new Error('invalid_rolo_message')
  }

  let remaining = 6_000 - cleanMessage.length
  const bounded: BoundedRoloTurn[] = []
  for (const turn of history.slice(-8).reverse()) {
    const clean = turn.text.trim()
    if (clean.length < 1 || CONTROL_CHARACTERS.test(clean)) continue
    const text = clean.slice(0, Math.min(700, remaining))
    if (!text) break
    bounded.unshift({ role: turn.role, text })
    remaining -= text.length
    if (remaining === 0) break
  }
  return { message: cleanMessage, history: bounded }
}
