import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createContext, Script } from 'node:vm'
import ts from 'typescript'
import type { HomesroloApi } from '../api/contract.ts'
import type { DeviceFile, ServerSession } from '../api/model.ts'
import { SessionFence, sessionBoundApi } from './session-fence.ts'

const HOME = `hhom_${'h'.repeat(43)}`
const PROJECT = `hprj_${'p'.repeat(43)}`
const COMMAND = `hcmd_${'c'.repeat(43)}`
const SESSION_A: Extract<ServerSession, { kind: 'signed_in' }> = {
  apiVersion: 'homeowner-api.v1-draft', kind: 'signed_in', principalRef: `hprn_${'a'.repeat(43)}`,
  capabilities: {
    emailCodeSignIn: true, magicLinkSignIn: false, persistence: true, projectQuotes: false,
    homeResearch: false, homeAssistant: false, homeAssistantVision: false, uploads: false,
    photoCheckups: false, projectReview: false, projectReviewAttachments: false,
    homeRecordHandoffs: false, invitations: false, sharing: false,
  },
}
const SESSION_B: Extract<ServerSession, { kind: 'signed_in' }> = { ...SESSION_A, principalRef: `hprn_${'b'.repeat(43)}` }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

type FetchCall = { readonly url: string; readonly init: RequestInit }
type ApiConstructor = typeof import('../api/client.ts').HomesroloNativeApi
const sourceDirectory = fileURLToPath(new URL('../', import.meta.url))
const compiled = new Map<string, string>()

/**
 * Execute the complete production client and its actual local helper modules.
 * Only native platform/entropy/file IO and fetch are replaced. No source method
 * extraction, parser replicas, real network, Expo runtime, or browser cookies.
 */
function realClient(options: {
  readonly randomBytes?: (length: number) => Promise<Uint8Array>
  readonly digest?: () => Promise<ArrayBuffer>
  readonly reply?: (call: FetchCall) => Promise<Response>
} = {}) {
  const fence = new SessionFence()
  fence.confirm(0, SESSION_A)
  const calls: FetchCall[] = []
  let signedOut = 0
  const unsupportedNativeIO = () => { throw new Error('unexpected_native_io') }
  const stubs: Record<string, unknown> = {
    'expo-constants': { default: {}, __esModule: true },
    'expo-crypto': {
      getRandomBytesAsync: options.randomBytes ?? (async length => new Uint8Array(length).fill(7)),
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digest: options.digest ?? (async () => new Uint8Array(32).fill(8).buffer),
    },
    'expo-file-system': { File: unsupportedNativeIO, Paths: {} },
    'react-native': { Platform: { OS: 'web' } },
  }
  const context = createContext({
    URL, URLSearchParams, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Response, Headers,
    fetch: async (url: string, init: RequestInit) => {
      const call = { url, init }
      calls.push(call)
      return options.reply ? options.reply(call) : mutationReply(call)
    },
  })
  const modules = new Map<string, { exports: Record<string, unknown> }>()
  function load(filename: string): Record<string, unknown> {
    assert.ok(filename.startsWith(sourceDirectory), 'only mobile source modules may load')
    const cached = modules.get(filename)
    if (cached) return cached.exports
    const module = { exports: {} }
    modules.set(filename, module)
    let code = compiled.get(filename)
    if (!code) {
      code = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
        },
        fileName: filename,
      }).outputText
      compiled.set(filename, code)
    }
    const requireLocal = (specifier: string): unknown => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier]
      assert.ok(specifier.startsWith('.'), `unapproved module: ${specifier}`)
      return load(path.resolve(path.dirname(filename), specifier))
    }
    const execute = new Script(`(function(require, module, exports) {\n${code}\n})`, { filename })
      .runInContext(context) as (require: typeof requireLocal, module: { exports: object }, exports: object) => void
    execute(requireLocal, module, module.exports)
    return module.exports
  }
  const Client = load(path.join(sourceDirectory, 'api/client.ts')).HomesroloNativeApi as ApiConstructor
  const raw = new Client(() => null, {
    origin: 'https://homesrolo.invalid', clientContract: 'pwa.v1',
    privateRequestGuard: () => fence.capture(), onSignedOut: () => { signedOut += 1 },
  })
  return {
    raw, fence, calls,
    bound: sessionBoundApi(raw, fence, SESSION_A.principalRef, true),
    signedOutCount: () => signedOut,
    changePrincipal() { assert.equal(fence.confirm(fence.invalidate(), SESSION_B), true) },
  }
}

function mutationReply(call: FetchCall): Response {
  const body = JSON.parse(String(call.init.body)) as { kind?: string; body?: string }
  const data = body.kind ? {
    activityRef: `hact_${'a'.repeat(43)}`, homeRef: HOME, projectRef: PROJECT,
    kind: body.kind, body: body.body, source: 'homeowner_entry', actorDisplayLabel: 'Synthetic A',
    createdAt: '2026-09-05T12:00:00.000Z',
  } : {
    homeRef: HOME, displayLabel: 'Synthetic home', privateLocationLabel: 'Synthetic location',
    relationshipLabel: 'claimed_unverified',
  }
  return Response.json({ data })
}

const mutations: readonly {
  readonly name: string
  readonly call: (api: HomesroloApi) => Promise<unknown>
}[] = [
  { name: 'createHome', call: api => api.createHome('Synthetic home', 'Synthetic location') },
  { name: 'addWorkNote', call: api => api.addWorkNote(HOME, PROJECT, 'Synthetic note') },
  { name: 'addWorkMilestone', call: api => api.addWorkMilestone(HOME, PROJECT, 'Synthetic milestone') },
]

for (const mutation of mutations) {
  test(`actual ${mutation.name} never dispatches A's delayed command under confirmed B`, async () => {
    const entropy = deferred<Uint8Array>()
    const entered = deferred<void>()
    const client = realClient({ randomBytes: async length => {
      assert.equal(length, 32)
      entered.resolve()
      return entropy.promise
    } })
    const pending = mutation.call(client.bound)
    const rejected = assert.rejects(pending, /session_check_required/)
    await entered.promise
    assert.equal(client.calls.length, 0, 'actual internal command creation is still pending')
    client.changePrincipal()
    entropy.resolve(new Uint8Array(32).fill(7))
    await rejected
    assert.equal(client.calls.length, 0, 'rejecting the response is too late: no mutation may dispatch')
    assert.doesNotThrow(client.fence.capture(SESSION_B.principalRef))
  })

  test(`actual ${mutation.name} dispatches once when the initiating session remains current`, async () => {
    const client = realClient()
    await mutation.call(client.bound)
    assert.equal(client.calls.length, 1)
    const call = client.calls[0]!
    assert.equal(call.init.method, 'POST')
    assert.equal(call.init.credentials, 'same-origin')
    assert.equal(new Headers(call.init.headers).has('authorization'), false)
    assert.match(JSON.parse(String(call.init.body)).commandRef, /^hcmd_[A-Za-z0-9_-]{43}$/)
  })
}

test('actual old private 401 cannot clear the newly confirmed principal', async () => {
  const response = deferred<Response>()
  const client = realClient({ reply: () => response.promise })
  const pending = client.bound.listHomes()
  const rejected = assert.rejects(pending, /session_check_required/)
  assert.equal(client.calls.length, 1)
  client.changePrincipal()
  response.resolve(Response.json({ error: { code: 'signed_out' } }, { status: 401 }))
  await rejected
  assert.equal(client.signedOutCount(), 0)
  assert.doesNotThrow(client.fence.capture(SESSION_B.principalRef))
})

test('actual current private 401 still notifies the session owner', async () => {
  const client = realClient({ reply: async () => Response.json({ error: { code: 'signed_out' } }, { status: 401 }) })
  await assert.rejects(client.bound.listHomes(), /signed_out/)
  assert.equal(client.signedOutCount(), 1)
})

test('actual protected mutation cannot dispatch while session certainty is absent', async () => {
  const client = realClient()
  client.fence.invalidate()
  await assert.rejects(client.bound.createHome('Synthetic home', 'Synthetic location', COMMAND), /session_check_required/)
  // Exercise the transport guard independently of the outer principal-bound API.
  await assert.rejects(client.raw.createHome('Synthetic home', 'Synthetic location', COMMAND), /session_check_required/)
  assert.equal(client.calls.length, 0)
})

const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]).buffer
function browserPhoto(read: () => Promise<ArrayBuffer> = async () => PHOTO_BYTES): DeviceFile {
  const blob = new Blob([PHOTO_BYTES], { type: 'image/jpeg' })
  blob.arrayBuffer = read
  return {
    uri: 'blob:synthetic-private-photo', name: 'synthetic.jpg', mediaType: 'image/jpeg',
    byteLength: PHOTO_BYTES.byteLength, browserFile: blob,
  }
}

for (const stage of ['bytes', 'digest', 'command'] as const) {
  test(`actual artifact upload cannot reserve under B after A's delayed ${stage}`, async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    async function hold<T>(value: T): Promise<T> {
      entered.resolve()
      await release.promise
      return value
    }
    const client = realClient({
      digest: async () => stage === 'digest' ? hold(new Uint8Array(32).buffer) : new Uint8Array(32).buffer,
      randomBytes: async length => stage === 'command' ? hold(new Uint8Array(length)) : new Uint8Array(length),
    })
    const file = browserPhoto(async () => stage === 'bytes' ? hold(PHOTO_BYTES) : PHOTO_BYTES)
    const pending = client.bound.uploadArtifact(HOME, 'photo', file, PROJECT)
    const rejected = assert.rejects(pending, /session_check_required/)
    await entered.promise
    assert.equal(client.calls.length, 0)
    client.changePrincipal()
    release.resolve()
    await rejected
    assert.equal(client.calls.length, 0, 'no reservation, object PUT, or completion may dispatch')
  })
}

test('actual home-checkup upload cannot send A photo bytes after B is confirmed', async () => {
  const entered = deferred<void>()
  const bytes = deferred<ArrayBuffer>()
  const client = realClient()
  const pending = client.bound.uploadHomeCheckup(HOME, {
    commandRef: COMMAND, observedOn: '2026-01-01', area: 'roofline',
    viewLabel: 'Synthetic roof', caption: '',
    file: browserPhoto(() => { entered.resolve(); return bytes.promise }),
  })
  const rejected = assert.rejects(pending, /session_check_required/)
  await entered.promise
  client.changePrincipal()
  bytes.resolve(PHOTO_BYTES)
  await rejected
  assert.equal(client.calls.length, 0)
})

function reservationReply(): Response {
  const storagePath = `${HOME}/hobj_${'o'.repeat(43)}`
  // This URL is parser-valid fixture data. Only the fake VM fetch can consume it.
  const token = 'synthetic-upload-fixture'
  return Response.json({ data: {
    state: 'upload_required', artifactRef: `hart_${'r'.repeat(43)}`,
    upload: {
      path: storagePath, token, expiresAt: '2026-09-05T12:05:00.000Z',
      signedUrl: `https://synthetic.supabase.co/storage/v1/object/upload/sign/homesrolo-homeowner-dev-uploads/${storagePath}?token=${token}`,
    },
  } })
}

for (const stage of ['reservation', 'object PUT'] as const) {
  test(`actual artifact upload stops after ${stage} if the browser principal changes`, async () => {
    const entered = deferred<void>()
    const response = deferred<Response>()
    const client = realClient({ reply: async call => {
      if (stage === 'reservation' || call.init.method === 'PUT') {
        entered.resolve()
        return response.promise
      }
      return reservationReply()
    } })
    const pending = client.bound.uploadArtifact(HOME, 'photo', browserPhoto(), PROJECT)
    const rejected = assert.rejects(pending, /session_check_required/)
    await entered.promise
    const expectedCalls = stage === 'reservation' ? 1 : 2
    assert.equal(client.calls.length, expectedCalls)
    if (stage === 'object PUT') assert.equal(client.calls[1]!.init.credentials, 'omit')
    client.changePrincipal()
    response.resolve(stage === 'reservation' ? reservationReply() : new Response(null, { status: 200 }))
    await rejected
    assert.equal(client.calls.length, expectedCalls, 'no subsequent PUT/completion under the new session')
    assert.equal(client.signedOutCount(), 0)
  })
}
